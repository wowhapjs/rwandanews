import { ContentBlock } from '../sources/types.js';

export type PortalTheme = 'BLACK' | 'PINK' | 'BLUE' | 'RAINBOW';
export type ViewMode = 'TEXT' | 'CARD' | 'PHOTO_TEXT';
export type EventViewMode = 'MONTH' | 'LIST';
export type ArticleProcessingStatus = 'RAW' | 'EXPORT_READY' | 'EXPORTED' | 'PARTIAL' | 'PROCESSED' | 'ERROR';
export type TagType = 'PERSON' | 'ORGANIZATION' | 'PLACE' | 'TOPIC' | 'INDUSTRY' | 'PROJECT' | 'EVENT_TYPE' | 'CUSTOM';

export interface SourceRecord {
  id: string;
  domain: string;
  name: string;
  region: 'rwanda' | 'korea' | 'africa' | 'world';
  type: 'news' | 'government' | 'social';
  defaultLanguage: string;
  homeUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SourceRunRecord {
  id: string;
  sourceId: string;
  runType: 'incremental' | 'backfill';
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  articlesDiscovered: number;
  articlesImported: number;
  errorsCount: number;
  lastError?: string;
  lastSuccessfulPage: number;
}

export interface SourceCheckpointRecord {
  sourceId: string;
  section: string;
  currentPage: number;
  lastSuccessfulPage: number;
  oldestDateReached?: string;
  checkpointTime: string;
}

export interface ArticleRecord {
  article_id: string;
  source_id: string;
  source_url: string;
  canonical_url: string;
  original_language: string;
  original_title: string;
  original_subtitle?: string;
  original_body: string;
  author?: string;
  published_at: string; // ISO string
  updated_at?: string;
  collected_at: string;
  source_section?: string;
  topic?: string;
  topic_sub?: string;
  is_representative?: boolean;
  grouped_article_ids?: string[];
  region?: string;
  lead_image_url?: string;
  image_urls: string[];
  content_blocks: ContentBlock[];
  processing_status: ArticleProcessingStatus;
  normalized_title: string;
  content_hash: string;
  duplicate_group_id?: string;
  story_cluster_id?: string;
  similar_article_ids?: string[];
  previous_article_ids?: string[];
  future_article_ids?: string[];
  created_at: string;
}

export interface ArticleRelationsRecord {
  similar: string[];
  previous: string[];
  future: string[];
  cluster_title?: string;
  notes?: string;
}

export interface StoryClusterRecord {
  id: string;
  title: string;
  representative_article_id: string;
  article_count: number;
  article_ids?: string[];
  integrated_body?: string;
  sources_summary?: string;
  created_at: string;
  updated_at: string;
}

export interface TagConceptRecord {
  tag_concept_id: string;
  key: string;
  type: TagType;
  created_at: string;
}

export interface TagAliasRecord {
  id: string;
  tag_concept_id: string;
  alias: string;
  language: string;
}

export interface EventRecord {
  event_id: string;
  canonical_name: string;
  original_name: string;
  subtitle?: string;
  description?: string;
  start_date: string; // YYYY-MM-DD
  start_time?: string; // HH:mm
  end_date: string; // YYYY-MM-DD
  end_time?: string; // HH:mm
  timezone: string; // e.g. 'Africa/Kigali'
  all_day: boolean;
  venue?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  organizer?: string;
  event_type?: string;
  category: 'Government' | 'Business / Investment' | 'Conference / Technology' | 'Culture / Festival' | 'Concert / Entertainment' | 'Education' | 'Sports' | 'Exhibition' | 'Community' | 'Other';
  official_url?: string;
  registration_url?: string;
  price_text?: string;
  status: 'confirmed' | 'unconfirmed' | 'cancelled';
  confidence: number;
  created_manually: boolean;
  duplicate_group_id?: string;
  source_article_id?: string;
  created_at: string;
  updated_at: string;
}

export interface EventMatchCandidateRecord {
  id: string;
  source_event_id: string;
  target_event_id: string;
  similarity_score: number; // 0 to 1
  status: 'PENDING' | 'MERGED' | 'REJECTED';
  match_reasons: string[];
  created_at: string;
}

export interface EventUrlRecord {
  id: string;
  url: string;
  status: 'QUEUED' | 'FETCHING' | 'READY' | 'EXPORTED' | 'IMPORTED' | 'ERROR';
  fetched_title?: string;
  fetched_text?: string;
  error_message?: string;
  batch_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AiBatchRecord {
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

export interface IntegratedArticleRecord {
  integrated_article_id: string;
  title: string;
  subtitle?: string;
  body: string;
  topic: string;
  topic_sub?: string;
  source_article_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface IntegratedSentenceRecord {
  sentence_id: string;
  integrated_article_id: string;
  sentence_index: number;
  sentence_text: string;
}

export interface IntegratedSentenceSourceRecord {
  id: string;
  sentence_id: string;
  source_article_id: string;
  source_url?: string;
  source_title?: string;
  source_fragment: string;
}

export interface SavedEventViewRecord {
  id: string;
  name: string;
  filter_state: {
    categories?: string[];
    sources?: string[];
    languages?: string[];
    tags?: string[];
    city?: string;
    eventType?: string;
    keyword?: string;
  };
  created_at: string;
}

// Localized Schemas (portal_ko, portal_en, portal_rw)
export interface LocalizedArticleRecord {
  article_id: string;
  title: string;
  subtitle?: string;
  summary?: string;
  body: string;
  topic?: string;
  topic_sub?: string;
  processed_at: string;
  batch_id?: string;
  content_blocks?: ContentBlock[];
}

export interface LocalizedTagRecord {
  tag_concept_id: string;
  name: string;
}

export interface LocalizedEventTextRecord {
  event_id: string;
  canonical_name: string;
  subtitle?: string;
  description?: string;
  venue?: string;
  city?: string;
}
