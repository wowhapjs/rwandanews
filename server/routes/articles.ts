import { Router } from 'express';
import { fetchArticlesDirectly, fetchArticleDetailDirectly } from '../db/supabaseStore.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const q = req.query as any;
    const limit = Math.max(1, Math.min(Number(q.limit || 30), 100));
    const offset = Math.max(0, Number(q.offset || 0));
    const list = (value: unknown) => String(value || '').split(',').map(v => v.trim()).filter(Boolean);
    const result = await fetchArticlesDirectly({
      ...q,
      limit,
      offset,
      search: String(q.search || '').trim(),
      sort: String(q.sort || 'newest'),
      lang: String(q.lang || 'original'),
      categories: list(q.categories), regions: list(q.regions), aiStatus: list(q.aiStatus),
      sources: list(q.sources), languages: list(q.languages), tags: list(q.tags),
      excludeCategories: list(q.excludeCategories), excludeRegions: list(q.excludeRegions),
      excludeSources: list(q.excludeSources), excludeLanguages: list(q.excludeLanguages), excludeTags: list(q.excludeTags),
    });
    res.json(result);
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : 'Supabase article service unavailable', source: 'supabase' });
  }
});

router.post('/group-similar', (_req, res) => res.status(410).json({ success:false, error:'Heuristic grouping is disabled. Use the AI Agent Story Clustering workflow.' }));

router.get('/:id', async (req, res) => {
  try {
    const detail = await fetchArticleDetailDirectly(req.params.id);
    if (!detail) return res.status(404).json({ error:'Article not found in Supabase' });
    return res.json({ article:detail, localized:{ko:detail.ko,en:detail.en,rw:detail.rw}, ko:detail.ko, en:detail.en, rw:detail.rw, similarArticles:detail.cluster_articles || [] });
  } catch (error) {
    return res.status(503).json({ error:error instanceof Error ? error.message : 'Supabase article service unavailable', source:'supabase' });
  }
});

export default router;
