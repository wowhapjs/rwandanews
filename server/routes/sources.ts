import { Router } from 'express';
import { db } from '../db/database.js';
import { sourceRegistry } from '../sources/registry.js';
import { crawlerService } from '../services/crawler.js';
import { fetchSourceArticleCountsDirectly } from '../db/supabaseStore.js';

const router = Router();

// GET /api/sources - List all sources with status & discovery metrics
router.get('/', async (req, res) => {
  const allMeta = sourceRegistry.getAllMetadata();
  const directCounts = await fetchSourceArticleCountsDirectly();

  const enriched = allMeta.map(meta => {
    const record = db.core.sources[meta.id] || {
      id: meta.id,
      enabled: meta.enabled,
      createdAt: new Date().toISOString()
    };

    const checkpoint = db.core.sourceCheckpoints[meta.id];

    // Articles count from this source directly from Supabase
    const articlesCount = directCounts[meta.id] ?? 0;

    // Runs
    const runs = Object.values(db.core.sourceRuns)
      .filter(r => r.sourceId === meta.id)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    const lastRun = runs[0];
    const isRunning = crawlerService.isSourceRunning(meta.id);

    return {
      ...meta,
      enabled: record.enabled ?? true,
      isRunning,
      articlesDiscovered: articlesCount,
      articlesImported: articlesCount,
      checkpoint,
      lastRun
    };
  });

  res.json({ sources: enriched });
});

// POST /api/sources/crawl-all - Trigger crawl for all enabled sources (incremental or backfill)
router.post('/crawl-all', async (req, res) => {
  const { mode = 'incremental', days = 365 } = req.body;
  const result = await crawlerService.runCrawlAll(mode, Number(days));
  res.json({
    success: true,
    message: result.message,
    totalStarted: result.totalStarted,
    mode
  });
});

// POST /api/sources/:id/crawl - Trigger crawl (incremental or backfill)
router.post('/:id/crawl', async (req, res) => {
  const { id } = req.params;
  const { mode = 'incremental', days = 365 } = req.body;

  // Run in background or wait up to 2 seconds
  crawlerService.runCrawl(id, mode, Number(days)).catch(err => {
    console.error(`Crawler background error for ${id}:`, err);
  });

  res.json({
    success: true,
    message: `Started ${mode} crawl for source ${id}`,
    sourceId: id,
    mode
  });
});

// POST /api/sources/:id/toggle - Enable / disable source
router.post('/:id/toggle', (req, res) => {
  const { id } = req.params;
  if (!db.core.sources[id]) {
    const meta = sourceRegistry.getAdapter(id)?.getMetadata();
    if (!meta) return res.status(404).json({ error: 'Source not found' });
    db.core.sources[id] = {
      id,
      domain: meta.domain,
      name: meta.name,
      region: meta.region,
      type: meta.type,
      defaultLanguage: meta.defaultLanguage,
      homeUrl: meta.homeUrl,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  db.core.sources[id].enabled = !db.core.sources[id].enabled;
  db.save();
  res.json({ success: true, enabled: db.core.sources[id].enabled });
});

// GET /api/sources/:id/runs - Recent runs & error logs
router.get('/:id/runs', (req, res) => {
  const { id } = req.params;
  const runs = Object.values(db.core.sourceRuns)
    .filter(r => r.sourceId === id)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 20);

  res.json({ runs });
});

export default router;
