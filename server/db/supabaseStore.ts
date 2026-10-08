import { getSupabaseClient } from './supabase.js';
import { ArticleRecord, LocalizedArticleRecord } from './types.js';

export interface DirectArticleQueryOptions {
  regions?: string[];
  categories?: string[];
  aiStatus?: string[];
  sources?: string[];
  languages?: string[];
  excludeCategories?: string[];
  excludeRegions?: string[];
  excludeSources?: string[];
  excludeLanguages?: string[];
  search?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  lang?: string;
}

export interface DirectArticleResult {
  total: number;
  articles: any[];
  limit: number;
  offset: number;
}

export function formatArticleCode(dateStr?: string | null, sequence: number = 1): string {
  if (!dateStr) return `#260101-${String(sequence).padStart(3, '0')}`;
  const clean = dateStr.replace(/[^0-9]/g, '');
  const yymmdd = clean.length >= 6 ? clean.slice(2, 8) : '260101';
  return `#${yymmdd}-${String(sequence).padStart(3, '0')}`;
}

function countWords(text?: string | null): number {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function normalizeTopicFilterValue(value:string):string {
  const clean=String(value||'').trim();
  return clean.toLowerCase()==='tech'?'AI/Tech':clean;
}

/**
 * Checks if Supabase client is connected and ready
 */
export function isSupabaseReady(): boolean {
  const client = getSupabaseClient();
  return Boolean(client);
}

/**
 * Direct query for articles from Supabase (No local in-memory copying)
 */
export async function fetchArticlesDirectly(
  options: DirectArticleQueryOptions
): Promise<DirectArticleResult> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured.');
  }

  const limit = Number(options.limit) || 50;
  const offset = Number(options.offset) || 0;
  const sort = options.sort || 'newest';
  const lang = options.lang || 'original';

  let query = client.from('articles').select('*', { count: 'exact' });

  // 1. Facet: Topic (single authoritative classification)
  if (options.categories && options.categories.length > 0) {
    const catList = options.categories.map(normalizeTopicFilterValue);
    query = query.in('topic', catList);
  }

  // 1-1. Exclude Categories
  if (options.excludeCategories && options.excludeCategories.length > 0) {
    for (const ec of options.excludeCategories) {
      query = query.neq('topic', normalizeTopicFilterValue(ec));
    }
  }

  // 1-2. Facet: Regions (rwanda, korea, etc.)
  const RWANDA_SOURCES = ['newtimes', 'igihe', 'ktpress', 'kigalitoday', 'umuseke', 'taarifa', 'futures'];
  const KOREA_SOURCES = ['yonhap', 'donga', 'chosun', 'hani', 'joongang'];

  if (options.regions && options.regions.length > 0) {
    const allowedSources: string[] = [];
    if (options.regions.includes('rwanda')) allowedSources.push(...RWANDA_SOURCES);
    if (options.regions.includes('korea')) allowedSources.push(...KOREA_SOURCES);
    if (allowedSources.length > 0) {
      query = query.in('source_id', allowedSources);
    }
  }

  if (options.excludeRegions && options.excludeRegions.length > 0) {
    const excludedSources: string[] = [];
    if (options.excludeRegions.includes('rwanda')) excludedSources.push(...RWANDA_SOURCES);
    if (options.excludeRegions.includes('korea')) excludedSources.push(...KOREA_SOURCES);
    for (const s of excludedSources) {
      query = query.neq('source_id', s);
    }
  }

  // 2. Facet: AI Processed Status
  if (options.aiStatus && options.aiStatus.length > 0) {
    const hasDone = options.aiStatus.includes('done');
    const hasWaiting = options.aiStatus.includes('waiting');
    if (hasDone && !hasWaiting) {
      query = query.eq('processing_status', 'PROCESSED');
    } else if (hasWaiting && !hasDone) {
      query = query.neq('processing_status', 'PROCESSED');
    }
  }

  // 3. Facet: Sources
  if (options.sources && options.sources.length > 0) {
    query = query.in('source_id', options.sources);
  }

  // 4. Facet: Languages
  if (options.languages && options.languages.length > 0) {
    query = query.in('original_language', options.languages);
  }

  // 5. Exclude filters
  if (options.excludeSources && options.excludeSources.length > 0) {
    for (const src of options.excludeSources) {
      query = query.neq('source_id', src);
    }
  }

  if (options.excludeLanguages && options.excludeLanguages.length > 0) {
    for (const l of options.excludeLanguages) {
      query = query.neq('original_language', l);
    }
  }

  // 6. Search
  if (options.search && options.search.trim()) {
    const term = options.search.trim();
    query = query.or(`original_title.ilike.%${term}%,author.ilike.%${term}%`);
  }

  // 7. Sort
  if (sort === 'oldest') {
    query = query.order('published_at', { ascending: true });
  } else if (sort === 'recently_collected') {
    query = query.order('collected_at', { ascending: false });
  } else if (sort === 'source') {
    query = query.order('source_id', { ascending: true });
  } else {
    // Default newest
    query = query.order('published_at', { ascending: false });
  }

  // 8. Pagination Range
  query = query.range(offset, offset + limit - 1);

  const { data: articles, count, error } = await query;
  if (error) {
    throw new Error(`Supabase query error: ${error.message}`);
  }

  const total = count ?? (articles?.length || 0);
  const rows = articles || [];

  // If language is requested ('ko', 'en', 'rw'), fetch localized translations for these rows in 1 query
  if (['ko', 'en', 'rw'].includes(lang) && rows.length > 0) {
    const articleIds = rows.map((r: any) => r.article_id);
    const { data: locData } = await client
      .from('localized_articles')
      .select('*')
      .in('article_id', articleIds)
      .eq('lang', lang);

    const locMap = new Map<string, any>();
    if (locData) {
      for (const loc of locData) {
        locMap.set(loc.article_id, loc);
      }
    }

    const mapped = rows.map((art: any) => {
      const loc = locMap.get(art.article_id);
      const rawTopic = (art.topic && art.topic !== 'undefined' && art.topic !== 'null') ? String(art.topic).trim() : null;
      const normalizedCategory = rawTopic || 'General';
      const topicSub = (art.topic_sub && art.topic_sub !== 'undefined' && art.topic_sub !== 'null') ? String(art.topic_sub).trim() : 'General';
      const relatedCount = art.story_cluster_id ? (art.source_id === 'grouping' ? (art.grouped_article_ids?.length || 2) : 2) : 0;
      return {
        ...art,
        topic: normalizedCategory,
        topic_sub: topicSub,
        lead_image_url: art.lead_image_url || art.image_urls?.[0] || null,
        relatedStoriesCount: relatedCount,
        displayTitle: loc?.title || art.original_title,
        displaySubtitle: loc?.subtitle || art.original_subtitle,
        displaySummary: loc?.summary || (art.original_subtitle || art.original_body?.slice(0, 180) + '...'),
        isLocalized: Boolean(loc)
      };
    });

    return { total, articles: mapped, limit, offset };
  }

  // Original display
  const mapped = rows.map((art: any) => {
    const rawTopic = (art.topic && art.topic !== 'undefined' && art.topic !== 'null') ? String(art.topic).trim() : null;
    const normalizedCategory = rawTopic || 'General';
    const topicSub = (art.topic_sub && art.topic_sub !== 'undefined' && art.topic_sub !== 'null') ? String(art.topic_sub).trim() : 'General';
    const relatedCount = art.story_cluster_id ? (art.source_id === 'grouping' ? (art.grouped_article_ids?.length || 2) : 2) : 0;
    return {
      ...art,
      topic: normalizedCategory,
      topic_sub: topicSub,
      lead_image_url: art.lead_image_url || art.image_urls?.[0] || null,
      relatedStoriesCount: relatedCount,
      displayTitle: art.original_title,
      displaySubtitle: art.original_subtitle,
      displaySummary: art.original_subtitle || art.original_body?.slice(0, 180) + '...',
      isLocalized: art.processing_status === 'PROCESSED'
    };
  });

  return { total, articles: mapped, limit, offset };
}

