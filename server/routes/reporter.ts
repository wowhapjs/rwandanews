import { Router } from 'express';
import multer from 'multer';
import { getSupabaseClient } from '../db/supabase.js';
import { validateArticleImageUpload } from '../services/imageUploadPolicy.js';
import { authenticateRequest, sendAuthError } from '../services/requestAuth.js';
import { requireEditor } from '../services/authz.js';
import { extractMarkdownImageUrls } from '../services/editorialArticle.js';

const router = Router();
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const client = () => { const c = getSupabaseClient(); if (!c) throw Object.assign(new Error('Supabase is not configured'), { statusCode: 503 }); return c; };

const normalize = (r: any, p?: any) => ({
  id: r.article_id,
  revisionId: r.revision_id,
  authorId: r.author_id,
  title: r.title,
  subtitle: r.subtitle,
  body: r.body_markdown,
  topic: p?.topic || 'General',
  topicSub: p?.topic_sub || 'General',
  originalLanguage: r.original_language || 'ko',
  state: r.workflow_state,
  reviewComment: r.review_note,
  leadImageUrl: p?.lead_image_url || p?.image_urls?.[0] || extractMarkdownImageUrls(String(r.body_markdown || ''))[0] || undefined,
  viewCount: Number(p?.view_count || 0),
  createdAt: r.created_at,
  updatedAt: r.created_at
});

async function latestOwnedRevision(articleId: string, actor: any) {
  const c = client();
  const { data, error } = await c.from('newsroom_article_revisions').select('*').eq('article_id', articleId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('Article not found'), { statusCode: 404 });
  if (actor.role !== 'ADMIN' && data.author_id !== actor.id) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  return data;
}

router.post('/images', upload.single('image'), async (req, res) => {
  try {
    const actor = requireEditor(await authenticateRequest(req));
    if (!req.file) return res.status(400).json({ error: 'image is required' });
    validateArticleImageUpload(req.file);
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `editor/${actor.id}/${name}`;
    const c = client();
    const { error } = await c.storage.from('newsroom-images').upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (error) throw error;
    const { data } = c.storage.from('newsroom-images').getPublicUrl(path);
    res.json({ url: data.publicUrl });
  } catch (e) { sendAuthError(res, e); }
});

router.get('/', async (req, res) => {
  try {
    const actor = requireEditor(await authenticateRequest(req));
    const c = client();
    const requested = String(req.query.authorId || '');
    const authorId = actor.role === 'ADMIN' && requested ? requested : actor.id;
    const { data, error } = await c.from('newsroom_article_revisions').select('*').eq('author_id', authorId).order('created_at', { ascending: false });
    if (error) throw error;
    const latest = new Map<string, any>();
    for (const r of data || []) if (!latest.has(r.article_id)) latest.set(r.article_id, r);
    const ids = [...latest.keys()];
    const publicRows = ids.length ? (await c.from('articles').select('article_id,lead_image_url,image_urls,view_count,topic,topic_sub').in('article_id', ids)).data || [] : [];
    const pub = new Map(publicRows.map((p: any) => [p.article_id, p]));
    res.json({ articles: [...latest.values()].map(r => normalize(r, pub.get(r.article_id))) });
  } catch (e) { sendAuthError(res, e); }
});

router.get('/:id/comments', async (req, res) => {
  try {
    const actor = requireEditor(await authenticateRequest(req));
    const revision = await latestOwnedRevision(req.params.id, actor);
    const c = client();
    const { data, error } = await c.from('newsroom_publish_history').select('id,article_id,action,actor_user_id,comment,from_status,to_status,created_at').eq('article_id', req.params.id).not('comment', 'is', null).order('created_at', { ascending: true });
    if (error) throw error;
    const actorIds = [...new Set((data || []).map((x: any) => x.actor_user_id).filter(Boolean))];
    const profiles = actorIds.length ? (await c.from('newsroom_profiles').select('user_id,display_name,email,role').in('user_id', actorIds)).data || [] : [];
    const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));
    res.json({ articleId: revision.article_id, comments: (data || []).map((x: any) => { const p = profileMap.get(x.actor_user_id); return { id: x.id, action: x.action, message: x.comment, actorId: x.actor_user_id, actorName: p?.display_name || p?.email || '관리자/에디터', actorRole: p?.role || 'SYSTEM', createdAt: x.created_at }; }) });
  } catch (e) { sendAuthError(res, e); }
});

router.post('/:id/comments', async (req, res) => {
  try {
    const actor = requireEditor(await authenticateRequest(req));
    const current = await latestOwnedRevision(req.params.id, actor);
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: '의견 내용을 입력하세요.' });
    if (message.length > 2000) return res.status(400).json({ error: '의견은 2000자 이하로 입력하세요.' });
    const { data, error } = await client().from('newsroom_publish_history').insert({ article_id: req.params.id, revision_id: current.revision_id, action: 'COMMENT', actor_user_id: actor.id, from_status: current.workflow_state, to_status: current.workflow_state, comment: message }).select().single();
    if (error) throw error;
    res.json({ ok: true, comment: data });
  } catch (e) { sendAuthError(res, e); }
});

