import { Router } from 'express';
import { db } from '../db/database.js';
import {
  getSupabaseConfig,
  getSupabaseClient,
  generateSupabaseDDL,
  saveProcessedArticleToSupabase,
  testSupabaseConnection,
  syncAssignmentsToSupabase,
  syncArticlesChunkToSupabase,
  syncAllMissingArticlesToSupabase
} from '../db/supabase.js';
import {
  isSupabaseReady,
  fetchBatchGroupsDirectly,
  fetchGroupArticlesDirectly,
  fetchArticleDetailDirectly,
  saveProcessedArticleDirectly,
  getArticleNumberMap
} from '../db/supabaseStore.js';

const router = Router();

const BATCH_GROUP_SIZE = 30;

interface BatchGroupInfo {
  group_number: number;
  agent_number: number;
  start_index: number;
  end_index: number;
  start_code: string;
  end_code: string;
  number_range: string;
  total_items: number;
  processed_items: number;
  raw_items: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE';
  first_article_id: string;
  last_article_id: string;
  source_summary: Record<string, number>;
}

export function formatArticleNumber(art: any, dateCounters: Record<string, number>): string {
  let yymmdd = '260101';
  const dateVal = art.published_at || art.collected_at || art.created_at;
  if (dateVal) {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      const yy = String(d.getFullYear()).slice(-2);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      yymmdd = `${yy}${mm}${dd}`;
    }
  }
  dateCounters[yymmdd] = (dateCounters[yymmdd] || 0) + 1;
  const seq = String(dateCounters[yymmdd]).padStart(3, '0');
  return `#${yymmdd}-${seq}`;
}