/**
 * Direct fetch of single article detail with localized versions from Supabase
 */
export async function fetchArticleDetailDirectly(articleId: string): Promise<any | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data: art, error } = await client
    .from('articles')
    .select('*')
    .eq('article_id', articleId)
    .maybeSingle();

  if (error || !art) return null;

  // Normalize the single authoritative topic fields.
  art.topic = (art.topic && art.topic !== 'undefined' && art.topic !== 'null') ? art.topic : 'General';
  art.topic_sub = (art.topic_sub && art.topic_sub !== 'undefined' && art.topic_sub !== 'null') ? art.topic_sub : 'General';
  art.lead_image_url = art.lead_image_url || art.image_urls?.[0] || null;

  // Fetch localized versions
  const { data: locList } = await client
    .from('localized_articles')
    .select('*')
    .eq('article_id', articleId);

  let ko: any = null;
  let en: any = null;
  let rw: any = null;

  if (locList) {
    for (const loc of locList) {
      if (loc.lang === 'ko') ko = loc;
      else if (loc.lang === 'en') en = loc;
      else if (loc.lang === 'rw') rw = loc;
    }
  }

  // Fetch clustered sibling original articles if this article is in a story cluster
  let cluster_articles: any[] = [];
  if (art.story_cluster_id) {
    const { data: siblings } = await client
      .from('articles')
      .select('article_id, original_title, original_subtitle, original_body, source_id, source_url, author, published_at, lead_image_url')
      .eq('story_cluster_id', art.story_cluster_id)
      .neq('article_id', articleId)
      .order('published_at', { ascending: false });

    if (siblings) {
      cluster_articles = siblings;
    }
  }

  return {
    ...art,
    ko,
    en,
    rw,
    cluster_articles
  };
}

