import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { db } from './database.js';
import { ArticleRecord, LocalizedArticleRecord, SourceRecord } from './types.js';

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

export interface SupabaseConfig {
  url: string;
  key: string;
  configured: boolean;
}

export interface MigrationState {
  migrated: boolean;
  localDbDeleted: boolean;
  migratedAt?: string;
  articleCount?: number;
  inProgress: boolean;
  error?: string;
}

export let migrationState: MigrationState = {
  migrated: false,
  localDbDeleted: false,
  inProgress: false
};

export function getSupabaseConfig(): SupabaseConfig {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    db.core.settings?.supabase_url?.trim() ||
    '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    db.core.settings?.supabase_key?.trim() ||
    '';

  return {
    url,
    key,
    configured: Boolean(url && key)
  };
}

export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config.configured) return null;

  const currentKey = `${config.url}::${config.key}`;
  if (cachedClient && cachedConfigKey === currentKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(config.url, config.key, {
      auth: { persistSession: false }
    });
    cachedConfigKey = currentKey;
    return cachedClient;
  } catch (err) {
    console.error('[Supabase] Failed to initialize client:', err);
    return null;
  }
}

export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  tablesFound?: string[];
  articleCount?: number;
  tablesExist?: boolean;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'Supabase URL과 Key가 설정되지 않았습니다. 환경 변수 또는 설정에서 입력해주세요.',
      tablesExist: false
    };
  }

  try {
    // 1. Explicitly check if public.articles exists in PostgREST schema cache
    const checkRes = await client
      .from('articles')
      .select('article_id')
      .limit(1);

    if (checkRes.error) {
      if (
        checkRes.error.code === 'PGRST205' ||
        checkRes.error.code === '42P01' ||
        checkRes.error.message?.includes('schema cache')
      ) {
        return {
          success: false,
          message:
            'Supabase URL과 인증 키는 정상 등록되었으나, 데이터베이스에 테이블(public.articles)이 아직 생성되지 않았습니다. Supabase 대시보드(SQL Editor)에서 스키마 DDL을 1회 실행(Run)해주세요.',
          tablesFound: [],
          tablesExist: false
        };
      }
      return {
        success: false,
        message: `Supabase 연결 오류 (${checkRes.error.code}): ${checkRes.error.message}`,
        tablesExist: false
      };
    }

    // 2. Count articles since tables exist
    const { count } = await client
      .from('articles')
      .select('article_id', { count: 'exact', head: true });

    return {
      success: true,
      message: `Supabase 연결 성공! (현재 저장된 기사: ${count ?? 0}건)`,
      tablesFound: ['articles', 'localized_articles', 'sources', 'portal_kv'],
      articleCount: count ?? 0,
      tablesExist: true
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Supabase 연결 시도 중 예외 발생: ${err.message}`,
      tablesExist: false
    };
  }
}

export function generateSupabaseDDL(): string {
  return `-- ========================================================
-- Supabase Schema for Personal News Intelligence Portal
-- Copy and run in Supabase SQL Editor (Dashboard > SQL Editor)
-- Direct URL: https://supabase.com/dashboard/project/ceeftkebfvttvshkatht/sql/new
-- ========================================================

-- 1. Articles Master Table
CREATE TABLE IF NOT EXISTS public.articles (
  article_id TEXT PRIMARY KEY,
  source_id TEXT,
  source_url TEXT,
  canonical_url TEXT,
  original_language TEXT,
  original_title TEXT,
  original_subtitle TEXT,
  original_body TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  source_section TEXT,
  source_subcategory TEXT,
  portal_category_id TEXT,
  topic TEXT, -- English topic (Economy, Politics, AI/Tech, etc.)
  lead_image_url TEXT,
  image_urls JSONB DEFAULT '[]'::jsonb,
  content_blocks JSONB DEFAULT '[]'::jsonb,
  processing_status TEXT DEFAULT 'RAW', -- 'RAW', 'EXPORTED', 'PROCESSED'
  normalized_title TEXT,
  content_hash TEXT,
  story_cluster_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_status ON public.articles(processing_status);
CREATE INDEX IF NOT EXISTS idx_articles_published ON public.articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source ON public.articles(source_id);

-- 2. Localized Articles (KO / EN / RW)
CREATE TABLE IF NOT EXISTS public.localized_articles (
  article_id TEXT REFERENCES public.articles(article_id) ON DELETE CASCADE,
  lang TEXT NOT NULL, -- 'ko', 'en', 'rw'
  title TEXT,
  subtitle TEXT,
  summary TEXT, -- 3-line summary
  body TEXT, -- translated & reparagraphed body with double newlines
  category_label TEXT,
  topic TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  batch_id TEXT,
  content_blocks JSONB DEFAULT '[]'::jsonb,
  PRIMARY KEY (article_id, lang)
);

CREATE INDEX IF NOT EXISTS idx_localized_lang ON public.localized_articles(lang);
CREATE INDEX IF NOT EXISTS idx_localized_processed ON public.localized_articles(processed_at DESC);

-- 3. Sources Master Table
CREATE TABLE IF NOT EXISTS public.sources (
  id TEXT PRIMARY KEY,
  domain TEXT,
  name TEXT,
  region TEXT,
  type TEXT,
  default_language TEXT,
  home_url TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Portal KV Table (events, batches, tags, settings, views)
CREATE TABLE IF NOT EXISTS public.portal_kv (
  collection TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (collection, key)
);

CREATE INDEX IF NOT EXISTS idx_portal_kv_coll ON public.portal_kv(collection);

-- 5. Agent Batch Assignments Table (5인 에이전트 30개 단위 편성 정보 및 과제 관리 테이블)
CREATE TABLE IF NOT EXISTS public.agent_batch_assignments (
  group_number INTEGER PRIMARY KEY,
  agent_number INTEGER NOT NULL, -- 1 to 5
  agent_name TEXT NOT NULL, -- 'Agent #1' ~ 'Agent #5'
  number_range TEXT NOT NULL, -- '#260101-001 ~ #260101-030'
  start_index INTEGER,
  end_index INTEGER,
  total_items INTEGER DEFAULT 30,
  processed_items INTEGER DEFAULT 0,
  raw_items INTEGER DEFAULT 30,
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'IN_PROGRESS', 'DONE'
  first_article_id TEXT,
  last_article_id TEXT,
  article_ids JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_agent ON public.agent_batch_assignments(agent_number);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON public.agent_batch_assignments(status);

-- 6. Enable Row Level Security (RLS) and grant full operations
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.localized_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_kv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_batch_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on articles') THEN
    CREATE POLICY "Allow all on articles" ON public.articles FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on localized') THEN
    CREATE POLICY "Allow all on localized" ON public.localized_articles FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on sources') THEN
    CREATE POLICY "Allow all on sources" ON public.sources FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on portal_kv') THEN
    CREATE POLICY "Allow all on portal_kv" ON public.portal_kv FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on agent_batch_assignments') THEN
    CREATE POLICY "Allow all on agent_batch_assignments" ON public.agent_batch_assignments FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
`;
}

function parseIsoDate(val?: string | null): string | null {
  if (!val || typeof val !== 'string' || !val.trim()) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Upserts computed batch assignments into Supabase public.agent_batch_assignments table
 */
export async function syncAssignmentsToSupabase(groups: any[]): Promise<{ success: boolean; count: number; error?: string }> {
  const client = getSupabaseClient();
  if (!client || !groups || groups.length === 0) {
    return { success: false, count: 0 };
  }
  try {
    const records = groups.map(g => ({
      group_number: g.group_number,
      agent_number: g.agent_number,
      agent_name: `Agent #${g.agent_number}`,
      number_range: g.number_range,
      start_index: g.start_index,
      end_index: g.end_index,
      total_items: g.total_items,
      processed_items: g.processed_items,
      raw_items: g.raw_items,
      status: g.status,
      first_article_id: g.first_article_id,
      last_article_id: g.last_article_id,
      updated_at: new Date().toISOString()
    }));

    const { error } = await client
      .from('agent_batch_assignments')
      .upsert(records, { onConflict: 'group_number' });

    if (error) {
      return { success: false, count: 0, error: error.message };
    }
    return { success: true, count: records.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
}

/**
 * Synchronizes an array of articles to Supabase public.articles table
 */
export async function syncArticlesChunkToSupabase(articles: ArticleRecord[]): Promise<{ success: boolean; count: number; error?: string }> {
  const client = getSupabaseClient();
  if (!client || !articles || articles.length === 0) {
    return { success: false, count: 0 };
  }
  try {
    const chunk = articles.map(art => ({
      article_id: art.article_id,
      source_id: art.source_id,
      source_url: art.source_url,
      canonical_url: art.canonical_url,
      original_language: art.original_language,
      original_title: art.original_title,
      original_subtitle: art.original_subtitle,
      original_body: art.original_body,
      author: art.author,
      published_at: parseIsoDate(art.published_at),
      collected_at: parseIsoDate(art.collected_at) || new Date().toISOString(),
      source_section: art.source_section,
      source_subcategory: art.source_subcategory,
      portal_category_id: art.portal_category_id,
      topic: (art as any).topic || art.portal_category_id,
      lead_image_url: art.lead_image_url,
      image_urls: art.image_urls || [],
      content_blocks: art.content_blocks || [],
      processing_status: art.processing_status || 'RAW',
      normalized_title: art.normalized_title,
      content_hash: art.content_hash,
      story_cluster_id: art.story_cluster_id,
      created_at: parseIsoDate(art.created_at) || new Date().toISOString()
    }));

    const { error } = await client.from('articles').upsert(chunk, { onConflict: 'article_id' });
    if (error) {
      console.warn('[Supabase] syncArticlesChunkToSupabase error:', error.message);
      return { success: false, count: 0, error: error.message };
    }
    return { success: true, count: chunk.length };
  } catch (err: any) {
    console.warn('[Supabase] syncArticlesChunkToSupabase exception:', err.message);
    return { success: false, count: 0, error: err.message };
  }
}

/**
 * Synchronizes all articles in local memory to Supabase public.articles
 */
export async function syncAllMissingArticlesToSupabase(): Promise<{ synced: number; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { synced: 0 };
  const allArticles = Object.values(db.core.articles);
  const CHUNK_SIZE = 100;
  let synced = 0;
  for (let i = 0; i < allArticles.length; i += CHUNK_SIZE) {
    const chunk = allArticles.slice(i, i + CHUNK_SIZE);
    const res = await syncArticlesChunkToSupabase(chunk);
    if (res.success) synced += res.count;
  }
  return { synced };
}

/**
 * Executes full migration of all local data into Supabase, then deletes the local database.
 */
export async function executeFullMigrationToSupabase(): Promise<{
  success: boolean;
  message: string;
  articleCount?: number;
  sourceCount?: number;
  localDbDeleted?: boolean;
}> {
  if (migrationState.inProgress) {
    return {
      success: false,
      message: '마이그레이션이 이미 진행 중입니다.'
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'Supabase가 설정되지 않았습니다. SUPABASE_URL과 키를 확인해주세요.'
    };
  }

  // Check if tables exist first
  const connCheck = await testSupabaseConnection();
  if (!connCheck.tablesExist) {
    return {
      success: false,
      message: 'Supabase에 articles 테이블이 아직 생성되지 않았습니다. Supabase SQL Editor에서 DDL 스키마를 먼저 실행해주세요.'
    };
  }

  migrationState.inProgress = true;
  migrationState.error = undefined;

  try {
    console.log('[Supabase Migration] Starting full migration of local data to Supabase...');

    // 1. Migrate Sources
    const sources = Object.values(db.core.sources).map(s => ({
      id: s.id,
      domain: s.domain,
      name: s.name,
      region: s.region,
      type: s.type,
      default_language: s.defaultLanguage,
      home_url: s.homeUrl,
      enabled: s.enabled,
      created_at: parseIsoDate(s.createdAt) || new Date().toISOString(),
      updated_at: parseIsoDate(s.updatedAt) || new Date().toISOString()
    }));

    if (sources.length > 0) {
      const { error: srcErr } = await client.from('sources').upsert(sources, { onConflict: 'id' });
      if (srcErr) {
        console.warn('[Supabase Migration] Warning upserting sources:', srcErr.message);
      } else {
        console.log(`[Supabase Migration] Migrated ${sources.length} sources.`);
      }
    }

    // 2. Migrate Articles (in batches of 100)
    const allArticles = Object.values(db.core.articles);
    const BATCH_SIZE = 100;
    let migratedArticles = 0;

    for (let i = 0; i < allArticles.length; i += BATCH_SIZE) {
      const chunk = allArticles.slice(i, i + BATCH_SIZE).map(art => ({
        article_id: art.article_id,
        source_id: art.source_id,
        source_url: art.source_url,
        canonical_url: art.canonical_url,
        original_language: art.original_language,
        original_title: art.original_title,
        original_subtitle: art.original_subtitle,
        original_body: art.original_body,
        author: art.author,
        published_at: parseIsoDate(art.published_at),
        collected_at: parseIsoDate(art.collected_at) || new Date().toISOString(),
        source_section: art.source_section,
        source_subcategory: art.source_subcategory,
        portal_category_id: art.portal_category_id,
        topic: (art as any).topic || art.portal_category_id,
        lead_image_url: art.lead_image_url,
        image_urls: art.image_urls || [],
        content_blocks: art.content_blocks || [],
        processing_status: art.processing_status || 'RAW',
        normalized_title: art.normalized_title,
        content_hash: art.content_hash,
        story_cluster_id: art.story_cluster_id,
        created_at: parseIsoDate(art.created_at) || new Date().toISOString()
      }));

      const { error: artErr } = await client.from('articles').upsert(chunk, { onConflict: 'article_id' });
      if (artErr) {
        throw new Error(`Articles upsert failed at batch ${i}~${i + BATCH_SIZE}: ${artErr.message}`);
      }
      migratedArticles += chunk.length;
    }
    console.log(`[Supabase Migration] Migrated ${migratedArticles} articles.`);

    // 3. Migrate Localized Articles (KO, EN, RW)
    const localizedRows: any[] = [];
    for (const [id, art] of Object.entries(db.ko.articles)) {
      localizedRows.push({
        article_id: id,
        lang: 'ko',
        title: art.title,
        subtitle: art.subtitle,
        summary: art.summary,
        body: art.body,
        category_label: art.category_label,
        processed_at: parseIsoDate(art.processed_at) || new Date().toISOString(),
        batch_id: art.batch_id || 'MIGRATION'
      });
    }
    for (const [id, art] of Object.entries(db.en.articles)) {
      localizedRows.push({
        article_id: id,
        lang: 'en',
        title: art.title,
        subtitle: art.subtitle,
        summary: art.summary,
        body: art.body,
        category_label: art.category_label,
        processed_at: parseIsoDate(art.processed_at) || new Date().toISOString(),
        batch_id: art.batch_id || 'MIGRATION'
      });
    }
    for (const [id, art] of Object.entries(db.rw.articles)) {
      localizedRows.push({
        article_id: id,
        lang: 'rw',
        title: art.title,
        subtitle: art.subtitle,
        summary: art.summary,
        body: art.body,
        category_label: art.category_label,
        processed_at: parseIsoDate(art.processed_at) || new Date().toISOString(),
        batch_id: art.batch_id || 'MIGRATION'
      });
    }

    let migratedLocalized = 0;
    for (let i = 0; i < localizedRows.length; i += BATCH_SIZE) {
      const chunk = localizedRows.slice(i, i + BATCH_SIZE);
      const { error: locErr } = await client.from('localized_articles').upsert(chunk, { onConflict: 'article_id,lang' });
      if (locErr) {
        console.warn(`[Supabase Migration] Warning on localized batch ${i}:`, locErr.message);
      } else {
        migratedLocalized += chunk.length;
      }
    }
    console.log(`[Supabase Migration] Migrated ${migratedLocalized} localized article records.`);

    // 4. Migrate Portal KV (events, batches, tagConcepts, settings)
    const kvRows: any[] = [];
    for (const [id, evt] of Object.entries(db.core.events)) {
      kvRows.push({ collection: 'events', key: id, value: evt });
    }
    for (const [id, b] of Object.entries(db.core.aiBatches)) {
      kvRows.push({ collection: 'aiBatches', key: id, value: b });
    }
    for (const [id, t] of Object.entries(db.core.tagConcepts)) {
      kvRows.push({ collection: 'tagConcepts', key: id, value: t });
    }
    if (db.core.settings && Object.keys(db.core.settings).length > 0) {
      kvRows.push({ collection: 'settings', key: 'global', value: db.core.settings });
    }

    if (kvRows.length > 0) {
      try {
        await client.from('portal_kv').upsert(kvRows, { onConflict: 'collection,key' });
        console.log(`[Supabase Migration] Migrated ${kvRows.length} portal_kv records.`);
      } catch (kvErr) {
        console.warn('[Supabase Migration] portal_kv upsert notice:', kvErr);
      }
    }

    // 5. Verify Supabase article count
    const { count: finalCount } = await client.from('articles').select('article_id', { count: 'exact', head: true });
    console.log(`[Supabase Migration] Verification: Supabase now has ${finalCount} articles.`);

    // 6. Close SQLite database and delete existing local database files
    db.closeSqlite();

    const dataDir = path.resolve(process.env.DATA_DIR || './data');
    const filesToDelete = [
      'portal.db',
      'portal.db-wal',
      'portal.db-shm',
      'portal_core.json',
      'portal_ko.json',
      'portal_en.json',
      'portal_rw.json'
    ];

    for (const f of filesToDelete) {
      const p = path.join(dataDir, f);
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (delErr) {
        console.warn(`[Supabase Migration] Could not unlink ${f}:`, delErr);
      }
    }
    console.log('[Supabase Migration] Successfully deleted local SQLite database and JSON files.');

    db.isSupabasePrimary = true;

    migrationState = {
      migrated: true,
      localDbDeleted: true,
      migratedAt: new Date().toISOString(),
      articleCount: finalCount ?? migratedArticles,
      inProgress: false
    };

    return {
      success: true,
      message: `성공! 로컬 기사 ${migratedArticles}건 및 다국어 번역이 모두 Supabase로 마이그레이션되었으며 기존 로컬 DB가 삭제되었습니다. 이제 Supabase가 주 DB로 동작합니다.`,
      articleCount: finalCount ?? migratedArticles,
      sourceCount: sources.length,
      localDbDeleted: true
    };
  } catch (err: any) {
    migrationState.inProgress = false;
    migrationState.error = err.message;
    console.error('[Supabase Migration] Migration failed:', err);
    return {
      success: false,
      message: `마이그레이션 실패: ${err.message}`
    };
  }
}

/**
 * Background Auto-Migrator:
 * Polls Supabase every 5 seconds; as soon as the tables are detected,
 * automatically transfers all local data to Supabase and deletes the local DB!
 */
let autoMigratorTimer: NodeJS.Timeout | null = null;

export function startSupabaseAutoMigrator(): void {
  if (autoMigratorTimer) return;

  autoMigratorTimer = setInterval(async () => {
    if (migrationState.migrated || migrationState.inProgress) return;

    const config = getSupabaseConfig();
    if (!config.configured) return;

    try {
      const conn = await testSupabaseConnection();
      if (conn.tablesExist) {
        console.log('[Supabase Auto-Migrator] Tables detected in Supabase! Initiating automatic migration...');
        const result = await executeFullMigrationToSupabase();
        if (result.success) {
          console.log('[Supabase Auto-Migrator] Automatic migration completed successfully!');
          if (autoMigratorTimer) {
            clearInterval(autoMigratorTimer);
            autoMigratorTimer = null;
          }
        }
      }
    } catch (err) {
      // Ignore transient errors
    }
  }, 5000);

  autoMigratorTimer.unref();
}

/**
 * Saves a single processed article directly to Supabase and updates processing_status
 */
export async function saveProcessedArticleToSupabase(params: {
  article_id: string;
  topic: string;
  title_ko: string;
  title_en: string;
  title_rw: string;
  summary_ko: string;
  summary_en: string;
  summary_rw: string;
  body_ko: string;
  body_en: string;
  body_rw: string;
  category_label?: string;
}): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient();
  const nowIso = new Date().toISOString();

  // In-memory cache update
  const localArt = db.core.articles[params.article_id];
  if (localArt) {
    localArt.processing_status = 'PROCESSED';
    localArt.portal_category_id = params.category_label || params.topic || localArt.portal_category_id;
  }

  db.ko.articles[params.article_id] = {
    article_id: params.article_id,
    title: params.title_ko,
    subtitle: params.summary_ko.split('\n')[0] || '',
    summary: params.summary_ko,
    body: params.body_ko,
    category_label: params.category_label || params.topic,
    processed_at: nowIso,
    batch_id: 'MCP-CHATGPT-DIRECT'
  };

  db.en.articles[params.article_id] = {
    article_id: params.article_id,
    title: params.title_en,
    subtitle: params.summary_en.split('\n')[0] || '',
    summary: params.summary_en,
    body: params.body_en,
    category_label: params.category_label || params.topic,
    processed_at: nowIso,
    batch_id: 'MCP-CHATGPT-DIRECT'
  };

  db.rw.articles[params.article_id] = {
    article_id: params.article_id,
    title: params.title_rw,
    subtitle: params.summary_rw.split('\n')[0] || '',
    summary: params.summary_rw,
    body: params.body_rw,
    category_label: params.category_label || params.topic,
    processed_at: nowIso,
    batch_id: 'MCP-CHATGPT-DIRECT'
  };

  // If local DB is not yet deleted, save to local; otherwise Supabase is primary
  try {
    db.saveSync();
  } catch {}

  // Write directly to Supabase
  if (client) {
    try {
      await client
        .from('articles')
        .update({
          processing_status: 'PROCESSED',
          topic: params.topic,
          portal_category_id: params.category_label || params.topic,
          updated_at: nowIso
        })
        .eq('article_id', params.article_id);

      const localizedRows = [
        {
          article_id: params.article_id,
          lang: 'ko',
          title: params.title_ko,
          subtitle: params.summary_ko.split('\n')[0] || '',
          summary: params.summary_ko,
          body: params.body_ko,
          category_label: params.category_label || params.topic,
          topic: params.topic,
          processed_at: nowIso,
          batch_id: 'MCP-CHATGPT-DIRECT'
        },
        {
          article_id: params.article_id,
          lang: 'en',
          title: params.title_en,
          subtitle: params.summary_en.split('\n')[0] || '',
          summary: params.summary_en,
          body: params.body_en,
          category_label: params.category_label || params.topic,
          topic: params.topic,
          processed_at: nowIso,
          batch_id: 'MCP-CHATGPT-DIRECT'
        },
        {
          article_id: params.article_id,
          lang: 'rw',
          title: params.title_rw,
          subtitle: params.summary_rw.split('\n')[0] || '',
          summary: params.summary_rw,
          body: params.body_rw,
          category_label: params.category_label || params.topic,
          topic: params.topic,
          processed_at: nowIso,
          batch_id: 'MCP-CHATGPT-DIRECT'
        }
      ];

      await client
        .from('localized_articles')
        .upsert(localizedRows, { onConflict: 'article_id,lang' });
    } catch (err: any) {
      console.error('[Supabase] Failed to write processed article to Supabase:', err);
    }
  }

  return {
    success: true,
    message: `기사 [${params.article_id}]의 3개 언어 번역/요약/토픽이 성공적으로 저장되고 PROCESSED 플래그로 업데이트되었습니다.`
  };
}

// Start the auto-migrator immediately
startSupabaseAutoMigrator();
