import { Router } from 'express';
import { db } from '../db/database.js';
import { buildStoryAgentCommand, parseStoryAgentResult } from '../services/storyAgentProtocol.js';

const router = Router();
const batches = new Map<string, { articleIds: string[]; proposed?: ReturnType<typeof parseStoryAgentResult> }>();

router.post('/batch', (req, res) => {
  const requested: string[] = Array.isArray(req.body?.articleIds) ? req.body.articleIds : [];
  const articleIds = requested.length
    ? requested.filter(id => !!db.core.articles[id]).slice(0, 150)
    : Object.values(db.core.articles).filter(a => !a.story_cluster_id).slice(0, 150).map(a => a.article_id);
  const batchId = `STORY-${Date.now().toString(36)}`;
  batches.set(batchId, { articleIds });
  const articles = articleIds.map(id => db.core.articles[id]).filter(Boolean).map(a => ({ articleId: a.article_id, title: a.original_title, body: a.original_body, sourceId: a.source_id, publishedAt: a.published_at, existingClusterId: a.story_cluster_id || null }));
  res.json({ batchId, count: articles.length, command: buildStoryAgentCommand(batchId, articles) });
});

router.post('/batch/:batchId/validate', (req, res) => {
  const batch = batches.get(req.params.batchId);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  try {
    const proposed = parseStoryAgentResult(typeof req.body?.result === 'string' ? req.body.result : JSON.stringify(req.body?.result), req.params.batchId, new Set(batch.articleIds));
    batch.proposed = proposed;
    res.json({ valid: true, proposed });
  } catch (error) {
    res.status(400).json({ valid: false, error: error instanceof Error ? error.message : 'Invalid result' });
  }
});

export default router;