let articleNumberMapCache: {
  timestamp: number;
  map: Map<string, string>;
} | null = null;

/**
 * Returns a consistent map of article_id -> #YYMMDD-XXX based on chronological publication order
 */
export async function getArticleNumberMap(): Promise<Map<string, string>> {
  if (articleNumberMapCache && Date.now() - articleNumberMapCache.timestamp < 600000) {
    return articleNumberMapCache.map;
  }

  const client = getSupabaseClient();
  if (!client) return new Map();

  const { count: totalArticlesCount } = await client
    .from('articles')
    .select('*', { count: 'exact', head: true });

  const total = totalArticlesCount ?? 0;
  if (total === 0) return new Map();

  const PAGE_SIZE = 1000;
  const numPages = Math.ceil(total / PAGE_SIZE);
  const promises = [];

  for (let p = 0; p < numPages; p++) {
    promises.push(
      client
        .from('articles')
        .select('article_id, published_at')
        .order('published_at', { ascending: false })
        .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
    );
  }

  const results = await Promise.all(promises);
  const all = results.flatMap(r => r.data || []);

  const dateCounters: Record<string, number> = {};
  const formattedNumbers = new Map<string, string>();
  for (const art of all) {
    const d = art.published_at ? art.published_at.slice(0, 10).replace(/[^0-9]/g, '') : '260101';
    const yymmdd = d.length >= 6 ? d.slice(2, 8) : '260101';
    dateCounters[yymmdd] = (dateCounters[yymmdd] || 0) + 1;
    formattedNumbers.set(art.article_id, `#${yymmdd}-${String(dateCounters[yymmdd]).padStart(3, '0')}`);
  }

  articleNumberMapCache = {
    timestamp: Date.now(),
    map: formattedNumbers
  };

  return formattedNumbers;
}

/**
 * Direct computation of 30-item batch groups directly from Supabase
 */