router.get('/:id', async (req, res) => {
  try {
    const actor = requireEditor(await authenticateRequest(req));
    const data = await latestOwnedRevision(req.params.id, actor);
    const { data: p } = await client().from('articles').select('article_id,lead_image_url,image_urls,view_count,topic,topic_sub').eq('article_id', req.params.id).maybeSingle();
    res.json({ article: normalize(data, p) });
  } catch (e) { sendAuthError(res, e); }
});

router.post('/', async (req, res) => {
  try {
    const actor = requireEditor(await authenticateRequest(req));
    const { title = '', subtitle = '', body = '', originalLanguage = 'ko', state = 'DRAFT' } = req.body || {};
    const id = `NEWS-${Date.now().toString(36)}`;
    const row = { revision_id: `REV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, article_id: id, author_id: actor.id, title: String(title).trim(), subtitle: String(subtitle || ''), body_markdown: String(body || ''), original_language: ['ko', 'en', 'rw'].includes(originalLanguage) ? originalLanguage : 'ko', workflow_state: state === 'PENDING_REVIEW' ? 'PENDING_REVIEW' : 'DRAFT' };
    if (!row.title) return res.status(400).json({ error: '제목을 입력하세요.' });
    const c = client();
    const { data, error } = await c.from('newsroom_article_revisions').insert(row).select().single();
    if (error) throw error;
    if (row.workflow_state === 'PENDING_REVIEW') await c.from('newsroom_publish_history').insert({ article_id: id, revision_id: row.revision_id, action: 'SUBMITTED', actor_user_id: actor.id, from_status: 'DRAFT', to_status: 'PENDING_REVIEW' });
    res.json({ article: normalize(data) });
  } catch (e) { sendAuthError(res, e); }
});

router.put('/:id', async (req, res) => {
  try {
    const actor = requireEditor(await authenticateRequest(req));
    const { title = '', subtitle = '', body = '', originalLanguage = 'ko', state = 'DRAFT' } = req.body || {};
    const current = await latestOwnedRevision(req.params.id, actor);
    if (['PENDING_REVIEW', 'ARCHIVED'].includes(current.workflow_state)) return res.status(409).json({ error: '현재 상태에서는 직접 수정할 수 없습니다.' });
    const next = state === 'PENDING_REVIEW' ? 'PENDING_REVIEW' : 'DRAFT';
    const row = { revision_id: `REV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, article_id: req.params.id, author_id: current.author_id, title: String(title).trim(), subtitle: String(subtitle || ''), body_markdown: String(body || ''), original_language: ['ko', 'en', 'rw'].includes(originalLanguage) ? originalLanguage : 'ko', workflow_state: next, review_note: null };
    if (!row.title) return res.status(400).json({ error: '제목을 입력하세요.' });
    const c = client();
    const { data, error } = await c.from('newsroom_article_revisions').insert(row).select().single();
    if (error) throw error;
    if (next === 'PENDING_REVIEW') {
      const action = current.workflow_state === 'ON_HOLD' ? 'RESUBMITTED' : ['APPROVED', 'PUBLISHED'].includes(current.workflow_state) ? 'REVISION_SUBMITTED' : 'SUBMITTED';
      await c.from('newsroom_publish_history').insert({ article_id: req.params.id, revision_id: row.revision_id, action, actor_user_id: actor.id, from_status: current.workflow_state, to_status: next });
    }
    res.json({ article: normalize(data) });
  } catch (e) { sendAuthError(res, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    const actor = requireEditor(await authenticateRequest(req));
    const c = client();
    const current = await latestOwnedRevision(req.params.id, actor);
    if (current.workflow_state === 'ARCHIVED') return res.json({ ok: true });
    const row = { ...current, revision_id: `REV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, workflow_state: 'ARCHIVED', review_note: null, created_at: new Date().toISOString() };
    delete row.id;
    const { error: re } = await c.from('newsroom_article_revisions').insert(row); if (re) throw re;
    const { error: rpcError } = await c.rpc('newsroom_unpublish_owned_article', { target_article_id: req.params.id }); if (rpcError) throw rpcError;
    await c.from('newsroom_publish_history').insert({ article_id: req.params.id, revision_id: row.revision_id, action: 'ARCHIVED_BY_AUTHOR', actor_user_id: actor.id, from_status: current.workflow_state, to_status: 'ARCHIVED' });
    res.json({ ok: true });
  } catch (e) { sendAuthError(res, e); }
});

export default router;
