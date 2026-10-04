import { db } from '../db/database.js';
import { sourceRegistry } from '../sources/registry.js';
import { deduplicationService } from './dedup.js';
import { contentHash, normalizeTitle } from '../sources/utils/hash.js';
import { ArticleRecord } from '../db/types.js';
import { insertArticleDirectly, isArticleUrlExistingDirectly } from '../db/supabaseStore.js';

export class CrawlerService {
  private activeRuns: Map<string, boolean> = new Map();

  async runCrawl(sourceId: string, mode: 'backfill' | 'incremental', daysToBackfill = 365): Promise<{ success: boolean; discovered: number; imported: number; message: string }> {
    if (this.activeRuns.get(sourceId)) {
      return { success: false, discovered: 0, imported: 0, message: `Crawl already running for ${sourceId}` };
    }

    const adapter = sourceRegistry.getAdapter(sourceId);
    if (!adapter) {
      return { success: false, discovered: 0, imported: 0, message: `Unknown source ${sourceId}` };
    }

    this.activeRuns.set(sourceId, true);
    const runId = `RUN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cutoffDate = mode === 'backfill'
      ? new Date(Date.now() - daysToBackfill * 24 * 60 * 60 * 1000)
      : undefined;

    // Check existing checkpoint for backfill
    const checkpoint = db.core.sourceCheckpoints[sourceId];
    const checkpointPage = (mode === 'backfill' && checkpoint) ? checkpoint.currentPage : 1;

    db.core.sourceRuns[runId] = {
      id: runId,
      sourceId,
      runType: mode,
      startedAt: new Date().toISOString(),
      status: 'running',
      articlesDiscovered: 0,
      articlesImported: 0,
      errorsCount: 0,
      lastSuccessfulPage: checkpointPage
    };
    db.save();

    let discoveredCount = 0;
    let importedCount = 0;

    try {
      const discovery = await adapter.discoverArticles({
        mode,
        cutoffDate,
        checkpointPage,
        maxPagesPerSection: mode === 'backfill' ? 50 : 2
      });

      discoveredCount = discovery.articles.length;
      db.core.sourceRuns[runId].articlesDiscovered = discoveredCount;
      db.core.sourceRuns[runId].lastSuccessfulPage = discovery.lastSuccessfulPage;

      // Update checkpoint
      db.core.sourceCheckpoints[sourceId] = {
        sourceId,
        section: 'all',
        currentPage: discovery.lastSuccessfulPage,
        lastSuccessfulPage: discovery.lastSuccessfulPage,
        oldestDateReached: discovery.oldestDateReached?.toISOString(),
        checkpointTime: new Date().toISOString()
      };

      // Ingest each discovered article
      for (const hint of discovery.articles) {
        // Skip if already in Supabase (or memory)
        const alreadyInSupabase = await isArticleUrlExistingDirectly(hint.url);
        if (alreadyInSupabase) continue;

        const existingByUrl = Object.values(db.core.articles).find(a => a.source_url === hint.url);
        if (existingByUrl) continue;

        try {
          // Delay to respect rate limits (500ms)
          await new Promise(r => setTimeout(r, 500));

          const html = await adapter.fetchArticle(hint.url);
          const parsed = await adapter.parseArticle(html, hint.url);

          if (!parsed) {
            // Requirement 51: Never fabricate data. If extraction fails, log it.
            db.core.sourceRuns[runId].errorsCount++;
            continue;
          }

          const articleId = `ART-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          const normalizedTitleStr = normalizeTitle(parsed.originalTitle);
          const hashStr = contentHash(parsed.originalBody);

          const newArticle: ArticleRecord = {
            article_id: articleId,
            source_id: parsed.sourceId,
            source_url: parsed.sourceUrl,
            canonical_url: parsed.canonicalUrl,
            original_language: parsed.originalLanguage,
            original_title: parsed.originalTitle,
            original_subtitle: parsed.originalSubtitle,
            original_body: parsed.originalBody,
            author: parsed.author,
            published_at: parsed.publishedAt,
            collected_at: new Date().toISOString(),
            source_section: parsed.sourceSection,
            source_subcategory: parsed.sourceSubcategory,
            portal_category_id: (parsed.portalCategoryId && ['tech', 'economy', 'sports', 'politics', 'volunteers', 'living'].includes(parsed.portalCategoryId.toLowerCase())) ? parsed.portalCategoryId : 'undefined',
            region: parsed.region || db.core.sources[parsed.sourceId]?.region || 'undefined',
            lead_image_url: parsed.leadImageUrl,
            image_urls: parsed.imageUrls,
            content_blocks: parsed.contentBlocks,
            processing_status: 'RAW',
            normalized_title: normalizedTitleStr,
            content_hash: hashStr,
            created_at: new Date().toISOString()
          };

          // Save directly to Supabase as primary database
          await insertArticleDirectly(newArticle);
          importedCount++;
          db.core.sourceRuns[runId].articlesImported = importedCount;
        } catch (itemErr: any) {
          db.core.sourceRuns[runId].errorsCount++;
          db.core.sourceRuns[runId].lastError = itemErr.message || 'Error fetching article';
        }
      }

      db.core.sourceRuns[runId].status = 'completed';
      db.core.sourceRuns[runId].completedAt = new Date().toISOString();
      db.save();

      return {
        success: true,
        discovered: discoveredCount,
        imported: importedCount,
        message: `Successfully completed crawl for ${adapter.getMetadata().name}`
      };
    } catch (err: any) {
      db.core.sourceRuns[runId].status = 'failed';
      db.core.sourceRuns[runId].completedAt = new Date().toISOString();
      db.core.sourceRuns[runId].lastError = err.message || 'Crawl failed';
      db.save();
      return {
        success: false,
        discovered: discoveredCount,
        imported: importedCount,
        message: `Crawl error: ${err.message}`
      };
    } finally {
      this.activeRuns.delete(sourceId);
    }
  }

  isSourceRunning(sourceId: string): boolean {
    return !!this.activeRuns.get(sourceId);
  }

  async runCrawlAll(mode: 'backfill' | 'incremental', daysToBackfill = 365): Promise<{ totalStarted: number; message: string }> {
    const allMeta = sourceRegistry.getAllMetadata();
    const enabledSources = allMeta.filter(meta => {
      const rec = db.core.sources[meta.id];
      return rec ? rec.enabled !== false : meta.enabled;
    });

    // Execute crawls sequentially with slight interval to prevent excessive resource contention
    (async () => {
      for (const src of enabledSources) {
        try {
          await this.runCrawl(src.id, mode, daysToBackfill);
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          console.error(`Error in runCrawlAll for source ${src.id}:`, e);
        }
      }
    })();

    return {
      totalStarted: enabledSources.length,
      message: `Started ${mode} crawl for ${enabledSources.length} sources`
    };
  }
}

export const crawlerService = new CrawlerService();