export async function fetchBatchGroupsDirectly(): Promise<{
  groups: any[];
  totalRaw: number;
  totalProcessed: number;
  totalArticles: number;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { groups: [], totalRaw: 0, totalProcessed: 0, totalArticles: 0 };
  }

  // 1. Get total article count
  const { count: totalArticlesCount } = await client
    .from('articles')
    .select('*', { count: 'exact', head: true });

  const totalArticles = totalArticlesCount ?? 0;
  if (totalArticles === 0) {
    return { groups: [], totalRaw: 0, totalProcessed: 0, totalArticles: 0 };
  }

  // 2. Fetch lightweight metadata in parallel chunks of 1000 items
  const PAGE_SIZE = 1000;
  const numPages = Math.ceil(totalArticles / PAGE_SIZE);
  const promises = [];

  for (let p = 0; p < numPages; p++) {
    promises.push(
      client
        .from('articles')
        .select('article_id, published_at, processing_status, source_id')
        .order('published_at', { ascending: false })
        .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
    );
  }

  const results = await Promise.all(promises);
  const allArticles = results.flatMap(r => r.data || []);

  let totalRaw = 0;
  let totalProcessed = 0;

  for (const art of allArticles) {
    if (art.processing_status === 'PROCESSED') totalProcessed++;
    else totalRaw++;
  }

  // Calculate article numbering #YYMMDD-번호 consistently
  const formattedNumbers = await getArticleNumberMap();

  const BATCH_GROUP_SIZE = 30;
  const groups: any[] = [];

  for (let i = 0; i < allArticles.length; i += BATCH_GROUP_SIZE) {
    const chunk = allArticles.slice(i, i + BATCH_GROUP_SIZE);
    const groupNum = Math.floor(i / BATCH_GROUP_SIZE) + 1;
    const agentNum = ((groupNum - 1) % 5) + 1;

    let processedCount = 0;
    let rawCount = 0;
    const sourceSummary: Record<string, number> = {};

    for (const item of chunk) {
      if (item.processing_status === 'PROCESSED') {
        processedCount++;
      } else {
        rawCount++;
      }
      const s = item.source_id || 'unknown';
      sourceSummary[s] = (sourceSummary[s] || 0) + 1;
    }

    let status: 'PENDING' | 'IN_PROGRESS' | 'DONE' = 'PENDING';
    if (processedCount === chunk.length) {
      status = 'DONE';
    } else if (processedCount > 0) {
      status = 'IN_PROGRESS';
    }

    const firstArt = chunk[0];
    const lastArt = chunk[chunk.length - 1];
    const startCode = formattedNumbers.get(firstArt?.article_id) || `#${i + 1}`;
    const endCode = formattedNumbers.get(lastArt?.article_id) || `#${i + chunk.length}`;

    groups.push({
      group_number: groupNum,
      agent_number: agentNum,
      start_index: i + 1,
      end_index: i + chunk.length,
      start_code: startCode,
      end_code: endCode,
      number_range: `${startCode} ~ ${endCode}`,
      total_items: chunk.length,
      processed_items: processedCount,
      raw_items: rawCount,
      status,
      first_article_id: firstArt?.article_id || '',
      last_article_id: lastArt?.article_id || '',
      source_summary: sourceSummary
    });
  }

  return { groups, totalRaw, totalProcessed, totalArticles };
}

/**
 * Direct computation of 30-item unprocessed batch groups (dedicated separate agent assignment for raw items only)
 */
