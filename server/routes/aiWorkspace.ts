import { Router } from 'express';
import multer from 'multer';
import { db } from '../db/database.js';
import { excelService, extractExcelFilesFromUploads } from '../services/excel.js';
import { integratedArticleService } from '../services/integrated.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const router = Router();

// In-memory cache for batch file downloads
const batchFiles = new Map<string, { buffer: Buffer; filename: string }>();

// In-memory progress tracking for asynchronous batch export
interface ExportJob {
  id: string;
  status: 'PROCESSING' | 'COMPLETED' | 'ERROR';
  current: number;
  total: number;
  progress: number;
  message: string;
  result?: {
    batchId: string;
    zipFilename: string;
    downloadZipUrl: string;
    fileCount: number;
    totalArticles: number;
  };
  error?: string;
  createdAt: number;
}

const exportJobs = new Map<string, ExportJob>();

// Clean up stale export jobs older than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of exportJobs.entries()) {
    if (job.createdAt < cutoff) exportJobs.delete(id);
  }
}, 5 * 60 * 1000);

// GET /api/ai/metrics - Processing status dashboard
router.get('/metrics', (req, res) => {
  const articles = Object.values(db.core.articles);
  const raw = articles.filter(a => a.processing_status === 'RAW').length;
  const exportReady = articles.filter(a => a.processing_status === 'EXPORT_READY').length;
  const exported = articles.filter(a => a.processing_status === 'EXPORTED').length;
  const partial = articles.filter(a => a.processing_status === 'PARTIAL').length;
  const processed = articles.filter(a => a.processing_status === 'PROCESSED').length;
  const error = articles.filter(a => a.processing_status === 'ERROR').length;

  const totalBatches = Object.keys(db.core.aiBatches).length;
  const totalEvents = Object.keys(db.core.events).length;
  const totalTags = Object.keys(db.core.tagConcepts).length;
  const queuedUrls = Object.values(db.core.eventUrls).filter(u => u.status === 'READY' || u.status === 'QUEUED').length;

  res.json({
    articles: { total: articles.length, raw, exportReady, exported, partial, processed, error },
    batches: totalBatches,
    events: totalEvents,
    tags: totalTags,
    queuedUrls
  });
});

// GET /api/ai/batches - List all batches
router.get('/batches', (req, res) => {
  const batches = Object.values(db.core.aiBatches).sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  res.json({ batches });
});

// DELETE /api/ai/batches - Delete all AI article packages
router.delete('/batches', (req, res) => {
  const count = Object.keys(db.core.aiBatches).length;
  db.core.aiBatches = {};
  batchFiles.clear();
  excelService.zipCache.clear();

  // Revert all articles with EXPORTED status back to RAW
  let resetCount = 0;
  for (const art of Object.values(db.core.articles)) {
    if (art.processing_status === 'EXPORTED') {
      art.processing_status = 'RAW';
      resetCount++;
    }
  }

  db.save();
  res.json({
    success: true,
    count,
    resetArticles: resetCount,
    message: `All AI article packages deleted and ${resetCount} articles reverted from EXPORTED to RAW.`
  });
});

// DELETE /api/ai/batch/:id - Delete a specific AI batch
router.delete('/batch/:id', (req, res) => {
  const { id } = req.params;
  const batch = db.core.aiBatches[id];
  const existed = !!batch;

  let resetCount = 0;
  if (batch) {
    const targetArticleIds: string[] = (batch as any).article_ids || [];
    for (const artId of targetArticleIds) {
      if (db.core.articles[artId] && db.core.articles[artId].processing_status === 'EXPORTED') {
        db.core.articles[artId].processing_status = 'RAW';
        resetCount++;
      }
    }
    delete db.core.aiBatches[id];
  }

  // If no more batches remain in db, also ensure no orphan EXPORTED articles remain
  if (Object.keys(db.core.aiBatches).length === 0) {
    for (const art of Object.values(db.core.articles)) {
      if (art.processing_status === 'EXPORTED') {
        art.processing_status = 'RAW';
        resetCount++;
      }
    }
  }

  batchFiles.delete(id);
  excelService.zipCache.delete(id);
  db.save();
  res.json({
    success: true,
    existed,
    resetArticles: resetCount,
    message: `Package ${id} deleted and ${resetCount} article(s) reverted to RAW.`
  });
});

