export type PortalTheme = 'BLACK' | 'PINK' | 'BLUE' | 'RAINBOW';
export type ViewMode = 'TEXT' | 'CARD' | 'PHOTO_TEXT';
export type EventViewMode = 'MONTH' | 'LIST';
export type ActiveTab = 'HOME' | 'NEWS' | 'EVENTS' | 'SOURCES' | 'AI_WORKSPACE' | 'SETTINGS';

export interface ContentBlock {
  blockId: string;
  type: 'paragraph' | 'heading' | 'blockquote' | 'image' | 'video' | 'embed';
  text?: string;
  headingLevel?: number;
  imageId?: string;
  url?: string;
  alt?: string;
  caption?: string;
  credit?: string;
}

export interface TagInfo {
  id: string;
  key: string;
  name: string;
  type?: string;
  nameEn?: string;
  nameKo?: string;
  nameRw?: string;
  articleCount?: number;
  eventCount?: number;
  totalCount?: number;
}

export interface Article {
  article_id: string;
  source_id: string;
  source_url: string;
  canonical_url: string;
  original_language: string;
  original_title: string;
  original_subtitle?: string;
  original_body: string;
  author?: string;
  published_at: string;
  collected_at: string;
  source_section?: string;
  topic?: string;
  topic_sub?: string;
  is_representative?: boolean;
  grouped_article_ids?: string[];
  cluster_articles?: any[];
  region?: string;
  lead_image_url?: string;
  image_urls: string[];
  content_blocks: ContentBlock[];
  processing_status: 'RAW' | 'EXPORT_READY' | 'EXPORTED' | 'PARTIAL' | 'PROCESSED' | 'ERROR';
  duplicate_group_id?: string;
  story_cluster_id?: string;
  similar_article_ids?: string[];
  previous_article_ids?: string[];
  future_article_ids?: string[];
  created_at: string;
  displayTitle: string;
  displaySubtitle?: string;
  displaySummary: string;
  isLocalized: boolean;
  relatedStoriesCount: number;
  relatedEvents: EventItem[];
  tags: TagInfo[];
  storyCluster?: {
    id: string;
    title: string;
    representative_article_id: string;
    article_count: number;
  };
  similarArticles?: {
    article_id: string;
    original_title: string;
    published_at: string;
    source_id: string;
    lead_image_url?: string;
    topic?: string;
    topic_sub?: string;
  }[];
  previousArticles?: {
    article_id: string;
    original_title: string;
    published_at: string;
    source_id: string;
    lead_image_url?: string;
    topic?: string;
    topic_sub?: string;
  }[];
  futureArticles?: {
    article_id: string;
    original_title: string;
    published_at: string;
    source_id: string;
    lead_image_url?: string;
    topic?: string;
    topic_sub?: string;
  }[];
}

export interface EventItem {
  event_id: string;
  canonical_name: string;
  original_name: string;
  subtitle?: string;
  description?: string;
  start_date: string;
  start_time?: string;
  end_date: string;
  end_time?: string;
  timezone: string;
  all_day: boolean;
  venue?: string;
  city?: string;
  country?: string;
  organizer?: string;
  category: 'Government' | 'Business / Investment' | 'Conference / Technology' | 'Culture / Festival' | 'Concert / Entertainment' | 'Education' | 'Sports' | 'Exhibition' | 'Community' | 'Other';
  event_type?: string;
  official_url?: string;
  registration_url?: string;
  price_text?: string;
  status: 'confirmed' | 'unconfirmed' | 'cancelled';
  confidence: number;
  displayName?: string;
  displaySubtitle?: string;
  relatedArticles?: Article[];
  tags?: TagInfo[];
}

export interface EventCandidate {
  id: string;
  source_event_id: string;
  target_event_id: string;
  similarity_score: number;
  status: 'PENDING' | 'MERGED' | 'REJECTED';
  match_reasons: string[];
  sourceEvent: EventItem;
  targetEvent: EventItem;
}

export interface SourceInfo {
  id: string;
  domain: string;
  name: string;
  region: 'rwanda' | 'korea' | 'africa' | 'world';
  type: 'news' | 'government' | 'social';
  defaultLanguage: string;
  homeUrl: string;
  enabled: boolean;
  isRunning: boolean;
  articlesDiscovered: number;
  articlesImported: number;
  checkpoint?: {
    currentPage: number;
    lastSuccessfulPage: number;
    oldestDateReached?: string;
    checkpointTime: string;
  };
  lastRun?: {
    id: string;
    runType: 'incremental' | 'backfill';
    startedAt: string;
    completedAt?: string;
    status: string;
    articlesDiscovered: number;
    articlesImported: number;
    errorsCount: number;
    lastError?: string;
  };
}

export interface AiBatch {
  batch_id: string;
  batch_type: 'article_processing' | 'event_extraction' | 'integrated_article';
  name: string;
  status: 'CREATED' | 'EXPORTED' | 'IMPORTED' | 'PARTIAL';
  item_count: number;
  char_count: number;
  filename: string;
  article_ids?: string[];
  created_at: string;
  imported_at?: string;
}

export interface EventUrlItem {
  id: string;
  url: string;
  status: 'QUEUED' | 'FETCHING' | 'READY' | 'EXPORTED' | 'IMPORTED' | 'ERROR';
  fetched_title?: string;
  fetched_text?: string;
  error_message?: string;
  created_at: string;
}

export interface IntegratedArticle {
  integrated_article_id: string;
  title: string;
  subtitle?: string;
  body: string;
  topic: string;
  topic_sub?: string;
  source_article_ids: string[];
  created_at: string;
}

export interface SentenceTrace {
  sentence_id: string;
  sentence_index: number;
  sentence_text: string;
  sources: {
    id: string;
    source_article_id: string;
    source_title?: string;
    source_url?: string;
    source_fragment: string;
  }[];
}

export interface FacetFilterState {
  regions: string[];
  categories: string[];
  aiStatus: string[];
  sources: string[];
  languages: string[];
  tags: string[];
  tagLogic: 'AND' | 'OR';
  search: string;
  excludeCategories?: string[];
  excludeRegions?: string[];
  excludeSources?: string[];
  excludeLanguages?: string[];
  excludeTags?: string[];
}