export async function fetchUnprocessedBatchGroupsDirectly(): Promise<{
  groups: any[];
  totalRaw: number;
  totalProcessed: number;
  totalArticles: number;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { groups: [], totalRaw: 0, totalProcessed: 0, totalArticles: 0 };
  }

  // 1. Get raw / unprocessed articles (EXPORTED, RAW, PENDING etc)
  const { data: rawArticles, error } = await client
    .from('articles')
    .select('article_id, published_at, processing_status, source_id, original_title')
    .neq('processing_status', 'PROCESSED')
    .order('published_at', { ascending: false });

  if (error || !rawArticles) {
    console.warn('[SupabaseStore] fetchUnprocessedBatchGroups error:', error?.message);
    return { groups: [], totalRaw: 0, totalProcessed: 0, totalArticles: 0 };
  }

  const totalRaw = rawArticles.length;
  const formattedNumbers = await getArticleNumberMap();
  const BATCH_GROUP_SIZE = 30;
  const groups: any[] = [];

  for (let i = 0; i < rawArticles.length; i += BATCH_GROUP_SIZE) {
    const chunk = rawArticles.slice(i, i + BATCH_GROUP_SIZE);
    const groupNum = Math.floor(i / BATCH_GROUP_SIZE) + 1;
    const agentNum = ((groupNum - 1) % 5) + 1;

    const sourceSummary: Record<string, number> = {};
    for (const item of chunk) {
      const s = item.source_id || 'unknown';
      sourceSummary[s] = (sourceSummary[s] || 0) + 1;
    }

    const firstArt = chunk[0];
    const lastArt = chunk[chunk.length - 1];
    const startCode = formattedNumbers.get(firstArt?.article_id) || `#${i + 1}`;
    const endCode = formattedNumbers.get(lastArt?.article_id) || `#${i + chunk.length}`;

    groups.push({
      group_number: groupNum,
      agent_number: agentNum,
      agent_name: `미처리 집중 Agent #${agentNum}`,
      is_unprocessed_batch: true,
      start_index: i + 1,
      end_index: i + chunk.length,
      start_code: startCode,
      end_code: endCode,
      number_range: `${startCode} ~ ${endCode}`,
      total_items: chunk.length,
      processed_items: 0,
      raw_items: chunk.length,
      status: 'PENDING',
      first_article_id: firstArt?.article_id || '',
      last_article_id: lastArt?.article_id || '',
      source_summary: sourceSummary,
      article_ids: chunk.map(a => a.article_id)
    });
  }

  return {
    groups,
    totalRaw,
    totalProcessed: 0,
    totalArticles: totalRaw
  };
}

/**
 * Direct fetch of 30 unprocessed articles in a dedicated unprocessed group
 */
export async function fetchUnprocessedGroupArticlesDirectly(groupNumber: number): Promise<any> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');

  const BATCH_GROUP_SIZE = 30;
  const startIndex = (groupNumber - 1) * BATCH_GROUP_SIZE;
  const endIndex = startIndex + BATCH_GROUP_SIZE - 1;

  const { data: chunk, error } = await client
    .from('articles')
    .select('*')
    .neq('processing_status', 'PROCESSED')
    .order('published_at', { ascending: false })
    .range(startIndex, endIndex);

  if (error) {
    throw new Error(`Supabase query error: ${error.message}`);
  }

  const articles = chunk || [];
  const agentNum = ((groupNumber - 1) % 5) + 1;
  const numberMap = await getArticleNumberMap();

  const articlesWithIndex = articles.map((art: any, idx: number) => {
    const artNumber = numberMap.get(art.article_id) || `#${startIndex + idx + 1}`;
    return {
      ...art,
      topic: art.topic || 'General',
      topic_sub: art.topic_sub || 'General',
      group_index: idx + 1,
      article_number: artNumber
    };
  });

  return {
    group_number: groupNumber,
    agent_number: agentNum,
    agent_name: `미처리 집중 Agent #${agentNum}`,
    is_unprocessed_batch: true,
    total_in_group: articlesWithIndex.length,
    articles: articlesWithIndex
  };
}

/**
 * Direct fetch of 30 articles in a group from Supabase
 */
