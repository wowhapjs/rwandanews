import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import {
  AiBatchRecord,
  ArticleRecord,
  EventMatchCandidateRecord,
  EventRecord,
  EventUrlRecord,
  IntegratedArticleRecord,
  IntegratedSentenceRecord,
  IntegratedSentenceSourceRecord,
  LocalizedArticleRecord,
  LocalizedEventTextRecord,
  LocalizedTagRecord,
  SavedEventViewRecord,
  SourceCheckpointRecord,
  SourceRecord,
  SourceRunRecord,
  StoryClusterRecord,
  TagAliasRecord,
  TagConceptRecord,
  ArticleRelationsRecord
} from './types.js';

export interface PortalCoreSchema {
  sources: Record<string, SourceRecord>;
  sourceRuns: Record<string, SourceRunRecord>;
  sourceCheckpoints: Record<string, SourceCheckpointRecord>;
  articles: Record<string, ArticleRecord>;
  duplicateGroups: Record<string, { id: string; canonicalArticleId: string; articleIds: string[] }>;
  storyClusters: Record<string, StoryClusterRecord>;
  storyClusterArticles: Record<string, string[]>; // clusterId -> articleIds
  articleRelations?: Record<string, ArticleRelationsRecord>; // articleId -> similar/previous/future
  tagConcepts: Record<string, TagConceptRecord>;
  tagAliases: Record<string, TagAliasRecord>;
  events: Record<string, EventRecord>;
  eventArticles: Record<string, string[]>; // eventId -> articleIds
  eventMatchCandidates: Record<string, EventMatchCandidateRecord>;
  eventMergeHistory: Record<string, { id: string; canonicalEventId: string; mergedEvent: EventRecord; timestamp: string }>;
  eventUrls: Record<string, EventUrlRecord>;
  aiBatches: Record<string, AiBatchRecord>;
  integratedArticles: Record<string, IntegratedArticleRecord>;
  integratedSentences: Record<string, IntegratedSentenceRecord>;
  integratedSentenceSources: Record<string, IntegratedSentenceSourceRecord>;
  savedEventViews: Record<string, SavedEventViewRecord>;
  settings: Record<string, any>;
}

export interface LocalizedSchema {
  articles: Record<string, LocalizedArticleRecord>;
  tags: Record<string, LocalizedTagRecord>;
  articleTags: Record<string, string[]>; // articleId -> tagConceptIds
  eventText: Record<string, LocalizedEventTextRecord>;
  eventTags: Record<string, string[]>; // eventId -> tagConceptIds
}

const MOCK_ARTICLE_IDS = new Set(['ART-001', 'ART-002', 'ART-003', 'ART-004', 'ART-005', 'ART-006']);
const MOCK_EVENT_IDS = new Set(['EVT-001', 'EVT-002', 'EVT-003']);
const MOCK_CLUSTER_IDS = new Set(['CLUSTER-001']);
const MOCK_INTEGRATED_IDS = new Set(['INT-001']);

export class DatabaseManager {
  private dataDir: string;
  public sqlite: DatabaseSync | null = null;
  public isSupabasePrimary: boolean = false;
  public core: PortalCoreSchema;
  public ko: LocalizedSchema;
  public en: LocalizedSchema;
  public rw: LocalizedSchema;
  private saveTimeout: NodeJS.Timeout | null = null;
  private isSaving: boolean = false;
  private syncTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.dataDir = path.resolve(process.env.DATA_DIR || './data');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    const dbPath = path.join(this.dataDir, 'portal.db');
    if (fs.existsSync(dbPath)) {
      try {
        this.sqlite = new DatabaseSync(dbPath);
        // High performance WAL mode
        this.sqlite.exec(`
          PRAGMA journal_mode = WAL;
          PRAGMA synchronous = NORMAL;
          PRAGMA temp_store = MEMORY;
          PRAGMA cache_size = -64000;
        `);
        this.initTables();
      } catch (err) {
        console.warn('[DatabaseManager] Could not open SQLite database:', err);
        this.sqlite = null;
      }
    } else {
      this.sqlite = null;
    }

    // Default schemas in memory
    this.core = {
      sources: {},
      sourceRuns: {},
      sourceCheckpoints: {},
      articles: {},
      duplicateGroups: {},
      storyClusters: {},
      storyClusterArticles: {},
      tagConcepts: {},
      tagAliases: {},
      events: {},
      eventArticles: {},
      eventMatchCandidates: {},
      eventMergeHistory: {},
      eventUrls: {},
      aiBatches: {},
      integratedArticles: {},
      integratedSentences: {},
      integratedSentenceSources: {},
      savedEventViews: {},
      settings: {
        defaultLanguage: 'original',
        portalTheme: 'BLACK',
        defaultNewsViewMode: 'PHOTO_TEXT',
        defaultEventListViewMode: 'CARD',
        articleBatchTarget: 20,
        articleBatchMax: 25,
        articleCharLimit: 300000,
        eventBatchTarget: 20,
        eventBatchMax: 30,
        eventCharLimit: 250000,
        crawlerIntervalMinutes: 60,
        eventAutoMergeThreshold: 0.95,
        eventReviewThreshold: 0.70,
        defaultTimezone: 'Africa/Kigali'
      }
    };

