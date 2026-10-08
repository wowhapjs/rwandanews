import { Router } from 'express';
import { getSupabaseConfig, generateSupabaseDDL, testSupabaseConnection } from '../db/supabase.js';
import { fetchBatchGroupsDirectly, fetchUnprocessedBatchGroupsDirectly, fetchGroupArticlesDirectly, fetchUnprocessedGroupArticlesDirectly, fetchArticleDetailDirectly, saveProcessedArticleDirectly } from '../db/supabaseStore.js';
const router = Router();
const unprocessed = (v: unknown) => String(v || '').toLowerCase() === 'true';
const groupData = (n: number, u: boolean) => u ? fetchUnprocessedGroupArticlesDirectly(n) : fetchGroupArticlesDirectly(n);
const TOPICS = '`Economy`, `Politics`, `AI/Tech`, `Education`, `Sports`, `Real Estate`, `Volunteers`, `Nature/Living`, `Culture`';

async function buildAgentPrompt(groupNumber: number, onlyRaw: boolean) {
  const group = await groupData(groupNumber, onlyRaw);
  const articles = group.articles || [];
  const agentNumber = group.agent_number || ((groupNumber - 1) % 5) + 1;
  const numberRange = group.number_range || `Group #${groupNumber}`;
  const articleListText = articles.map((art: any, idx: number) => `${idx + 1}. ${art.article_number || `#${idx + 1}`} · ID: \`${art.article_id}\``).join('\n');
  const articleIdListSql = articles.map((art: any) => `'${art.article_id}'`).join(',\n    ');

  return `# ChatGPT 에이전트 지침: 기사 다국어 번역 및 Supabase DB 직접 갱신 프로시저 (Agent #${agentNumber})

당신은 **뉴스 인텔리전스 포털 전문 다국어 번역 및 인텔리전스 분석 에이전트 [Agent #${agentNumber}]**입니다.
Supabase 데이터베이스를 직접 조회하고 갱신하여 고품질 3개 국어(한국어, 영어, 키냐르완다어) 번역을 수행하십시오.

- **담당 과제**: 그룹 #${groupNumber} (편성 ID: \`ASSIGN-G${groupNumber}-A${agentNumber}\`) ${onlyRaw ? '· 미처리 집중배정' : ''}
- **기사 넘버링 범위**: ${numberRange} (총 ${articles.length}개 기사)
- **배정 에이전트**: Agent #${agentNumber} (총 5명 병렬 순환 분배)

---

## ⚠️ [필독] 기사 상태(Status) 및 작업 대상 명시 규칙
1. **'EXPORTED' 상태는 작업 필수 대상**: 기사 상태 중 \`EXPORTED\`, \`RAW\`, \`PENDING\` 등은 **아직 3개국어 번역/정제 처리가 완료된 것이 아닙니다!** 절대 \`EXPORTED\` 상태를 \`PROCESSED\`(완료)로 오인하여 건너뛰지 마십시오. 이번 과제에 배정된 기사는 모두 반드시 처리해야 하는 대상입니다.
2. **연속 작업 ('다음' / 'next' 명령어 지원)**:
   - 사용자가 이번 기사 묶음 완료 후 채팅창에 **"다음"** 또는 **"next"**라고만 입력하면 별도로 웹사이트에서 다음 프롬프트를 복사해오라고 요구하지 마십시오.
   - 즉시 연결된 Supabase MCP 도구(\`execute_sql\` 등)를 사용하여 아직 처리되지 않은 다음 30개 기사를 DB에서 직접 조회하고 연속 작업하십시오.
   - 다음 묶음 조회 기준은 \`processing_status != 'PROCESSED'\`, 최신순이며 분류 필드는 오직 \`topic\` / \`topic_sub\`만 사용합니다.

---

## ⚡ 1. 작업 시작 전 DB 환경 확인 및 오류 방지 규칙 (필독)

### ① 편성 테이블 (\`public.agent_batch_assignments\`) 부재 시 처리
- 만약 DB에 \`public.agent_batch_assignments\` 테이블이 아직 없더라도 **절대 에러로 중단하거나 작업을 멈추지 마십시오.**
- 에이전트 번호(Agent #${agentNumber})와 담당 기사 ID 목록은 이미 **본 지침서 5번 항목에 완벽하게 기재**되어 있으므로, 테이블 조회를 생략하고 곧바로 **②번 \`public.articles\` 원문 일괄 조회 단계로 직행**하십시오.
- 필요하면 아래 DDL을 1회 실행할 수 있으나, 생성하지 않고 기사 번역 작업만 수행해도 무방합니다.

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

### ② 배정된 기사 원문 전문(\`original_body\`) 일괄 조회 쿼리
본 지침서에는 토큰 절약과 정확도를 위해 **기사 ID만 제공**되어 있습니다. 기사 제목과 전문은 Supabase \`public.articles\`에서 아래 SQL로 일괄 조회하십시오.

\`\`\`sql
SELECT
  article_id,
  original_language,
  original_title,
  original_body,
  topic,
  topic_sub,
  processing_status,
  published_at
FROM public.articles
WHERE article_id IN (
    ${articleIdListSql}
)
ORDER BY published_at DESC;
\`\`\`

### ③ 쿼리 결과 레코드가 0건이거나 최신 기사가 아직 미수집된 경우 자동 대응
1. 먼저 \`SELECT MAX(published_at) AS latest_published_at, COUNT(*) AS total_count FROM public.articles;\`로 DB 최신 상태를 확인하십시오.
2. 배정 기사가 아직 DB에 없으면 사용자에게 최신 기사 일자와 미동기화 상태를 명확히 브리핑하십시오.
3. 사용자가 기사 원문 전문을 직접 제공하면 지체 없이 해당 원문을 기반으로 번역 및 DB 저장을 수행하십시오.

---

## 🎯 2. 핵심 원칙 및 행동 수칙 (반드시 준수)

### 1. 직접 번역 원칙 (기계 번역 프로그램 사용 절대 금지)
- 구글 번역기, 파파고 등 단순 기계 번역 프로그램을 돌리지 말고, **맥락과 저널리즘 품격을 살린 최고 수준의 AI 네이티브 직접 번역**을 수행하십시오.
- 키냐르완다어(RW), 한국어(KO), 영어(EN)의 어법과 어휘를 세련되고 자연스럽게 표현하십시오.

### 2. 연속 완수 목표 (하나만 하고 멈추지 말 것)
- 기사 1개를 마칠 때마다 멈춰서 사용자에게 다음 진행 여부를 묻지 마십시오.
- **배정된 ${articles.length}개 기사를 처음부터 끝까지 쉬지 않고 순차적으로 완료하는 것을 목표**로 작업하십시오.
- ChatGPT 출력 토큰 한계에 도달하면 그때까지 완료된 기사들의 SQL 쿼리를 출력한 뒤, \`"계속 진행하려면 '계속' 또는 '다음'을 입력해주세요."\`라고 안내하십시오.

### 3. 사용자 "계속" / "다음" 지시 처리
- 사용자가 언제든 **"계속"**, **"다음"**, **"next"**, **"continue"** 등을 지시하면 현재 그룹에서 아직 처리하지 못한 다음 순번부터 즉시 이어서 진행하십시오.
- 현재 그룹이 모두 완료된 상태라면 다음 배정 그룹의 미처리 과제를 파악하여 연속해서 작업하십시오.

### 4. 에이전트 모드 (ChatGPT 내 사용자 직접 지시 지원)
- 🅰️ **[모드 A: 진행한 번역은 건너뛰기 (기본값)]**: 이미 번역이 완료되어 DB에 존재하거나 \`processing_status='PROCESSED'\`인 기사는 건너뛰고 미처리 기사만 처리합니다.
- 🅱️ **[모드 B: 진행한 번역도 다시하기 (강제 재번역 모드)]**: 기존 번역 여부와 상관없이 배정 기사를 최신 품질로 새롭게 번역하여 UPDATE합니다.
- 사용자가 \`"건너뛰기 모드"\`, \`"모드 B"\`처럼 지시하면 즉시 반영하십시오.

### 5. 수시 진행 현황 및 진행률(%) 브리핑
- 기사 번역을 출력할 때마다 상단에 전체 업무 패키지 수와 현재 진행 상황, 진행률을 명확히 브리핑하십시오.
- 예: \`[📊 Agent #${agentNumber} 실시간 보고] 담당 그룹: #${groupNumber} | 진행도: 5/${articles.length} 기사 완료 | 상태: 순차 처리 중\`

---

## 📌 3. 기사별 번역 및 생성 기준

### 1. topic 결정 (영문 대분류 9대 표준)
- **3개 언어 모두 동일한 영문 표기**로 결정합니다.
- 허용 표준 토픽: ${TOPICS}
- **topic_sub은 현재 단계에서는 항상 \`General\`로 저장하십시오.**

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
- 원문에 없는 사실, 인용, 숫자를 생성하지 마십시오.

---

## 💾 4. Supabase DB 반영 SQL 쿼리 템플릿 (실제 DB 스키마 준수)

⚠️ **중요 스키마 규칙**
- 기사 분류의 유일한 대분류 필드는 \`topic\`입니다.
- \`topic_sub\`은 현재 \`General\`을 사용합니다.
- \`public.localized_articles\`는 언어 컬럼으로 **\`lang\`**을 사용합니다.
- 존재하지 않는 임의 컬럼을 SQL에 추가하지 마십시오.

\`\`\`sql
-- 1) 메인 기사 테이블 topic / topic_sub / processing_status 갱신
UPDATE public.articles
SET
  topic = 'Economy',
  topic_sub = 'General',
  processing_status = 'PROCESSED',
  updated_at = NOW()
WHERE article_id = 'ART-XXXXX';

-- 2) 3개 국어 번역문 업서트
INSERT INTO public.localized_articles (
  article_id, lang, title, summary, body, topic, topic_sub, processed_at
) VALUES
  ('ART-XXXXX','ko','한국어 제목','한국어 1줄 요약\\n2줄 요약\\n3줄 요약','첫 번째 문단입니다.\\n\\n두 번째 문단입니다.','Economy','General',NOW()),
  ('ART-XXXXX','en','English Title','English line 1\\nLine 2\\nLine 3','First paragraph.\\n\\nSecond paragraph.','Economy','General',NOW()),
  ('ART-XXXXX','rw','Umutwe mu Kinyarwanda','Incamake 1\\nIncamake 2\\nIncamake 3','Igika cya mbere.\\n\\nIgika cya kabiri.','Economy','General',NOW())
ON CONFLICT (article_id, lang)
DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  topic = EXCLUDED.topic,
  topic_sub = EXCLUDED.topic_sub,
  processed_at = NOW();
\`\`\`

30개 기사 완수 시 \`public.agent_batch_assignments\` 테이블이 존재한다면 상태도 갱신하십시오.

\`\`\`sql
UPDATE public.agent_batch_assignments
SET status='DONE', processed_items=${articles.length}, raw_items=0, updated_at=NOW()
WHERE group_number=${groupNumber};
\`\`\`

---

## 📋 5. Agent #${agentNumber} 담당 기사 ID 목록 (그룹 #${groupNumber} · ${numberRange})

${articleListText}

지금 1번째 기사부터 마지막 기사까지 중단 없이 완수를 목표로 번역 및 DB 반영을 시작하세요!`;
}

async function buildTopicPrompt(batchIndex: number, onlyRaw: boolean) {
  const startGroup = (Math.max(1, batchIndex) - 1) * 5 + 1;
  const endGroup = startGroup + 4;
  const all: any[] = [];
  for (let n = startGroup; n <= endGroup; n++) {
    const g = await groupData(n, onlyRaw);
    all.push(...(g.articles || []));
  }
  const articles = all.slice(0, 150);
  if (!articles.length) return '';
  const rows = articles.map((a: any, idx: number) => {
    const koTitle = a.ko?.title || '';
    const originalTitle = String(a.original_title || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const titleDisplay = koTitle && koTitle !== originalTitle ? `${koTitle} (원문: ${originalTitle})` : originalTitle;
    const body = String(a.original_body || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    return `${idx + 1}. [${a.article_number || `#${idx + 1}`} · \`${a.article_id}\`] ${titleDisplay}${body ? ` | 본문: ${body}...` : ''}`;
  }).join('\n');

  return `# ChatGPT 에이전트 지침: 150개 기사 일괄 Topic 고속 재결정 에이전트 (Batch #${batchIndex} · 그룹 #${startGroup}~#${endGroup})

당신은 **뉴스 인텔리전스 150개 기사 일괄 Topic 재결정 전문 고속 에이전트 [Batch Topic Classifier]**입니다.
총 5개 그룹(그룹 #${startGroup} ~ #${endGroup}, 총 ${articles.length}개 기사)의 제목과 핵심 내용을 신속하게 분석하여, 각 기사별 최적의 영문 대분류 Topic을 일괄 결정하고 Supabase DB에 한 번에 업데이트하는 고속 일괄 UPDATE SQL을 직접 실행하거나 생성합니다.

---

## ⚠️ [필독] 기사 분석 및 Topic 결정 4대 절대 원칙
1. **기존 Topic 값 100% 무시 및 신규 지정**:
   - 현재 DB의 \`topic\` 값이 무엇이든 **100% 무시**하고 제목과 본문 내용을 바탕으로 9대 표준 영문 Topic 중 가장 적합한 하나를 새롭게 지정하십시오.
   - \`topic_sub\`은 현재 모든 기사에서 \`General\`로 유지하십시오.
2. **EXPORTED 기사는 이번 작업 대상임 (PROCESSED 오인 금지)**:
   - \`EXPORTED\`, \`RAW\`, \`PENDING\` 등은 아직 완료된 것이 아니며 일괄 Topic 분류 작업의 필수 대상입니다.
3. **언어 무관 / 원문 제목 및 본문 적극 참조**:
   - 원문 언어에 관계없이 제목을 기본 참조하고, 제목만으로 핵심 분야가 모호하면 반드시 본문 문맥을 적극 참조하십시오.
4. **Supabase DB 직접 실행 및 반영 완료 (단순 SQL 반환 금지)**:
   - Supabase MCP 도구(\`execute_sql\` 등)가 연결되어 있다면 SQL 텍스트만 출력하고 멈추지 말고 실제 DB 갱신을 완료한 뒤 성공 행 수를 보고하십시오.

---

## 📌 표준 9대 영문 Topic 분류 기준
- **Economy**: 경제, 금융, 은행, 투자, 통상, 무역, 물가, 비즈니스, 기업, 산업 활동, 세금, 예산
- **Politics**: 정치, 국회, 정부 정책, 법률, 외교, 조약, 정상회담, 사법, 안보, 군사, 국방
- **AI/Tech**: IT, 소프트웨어, 인공지능, 통신, 디지털 혁신, 스타트업, 사이버보안, 모바일
- **Education**: 교육, 학교, 대학, 장학금, 직업 훈련, 학술 연구, R&D, 교사, 시험
- **Sports**: 축구, 농구, 올림픽, 마라톤, 각종 스포츠 경기 및 선수 소식, 대회
- **Real Estate**: 부동산, 주택, 아파트, 토지, 건설, 인프라, 도로, 철도, 공항, 도시개발
- **Volunteers**: 자원봉사, 인도주의적 구호, NGO, 자선, 기부, 사회공헌, 취약계층 지원, 난민
- **Nature/Living**: 자연, 환경, 기후변화, 국립공원, 야생동물, 농업, 보건의료, 질병, 병원, 일상생활
- **Culture**: 문화, 예술, 역사, 영화, 음악, 축제, 전통, 관광, 엔터테인먼트, 공연

---

## ⚡ 150개 기사 고속 일괄 UPDATE SQL 템플릿
반드시 대상 기사 전체 매핑을 누락 없이 작성하십시오.

\`\`\`sql
-- [Batch #${batchIndex}] 기사 일괄 Topic 갱신 (그룹 #${startGroup}~#${endGroup})
UPDATE public.articles AS a
SET
  topic = v.topic,
  topic_sub = 'General',
  updated_at = NOW()
FROM (VALUES
  ('${articles[0]?.article_id || 'ART-XXXX1'}', 'Economy'),
  ('${articles[1]?.article_id || 'ART-XXXX2'}', 'AI/Tech')
  -- ${articles.length}개 기사 전체 매핑...
) AS v(article_id, topic)
WHERE a.article_id = v.article_id;

UPDATE public.localized_articles AS l
SET topic = a.topic,
    topic_sub = a.topic_sub
FROM public.articles a
WHERE l.article_id = a.article_id
  AND a.article_id IN (/* 위 대상 article_id 전체 */);
\`\`\`

---

## 📋 일괄 분류 대상 ${articles.length}개 기사 목록 (그룹 #${startGroup} ~ #${endGroup})

${rows}

지금 즉시 위 ${articles.length}개 기사의 내용을 파악하고, 각 기사의 영문 Topic을 결정하여 Supabase DB에 단번에 반영 완료하십시오!`;
}

router.post('/cluster-similar-articles', (_req, res) => res.status(410).json({ error: 'Legacy heuristic clustering is disabled. Use /api/story-agent/batch and validate the agent result before any cluster changes.' }));
router.get('/supabase/status', async (_req, res) => { const config = getSupabaseConfig(), test = await testSupabaseConnection(); res.json({ config: { configured: config.configured, url: config.url ? `${config.url.slice(0, 18)}...` : '' }, test, ddl: generateSupabaseDDL() }); });
router.post('/sync-articles', async (_req, res) => { try { const test = await testSupabaseConnection(); res.json({ success: true, count: test.articleCount || 0 }); } catch (err: any) { res.status(500).json({ success: false, error: err.message }); } });
router.post('/supabase/config', (_req, res) => res.status(410).json({ error: 'Runtime Supabase configuration is environment-only.' }));
router.get('/openapi.json', (req, res) => res.json({ openapi: '3.1.0', info: { title: 'News Intelligence MCP API', version: '2.0.0' }, servers: [{ url: `${req.protocol}://${req.get('host')}` }], paths: {} }));
router.get('/groups', async (req, res) => { try { res.json(unprocessed(req.query.unprocessed) ? await fetchUnprocessedBatchGroupsDirectly() : await fetchBatchGroupsDirectly()); } catch (err: any) { res.status(500).json({ error: err.message }); } });
router.get('/group/:groupNumber', async (req, res) => { try { res.json(await groupData(Number(req.params.groupNumber) || 1, unprocessed(req.query.unprocessed))); } catch (err: any) { res.status(500).json({ error: err.message }); } });
router.get('/prompt/:groupNumber', async (req, res) => { try { res.json({ prompt: await buildAgentPrompt(Number(req.params.groupNumber) || 1, unprocessed(req.query.unprocessed)) }); } catch (err: any) { res.status(500).json({ error: err.message }); } });
router.get('/topic-prompt/:batchIndex', async (req, res) => { try { res.json({ prompt: await buildTopicPrompt(Number(req.params.batchIndex) || 1, unprocessed(req.query.unprocessed)) }); } catch (err: any) { res.status(500).json({ error: err.message }); } });
router.get('/article/:article_id', async (req, res) => { const art = await fetchArticleDetailDirectly(req.params.article_id); if (!art) return res.status(404).json({ error: 'Article not found' }); res.json(art); });
router.post('/save-article', async (req, res) => { try { res.json(await saveProcessedArticleDirectly(req.body)); } catch (err: any) { res.status(500).json({ error: err.message }); } });
router.post('/rpc', async (req, res) => { const { jsonrpc, id, method, params } = req.body || {}; if (jsonrpc !== '2.0') return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } }); try { if (method === 'tools/list') return res.json({ jsonrpc: '2.0', id, result: { tools: [{ name: 'get_batch_groups', inputSchema: { type: 'object', properties: {} } }, { name: 'get_group_articles', inputSchema: { type: 'object', properties: { group_number: { type: 'number' } }, required: ['group_number'] } }, { name: 'get_raw_article', inputSchema: { type: 'object', properties: { article_id: { type: 'string' } }, required: ['article_id'] } }, { name: 'save_processed_article', inputSchema: { type: 'object', properties: { article_id: { type: 'string' } }, required: ['article_id'] } }] } }); if (method === 'tools/call') { const name = params?.name, args = params?.arguments || {}; let data: any; if (name === 'get_batch_groups') data = await fetchBatchGroupsDirectly(); else if (name === 'get_group_articles') data = await fetchGroupArticlesDirectly(args.group_number || 1); else if (name === 'get_raw_article') data = await fetchArticleDetailDirectly(args.article_id); else if (name === 'save_processed_article') data = await saveProcessedArticleDirectly(args); else return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Tool ${name} not found` } }); return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } }); } return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not implemented' } }); } catch (error: any) { return res.status(500).json({ jsonrpc: '2.0', id, error: { code: -32000, message: error.message } }); } });
export default router;