// POST /api/ai/reset-exported - Reset stuck EXPORTED articles back to RAW
router.post('/reset-exported', (req, res) => {
  let count = 0;
  for (const art of Object.values(db.core.articles)) {
    if (art.processing_status === 'EXPORTED') {
      art.processing_status = 'RAW';
      count++;
    }
  }
  db.save();
  res.json({ success: true, resetCount: count, message: `Reverted ${count} articles from EXPORTED to RAW.` });
});

// POST /api/ai/batch/article - Create Article Processing XLSX Batch (single file)
router.post('/batch/article', (req, res) => {
  const { articleIds, batchName, includeProcessed } = req.body;
  let targetIds = articleIds;

  if (!targetIds || targetIds.length === 0) {
    const all = Object.values(db.core.articles);
    // Sort all articles by newest first (priority 1)
    all.sort((a, b) => new Date(b.published_at || b.collected_at).getTime() - new Date(a.published_at || a.collected_at).getTime());

    const filterFn = includeProcessed
      ? () => true
      : (a: any) => a.processing_status === 'RAW' || a.processing_status === 'EXPORT_READY' || a.processing_status === 'PARTIAL';
    
    targetIds = all
      .filter(filterFn)
      .map(a => a.article_id)
      .slice(0, db.core.settings.articleBatchMax || 25);
  } else {
    // Sort selected articles by newest first
    targetIds = [...targetIds].sort((idA, idB) => {
      const artA = db.core.articles[idA];
      const artB = db.core.articles[idB];
      const timeA = artA ? new Date(artA.published_at || artA.collected_at).getTime() : 0;
      const timeB = artB ? new Date(artB.published_at || artB.collected_at).getTime() : 0;
      return timeB - timeA;
    });
  }

  if (!targetIds || targetIds.length === 0) {
    return res.status(400).json({ error: 'No articles selected or available for export' });
  }

  const { buffer, filename, batchId } = excelService.generateArticleBatchWorkbook(targetIds, batchName);
  batchFiles.set(batchId, { buffer, filename });

  res.json({
    success: true,
    batchId,
    filename,
    downloadUrl: `/api/ai/batch/${batchId}/download`,
    itemCount: targetIds.length
  });
});