    this.ko = { articles: {}, tags: {}, articleTags: {}, eventText: {}, eventTags: {} };
    this.en = { articles: {}, tags: {}, articleTags: {}, eventText: {}, eventTags: {} };
    this.rw = { articles: {}, tags: {}, articleTags: {}, eventText: {}, eventTags: {} };

    // Initial load: migrate from JSON if DB is new, otherwise load from SQLite
    if (this.sqlite) {
      this.loadFromSqliteOrMigrate();
      this.purgeMockData();
      this.autoClassifyUncategorizedArticles();
    }
  }

  private initTables(): void {
    if (!this.sqlite) return;
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        article_id TEXT PRIMARY KEY,
        source_id TEXT,
        source_url TEXT,
        canonical_url TEXT,
        original_language TEXT,
        original_title TEXT,
        original_subtitle TEXT,
        original_body TEXT,
        author TEXT,
        published_at TEXT,
        collected_at TEXT,
        source_section TEXT,
        source_subcategory TEXT,
        portal_category_id TEXT,
        lead_image_url TEXT,
        image_urls TEXT,
        content_blocks TEXT,
        processing_status TEXT,
        normalized_title TEXT,
        content_hash TEXT,
        story_cluster_id TEXT,
        created_at TEXT,
        raw_record TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
      CREATE INDEX IF NOT EXISTS idx_articles_source_id ON articles(source_id);
      CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(processing_status);
      CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(portal_category_id);

      CREATE TABLE IF NOT EXISTS localized_articles (
        article_id TEXT,
        lang TEXT,
        title TEXT,
        subtitle TEXT,
        summary TEXT,
        body TEXT,
        category_label TEXT,
        processed_at TEXT,
        batch_id TEXT,
        content_blocks TEXT,
        raw_record TEXT,
        PRIMARY KEY (article_id, lang)
      );

      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        domain TEXT,
        name TEXT,
        region TEXT,
        type TEXT,
        default_language TEXT,
        home_url TEXT,
        enabled INTEGER,
        created_at TEXT,
        updated_at TEXT,
        raw_record TEXT
      );

      CREATE TABLE IF NOT EXISTS source_runs (
        id TEXT PRIMARY KEY,
        source_id TEXT,
        started_at TEXT,
        raw_record TEXT
      );

      CREATE TABLE IF NOT EXISTS source_checkpoints (
        source_id TEXT PRIMARY KEY,
        raw_record TEXT
      );

      CREATE TABLE IF NOT EXISTS story_clusters (
        id TEXT PRIMARY KEY,
        raw_record TEXT
      );

      CREATE TABLE IF NOT EXISTS story_cluster_articles (
        cluster_id TEXT,
        article_id TEXT,
        PRIMARY KEY (cluster_id, article_id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        canonical_name TEXT,
        start_date TEXT,
        end_date TEXT,
        venue TEXT,
        city TEXT,
        country TEXT,
        organizer TEXT,
        category TEXT,
        status TEXT,
        confidence REAL,
        raw_record TEXT
      );

      CREATE TABLE IF NOT EXISTS event_articles (
        event_id TEXT,
        article_id TEXT,
        PRIMARY KEY (event_id, article_id)
      );

      CREATE TABLE IF NOT EXISTS ai_batches (
        id TEXT PRIMARY KEY,
        batch_number INTEGER,
        status TEXT,
        created_at TEXT,
        raw_record TEXT
      );

      CREATE TABLE IF NOT EXISTS portal_kv (
        collection TEXT,
        key TEXT,
        value TEXT,
        PRIMARY KEY (collection, key)
      );
    `);
  }

  private loadFromSqliteOrMigrate(): void {
    if (!this.sqlite) return;
    const countRow = this.sqlite.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number };
    const hasDbData = countRow && countRow.count > 0;

    if (!hasDbData) {
      // Check if existing JSON files can be migrated
      const jsonCorePath = path.join(this.dataDir, 'portal_core.json');
      if (fs.existsSync(jsonCorePath)) {
        try {
          const raw = fs.readFileSync(jsonCorePath, 'utf-8');
          const jsonCore = JSON.parse(raw);
          console.log(`[DatabaseManager] Migrating data from JSON to SQLite (articles: ${Object.keys(jsonCore.articles || {}).length})...`);
          
          this.core = { ...this.core, ...jsonCore };
          this.ko = this.loadJsonFallback('portal_ko.json', this.ko);
          this.en = this.loadJsonFallback('portal_en.json', this.en);
          this.rw = this.loadJsonFallback('portal_rw.json', this.rw);

          // Purge mock data before saving to DB
          this.purgeMockData();

          // Save everything into SQLite immediately
          this.persistToSqliteSync();
          console.log(`[DatabaseManager] SQLite database initialized and synced successfully at ${path.join(this.dataDir, 'portal.db')}`);
          return;
        } catch (err) {
          console.error('[DatabaseManager] Failed to migrate JSON to SQLite:', err);
        }
      }
    }

    // Load state from SQLite
    this.loadFromSqlite();
  }

  private loadFromSqlite(): void {
    if (!this.sqlite) return;
    try {
      // 1. Articles - Zero In-Memory Cache (Direct Reference)
      // Bulk articles are referenced directly from primary storage without keeping in-memory copies.

      // 2. Sources
      const sourceRows = this.sqlite.prepare('SELECT raw_record FROM sources').all() as Array<{ raw_record: string }>;
      for (const row of sourceRows) {
        if (!row.raw_record) continue;
        try {
          const src = JSON.parse(row.raw_record) as SourceRecord;
          if (src && src.id) this.core.sources[src.id] = src;
        } catch {}
      }

      // 3. Source Runs
      const runRows = this.sqlite.prepare('SELECT raw_record FROM source_runs').all() as Array<{ raw_record: string }>;
      for (const row of runRows) {
        if (!row.raw_record) continue;
        try {
          const run = JSON.parse(row.raw_record) as SourceRunRecord;
          if (run && run.id) this.core.sourceRuns[run.id] = run;
        } catch {}
      }

      // 4. Source Checkpoints
      const cpRows = this.sqlite.prepare('SELECT source_id, raw_record FROM source_checkpoints').all() as Array<{ source_id: string; raw_record: string }>;
      for (const row of cpRows) {
        if (!row.raw_record) continue;
        try {
          const cp = JSON.parse(row.raw_record) as SourceCheckpointRecord;
          if (cp) this.core.sourceCheckpoints[row.source_id] = cp;
        } catch {}
      }

      // 5. Story Clusters
      const clusterRows = this.sqlite.prepare('SELECT raw_record FROM story_clusters').all() as Array<{ raw_record: string }>;
      for (const row of clusterRows) {
        if (!row.raw_record) continue;
        try {
          const cluster = JSON.parse(row.raw_record) as StoryClusterRecord;
          if (cluster && cluster.id && !MOCK_CLUSTER_IDS.has(cluster.id)) {
            this.core.storyClusters[cluster.id] = cluster;
          }
        } catch {}
      }

      const clusterArticleRows = this.sqlite.prepare('SELECT cluster_id, article_id FROM story_cluster_articles').all() as Array<{ cluster_id: string; article_id: string }>;
      for (const row of clusterArticleRows) {
        if (MOCK_CLUSTER_IDS.has(row.cluster_id) || MOCK_ARTICLE_IDS.has(row.article_id)) continue;
        if (!this.core.storyClusterArticles[row.cluster_id]) {
          this.core.storyClusterArticles[row.cluster_id] = [];
        }
        this.core.storyClusterArticles[row.cluster_id].push(row.article_id);
      }

      // 6. Events
      const eventRows = this.sqlite.prepare('SELECT raw_record FROM events').all() as Array<{ raw_record: string }>;
      for (const row of eventRows) {
        if (!row.raw_record) continue;
        try {
          const evt = JSON.parse(row.raw_record) as EventRecord;
          const evtId = evt.event_id || (evt as any).id;
          if (evt && evtId && !MOCK_EVENT_IDS.has(evtId)) {
            this.core.events[evtId] = evt;
          }
        } catch {}
      }

      const eventArticleRows = this.sqlite.prepare('SELECT event_id, article_id FROM event_articles').all() as Array<{ event_id: string; article_id: string }>;
      for (const row of eventArticleRows) {
        if (MOCK_EVENT_IDS.has(row.event_id) || MOCK_ARTICLE_IDS.has(row.article_id)) continue;
        if (!this.core.eventArticles[row.event_id]) {
          this.core.eventArticles[row.event_id] = [];
        }
        this.core.eventArticles[row.event_id].push(row.article_id);
      }

      // 7. AI Batches
      const batchRows = this.sqlite.prepare('SELECT raw_record FROM ai_batches').all() as Array<{ raw_record: string }>;
      for (const row of batchRows) {
        if (!row.raw_record) continue;
        try {
          const b = JSON.parse(row.raw_record) as AiBatchRecord;
          const batchId = b.batch_id || (b as any).id;
          if (b && batchId) this.core.aiBatches[batchId] = b;
        } catch {}
      }

      // 8. Localized Articles - Zero In-Memory Cache (Direct Reference)
      // Localized translations are referenced directly from primary storage.

      // 9. Portal KV collections
      const kvRows = this.sqlite.prepare('SELECT collection, key, value FROM portal_kv').all() as Array<{ collection: string; key: string; value: string }>;
      for (const row of kvRows) {
        if (!row.value) continue;
        try {
          const val = JSON.parse(row.value);
          switch (row.collection) {
            case 'tagConcepts':
              this.core.tagConcepts[row.key] = val;
              break;
            case 'tagAliases':
              this.core.tagAliases[row.key] = val;
              break;
            case 'duplicateGroups':
              this.core.duplicateGroups[row.key] = val;
              break;
            case 'articleRelations':
              if (!this.core.articleRelations) this.core.articleRelations = {};
              this.core.articleRelations[row.key] = val;
              break;
            case 'eventMatchCandidates':
              this.core.eventMatchCandidates[row.key] = val;
              break;
            case 'eventMergeHistory':
              this.core.eventMergeHistory[row.key] = val;
              break;
            case 'eventUrls':
              this.core.eventUrls[row.key] = val;
              break;
            case 'integratedArticles':
              if (!MOCK_INTEGRATED_IDS.has(row.key)) this.core.integratedArticles[row.key] = val;
              break;
            case 'integratedSentences':
              this.core.integratedSentences[row.key] = val;
              break;
            case 'integratedSentenceSources':
              this.core.integratedSentenceSources[row.key] = val;
              break;
            case 'savedEventViews':
              this.core.savedEventViews[row.key] = val;
              break;
            case 'settings':
              this.core.settings = { ...this.core.settings, ...val };
              break;
            case 'ko_tags':
              this.ko.tags[row.key] = val;
              break;
            case 'en_tags':
              this.en.tags[row.key] = val;
              break;
            case 'rw_tags':
              this.rw.tags[row.key] = val;
              break;
            case 'ko_articleTags':
              this.ko.articleTags[row.key] = val;
              break;
            case 'en_articleTags':
              this.en.articleTags[row.key] = val;
              break;
            case 'rw_articleTags':
              this.rw.articleTags[row.key] = val;
              break;
            case 'ko_eventText':
              this.ko.eventText[row.key] = val;
              break;
            case 'en_eventText':
              this.en.eventText[row.key] = val;
              break;
            case 'rw_eventText':
              this.rw.eventText[row.key] = val;
              break;
            case 'ko_eventTags':
              this.ko.eventTags[row.key] = val;
              break;
            case 'en_eventTags':
              this.en.eventTags[row.key] = val;
              break;
            case 'rw_eventTags':
              this.rw.eventTags[row.key] = val;
              break;
          }
        } catch {}
      }

      console.log(`[DatabaseManager] Loaded from SQLite: ${Object.keys(this.core.articles).length} real articles, ${Object.keys(this.core.sources).length} sources, ${Object.keys(this.core.events).length} events.`);
    } catch (err) {
      console.error('[DatabaseManager] Error loading from SQLite:', err);
    }
  }

  public purgeMockData(): void {
    let purgedArticles = 0;
    for (const id of MOCK_ARTICLE_IDS) {
      if (this.core.articles[id]) {
        delete this.core.articles[id];
        delete this.ko.articles[id];
        delete this.en.articles[id];
        delete this.rw.articles[id];
        delete this.ko.articleTags[id];
        delete this.en.articleTags[id];
        delete this.rw.articleTags[id];
        purgedArticles++;
      }
    }

    for (const id of MOCK_EVENT_IDS) {
      if (this.core.events[id]) {
        delete this.core.events[id];
        delete this.core.eventArticles[id];
      }
    }

    for (const id of MOCK_CLUSTER_IDS) {
      if (this.core.storyClusters[id]) {
        delete this.core.storyClusters[id];
        delete this.core.storyClusterArticles[id];
      }
    }

    for (const id of MOCK_INTEGRATED_IDS) {
      if (this.core.integratedArticles[id]) {
        delete this.core.integratedArticles[id];
      }
    }

    // Delete directly from SQLite as well
    if (this.sqlite) {
      try {
        this.sqlite.exec(`
          DELETE FROM articles WHERE article_id IN ('ART-001', 'ART-002', 'ART-003', 'ART-004', 'ART-005', 'ART-006');
          DELETE FROM localized_articles WHERE article_id IN ('ART-001', 'ART-002', 'ART-003', 'ART-004', 'ART-005', 'ART-006');
          DELETE FROM events WHERE id IN ('EVT-001', 'EVT-002', 'EVT-003');
          DELETE FROM event_articles WHERE event_id IN ('EVT-001', 'EVT-002', 'EVT-003') OR article_id IN ('ART-001', 'ART-002', 'ART-003', 'ART-004', 'ART-005', 'ART-006');
          DELETE FROM story_clusters WHERE id = 'CLUSTER-001';
          DELETE FROM story_cluster_articles WHERE cluster_id = 'CLUSTER-001' OR article_id IN ('ART-001', 'ART-002', 'ART-003', 'ART-004', 'ART-005', 'ART-006');
          DELETE FROM portal_kv WHERE collection = 'integratedArticles' AND key = 'INT-001';
        `);
      } catch {}
    }

    if (purgedArticles > 0) {
      console.log(`[DatabaseManager] Successfully purged ${purgedArticles} mock example articles.`);
    }
  }

  private autoClassifyUncategorizedArticles(): void {
    let modified = false;
    for (const art of Object.values(this.core.articles)) {
      const cat = (art.portal_category_id || '').trim().toLowerCase();
      if (!cat || cat === 'undefined' || cat === 'general' || cat === 'uncategorized') {
        const text = `${art.original_title || ''} ${art.original_subtitle || ''} ${art.source_section || ''} ${art.source_subcategory || ''} ${(art.original_body || '').slice(0, 1000)}`.toLowerCase();
        
        let assigned = 'Nature/Living';
        if (text.includes('tech') || text.includes('ai ') || text.includes('artificial intelligence') || text.includes('telecom') || text.includes('broadband') || text.includes('software') || text.includes('digital') || text.includes('innovation') || text.includes('startup') || text.includes('cyber')) {
          assigned = 'AI/Tech';
        } else if (text.includes('educat') || text.includes('school') || text.includes('student') || text.includes('teacher') || text.includes('university') || text.includes('college') || text.includes('exam') || text.includes('learn') || text.includes('reb ')) {
          assigned = 'Education';
        } else if (text.includes('econ') || text.includes('financ') || text.includes('bank') || text.includes('invest') || text.includes('trade') || text.includes('market') || text.includes('price') || text.includes('tax') || text.includes('business') || text.includes('real estate') || text.includes('estate') || text.includes('rdb')) {
          assigned = 'Economy/RealEstate';
        } else if (text.includes('sport') || text.includes('football') || text.includes('soccer') || text.includes('basketball') || text.includes('cycl') || text.includes('match') || text.includes('league') || text.includes('cup') || text.includes('player') || text.includes('stadium') || text.includes('tour du rwanda')) {
          assigned = 'Sports';
        } else if (text.includes('politic') || text.includes('parliament') || text.includes('senate') || text.includes('minister') || text.includes('president') || text.includes('kagame') || text.includes('election') || text.includes('diplomat') || text.includes('gov') || text.includes('embassy')) {
          assigned = 'Politics';
        } else if (text.includes('volunt') || text.includes('community') || text.includes('charity') || text.includes('umuganda') || text.includes('donation') || text.includes('ngo') || text.includes('aid') || text.includes('red cross')) {
          assigned = 'Volunteers';
        } else {
          assigned = 'Nature/Living';
        }

        art.portal_category_id = assigned;
        modified = true;
      }
    }
    if (modified) {
      this.save();
    }
  }

  private loadJsonFallback<T>(filename: string, fallback: T): T {
    const filePath = path.join(this.dataDir, filename);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return { ...fallback, ...JSON.parse(raw) };
      } catch (err) {
        return fallback;
      }
    }
    return fallback;
  }

  public save(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    // High-performance debounced sync
    this.saveTimeout = setTimeout(() => {
      this.saveSync();
    }, 150);
  }

  public saveSync(): void {
    if (this.isSupabasePrimary) {
      this.syncChangesToSupabase();
      return;
    }
    if (!this.sqlite) return;
    if (this.isSaving) return;
    this.isSaving = true;
    try {
      this.persistToSqliteSync();

      // Keep backup JSON files updated safely
      const writeAtomic = (filename: string, data: any) => {
        const targetPath = path.join(this.dataDir, filename);
        const tempPath = `${targetPath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tempPath, targetPath);
      };

      writeAtomic('portal_core.json', this.core);
      writeAtomic('portal_ko.json', this.ko);
      writeAtomic('portal_en.json', this.en);
      writeAtomic('portal_rw.json', this.rw);
    } catch (err) {
      console.error('[DatabaseManager] Error in saveSync:', err);
    } finally {
      this.isSaving = false;
    }
  }

  private persistToSqliteSync(): void {
    if (!this.sqlite) return;
    this.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      // 1. Articles
      const insertArticle = this.sqlite.prepare(`
        INSERT OR REPLACE INTO articles (
          article_id, source_id, source_url, canonical_url, original_language,
          original_title, original_subtitle, original_body, author, published_at,
          collected_at, source_section, source_subcategory, portal_category_id,
          lead_image_url, image_urls, content_blocks, processing_status,
          normalized_title, content_hash, story_cluster_id, created_at, raw_record
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        );
      `);

      for (const [id, art] of Object.entries(this.core.articles)) {
        if (MOCK_ARTICLE_IDS.has(id)) continue;
        insertArticle.run(
          art.article_id || id,
          art.source_id || '',
          art.source_url || '',
          art.canonical_url || '',
          art.original_language || 'en',
          art.original_title || '',
          art.original_subtitle || '',
          art.original_body || '',
          art.author || '',
          art.published_at || '',
          art.collected_at || '',
          art.source_section || '',
          art.source_subcategory || '',
          art.portal_category_id || '',
          art.lead_image_url || '',
          JSON.stringify(art.image_urls || []),
          JSON.stringify(art.content_blocks || []),
          art.processing_status || 'RAW',
          art.normalized_title || '',
          art.content_hash || '',
          art.story_cluster_id || '',
          art.created_at || '',
          JSON.stringify(art)
        );
      }

      // 2. Localized Articles
      const insertLocalized = this.sqlite.prepare(`
        INSERT OR REPLACE INTO localized_articles (
          article_id, lang, title, subtitle, summary, body, category_label,
          processed_at, batch_id, content_blocks, raw_record
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);

      const persistLoc = (lang: string, schema: LocalizedSchema) => {
        for (const [id, art] of Object.entries(schema.articles)) {
          if (MOCK_ARTICLE_IDS.has(id)) continue;
          insertLocalized.run(
            id,
            lang,
            art.title || '',
            art.subtitle || '',
            art.summary || '',
            art.body || '',
            art.category_label || '',
            art.processed_at || '',
            art.batch_id || '',
            JSON.stringify(art.content_blocks || []),
            JSON.stringify(art)
          );
        }
      };

      persistLoc('ko', this.ko);
      persistLoc('en', this.en);
      persistLoc('rw', this.rw);

      // 3. Sources
      const insertSource = this.sqlite.prepare(`
        INSERT OR REPLACE INTO sources (
          id, domain, name, region, type, default_language, home_url, enabled, created_at, updated_at, raw_record
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);
      for (const [id, src] of Object.entries(this.core.sources)) {
        insertSource.run(
          id,
          src.domain || '',
          src.name || '',
          src.region || '',
          src.type || '',
          src.defaultLanguage || '',
          src.homeUrl || '',
          src.enabled ? 1 : 0,
          src.createdAt || '',
          src.updatedAt || '',
          JSON.stringify(src)
        );
      }

      // 4. Source Runs
      const insertRun = this.sqlite.prepare(`
        INSERT OR REPLACE INTO source_runs (id, source_id, started_at, raw_record)
        VALUES (?, ?, ?, ?);
      `);
      for (const [id, run] of Object.entries(this.core.sourceRuns)) {
        insertRun.run(id, run.sourceId || '', run.startedAt || '', JSON.stringify(run));
      }

      // 5. Source Checkpoints
      const insertCp = this.sqlite.prepare(`
        INSERT OR REPLACE INTO source_checkpoints (source_id, raw_record)
        VALUES (?, ?);
      `);
      for (const [srcId, cp] of Object.entries(this.core.sourceCheckpoints)) {
        insertCp.run(srcId, JSON.stringify(cp));
      }

      // 6. Story Clusters
      const insertCluster = this.sqlite.prepare(`
        INSERT OR REPLACE INTO story_clusters (id, raw_record) VALUES (?, ?);
      `);
      const insertClusterArticle = this.sqlite.prepare(`
        INSERT OR REPLACE INTO story_cluster_articles (cluster_id, article_id) VALUES (?, ?);
      `);
      for (const [id, cluster] of Object.entries(this.core.storyClusters)) {
        if (MOCK_CLUSTER_IDS.has(id)) continue;
        insertCluster.run(id, JSON.stringify(cluster));
      }
      for (const [clusterId, articleIds] of Object.entries(this.core.storyClusterArticles)) {
        if (MOCK_CLUSTER_IDS.has(clusterId)) continue;
        for (const artId of articleIds) {
          if (MOCK_ARTICLE_IDS.has(artId)) continue;
          insertClusterArticle.run(clusterId, artId);
        }
      }

      // 7. Events
      const insertEvent = this.sqlite.prepare(`
        INSERT OR REPLACE INTO events (
          id, canonical_name, start_date, end_date, venue, city, country, organizer, category, status, confidence, raw_record
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);
      const insertEventArticle = this.sqlite.prepare(`
        INSERT OR REPLACE INTO event_articles (event_id, article_id) VALUES (?, ?);
      `);
      for (const [id, evt] of Object.entries(this.core.events)) {
        if (MOCK_EVENT_IDS.has(id)) continue;
        insertEvent.run(
          id,
          evt.canonical_name || (evt as any).canonicalName || evt.original_name || (evt as any).originalName || '',
          evt.start_date || (evt as any).startDate || '',
          evt.end_date || (evt as any).endDate || '',
          evt.venue || '',
          evt.city || '',
          evt.country || '',
          evt.organizer || '',
          evt.category || '',
          evt.status || 'tentative',
          evt.confidence || 1.0,
          JSON.stringify(evt)
        );
      }
      for (const [evtId, artIds] of Object.entries(this.core.eventArticles)) {
        if (MOCK_EVENT_IDS.has(evtId)) continue;
        for (const artId of artIds) {
          if (MOCK_ARTICLE_IDS.has(artId)) continue;
          insertEventArticle.run(evtId, artId);
        }
      }

      // 8. AI Batches
      const insertBatch = this.sqlite.prepare(`
        INSERT OR REPLACE INTO ai_batches (id, batch_number, status, created_at, raw_record)
        VALUES (?, ?, ?, ?, ?);
      `);
      for (const [id, batch] of Object.entries(this.core.aiBatches)) {
        insertBatch.run(id, batch.item_count || 0, batch.status || '', batch.created_at || '', JSON.stringify(batch));
      }

      // 9. KV Store for settings, tags, relations
      const insertKV = this.sqlite.prepare(`
        INSERT OR REPLACE INTO portal_kv (collection, key, value) VALUES (?, ?, ?);
      `);

      insertKV.run('settings', 'current', JSON.stringify(this.core.settings));

      for (const [k, v] of Object.entries(this.core.tagConcepts)) {
        insertKV.run('tagConcepts', k, JSON.stringify(v));
      }
      for (const [k, v] of Object.entries(this.core.tagAliases)) {
        insertKV.run('tagAliases', k, JSON.stringify(v));
      }
      for (const [k, v] of Object.entries(this.core.duplicateGroups)) {
        insertKV.run('duplicateGroups', k, JSON.stringify(v));
      }
      if (this.core.articleRelations) {
        for (const [k, v] of Object.entries(this.core.articleRelations)) {
          insertKV.run('articleRelations', k, JSON.stringify(v));
        }
      }
      for (const [k, v] of Object.entries(this.core.eventMatchCandidates)) {
        insertKV.run('eventMatchCandidates', k, JSON.stringify(v));
      }
      for (const [k, v] of Object.entries(this.core.eventMergeHistory)) {
        insertKV.run('eventMergeHistory', k, JSON.stringify(v));
      }
      for (const [k, v] of Object.entries(this.core.eventUrls)) {
        insertKV.run('eventUrls', k, JSON.stringify(v));
      }
      for (const [k, v] of Object.entries(this.core.integratedArticles)) {
        if (!MOCK_INTEGRATED_IDS.has(k)) insertKV.run('integratedArticles', k, JSON.stringify(v));
      }
      for (const [k, v] of Object.entries(this.core.integratedSentences)) {
        insertKV.run('integratedSentences', k, JSON.stringify(v));
      }
      for (const [k, v] of Object.entries(this.core.integratedSentenceSources)) {
        insertKV.run('integratedSentenceSources', k, JSON.stringify(v));
      }
      for (const [k, v] of Object.entries(this.core.savedEventViews)) {
        insertKV.run('savedEventViews', k, JSON.stringify(v));
      }

      // Localized tags & eventText
      for (const [k, v] of Object.entries(this.ko.tags)) insertKV.run('ko_tags', k, JSON.stringify(v));
      for (const [k, v] of Object.entries(this.en.tags)) insertKV.run('en_tags', k, JSON.stringify(v));
      for (const [k, v] of Object.entries(this.rw.tags)) insertKV.run('rw_tags', k, JSON.stringify(v));

      for (const [k, v] of Object.entries(this.ko.articleTags)) insertKV.run('ko_articleTags', k, JSON.stringify(v));
      for (const [k, v] of Object.entries(this.en.articleTags)) insertKV.run('en_articleTags', k, JSON.stringify(v));
      for (const [k, v] of Object.entries(this.rw.articleTags)) insertKV.run('rw_articleTags', k, JSON.stringify(v));

      for (const [k, v] of Object.entries(this.ko.eventText)) insertKV.run('ko_eventText', k, JSON.stringify(v));
      for (const [k, v] of Object.entries(this.en.eventText)) insertKV.run('en_eventText', k, JSON.stringify(v));
      for (const [k, v] of Object.entries(this.rw.eventText)) insertKV.run('rw_eventText', k, JSON.stringify(v));

      for (const [k, v] of Object.entries(this.ko.eventTags)) insertKV.run('ko_eventTags', k, JSON.stringify(v));
      for (const [k, v] of Object.entries(this.en.eventTags)) insertKV.run('en_eventTags', k, JSON.stringify(v));
      for (const [k, v] of Object.entries(this.rw.eventTags)) insertKV.run('rw_eventTags', k, JSON.stringify(v));

      this.sqlite.exec('COMMIT;');
    } catch (err) {
      this.sqlite.exec('ROLLBACK;');
      throw err;
    }
  }

  public getLocalizedSchema(lang: string): LocalizedSchema | null {
    if (lang === 'ko') return this.ko;
    if (lang === 'en') return this.en;
    if (lang === 'rw') return this.rw;
    return null;
  }

  public closeSqlite(): void {
    if (this.sqlite) {
      try {
        this.sqlite.close();
        this.sqlite = null;
        console.log('[DatabaseManager] SQLite connection closed.');
      } catch (err) {
        console.warn('[DatabaseManager] Error closing SQLite:', err);
      }
    }
  }

  public async initDatabase(): Promise<void> {
    try {
      const { testSupabaseConnection } = await import('./supabase.js');
      const conn = await testSupabaseConnection();
      if (conn.tablesExist && conn.articleCount && conn.articleCount > 0) {
        console.log(`[DatabaseManager] Detected ${conn.articleCount} articles in Supabase. Supabase is PRIMARY.`);
        await this.loadFromSupabase();
        this.closeSqlite();
        this.isSupabasePrimary = true;
      }
    } catch (err) {
      console.warn('[DatabaseManager] initDatabase notice:', err);
    }
  }

  public async loadFromSupabase(): Promise<boolean> {
    try {
      const { getSupabaseClient } = await import('./supabase.js');
      const client = getSupabaseClient();
      if (!client) return false;

      console.log('[DatabaseManager] Loading portal data from Supabase...');

      // 1. Sources
      const { data: sources } = await client.from('sources').select('*');
      if (sources && sources.length > 0) {
        for (const s of sources) {
          this.core.sources[s.id] = {
            id: s.id,
            domain: s.domain,
            name: s.name,
            region: s.region,
            type: s.type,
            defaultLanguage: s.default_language,
            homeUrl: s.home_url,
            enabled: s.enabled,
            createdAt: s.created_at,
            updatedAt: s.updated_at
          };
        }
      }

      // Note: Articles and localized articles are referenced directly from Supabase.
      // The server does NOT copy or cache articles into internal memory.

      // 2. Portal KV (events, batches, tags, settings)
      const { data: kvs } = await client.from('portal_kv').select('*');
      if (kvs && kvs.length > 0) {
        for (const kv of kvs) {
          if (kv.collection === 'events') this.core.events[kv.key] = kv.value;
          else if (kv.collection === 'aiBatches') this.core.aiBatches[kv.key] = kv.value;
          else if (kv.collection === 'tagConcepts') this.core.tagConcepts[kv.key] = kv.value;
          else if (kv.collection === 'settings' && kv.key === 'global') {
            this.core.settings = { ...this.core.settings, ...kv.value };
          }
        }
      }

      this.isSupabasePrimary = true;
      console.log(`[DatabaseManager] Connected to Supabase directly (Zero-Cache Direct Mode): ${Object.keys(this.core.sources).length} sources loaded.`);
      return true;
    } catch (err) {
      console.error('[DatabaseManager] Error loading from Supabase:', err);
      return false;
    }
  }

  public syncChangesToSupabase(): void {
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(async () => {
      try {
        const { getSupabaseClient } = await import('./supabase.js');
        const client = getSupabaseClient();
        if (!client) return;

        if (this.core.settings && Object.keys(this.core.settings).length > 0) {
          await client.from('portal_kv').upsert([
            { collection: 'settings', key: 'global', value: this.core.settings }
          ], { onConflict: 'collection,key' });
        }
      } catch (err) {
        console.warn('[DatabaseManager] Supabase sync notice:', err);
      }
    }, 400);
  }
}

export const db = new DatabaseManager();