export function countWords(text?: string | null): number {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Helper to compute 30-item batch groups from all articles
 */
export function computeBatchGroups(): {
  groups: BatchGroupInfo[];
  totalRaw: number;
  totalProcessed: number;
  totalArticles: number;
} {
  // Sort articles chronologically descending (newest first)
  const allArticles = Object.values(db.core.articles).sort((a, b) => {
    const da = a.published_at || a.created_at || '';
    const dbTime = b.published_at || b.created_at || '';
    return dbTime.localeCompare(da);
  });

  const totalArticles = allArticles.length;
  let totalRaw = 0;
  let totalProcessed = 0;

  for (const art of allArticles) {
    if (art.processing_status === 'PROCESSED') totalProcessed++;
    else totalRaw++;
  }

  // Pre-calculate formatted #YYMMDD-번호 for all articles descending
  const dateCounters: Record<string, number> = {};
  const formattedNumbers = new Map<string, string>();
  for (const art of allArticles) {
    formattedNumbers.set(art.article_id, formatArticleNumber(art, dateCounters));
  }

  const groups: BatchGroupInfo[] = [];

  for (let i = 0; i < allArticles.length; i += BATCH_GROUP_SIZE) {
    const chunk = allArticles.slice(i, i + BATCH_GROUP_SIZE);
    const groupNum = Math.floor(i / BATCH_GROUP_SIZE) + 1;
    // 5 agents repeating: 1, 2, 3, 4, 5, 1, 2, 3, 4, 5...
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
 * Generates prompt for a specific 30-item agent group
 */
export function generateAgentPrompt(
  groupNumber: number,
  _baseUrl?: string,
  customChunk?: any[],
  customNumberRange?: string
): string {
  let chunk = customChunk;
  let numberRange = customNumberRange;
  let agentNumber = ((groupNumber - 1) % 5) + 1;

  if (!chunk || chunk.length === 0) {
    const { groups } = computeBatchGroups();
    const group = groups.find(g => g.group_number === groupNumber);
    agentNumber = group ? group.agent_number : ((groupNumber - 1) % 5) + 1;
    numberRange = group ? group.number_range : `Group #${groupNumber}`;

    // Get articles in this group
    const allArticles = Object.values(db.core.articles).sort((a, b) => {
      const da = a.published_at || a.created_at || '';
      const dbTime = b.published_at || b.created_at || '';
      return dbTime.localeCompare(da);
    });
    const dateCounters: Record<string, number> = {};
    const formattedNumbers = new Map<string, string>();
    for (const art of allArticles) {
      formattedNumbers.set(art.article_id, formatArticleNumber(art, dateCounters));
    }
    const startIndex = (groupNumber - 1) * BATCH_GROUP_SIZE;
    chunk = allArticles.slice(startIndex, startIndex + BATCH_GROUP_SIZE).map((art, idx) => ({
      ...art,
      article_number: formattedNumbers.get(art.article_id) || `#${startIndex + idx + 1}`
    }));
  }

  const startIndex = (groupNumber - 1) * BATCH_GROUP_SIZE;

  // User requirement: Only provide sequential number & article ID (do NOT include source, date, title, or summary snippets)
  const articleListText = chunk.map((art, idx) => {
    const artNum = art.article_number || `#${startIndex + idx + 1}`;
    return `${idx + 1}. ${artNum} · ID: \`${art.article_id}\``;
  }).join('\n');

  const articleIdListSql = chunk.map(art => `'${art.article_id}'`).join(',\n    ');

  return `# ChatGPT 에이전트 지침: 기사 다국어 번역 및 Supabase DB 직접 갱신 프로시저 (Agent #${agentNumber})

당신은 **뉴스 인텔리전스 포털 전문 다국어 번역 및 인텔리전스 분석 에이전트 [Agent #${agentNumber}]**입니다.
Supabase 데이터베이스를 직접 조회하고 갱신하여 고품질 3개 국어(한국어, 영어, 키냐르완다어) 번역을 수행하십시오.

- **담당 과제**: 그룹 #${groupNumber} (편성 ID: \`ASSIGN-G${groupNumber}-A${agentNumber}\`)
- **기사 넘버링 범위**: ${numberRange} (총 ${chunk.length}개 기사)
- **배정 에이전트**: Agent #${agentNumber} (총 5명 병렬 순환 분배)

---

## ⚡ 1. 작업 시작 전 DB 환경 확인 및 오류 방지 규칙 (필독)

### ① 편성 테이블 (\`public.agent_batch_assignments\`) 부재 시 처리
- 만약 DB에 \`public.agent_batch_assignments\` 테이블이 아직 없더라도 **절대 에러로 중단하거나 작업을 멈추지 마십시오.**
- 에이전트 번호(Agent #${agentNumber})와 담당 기사 30개 ID 목록은 이미 **본 지침서 5번 항목에 완벽하게 기재**되어 있으므로, 테이블 조회를 생략하고 곧바로 **②번 \`public.articles\` 원문 일괄 조회 단계로 직행**하십시오.
- *(참고)* 필요 시 아래 DDL을 1회 실행하여 테이블을 생성할 수 있으나, 생성하지 않고 기사 번역 작업만 수행해도 무방합니다:
\`\`\`sql
CREATE TABLE IF NOT EXISTS public.agent_batch_assignments (
  group_number INTEGER PRIMARY KEY,
  agent_number INTEGER NOT NULL,
  agent_name TEXT NOT NULL,
  number_range TEXT NOT NULL,
  total_items INTEGER DEFAULT 30,
  processed_items INTEGER DEFAULT 0,
  raw_items INTEGER DEFAULT 30,
  status TEXT DEFAULT 'PENDING',
  article_ids JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

### ② 배정된 30개 기사 원문 전문(\`original_body\`) 일괄 조회 쿼리
본 지침서에는 토큰 절약과 정확도를 위해 **기사 ID만 제공**되어 있습니다 (출처, 일자, 제목, 잘린 요약문은 불필요하므로 제외).
기사 제목과 전문 본문(\`original_body\`)은 Supabase **\`public.articles\`** 테이블에서 아래 SQL로 일괄 조회하십시오:

\`\`\`sql
SELECT 
  article_id, 
  original_language, 
  original_title, 
  original_body, 
  portal_category_id, 
  published_at
FROM public.articles
WHERE article_id IN (
    ${articleIdListSql}
)
ORDER BY published_at DESC;
\`\`\`

### ③ 쿼리 결과 레코드가 0건이거나 최신 기사가 아직 미수집된 경우 자동 대응
만약 위 조회 쿼리를 실행했을 때 0건이 나오거나 기사들을 찾을 수 없는 경우:
1. 먼저 DB의 최신 기사 수집 일자를 확인하는 쿼리를 실행하십시오:
   \`\`\`sql
   SELECT MAX(published_at) AS latest_published_at, COUNT(*) AS total_count FROM public.articles;
   \`\`\`
2. 만약 배정된 기사들이 아직 DB에 동기화(Sync)되지 않은 상태라면, 즉시 사용자에게 다음과 같이 브리핑하십시오:
   > *"현재 Supabase DB의 최신 기사는 [latest_published_at]이며, 배정된 기사(${numberRange})는 아직 DB에 업로드되지 않은 상태입니다. 포털 웹 화면에서 [동기화] 버튼을 눌러주시거나, 기사 원문 전문을 채팅창에 직접 전달해주시면 즉시 작업을 진행하겠습니다."*
3. 만약 사용자가 채팅창에 기사 전문을 직접 붙여넣거나 제공하는 경우, 지체 없이 해당 원문을 기반으로 번역 및 DB 저장을 수행하십시오.

---

## 🎯 2. 핵심 원칙 및 행동 수칙 (반드시 준수)

### 1. 직접 번역 원칙 (기계 번역 프로그램 사용 절대 금지)
- 구글 번역기, 파파고 등 단순 기계 번역 프로그램을 돌리지 말고, **맥락과 저널리즘 품격을 살린 최고 수준의 AI 네이티브 직접 번역**을 수행하십시오.
- 키냐르완다어(RW), 한국어(KO), 영어(EN)의 어법과 어휘를 세련되고 자연스럽게 표현하십시오.

### 2. 연속 완수 목표 (하나만 하고 멈추지 말 것)
- 기사 1개를 마칠 때마다 멈춰서 사용자에게 다음 진행 여부를 묻지 마십시오.
- **배정된 30개 기사를 처음부터 끝까지 쉬지 않고 순차적으로 완료하는 것을 목표**로 작업하십시오.
- ChatGPT 출력 토큰 한계에 도달하면 그때까지 완료된 기사들의 SQL 쿼리를 출력한 뒤, \`"계속 진행하려면 '계속' 또는 '다음'을 입력해주세요."\`라고 안내하십시오.

### 3. 사용자 "계속" / "다음" 지시 처리
- 사용자가 언제든 **"계속"**, **"다음"**, **"next"**, **"continue"** 등을 지시하면:
  1. 현재 그룹에서 아직 처리하지 못한 다음 순번 기사부터 즉시 중단 없이 이어서 진행하십시오.
  2. 현재 그룹(30개)이 모두 완수된 상태라면, 다음 그룹(예: 그룹 #${groupNumber + 5})의 과제를 파악하여 연속해서 작업을 이어가십시오.

### 4. 에이전트 모드 (ChatGPT 내 사용자 직접 지시 지원)
사용자가 채팅창에서 모드를 지시하면 그에 맞춰 동작 방식을 전환하십시오:
- 🅰️ **[모드 A: 진행한 번역은 건너뛰기 (기본값)]**
  - 이미 번역이 완료되어 DB에 존재하거나 \`processing_status = 'PROCESSED'\`인 기사는 건너뛰고, 미처리(\`RAW\`) 기사만 신속하게 번역합니다.
- 🅱️ **[모드 B: 진행한 번역도 다시하기 (강제 재번역 모드)]**
  - 기존 번역 여부와 상관없이 배정된 30개 기사 전체를 최신 품질로 새롭게 번역하여 DB를 UPDATE합니다.
- *사용자 전환 예시*: \`"건너뛰기 모드로 해줘"\`, \`"모드 B로 전체 다시 번역해줘"\` 등 입력 시 즉시 모드 반영.

### 5. 수시 진행 현황 및 진행률(%) 브리핑
- 기사 번역을 출력할 때마다 상단에 **자신의 전체 업무 패키지 수와 현재 진행 상황, 진행률(%)**을 명확히 브리핑하십시오:
  - *브리핑 형식 예시*:
    \`[📊 Agent #${agentNumber} 실시간 보고] 담당 그룹: #${groupNumber} | 진행도: 5/30 기사 완료 (16.7%) | 상태: 순차 처리 중\`

---

## 📌 3. 기사별 번역 및 생성 기준

### 1. topic 결정 (영문 대분류 9대 표준)
- **3개 언어 모두 동일한 영문 표기**로 결정합니다.
- 허용 표준 토픽: \`Economy\`, \`Politics\`, \`AI/Tech\`, \`Education\`, \`Sports\`, \`Real Estate\`, \`Volunteers\`, \`Nature/Living\`, \`Culture\`

### 2. title 결정 (한국어 / 영어 / 르완다어)
- **title_ko**: 한국 언론사 뉴스 헤드라인 스타일의 명확하고 간결한 한국어 제목
- **title_en**: 세련된 글로벌 뉴스 스타일의 영문 제목
- **title_rw**: 정확하고 자연스러운 키냐르완다어(Ikinyarwanda) 제목

### 3. 3줄 summary 결정 (각 언어별 핵심 3문장)
- **summary_ko**: 핵심 사실 3줄 요약 (줄바꿈 구분)
- **summary_en**: 3-line concise English summary (newline separated)
- **summary_rw**: Incamake y'ingenzi mu mirongo 3 mu Kinyarwanda

### 4. body 결정 (언어별 전문 번역 및 Reparagraph)
- 단순 직역이 아닌, 문맥을 살린 고품질 인텔리전스 번역을 수행합니다.
- **가독성을 위해 반드시 문단과 문단 사이에 빈 줄(double line-break)을 삽입하여 리파라그래프**합니다.
- **body_ko**: 한국어 번역문 (문단별 빈 줄 구분)
- **body_en**: 영어 정돈문 (문단별 빈 줄 구분)
- **body_rw**: 키냐르완다어 번역문 (문단별 빈 줄 구분)

---

## 💾 4. Supabase DB 반영 SQL 쿼리 템플릿 (실제 DB 스키마 준수)

⚠️ **중요 스키마 규칙**: \`public.localized_articles\` 테이블은 **\`lang\`** 컬럼을 사용하며(not language), **\`word_count\` 컬럼은 존재하지 않습니다.**

각 기사 작업 완료 시 아래 SQL 구문을 실행하거나 출력하십시오:

\`\`\`sql
-- 1) 메인 기사 테이블 topic 및 processing_status 갱신
UPDATE public.articles
SET 
  topic = 'Economy', -- 9대 표준 영문 Topic
  processing_status = 'PROCESSED',
  updated_at = NOW()
WHERE article_id = 'ART-XXXXX';

-- 2) 3개 국어 번역문 업서트 (컬럼명: lang 사용, word_count 없음)
INSERT INTO public.localized_articles (
  article_id,
  lang,
  title,
  summary,
  body,
  topic,
  processed_at
) VALUES 
  ('ART-XXXXX', 'ko', '한국어 제목', '한국어 1줄 요약\\n2줄 요약\\n3줄 요약', '첫 번째 문단입니다.\\n\\n두 번째 문단입니다.', 'Economy', NOW()),
  ('ART-XXXXX', 'en', 'English Title', 'English line 1\\nLine 2\\nLine 3', 'First paragraph.\\n\\nSecond paragraph.', 'Economy', NOW()),
  ('ART-XXXXX', 'rw', 'Umutwe mu Kinyarwanda', 'Incamake 1\\nIncamake 2\\nIncamake 3', 'Igika cya mbere.\\n\\nIgika cya kabiri.', 'Economy', NOW())
ON CONFLICT (article_id, lang) 
DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  topic = EXCLUDED.topic,
  processed_at = NOW();
\`\`\`

30개 기사 완수 시 (\`public.agent_batch_assignments\` 테이블이 존재하는 경우):
\`\`\`sql
UPDATE public.agent_batch_assignments 
SET status = 'DONE', processed_items = 30, raw_items = 0, updated_at = NOW() 
WHERE group_number = ${groupNumber};
\`\`\`

---

## 📋 5. Agent #${agentNumber} 담당 30개 기사 ID 목록 (그룹 #${groupNumber} · ${numberRange})

${articleListText}

지금 1번째 기사부터 30번째 기사까지 중단 없이 완수를 목표로 번역 및 DB 반영을 시작하세요!`;
}

/**
 * Generates prompt for 150-article batch Topic classification (5 groups * 30 items) directly from Supabase
 */
export async function generateBatchTopicPrompt(batchIndex: number): Promise<{
  batch_index: number;
  start_group: number;
  end_group: number;
  total_items: number;
  prompt: string;
}> {
  const startGroup = (batchIndex - 1) * 5 + 1;
  const endGroup = startGroup + 4;
  const startIndex = (startGroup - 1) * BATCH_GROUP_SIZE;
  const count = 5 * BATCH_GROUP_SIZE; // 150 items
  const client = getSupabaseClient();

  let chunk150: any[] = [];
  if (client) {
    const { data, error } = await client
      .from('articles')
      .select('article_id, original_language, original_title, original_body, published_at, topic, portal_category_id')
      .order('published_at', { ascending: false })
      .range(startIndex, startIndex + count - 1);
    if (data && !error) {
      chunk150 = data;
    }
  }

  // Fallback to local in-memory articles if client not configured
  if (chunk150.length === 0) {
    const allArticles = Object.values(db.core.articles).sort((a, b) => {
      const da = a.published_at || a.created_at || '';
      const dbTime = b.published_at || b.created_at || '';
      return dbTime.localeCompare(da);
    });
    chunk150 = allArticles.slice(startIndex, startIndex + count);
  }

  // Fetch localized Korean titles for these 150 articles to provide richest context
  const articleIds = chunk150.map(a => a.article_id);
  const koTitleMap = new Map<string, string>();
  if (client && articleIds.length > 0) {
    const { data: locs } = await client
      .from('localized_articles')
      .select('article_id, title')
      .in('article_id', articleIds)
      .eq('lang', 'ko');
    if (locs) {
      for (const l of locs) {
        if (l.title) koTitleMap.set(l.article_id, l.title.trim());
      }
    }
  }

  // Get consistent #YYMMDD-XXX numbering
  const formattedNumbers = await getArticleNumberMap();

  const articleRows = chunk150.map((art, idx) => {
    const artNum = formattedNumbers.get(art.article_id) || `#${startIndex + idx + 1}`;
    const koTitle = koTitleMap.get(art.article_id);
    const origTitle = (art.original_title || '').replace(/\r?\n+/g, ' ').trim().slice(0, 120);

    let titleDisplay = origTitle;
    if (koTitle && koTitle !== origTitle) {
      titleDisplay = `${koTitle} (원문: ${origTitle})`;
    }

    const cleanSnippet = (art.original_body || '').replace(/\r?\n+/g, ' ').trim().slice(0, 150);
    const bodySnippet = cleanSnippet ? ` | 본문: ${cleanSnippet}...` : '';

    return `${idx + 1}. [${artNum} · \`${art.article_id}\`] ${titleDisplay}${bodySnippet}`;
  }).join('\n');

  const prompt = `# ChatGPT 에이전트 지침: 150개 기사 일괄 Topic 고속 재결정 에이전트 (Batch #${batchIndex} · 그룹 #${startGroup}~#${endGroup})

당신은 **뉴스 인텔리전스 150개 기사 일괄 Topic 재결정 전문 고속 에이전트 [Batch Topic Classifier]**입니다.
총 5개 그룹(그룹 #${startGroup} ~ #${endGroup}, 총 ${chunk150.length}개 기사)의 제목과 핵심 내용을 신속하게 분석하여, 각 기사별 최적의 영문 대분류 Topic을 일괄 결정하고 Supabase DB에 한 번에 업데이트하는 고속 일괄 UPDATE SQL을 생성합니다.

---

## 📌 기사 분석 및 Topic 결정 원칙 (필독)
1. **언어 무관 종합 분석**: 기사의 원문 언어(영어, 한국어, 키냐르완다어, 프랑스어 등)에 관계없이, 제공된 제목(국문 번역 제목 및 원문 제목)과 본문 요약을 바탕으로 분석하십시오.
2. **제목 및 본문 내용 종합 참조**: 제목을 기본으로 참고하되, **제목만으로 핵심 분야가 불명확하거나 모호한 경우 반드시 함께 제공된 본문 내용 요약(본문: ...)을 적극 참조**하여 기사의 실질적인 주제를 정확히 파악하십시오.
3. **표준 9대 영문 Topic 중 반드시 1개 선택**:
   - **Economy**: 경제, 금융, 은행, 투자, 통상, 무역, 물가, 비즈니스, 기업, 산업 활동
   - **Politics**: 정치, 국회, 정부 정책, 법률, 외교, 조약, 정상회담, 사법, 안보, 군사
   - **AI/Tech**: IT, 소프트웨어, 인공지능, 통신, 디지털 혁신, 스타트업, 사이버보안
   - **Education**: 교육, 학교, 대학, 장학금, 직업 훈련, 학술 연구, R&D
   - **Sports**: 축구, 농구, 올림픽, 마라톤, 각종 스포츠 경기 및 선수 소식
   - **Real Estate**: 부동산, 주택, 아파트, 토지, 건설, 인프라, 도시개발
   - **Volunteers**: 자원봉사, 인도주의적 구호, NGO, 자선, 기부, 사회공헌, 취약계층 지원
   - **Nature/Living**: 자연, 환경, 기후변화, 국립공원, 야생동물, 농업, 보건의료, 질병, 일상생활
   - **Culture**: 문화, 예술, 역사, 영화, 음악, 축제, 전통, 관광, 엔터테인먼트

---

## ⚡ 150개 기사 고속 일괄 UPDATE SQL 템플릿
분석 완료 후, 아래와 같이 PostgreSQL의 고속 일괄 갱신 구문(UPDATE ... FROM VALUES)으로 한 번에 실행 가능한 단일 SQL을 출력하십시오:

\`\`\`sql
-- [Batch #${batchIndex}] 150개 기사 일괄 Topic 갱신 (그룹 #${startGroup}~#${endGroup})
UPDATE public.articles AS a
SET 
  topic = v.topic,
  updated_at = NOW()
FROM (VALUES
  ('${chunk150[0]?.article_id || 'ART-XXXX1'}', 'Economy'),
  ('${chunk150[1]?.article_id || 'ART-XXXX2'}', 'AI/Tech')
  -- ${chunk150.length}개 기사 전체 매핑...
) AS v(article_id, topic)
WHERE a.article_id = v.article_id;
\`\`\`

---

## 📋 일괄 분류 대상 150개 기사 목록 (그룹 #${startGroup} ~ #${endGroup} · 총 ${chunk150.length}개)

${articleRows}

지금 즉시 위 150개 기사의 내용을 파악하고, 각 기사의 영문 Topic을 결정하여 일괄 UPDATE SQL을 단번에 생성하십시오!`;

  return {
    batch_index: batchIndex,
    start_group: startGroup,
    end_group: endGroup,
    total_items: chunk150.length,
    prompt
  };
}

// ==========================================
// Routes
// ==========================================

// GET /api/mcp/groups - 30-item grouping status directly from Supabase
router.get('/groups', async (_req, res) => {
  if (isSupabaseReady()) {
    try {
      const result = await fetchBatchGroupsDirectly();
      return res.json({
        ...result,
        supabase_configured: true,
        batch_size: BATCH_GROUP_SIZE
      });
    } catch (err: any) {
      console.warn('[MCP groups] Direct Supabase fetch error:', err?.message || err);
    }
  }

  const result = computeBatchGroups();
  res.json({
    ...result,
    supabase_configured: isSupabaseReady(),
    batch_size: BATCH_GROUP_SIZE
  });
});

// GET /api/mcp/topic-prompt/:batchIndex - Return 150-article batch Topic classification prompt
router.get('/topic-prompt/:batchIndex', async (req, res) => {
  const batchIdx = parseInt(req.params.batchIndex, 10) || 1;
  try {
    const data = await generateBatchTopicPrompt(batchIdx);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mcp/group/:groupNumber - Get articles in specific 30-item group
router.get('/group/:groupNumber', async (req, res) => {
  const groupNum = parseInt(req.params.groupNumber, 10);
  if (isNaN(groupNum) || groupNum < 1) {
    return res.status(400).json({ error: '올바른 그룹 번호를 입력해주세요.' });
  }

  if (isSupabaseReady()) {
    try {
      const data = await fetchGroupArticlesDirectly(groupNum);
      return res.json(data);
    } catch (err: any) {
      console.warn('[MCP group] Direct Supabase fetch fallback to local:', err?.message || err);
    }
  }

  const allArticles = Object.values(db.core.articles).sort((a, b) => {
    const da = a.published_at || a.created_at || '';
    const dbTime = b.published_at || b.created_at || '';
    return dbTime.localeCompare(da);
  });

  // Calculate article numbering for all articles descending
  const dateCounters: Record<string, number> = {};
  const formattedNumbers = new Map<string, string>();
  for (const art of allArticles) {
    formattedNumbers.set(art.article_id, formatArticleNumber(art, dateCounters));
  }

  const startIndex = (groupNum - 1) * BATCH_GROUP_SIZE;
  const chunk = allArticles.slice(startIndex, startIndex + BATCH_GROUP_SIZE);

  if (chunk.length === 0) {
    return res.status(404).json({ error: `그룹 #${groupNum}에 해당하는 기사가 없습니다.` });
  }

  const agentNum = ((groupNum - 1) % 5) + 1;

  const articlesWithIndex = chunk.map((art, idx) => {
    const ko = db.ko.articles[art.article_id];
    const en = db.en.articles[art.article_id];
    const rw = db.rw.articles[art.article_id];

    return {
      global_index: startIndex + idx + 1,
      group_index: idx + 1,
      article_number: formattedNumbers.get(art.article_id) || `#${startIndex + idx + 1}`,
      article_id: art.article_id,
      source_id: art.source_id,
      source_name: db.core.sources[art.source_id]?.name || art.source_id,
      source_url: art.source_url,
      original_language: art.original_language,
      original_title: art.original_title,
      original_subtitle: art.original_subtitle,
      original_body: art.original_body,
      author: art.author,
      published_at: art.published_at,
      portal_category_id: art.portal_category_id,
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

  res.json({
    group_number: groupNum,
    agent_number: agentNum,
    start_index: startIndex + 1,
    end_index: startIndex + chunk.length,
    start_code: articlesWithIndex[0]?.article_number,
    end_code: articlesWithIndex[articlesWithIndex.length - 1]?.article_number,
    number_range: `${articlesWithIndex[0]?.article_number} ~ ${articlesWithIndex[articlesWithIndex.length - 1]?.article_number}`,
    total_in_group: chunk.length,
    articles: articlesWithIndex
  });
});

// GET /api/mcp/article/:id - Get single article
router.get('/article/:id', async (req, res) => {
  if (isSupabaseReady()) {
    try {
      const art = await fetchArticleDetailDirectly(req.params.id);
      if (art) {
        return res.json({
          article_id: art.article_id,
          source_id: art.source_id,
          source_name: art.source_id,
          source_url: art.source_url,
          original_language: art.original_language,
          original_title: art.original_title,
          original_subtitle: art.original_subtitle,
          original_body: art.original_body,
          published_at: art.published_at,
          portal_category_id: art.portal_category_id,
          processing_status: art.processing_status
        });
      }
    } catch (err: any) {
      console.warn('[MCP article] Direct Supabase fetch fallback to local:', err?.message || err);
    }
  }

  const art = db.core.articles[req.params.id];
  if (!art) {
    return res.status(404).json({ error: `기사 [${req.params.id}]를 찾을 수 없습니다.` });
  }

  res.json({
    article_id: art.article_id,
    source_id: art.source_id,
    source_name: db.core.sources[art.source_id]?.name || art.source_id,
    source_url: art.source_url,
    original_language: art.original_language,
    original_title: art.original_title,
    original_subtitle: art.original_subtitle,
    original_body: art.original_body,
    published_at: art.published_at,
    portal_category_id: art.portal_category_id,
    processing_status: art.processing_status
  });
});

// POST /api/mcp/save-article - Save processed article and flag PROCESSED
router.post('/save-article', async (req, res) => {
  const {
    article_id,
    topic,
    title_ko,
    title_en,
    title_rw,
    summary_ko,
    summary_en,
    summary_rw,
    body_ko,
    body_en,
    body_rw,
    category_label
  } = req.body;

  if (!article_id) {
    return res.status(400).json({ error: 'article_id가 필요합니다.' });
  }

  if (!title_ko || !title_en || !title_rw) {
    return res.status(400).json({ error: '3개 언어(KO, EN, RW)의 title이 모두 필요합니다.' });
  }

  try {
    const result = await saveProcessedArticleDirectly({
      article_id,
      topic: topic || 'General',
      title_ko,
      title_en,
      title_rw,
      summary_ko: summary_ko || '',
      summary_en: summary_en || '',
      summary_rw: summary_rw || '',
      body_ko: body_ko || '',
      body_en: body_en || '',
      body_rw: body_rw || '',
      category_label: category_label || topic
    });

    res.json({
      success: true,
      article_id,
      processing_status: 'PROCESSED',
      message: result.message
    });
  } catch (err: any) {
    console.error('[MCP save-article] Error:', err);
    res.status(500).json({ error: `저장 실패: ${err.message}` });
  }
});

// GET /api/mcp/prompt/:groupNumber - Return formatted prompt
router.get('/prompt/:groupNumber', async (req, res) => {
  const groupNum = parseInt(req.params.groupNumber, 10) || 1;
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  let chunk: any[] = [];
  let numberRange = `Group #${groupNum}`;

  if (isSupabaseReady()) {
    try {
      const gData = await fetchGroupArticlesDirectly(groupNum);
      chunk = gData.articles || [];
      numberRange = gData.number_range || numberRange;
    } catch (err: any) {
      console.warn('[MCP prompt] Direct Supabase fetch error:', err?.message || err);
    }
  }

  const prompt = generateAgentPrompt(groupNum, baseUrl, chunk, numberRange);
  res.json({ group_number: groupNum, prompt });
});

// GET /api/mcp/supabase/status - Test Supabase status & DDL
router.get('/supabase/status', async (_req, res) => {
  const config = getSupabaseConfig();
  const test = await testSupabaseConnection();
  res.json({
    config: {
      configured: config.configured,
      url: config.url ? `${config.url.slice(0, 18)}...` : ''
    },
    test,
    ddl: generateSupabaseDDL()
  });
});

// POST /api/mcp/sync-articles - Check Supabase direct state and refresh
router.post('/sync-articles', async (_req, res) => {
  try {
    const test = await testSupabaseConnection();
    res.json({
      success: true,
      count: test.articleCount || 0,
      message: `서버 내부 캐시 복사 절차가 완전히 삭제되었습니다. 현재 ${test.articleCount || 0}개의 모든 기사가 Supabase를 직접 참조하고 있습니다.`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/mcp/supabase/config - Save Supabase URL and Key to portal settings
router.post('/supabase/config', async (req, res) => {
  const { url, key } = req.body;
  if (url !== undefined) db.core.settings.supabase_url = url.trim();
  if (key !== undefined) db.core.settings.supabase_key = key.trim();
  db.saveSync();

  const test = await testSupabaseConnection();
  res.json({ success: true, test });
});

// GET /api/mcp/openapi.json - OpenAPI 3.1 schema for ChatGPT Custom GPT Actions
router.get('/openapi.json', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.json({
    openapi: '3.1.0',
    info: {
      title: 'News Intelligence Supabase & Translation MCP API',
      description: 'API for ChatGPT to retrieve 30-item grouped raw articles, translate into KO/EN/RW with 3-line summary and topic, and commit directly to Supabase.',
      version: '1.0.0'
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/api/mcp/groups': {
        get: {
          operationId: 'getBatchGroups',
          summary: 'List 30-item article batch groups with processing status',
          responses: { '200': { description: 'Batch groups list' } }
        }
      },
      '/api/mcp/group/{groupNumber}': {
        get: {
          operationId: 'getGroupArticles',
          summary: 'Get the 30 articles in a specified group for sequential processing',
          parameters: [
            { name: 'groupNumber', in: 'path', required: true, schema: { type: 'integer' } }
          ],
          responses: { '200': { description: 'Articles list for the group' } }
        }
      },
      '/api/mcp/article/{article_id}': {
        get: {
          operationId: 'getRawArticle',
          summary: 'Get raw single article for translation',
          parameters: [
            { name: 'article_id', in: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'Article content' } }
        }
      },
      '/api/mcp/save-article': {
        post: {
          operationId: 'saveProcessedArticle',
          summary: 'Save translated KO/EN/RW article, summary, and topic directly into Supabase and mark PROCESSED',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['article_id', 'topic', 'title_ko', 'title_en', 'title_rw', 'body_ko', 'body_en', 'body_rw'],
                  properties: {
                    article_id: { type: 'string', description: 'Article ID (e.g. ART-XXXX)' },
                    topic: { type: 'string', description: 'Topic in English (Economy, AI/Tech, Politics, etc.)' },
                    title_ko: { type: 'string', description: 'Korean title' },
                    title_en: { type: 'string', description: 'English title' },
                    title_rw: { type: 'string', description: 'Kinyarwanda title' },
                    summary_ko: { type: 'string', description: '3-line Korean summary' },
                    summary_en: { type: 'string', description: '3-line English summary' },
                    summary_rw: { type: 'string', description: '3-line Kinyarwanda summary' },
                    body_ko: { type: 'string', description: 'Korean translated body with double line breaks' },
                    body_en: { type: 'string', description: 'English body with double line breaks' },
                    body_rw: { type: 'string', description: 'Kinyarwanda body with double line breaks' },
                    category_label: { type: 'string', description: 'Category label' }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Article saved successfully and flagged PROCESSED' }
          }
        }
      }
    }
  });
});

// POST /api/mcp/rpc - Model Context Protocol (MCP) JSON-RPC 2.0 endpoint
router.post('/rpc', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (jsonrpc !== '2.0') {
    return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } });
  }

  try {
    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'get_batch_groups',
              description: 'Retrieve 30-item article groups with RAW/PROCESSED counts and group numbers',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'get_group_articles',
              description: 'Retrieve the 30 articles for an assigned agent group number',
              inputSchema: {
                type: 'object',
                properties: { group_number: { type: 'number', description: 'Group number (1, 2, 3...)' } },
                required: ['group_number']
              }
            },
            {
              name: 'get_raw_article',
              description: 'Retrieve single article body and details by ID',
              inputSchema: {
                type: 'object',
                properties: { article_id: { type: 'string' } },
                required: ['article_id']
              }
            },
            {
              name: 'save_processed_article',
              description: 'Save topic (English), title (KO/EN/RW), 3-line summary (KO/EN/RW), and reparagraphed body (KO/EN/RW) into Supabase DB and flag as PROCESSED',
              inputSchema: {
                type: 'object',
                properties: {
                  article_id: { type: 'string' },
                  topic: { type: 'string', description: 'Topic in English' },
                  title_ko: { type: 'string' },
                  title_en: { type: 'string' },
                  title_rw: { type: 'string' },
                  summary_ko: { type: 'string', description: '3-line Korean summary' },
                  summary_en: { type: 'string', description: '3-line English summary' },
                  summary_rw: { type: 'string', description: '3-line Kinyarwanda summary' },
                  body_ko: { type: 'string', description: 'Korean body with double newlines' },
                  body_en: { type: 'string', description: 'English body with double newlines' },
                  body_rw: { type: 'string', description: 'Kinyarwanda body with double newlines' }
                },
                required: ['article_id', 'topic', 'title_ko', 'title_en', 'title_rw', 'body_ko', 'body_en', 'body_rw']
              }
            }
          ]
        }
      });
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName === 'get_batch_groups') {
        const data = isSupabaseReady() ? await fetchBatchGroupsDirectly() : computeBatchGroups();
        return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } });
      }

      if (toolName === 'get_group_articles') {
        const groupNum = args.group_number || 1;
        if (isSupabaseReady()) {
          const groupData = await fetchGroupArticlesDirectly(groupNum);
          return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(groupData.articles || []) }] } });
        }
        const allArticles = Object.values(db.core.articles).sort((a, b) => {
          const da = a.published_at || a.created_at || '';
          const dbTime = b.published_at || b.created_at || '';
          return dbTime.localeCompare(da);
        });
        const startIndex = (groupNum - 1) * BATCH_GROUP_SIZE;
        const chunk = allArticles.slice(startIndex, startIndex + BATCH_GROUP_SIZE);
        return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(chunk) }] } });
      }

      if (toolName === 'get_raw_article') {
        let art = isSupabaseReady() ? await fetchArticleDetailDirectly(args.article_id) : db.core.articles[args.article_id];
        if (!art && !isSupabaseReady()) {
          art = db.core.articles[args.article_id];
        }
        if (!art) {
          return res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Article not found' } });
        }
        return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(art) }] } });
      }

      if (toolName === 'save_processed_article') {
        const saveRes = await saveProcessedArticleDirectly(args);
        return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(saveRes) }] } });
      }

      return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Tool ${toolName} not found` } });
    }

    return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method ${method} not implemented` } });
  } catch (error: any) {
    return res.status(500).json({ jsonrpc: '2.0', id, error: { code: -32000, message: error.message } });
  }
});

export default router;
