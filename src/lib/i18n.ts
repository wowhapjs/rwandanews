/**
 * Global Internationalization (i18n) Dictionary & Helpers
 * Supports 'ko' (Korean), 'en' (English), 'rw' (Kinyarwanda).
 * Note: Source names and category names are excluded from translation as requested.
 */

export type SupportedLang = 'ko' | 'en' | 'rw';

export function getEffectiveLang(lang?: string): SupportedLang {
  if (!lang || lang === 'original' || lang === 'ko') return 'ko';
  if (lang === 'en') return 'en';
  if (lang === 'rw') return 'rw';
  return 'ko';
}

export const translations = {
  // Navigation & Header
  nav_home: { ko: '홈', en: 'Home', rw: 'Ahabanza' },
  nav_news: { ko: '뉴스', en: 'News', rw: 'Amakuru' },
  nav_events: { ko: '이벤트', en: 'Events', rw: 'Ibirori' },
  nav_sources: { ko: '출처 관리', en: 'Sources', rw: 'Inkomoko' },
  nav_ai_workspace: { ko: 'AI 워크스페이스', en: 'AI Workspace', rw: 'AI Workspace' },
  nav_settings: { ko: '설정', en: 'Settings', rw: 'Igenamiterere' },
  brand_title: { ko: '개인 뉴스 인텔리전스', en: 'Personal News Intelligence', rw: "Ubutasi bw'Amakuru Bwite" },
  brand_subtitle: { ko: '르완다 · 한국 · 글로벌 포털', en: 'Rwanda · Korea · Global Portal', rw: 'Rwanda · Koreya · Isi Yose' },
  search_placeholder: { ko: '기사 제목, 내용, 태그 검색...', en: 'Search title, body, tags...', rw: 'Shakisha umutwe, amakuru, amatagi...' },
  lang_select: { ko: '언어 선택', en: 'Select Language', rw: 'Hitamo Ururimi' },
  skin_theme: { ko: '스킨 테마', en: 'Color Skin Theme', rw: "Insanganyamatsiko y'Ibara" },

  // Themes
  theme_black: { ko: '블랙 (다크)', en: 'Black (Dark)', rw: 'Umukara' },
  theme_pink: { ko: '핑크 (네온)', en: 'Pink (Neon)', rw: 'Ipingi' },
  theme_blue: { ko: '블루 (사이버)', en: 'Blue (Cyber)', rw: 'Ubururu' },
  theme_rainbow: { ko: '레인보우 (네온)', en: 'Rainbow (Neon)', rw: "Umukororombya" },

  // Filter Panel & Facets
  filter_all: { ko: '전체', en: 'All', rw: 'Byose' },
  filter_search: { ko: '검색', en: 'Search', rw: 'Shakisha' },
  filter_options: { ko: '필터 설정', en: 'Filter Options', rw: "Igenamiterere ry'Akayunguruzo" },
  filter_collapse: { ko: '필터 접기', en: 'Collapse Filters', rw: 'Kina akayunguruzo' },
  filter_reset: { ko: '필터 초기화', en: 'Clear Filters', rw: 'Siba akayunguruzo' },
  filter_none_active: { ko: '현재 적용된 필터가 없습니다 (전체 표시 중)', en: 'No active filters (showing all)', rw: 'Nta kayunguruzo gakora (byose birerekanwa)' },
  filter_exclude_mode: { ko: '제외 모드 (NOT)', en: 'Exclude Mode (NOT)', rw: 'Uburyo bwo Gukuramo (NOT)' },
  filter_include_mode: { ko: '포함 모드 (IN)', en: 'Include Mode (IN)', rw: 'Uburyo bwo Gushyiramo (IN)' },
  filter_tag_logic_or: { ko: 'OR (하나라도 일치)', en: 'OR (Match any)', rw: 'OR (Kimwe cyose)' },
  filter_tag_logic_and: { ko: 'AND (모두 일치)', en: 'AND (Match all)', rw: 'AND (Byose bihuje)' },
  filter_categories: { ko: '카테고리', en: 'Categories', rw: 'Ibyiciro' },
  filter_regions: { ko: '지역', en: 'Regions', rw: 'Uturere' },
  filter_ai_status: { ko: 'AI 처리 상태', en: 'AI Status', rw: 'Imiterere ya AI' },
  filter_sources: { ko: '수집 출처', en: 'Sources', rw: 'Inkomoko' },
  filter_languages: { ko: '언어', en: 'Languages', rw: 'Indimi' },
  filter_tags: { ko: '추천 태그', en: 'Tags', rw: 'Amatagi' },
  filter_popular_tags: { ko: '인기 태그', en: 'Popular Tags', rw: 'Amatagi akunzwe' },
  filter_tag_explorer: { ko: '태그 탐색기', en: 'Tag Explorer', rw: "Ubushakashatsi bw'Amatagi" },
  filter_show_more: { ko: '더보기', en: 'Show More', rw: 'Reba ibindi' },
  filter_show_less: { ko: '접기', en: 'Show Less', rw: 'Gufunga' },

  // Status
  status_raw: { ko: '미처리 (RAW)', en: 'Unprocessed (RAW)', rw: 'Bitaratunganywa (RAW)' },
  status_exported: { ko: '패키지 추출 (EXPORTED)', en: 'Exported (EXPORTED)', rw: 'Byasohowe (EXPORTED)' },
  status_processed: { ko: '번역 완료 (PROCESSED)', en: 'Processed (PROCESSED)', rw: 'Byatunganyijwe (PROCESSED)' },
  status_done: { ko: '완료', en: 'Completed', rw: 'Byarangiye' },
  status_in_progress: { ko: '진행 중', en: 'In Progress', rw: 'Birakomeje' },
  status_pending: { ko: '미처리', en: 'Pending', rw: 'Bitegereje' },

  // Common UI actions
  btn_refresh: { ko: '새로고침', en: 'Refresh', rw: 'Kuvugurura' },
  btn_close: { ko: '닫기', en: 'Close', rw: 'Funga' },
  btn_save: { ko: '저장', en: 'Save', rw: 'Bika' },
  btn_copy: { ko: '복사', en: 'Copy', rw: 'Koporora' },
  btn_copied: { ko: '복사됨!', en: 'Copied!', rw: 'Byakoporowe!' },
  btn_preview: { ko: '미리보기', en: 'Preview', rw: 'Irebere' },
  btn_view_original: { ko: '원문 보기', en: 'View Original', rw: 'Reba umwimerere' },
  btn_next: { ko: '다음', en: 'Next', rw: 'Gukurikira' },
  btn_prev: { ko: '이전', en: 'Previous', rw: 'Kubanziriza' },
  btn_delete: { ko: '삭제', en: 'Delete', rw: 'Gusiba' },
  btn_cancel: { ko: '취소', en: 'Cancel', rw: 'Kureka' },
  btn_confirm: { ko: '확인', en: 'Confirm', rw: 'Kwemeza' },

  // Home View
  home_tracked_articles: { ko: '수집 기사 현황', en: 'Tracked Articles', rw: 'Amakuru Akurikiranywe' },
  home_verified_events: { ko: '검증된 이벤트', en: 'Verified Events', rw: 'Ibirori Byemejwe' },
  home_ai_batches: { ko: 'AI 번역 패키지', en: 'AI Translation Batches', rw: 'Amatsinda ya AI' },
  home_registered_sources: { ko: '등록된 수집 출처', en: 'Registered Sources', rw: 'Inkomoko Zanditswe' },
  home_latest_stream: { ko: '최신 인텔리전스 뉴스 스트림', en: 'Latest Intelligence Stream', rw: "Uruhererekane rw'Amakuru Mashya" },
  home_view_all_news: { ko: '전체 뉴스 보기', en: 'View All News', rw: 'Reba Amakuru Yose' },
  home_upcoming_events: { ko: '주요 예정 이벤트 캘린더', en: 'Upcoming Events Calendar', rw: "Ikalendari y'Ibirori Biteganyijwe" },
  home_explore_calendar: { ko: '캘린더 탐색', en: 'Explore Calendar', rw: 'Shakisha Ikalendari' },
  home_pipeline_title: { ko: 'AI 비용 Zero 고속 인텔리전스 파이프라인', en: 'Zero-Cost AI Intelligence Pipeline', rw: 'Uburyo bwa AI Butishyuzwa' },
  home_pipeline_desc: {
    ko: '수집된 비정형 뉴스를 엑셀 또는 Supabase 직결 에이전트로 배정하여 3개 국어로 완벽 번역 및 요약합니다.',
    en: 'Discovered raw news are batched or directly assigned to 5 agents for multilingual translation & summarization.',
    rw: 'Amakuru mashya agabanywamo amatsinda maze agahindurwa mu ndimi 3.'
  },
  home_events_desc: {
    ko: '키갈리, 서울 및 주요 국제 컨퍼런스 & 정상회담',
    en: 'Kigali, Seoul, regional conferences & summits',
    rw: 'Kigali, Seoul, inama zikomeye'
  },
  home_pipeline_sub: {
    ko: 'API 비용 0원 기반 고속 대량 처리',
    en: 'Zero AI API costs high-speed batch workflow',
    rw: 'Gutunganya amakuru menshi nta kiguzi cya API'
  },
  home_sources_desc: {
    ko: '르완다, 한국 및 글로벌 뉴스 RSS & 크롤러',
    en: 'Rwanda, Korea & Global RSS and Crawlers',
    rw: 'RSS n\'abakusanya amakuru muri Rwanda na Koreya'
  },
  home_stat_processed: { ko: '번역완료', en: 'processed', rw: 'byatunganyijwe' },
  home_stat_raw: { ko: '미처리', en: 'raw', rw: 'bitaratunganywa' },

  // News View
  view_mode_text: { ko: '텍스트', en: 'Text', rw: 'Inyandiko' },
  view_mode_card: { ko: '카드', en: 'Card', rw: 'Ikarita' },
  view_mode_photo_text: { ko: '포토+텍스트', en: 'Photo+Text', rw: 'Ifoto+Inyandiko' },
  cols_label: { ko: '단수:', en: 'Cols:', rw: 'Inkingi:' },
  articles_unit: { ko: '개 기사', en: 'articles', rw: 'amakuru' },
  allow_processed_updates: { ko: '처리완료 기사 수정 허용', en: 'Allow processed updates', rw: 'Emerera kuvugurura ibyarangiye' },
  select_all: { ko: '전체 선택', en: 'Select All', rw: 'Hitamo Byose' },
  deselect_all: { ko: '선택 해제', en: 'Deselect', rw: 'Kureka guhitamo' },
  generate_xlsx: { ko: '선택 기사 엑셀 추출', en: 'Export Selected XLSX', rw: 'Sohora muri XLSX' },
  synthesize_report: { ko: '통합 기사 합성 (2건 이상)', en: 'Synthesize Report', rw: 'Guhuza Amakuru' },
  sort_newest: { ko: '최신순', en: 'Sort: Newest', rw: 'Bishya cyane' },
  sort_oldest: { ko: '과거순', en: 'Sort: Oldest', rw: 'Bishaje' },
  loading_articles: { ko: '기사를 불러오는 중입니다...', en: 'Loading articles...', rw: 'Biracyashakisha amakuru...' },
  no_articles_found: { ko: '조건에 일치하는 기사가 없습니다.', en: 'No matching articles found.', rw: 'Nta makuru ahuye n\'ibyasabwe.' },

  // Events View
  view_month: { ko: '월간 달력', en: 'Month', rw: 'Ukwezi' },
  view_list: { ko: '목록 보기', en: 'List', rw: 'Urutonde' },
  event_facets: { ko: '이벤트 필터:', en: 'Event Facets:', rw: "Akayunguruzo k'Ibirori:" },
  all_cities: { ko: '모든 도시', en: 'All Cities', rw: 'Imijyi Yose' },
  all_categories: { ko: '모든 카테고리', en: 'All Categories', rw: 'Ibyiciro Byose' },
  all_statuses: { ko: '모든 상태', en: 'All Statuses', rw: 'Imiterere Yose' },
  status_confirmed: { ko: '확정됨', en: 'Confirmed', rw: 'Byemejwe' },
  status_unconfirmed: { ko: '미확정', en: 'Unconfirmed', rw: 'Bitaremezwa' },
  saved_views_placeholder: { ko: '저장된 뷰 선택...', en: 'Saved Views...', rw: 'Uburyo bwo Kureba...' },
  btn_save_view: { ko: '뷰 저장', en: 'Save View', rw: 'Bika Uburyo' },
  btn_ai_dedup: { ko: 'AI 중복검토 & 연결', en: 'AI Deduplicate & Link', rw: 'Guhuza & Kugenzura na AI' },
  btn_ai_dedup_running: { ko: 'AI 검토 중...', en: 'AI Processing...', rw: 'Biri gukorwa na AI...' },
  btn_export_excel: { ko: '엑셀 내보내기', en: 'Export Excel', rw: 'Sohora Muri Excel' },
  btn_url_inbox: { ko: 'URL 수신함', en: 'URL Inbox', rw: 'Akasanduku ka URL' },
  btn_duplicate_review: { ko: '중복 검토', en: 'Duplicate Review', rw: 'Gusubiramo Ibyikubye' },
  btn_add_event: { ko: '이벤트 추가', en: 'Add Event', rw: 'Ongeraho Ikirori' },
  dow_sun: { ko: '일', en: 'Sun', rw: 'Mbe' },
  dow_mon: { ko: '월', en: 'Mon', rw: 'Kag' },
  dow_tue: { ko: '화', en: 'Tue', rw: 'Gak' },
  dow_wed: { ko: '수', en: 'Wed', rw: 'Gtw' },
  dow_thu: { ko: '목', en: 'Thu', rw: 'Gkn' },
  dow_fri: { ko: '금', en: 'Fri', rw: 'Gtn' },
  dow_sat: { ko: '토', en: 'Sat', rw: 'Gnd' },

  // Sources View
  sources_title: { ko: '출처 관리 및 크롤러 제어', en: 'Sources & Crawlers Management', rw: 'Inkomoko & Abakusanya Amakuru' },
  sources_subtitle: {
    ko: 'SQLite 기반 고속 기사 저장소 · 독립적 소스 크롤러 · Facebook 세션 연동',
    en: 'SQLite high-speed article storage · Independent crawlers · Facebook session sync',
    rw: 'Ububiko bwa SQLite · Abakusanya amakuru bwigenga · Facebook session'
  },
  sources_fb_session: { ko: 'Facebook 세션 (cookies.txt)', en: 'Facebook Session (cookies.txt)', rw: 'Facebook Session (cookies.txt)' },
  sources_crawl_incremental: { ko: '전체 증분 수집 (최신)', en: 'All Item Incremental', rw: 'Gukusanya Byose (Bishya)' },
  sources_crawl_backfill: { ko: '전체 과거 수집 (365일)', en: 'All Item Backfill (365d)', rw: 'Gukusanya Byose Byashize (365d)' },
  sources_col_source_domain: { ko: '출처 및 도메인', en: 'Source & Domain', rw: 'Inkomoko & Urubuga' },
  sources_col_region_lang: { ko: '지역 / 언어', en: 'Region / Lang', rw: 'Akarere / Ururimi' },
  sources_col_articles: { ko: '수집 기사 수 (발견 / 임포트)', en: 'Articles (Discovered / Imp)', rw: 'Amakuru (Yabonetse / Yinjijwe)' },
  sources_col_checkpoint: { ko: '체크포인트 / 최근 실행', en: 'Checkpoint / Last Run', rw: 'Iheruka / Igihe Byakorewe' },
  sources_col_enabled: { ko: '활성화', en: 'Enabled', rw: 'Birakora' },
  sources_col_crawl_actions: { ko: '수집 실행', en: 'Crawl Actions', rw: 'Gukusanya' },
  sources_btn_incremental: { ko: '증분 수집', en: 'Incremental', rw: 'Bishya gusa' },
  sources_btn_backfill: { ko: '과거 수집', en: 'Backfill (365d)', rw: 'Gukusanya byashize' },
  sources_btn_logs: { ko: '수집 로그', en: 'Logs', rw: 'Raporo' },

  // AI Workspace View
  ai_tab_mcp: { ko: 'Supabase DB & ChatGPT MCP (30개 단위 직접 처리)', en: 'Supabase DB & ChatGPT MCP (30-Item Direct)', rw: 'Supabase DB & ChatGPT MCP' },
  ai_tab_export_batches: { ko: '엑셀 패키지 내보내기 (Export Batches)', en: 'Export Excel Batches', rw: 'Sohora Amatsinda ya Excel' },
  ai_tab_import_workbooks: { ko: '엑셀 결과 임포트 (Import Workbooks)', en: 'Import Workbooks', rw: 'Injiza Amakuru ya Excel' },
  ai_tab_integrated_articles: { ko: '통합 기사 관리 (Integrated Articles)', en: 'Integrated Articles', rw: 'Guhuza Amakuru' },
  ai_metric_raw: { ko: '미처리 기사 (RAW)', en: 'RAW Articles', rw: 'Amakuru Bitaratunganywa' },
  ai_metric_exported: { ko: '추출된 패키지', en: 'Exported Batches', rw: 'Amatsinda Yasohowe' },
  ai_metric_partial: { ko: '부분 번역 기사', en: 'Partial Localized', rw: 'Amakuru Ahinduwe Igice' },
  ai_metric_processed: { ko: '번역 완료 기사', en: 'Fully Processed', rw: 'Amakuru Yatunganyijwe' },
  ai_metric_batches: { ko: 'AI 작업 패키지', en: 'AI Batches', rw: 'Amatsinda ya AI' },
  ai_metric_url_inbox: { ko: '대기 중인 URL 수신함', en: 'Queued URL Inbox', rw: 'URL Zitegereje' },

  // Articles & Table Headers
  col_numbering: { ko: '기사 넘버링', en: 'Article #', rw: 'Nimero y\'Amakuru' },
  col_source_date: { ko: '출처 & 작성일자', en: 'Source & Date', rw: 'Inkomoko & Itariki' },
  col_original_title: { ko: '원문 제목 (전체 표시)', en: 'Original Title (Full)', rw: 'Umutwe w\'Umwimerere' },
  col_3lang_translation: { ko: '3개 국어 번역', en: '3-Language Translation', rw: 'Ubuhinduzi mu Ndimi 3' },
  col_processing_flag: { ko: '처리 상태 (Flag)', en: 'Status (Flag)', rw: 'Imiterere (Flag)' },
  col_preview: { ko: '미리보기', en: 'Preview', rw: 'Irebere' },

  // Batch Groups Table
  mcp_workspace_title: {
    ko: 'Supabase DB & ChatGPT MCP 연동 워크스페이스',
    en: 'Supabase DB & ChatGPT MCP Integration Workspace',
    rw: 'Supabase DB & ChatGPT MCP Workspace'
  },
  mcp_workspace_badge: {
    ko: 'DB 직결 + 5명 에이전트 병렬 분배',
    en: 'Direct DB + 5 Agents Parallel Distribution',
    rw: 'DB Yihuse + Abajenti 5 Bakorera Hamwe'
  },
  mcp_workspace_desc: {
    ko: '기사를 30개 단위 그룹으로 자동 분배하고, 5명의 에이전트(Agent #1 ~ #5)가 교대로 MCP 및 REST API를 통해 순차 번역 후 Supabase DB에 실시간 저장합니다.',
    en: 'Articles are grouped into 30-item batches, rotated across 5 agents (Agent #1~#5), translated and committed directly into Supabase DB.',
    rw: 'Amakuru agabanywamo amatsinda ya 30, agahindurwa n\'abajenti 5 (Agent #1~#5) maze akabikwa muri Supabase DB.'
  },
  batch_table_title: {
    ko: '30개 단위 미처리 기사 에이전트 분배 테이블 (Batch Groups)',
    en: '30-Item Unprocessed Article Agent Distribution Table (Batch Groups)',
    rw: 'Imbonerahamwe yo Gukwirakwiza Amakuru 30 ku ba Ajenti'
  },
  batch_table_desc: {
    ko: '총 5명의 에이전트(Agent #1 ~ #5)가 순환 배정되며, #날짜yymmdd-번호 내림차순으로 기사를 처리합니다.',
    en: '5 agents (Agent #1 to #5) rotate assignments chronologically descending (#yymmdd-seq).',
    rw: 'Abajenti 5 basimburana mu mirimo hakurikijwe amatariki atembagaye (#yymmdd-seq).'
  },
  btn_refresh_repartition: {
    ko: '새로고침 & 재편성',
    en: 'Refresh & Reassign',
    rw: 'Kuvugurura & Kongera Gukwirakwiza'
  },
  col_group_agent: { ko: '그룹 / 담당 에이전트', en: 'Group / Assigned Agent', rw: 'Itsinda / Ajenti' },
  col_number_range: { ko: '기사 넘버링 범위 (#yymmdd-번호 내림차순)', en: 'Article Number Range (#yymmdd-seq desc)', rw: 'Urwego rw\'Imibare y\'Amakuru' },
  col_total_articles: { ko: '총 기사', en: 'Total Articles', rw: 'Amakuru Yose' },
  col_raw_articles: { ko: '미처리 (RAW)', en: 'Unprocessed (RAW)', rw: 'Bitaratunganywa' },
  col_processed_articles: { ko: '처리완료 (PROCESSED)', en: 'Processed (PROCESSED)', rw: 'Byatunganyijwe' },
  col_status: { ko: '진행 상태', en: 'Status', rw: 'Imiterere' },
  col_agent_action: { ko: '에이전트 배정 / 동작', en: 'Agent Actions', rw: 'Ibikorwa bya Ajenti' },
  col_batch_150_topic: { ko: '150개 일괄 Topic (5개 행당 1개)', en: '150-Item Batch Topic (Per 5 Groups)', rw: 'Topic Rusange ku Makuru 150' },

  btn_150_topic_prompt: { ko: '150개 Topic 프롬프트', en: '150-Item Topic Prompt', rw: 'Topic y\'Amakuru 150' },
  btn_150_topic_tooltip: {
    ko: '150개 기사 일괄 Topic 고속 재결정 프롬프트 복사 (5개 그룹 분량)',
    en: 'Copy 150-article batch Topic fast classification prompt (5 groups)',
    rw: 'Koporora ibisabwa byo gushyira Topic ku makuru 150 (Amatsinda 5)'
  },

  detail_table_title: {
    ko: '담당 기사 상세 목록',
    en: 'Assigned Articles Detail List',
    rw: 'Urutonde Rurambuye rw\'Amakuru'
  },
  detail_table_desc: {
    ko: '원문 제목은 여러 줄로 전체 표기되며, 3개 국어 번역 현황 및 단어 수는 툴팁으로 확인할 수 있습니다.',
    en: 'Original title displayed multi-line; 3-language translation status and word counts in tooltips.',
    rw: 'Umutwe ugaragara mu mirongo myinshi; ubuhinduzi mu ndimi 3 n\'amagambo biboneka mu bisobanuro.'
  },
  btn_copy_agent_prompt: {
    ko: '전용 프롬프트 복사',
    en: 'Copy Dedicated Prompt',
    rw: 'Koporora Ibisabwa bya Ajenti'
  },

  // Article Modal
  modal_3line_summary: { ko: '핵심 3줄 요약', en: '3-Line Core Summary', rw: 'Incamake y\'Ingenzi mu Mirongo 3' },
  modal_article_body: { ko: '본문 내용', en: 'Article Content', rw: 'Ibiromo mu Makuru' },
  modal_untranslated_notice: {
    ko: '선택한 언어로 번역된 본문이 아직 준비되지 않아 원문 내용을 표시합니다.',
    en: 'Content in the selected language is not yet ready. Displaying original text.',
    rw: 'Amakuru mu rurimi rwahiswemo ntaraboneka. Harerekanwa umwimerere.'
  },

  // Settings
  settings_title: { ko: '포털 환경설정', en: 'Portal Settings', rw: 'Igenamiterere rya Porutali' },
  settings_theme: { ko: '테마 스킨 설정', en: 'Theme Skin Settings', rw: 'Igenamiterere ry\'Insanganyamatsiko' },
  settings_default_lang: { ko: '기본 언어', en: 'Default Language', rw: 'Ururimi Rusanzwe' }
} as const;

export type TranslationKey = keyof typeof translations;

/**
 * Main translation lookup function
 */
export function t(key: TranslationKey, currentLang?: string): string {
  const lang = getEffectiveLang(currentLang);
  const entry = translations[key];
  if (!entry) return key;
  return entry[lang] || entry['ko'] || key;
}