// POST /api/ai/batch/multi-article/start - Start async generation of 100 Excel files ZIP (with progress reporting)
router.post('/batch/multi-article/start', async (req, res) => {
  const { articleIds, batchName, chunkSize = 25, targetTotal = 2500, includeProcessed = false } = req.body;
  let targetIds = articleIds;

  if (!targetIds || targetIds.length === 0) {
    const all = Object.values(db.core.articles);
    // Sort newest first (priority 1)
    all.sort((a, b) => new Date(b.published_at || b.collected_at).getTime() - new Date(a.published_at || a.collected_at).getTime());

    const pending = all.filter(a => a.processing_status === 'RAW' || a.processing_status === 'EXPORT_READY' || a.processing_status === 'PARTIAL');
    const processed = all.filter(a => a.processing_status === 'PROCESSED');
    
    if (includeProcessed) {
      targetIds = [...pending, ...processed].map(a => a.article_id);
    } else {
      targetIds = pending.map(a => a.article_id);
    }
  } else {
    // Sort selected articles by newest first (priority 1)
    targetIds = [...targetIds].sort((idA, idB) => {
      const artA = db.core.articles[idA];
      const artB = db.core.articles[idB];
      const timeA = artA ? new Date(artA.published_at || artA.collected_at).getTime() : 0;
      const timeB = artB ? new Date(artB.published_at || artB.collected_at).getTime() : 0;
      return timeB - timeA;
    });

    if (!includeProcessed) {
      targetIds = targetIds.filter((id: string) => db.core.articles[id]?.processing_status !== 'PROCESSED');
    }
  }

  if (!targetIds || targetIds.length === 0) {
    return res.status(400).json({ error: '처리 대기 중인(남은) 기사가 없습니다. 모든 기사가 이미 처리(PROCESSED) 완료되었습니다.' });
  }

  const jobId = `EXPORT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const totalChunks = Math.max(1, Math.min(100, Math.ceil(targetIds.length / chunkSize)));

  const job: ExportJob = {
    id: jobId,
    status: 'PROCESSING',
    current: 0,
    total: totalChunks,
    progress: 0,
    message: `Starting packaging of ${totalChunks} files...`,
    createdAt: Date.now()
  };
  exportJobs.set(jobId, job);

  // Run asynchronously in background
  excelService.generateMultiArticleBatchZip(
    targetIds,
    batchName || 'AI Article Package (100 Files / 2500 Articles)',
    Number(chunkSize),
    Number(targetTotal),
    (current, total, message) => {
      job.current = current;
      job.total = total;
      job.progress = Math.min(99, Math.round((current / total) * 100));
      job.message = message;
    }
  ).then(result => {
    job.status = 'COMPLETED';
    job.progress = 100;
    job.message = `Successfully completed ${result.fileCount} Excel workbooks in ZIP package.`;
    job.result = {
      batchId: result.batchId,
      zipFilename: result.zipFilename,
      downloadZipUrl: `/api/ai/batch/${result.batchId}/download-zip`,
      fileCount: result.fileCount,
      totalArticles: result.totalArticles
    };
  }).catch(err => {
    job.status = 'ERROR';
    job.error = err.message || 'Generation failed';
    job.message = `Failed to generate package: ${err.message}`;
  });

  res.json({
    success: true,
    jobId,
    totalChunks,
    message: 'Package generation started'
  });
});

// GET /api/ai/batch/multi-article/progress/:jobId - Poll generation progress
router.get('/batch/multi-article/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = exportJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Export job not found or expired.' });
  }
  res.json(job);
});

// POST /api/ai/batch/multi-article - Create 100 Excel files (25 articles each) in a single ZIP (synchronous fallback)
router.post('/batch/multi-article', async (req, res) => {
  const { articleIds, batchName, chunkSize = 25, targetTotal = 2500, includeProcessed = true } = req.body;
  let targetIds = articleIds;

  if (!targetIds || targetIds.length === 0) {
    const all = Object.values(db.core.articles);
    const pending = all.filter(a => a.processing_status === 'RAW' || a.processing_status === 'EXPORT_READY' || a.processing_status === 'PARTIAL');
    const processed = all.filter(a => a.processing_status === 'PROCESSED');
    
    if (includeProcessed) {
      targetIds = [...pending, ...processed].map(a => a.article_id);
    } else {
      targetIds = pending.map(a => a.article_id);
    }
  }

  if (!targetIds || targetIds.length === 0) {
    targetIds = Object.keys(db.core.articles);
  }

  if (targetIds.length === 0) {
    return res.status(400).json({ error: 'No articles found in database to package into batch.' });
  }

  try {
    const result = await excelService.generateMultiArticleBatchZip(
      targetIds,
      batchName || 'AI Article Package (100 Files / 2500 Articles)',
      Number(chunkSize),
      Number(targetTotal)
    );

    res.json({
      success: true,
      batchId: result.batchId,
      zipFilename: result.zipFilename,
      downloadZipUrl: `/api/ai/batch/${result.batchId}/download-zip`,
      fileCount: result.fileCount,
      totalArticles: result.totalArticles
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to generate multi-article batch ZIP: ${err.message}` });
  }
});