export async function fetchGroupArticlesDirectly(groupNumber: number): Promise<any> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');

  const BATCH_GROUP_SIZE = 30;
  const startIndex = (groupNumber - 1) * BATCH_GROUP_SIZE;
  const endIndex = startIndex + BATCH_GROUP_SIZE - 1;

  // 1. Fetch 30 articles
  const { data: chunk, error } = await client
    .from('articles')
    .select('*')
    .order('published_at', { ascending: false })
    .range(startIndex, endIndex);

  if (error) {
    throw new Error(`Supabase query error: ${error.message}`);
  }

  const articles = chunk || [];
  if (articles.length === 0) {
    return {
      group_number: groupNumber,
      agent_number: ((groupNumber - 1) % 5) + 1,
      total_in_group: 0,
      articles: []
    };
  }

  // 2. Fetch localized articles for these 30
  const articleIds = articles.map(a => a.article_id);
  const { data: locRows } = await client
    .from('localized_articles')
    .select('*')
    .in('article_id', articleIds);

  const locByArtAndLang = new Map<string, any>();
  if (locRows) {
    for (const r of locRows) {
      locByArtAndLang.set(`${r.article_id}::${r.lang}`, r);
    }
  }

  // 3. Format numbers and construct response
  const agentNum = ((groupNumber - 1) % 5) + 1;
  const numberMap = await getArticleNumberMap();

  const articlesWithIndex = articles.map((art: any, idx: number) => {
    const ko = locByArtAndLang.get(`${art.article_id}::ko`);
    const en = locByArtAndLang.get(`${art.article_id}::en`);
    const rw = locByArtAndLang.get(`${art.article_id}::rw`);

    const artNumber = numberMap.get(art.article_id) || `#${startIndex + idx + 1}`;

    return {
      global_index: startIndex + idx + 1,
      group_index: idx + 1,
      article_number: artNumber,
      article_id: art.article_id,
      source_id: art.source_id,
      source_name: art.source_id,
      source_url: art.source_url,
      original_language: art.original_language,
      original_title: art.original_title,
      original_subtitle: art.original_subtitle,
      original_body: art.original_body,
      author: art.author,
      published_at: art.published_at,
      topic: art.topic || 'General',
      topic_sub: art.topic_sub || 'General',
      processing_status: art.processing_status,
      has_ko: Boolean(ko),
      has_en: Boolean(en),
      has_rw: Boolean(rw),
      word_count_ko: countWords((ko?.title || '') + ' ' + (ko?.summary || '') + ' ' + (ko?.body || '')),
      word_count_en: countWords((en?.title || '') + ' ' + (en?.summary || '') + ' ' + (en?.body || '')),
      word_count_rw: countWords((rw?.title || '') + ' ' + (rw?.summary || '') + ' ' + (rw?.body || '')),
      body_words_ko: countWords(ko?.body),
      body_words_en: countWords(en?.body),
      body_words_rw: countWords(rw?.body),
      original_word_count: countWords(art.original_body)
    };
  });

  return {
    group_number: groupNumber,
    agent_number: agentNum,
    start_index: startIndex + 1,
    end_index: startIndex + articles.length,
    start_code: articlesWithIndex[0]?.article_number,
    end_code: articlesWithIndex[articlesWithIndex.length - 1]?.article_number,
    number_range: `${articlesWithIndex[0]?.article_number} ~ ${articlesWithIndex[articlesWithIndex.length - 1]?.article_number}`,
    total_in_group: articles.length,
    articles: articlesWithIndex
  };
}

/**
 * Direct fetch of AI Workspace Metrics from Supabase
 */
export async function fetchAiMetricsDirectly(): Promise<any> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      totalArticles: 0,
      totalRaw: 0,
      totalProcessed: 0,
      totalExported: 0,
      totalPartialLocalized: 0,
      totalFullyProcessed: 0
    };
  }

  // 1. Total count
  const { count: totalArticles } = await client
    .from('articles')
    .select('*', { count: 'exact', head: true });

  // 2. PROCESSED count
  const { count: processedCount } = await client
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('processing_status', 'PROCESSED');

  // 3. EXPORTED count
  const { count: exportedCount } = await client
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('processing_status', 'EXPORTED');

  const total = totalArticles ?? 0;
  const processed = processedCount ?? 0;
  const exported = exportedCount ?? 0;
  const raw = Math.max(0, total - processed - exported);

  return {
    totalArticles: total,
    totalRaw: raw,
    totalProcessed: processed,
    totalExported: exported,
    totalPartialLocalized: processed,
    totalFullyProcessed: processed,
    totalIntegrated: 0
  };
}

/**
 * Direct save of processed article into Supabase
 */