// GET /api/ai/batch/:id/download-zip - Stream multi-part batch ZIP file
router.get('/batch/:id/download-zip', (req, res) => {
  const { id } = req.params;
  const cached = excelService.zipCache.get(id);
  if (!cached) {
    return res.status(404).send('ZIP archive expired or not found. Please regenerate.');
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${cached.filename}"`);
  res.setHeader('Content-Length', cached.buffer.length);
  res.send(cached.buffer);
});

// POST /api/ai/batch/event-urls - Create Event URL XLSX Batch
router.post('/batch/event-urls', (req, res) => {
  const { urlIds } = req.body;
  const targetIds = urlIds || Object.values(db.core.eventUrls)
    .filter(u => u.status === 'READY')
    .map(u => u.id)
    .slice(0, db.core.settings.eventBatchMax || 30);

  if (!targetIds || targetIds.length === 0) {
    return res.status(400).json({ error: 'No ready event URLs selected or available for batch' });
  }

  const { buffer, filename, batchId } = excelService.generateEventUrlWorkbook(targetIds);
  batchFiles.set(batchId, { buffer, filename });

  res.json({
    success: true,
    batchId,
    filename,
    downloadUrl: `/api/ai/batch/${batchId}/download`,
    itemCount: targetIds.length
  });
});

// POST /api/ai/batch/integrated - Create Integrated Article XLSX Batch
router.post('/batch/integrated', (req, res) => {
  const { articleIds, topicTitle } = req.body;
  if (!articleIds || articleIds.length < 2) {
    return res.status(400).json({ error: 'At least 2 source articles must be selected for integration' });
  }

  const { buffer, filename, batchId } = excelService.generateIntegratedArticleWorkbook(articleIds, topicTitle);
  batchFiles.set(batchId, { buffer, filename });

  res.json({
    success: true,
    batchId,
    filename,
    downloadUrl: `/api/ai/batch/${batchId}/download`,
    itemCount: articleIds.length
  });
});

// GET /api/ai/batch/:id/download - Download XLSX workbook
router.get('/batch/:id/download', (req, res) => {
  const { id } = req.params;
  const file = batchFiles.get(id);
  if (!file) {
    return res.status(404).send('Batch file expired or not found. Please regenerate.');
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.buffer);
});

// POST /api/ai/import/preview - Upload & preview Excel workbook(s) or ZIP package (supports single file, multi-file, or complete ZIP)
router.post('/import/preview', upload.any(), (req, res) => {
  const rawFiles = (req.files as Express.Multer.File[]) || [];
  if (rawFiles.length === 0) {
    return res.status(400).json({ error: 'No Excel (.xlsx) or ZIP package file(s) uploaded' });
  }

  try {
    const fileEntries = extractExcelFilesFromUploads(rawFiles.map(f => ({
      filename: f.originalname,
      buffer: f.buffer
    })));

    if (fileEntries.length === 0) {
      return res.status(400).json({ error: 'No valid Excel (.xlsx, .xls) workbooks found in uploaded file(s) or ZIP archive.' });
    }

    if (fileEntries.length === 1) {
      const preview = excelService.previewArticleWorkbook(fileEntries[0].buffer);
      return res.json({
        preview,
        isMultiFile: false,
        totalFiles: 1,
        filename: fileEntries[0].filename
      });
    }

    // Multiple files preview
    const multiPreview = excelService.previewMultipleWorkbooks(fileEntries);
    return res.json({
      preview: {
        totalArticles: multiPreview.totalArticles,
        koCount: multiPreview.koCount,
        enCount: multiPreview.enCount,
        rwCount: multiPreview.rwCount,
        eventCandidatesCount: multiPreview.eventCandidatesCount,
        tagsCount: multiPreview.tagsCount,
        relationsCount: multiPreview.relationsCount,
        errors: multiPreview.errors,
        warnings: multiPreview.warnings,
        validArticleIds: []
      },
      multiPreview,
      isMultiFile: true,
      totalFiles: fileEntries.length
    });
  } catch (err: any) {
    res.status(400).json({ error: `Failed to read Excel workbook(s): ${err.message}` });
  }
});

// POST /api/ai/import/commit - Commit Excel workbook(s) or ZIP package into database
router.post('/import/commit', upload.any(), (req, res) => {
  const rawFiles = (req.files as Express.Multer.File[]) || [];
  if (rawFiles.length === 0) {
    return res.status(400).json({ error: 'No Excel (.xlsx) or ZIP package file(s) uploaded' });
  }

  try {
    const fileEntries = extractExcelFilesFromUploads(rawFiles.map(f => ({
      filename: f.originalname,
      buffer: f.buffer
    })));

    if (fileEntries.length === 0) {
      return res.status(400).json({ error: 'No valid Excel (.xlsx, .xls) workbooks found in uploaded file(s) or ZIP archive.' });
    }

    if (fileEntries.length === 1) {
      const result = excelService.importArticleWorkbook(fileEntries[0].buffer);
      return res.json({
        ...result,
        isMultiFile: false,
        totalFiles: 1,
        filename: fileEntries[0].filename
      });
    }

    const multiResult = excelService.importMultipleWorkbooks(fileEntries);
    return res.json({
      ...multiResult,
      isMultiFile: true,
      filename: `${fileEntries.length} Excel workbooks (from bulk upload / ZIP)`
    });
  } catch (err: any) {
    res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

// GET /api/ai/integrated-articles - List integrated articles
router.get('/integrated-articles', (req, res) => {
  const articles = Object.values(db.core.integratedArticles).sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  res.json({ articles });
});

// GET /api/ai/integrated-articles/:id - Get integrated article with sentence traces
router.get('/integrated-articles/:id', (req, res) => {
  const art = db.core.integratedArticles[req.params.id];
  if (!art) return res.status(404).json({ error: 'Integrated article not found' });

  const sentences = integratedArticleService.getSentenceTraces(req.params.id);
  const sourceArticles = art.source_article_ids.map(id => db.core.articles[id]).filter(Boolean);

  res.json({
    article: art,
    sentences,
    sourceArticles
  });
});

export default router;