export async function saveProcessedArticleDirectly(data: {
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
  topic_sub?: string;
}): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured.');
  }

  // 1. Update master article in Supabase
  const { error: artErr } = await client
    .from('articles')
    .update({
      topic: data.topic,
      topic_sub: data.topic_sub || 'General',
      processing_status: 'PROCESSED',
      updated_at: new Date().toISOString()
    })
    .eq('article_id', data.article_id);

  if (artErr) {
    console.warn('[SupabaseStore] Article update error:', artErr.message);
  }

  // 2. Upsert localized articles for 'ko', 'en', 'rw'
  const localizedRows = [
    {
      article_id: data.article_id,
      lang: 'ko',
      title: data.title_ko,
      summary: data.summary_ko,
      body: data.body_ko,
      topic: data.topic,
      topic_sub: data.topic_sub || 'General',
      processed_at: new Date().toISOString()
    },
    {
      article_id: data.article_id,
      lang: 'en',
      title: data.title_en,
      summary: data.summary_en,
      body: data.body_en,
      topic: data.topic,
      topic_sub: data.topic_sub || 'General',
      processed_at: new Date().toISOString()
    },
    {
      article_id: data.article_id,
      lang: 'rw',
      title: data.title_rw,
      summary: data.summary_rw,
      body: data.body_rw,
      topic: data.topic,
      topic_sub: data.topic_sub || 'General',
      processed_at: new Date().toISOString()
    }
  ];

  const { error: locErr } = await client
    .from('localized_articles')
    .upsert(localizedRows, { onConflict: 'article_id,lang' });

  if (locErr) {
    throw new Error(`Localized articles upsert error: ${locErr.message}`);
  }

  return {
    success: true,
    message: `기사 [${data.article_id}]가 Supabase에 직접 성공적으로 저장되었습니다.`
  };
}

/**
 * Direct insert/upsert of new crawled article into Supabase
 */
export async function insertArticleDirectly(art: ArticleRecord): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const row = {
    article_id: art.article_id,
    source_id: art.source_id,
    source_url: art.source_url,
    canonical_url: art.canonical_url,
    original_language: art.original_language,
    original_title: art.original_title,
    original_subtitle: art.original_subtitle,
    original_body: art.original_body,
    author: art.author,
    published_at: art.published_at,
    collected_at: art.collected_at || new Date().toISOString(),
    source_section: art.source_section,
    topic: (art as any).topic || 'General',
    topic_sub: (art as any).topic_sub || 'General',
    lead_image_url: art.lead_image_url,
    image_urls: art.image_urls || [],
    content_blocks: art.content_blocks || [],
    processing_status: art.processing_status || 'RAW',
    normalized_title: art.normalized_title,
    content_hash: art.content_hash,
    story_cluster_id: art.story_cluster_id,
    created_at: art.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await client.from('articles').upsert(row, { onConflict: 'article_id' });
  if (error) {
    console.warn('[SupabaseStore] Direct insert error:', error.message);
  }
}

/**
 * Direct count of articles per source from Supabase (No in-memory cache)
 */
export async function fetchSourceArticleCountsDirectly(): Promise<Record<string, number>> {
  const client = getSupabaseClient();
  if (!client) return {};

  const knownSources = [
    'newtimes', 'igihe', 'ktpress', 'kigalitoday', 'umuseke', 'taarifa', 'futures',
    'yonhap', 'donga', 'chosun', 'hani', 'joongang'
  ];

  const counts: Record<string, number> = {};
  await Promise.all(
    knownSources.map(async sId => {
      const { count } = await client
        .from('articles')
        .select('*', { count: 'exact', head: true })
        .eq('source_id', sId);
      counts[sId] = count || 0;
    })
  );

  return counts;
}

/**
 * Fetch articles by list of IDs directly from Supabase
 */
export async function fetchArticlesByIdsDirectly(articleIds: string[]): Promise<any[]> {
  const client = getSupabaseClient();
  if (!client || !articleIds || articleIds.length === 0) return [];
  const { data } = await client
    .from('articles')
    .select('*')
    .in('article_id', articleIds);
  return data || [];
}

/**
 * Fetch latest un-processed (RAW) article IDs directly from Supabase
 */
export async function fetchUnprocessedArticleIdsDirectly(limit = 100): Promise<string[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data } = await client
    .from('articles')
    .select('article_id')
    .neq('processing_status', 'PROCESSED')
    .order('published_at', { ascending: false })
    .limit(limit);
  return (data || []).map(d => d.article_id);
}

/**
 * Checks whether an article URL already exists directly in Supabase
 */
export async function isArticleUrlExistingDirectly(url: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !url) return false;
  const { data } = await client
    .from('articles')
    .select('article_id')
    .eq('source_url', url)
    .limit(1);
  return Boolean(data && data.length > 0);
}
