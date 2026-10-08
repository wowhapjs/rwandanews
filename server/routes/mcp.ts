import{Router}from'express';import{getSupabaseConfig,generateSupabaseDDL,testSupabaseConnection}from'../db/supabase.js';import{fetchBatchGroupsDirectly,fetchUnprocessedBatchGroupsDirectly,fetchGroupArticlesDirectly,fetchUnprocessedGroupArticlesDirectly,fetchArticleDetailDirectly,saveProcessedArticleDirectly}from'../db/supabaseStore.js';const router=Router(),TOPICS='Economy, Politics, AI/Tech, Education, Sports, Real Estate, Volunteers, Nature/Living, Culture';const unprocessed=(v:unknown)=>String(v||'').toLowerCase()==='true';const groupData=(n:number,u:boolean)=>u?fetchUnprocessedGroupArticlesDirectly(n):fetchGroupArticlesDirectly(n);
async function buildAgentPrompt(groupNumber:number,onlyRaw:boolean){const g=await groupData(groupNumber,onlyRaw),articles=g.articles||[],agent=g.agent_number||((groupNumber-1)%5)+1,range=g.number_range||`Group #${groupNumber}`,ids=articles.map((a:any)=>`'${a.article_id}'`).join(',\n    '),list=articles.map((a:any,i:number)=>`${i+1}. ${a.article_number||`#${i+1}`} · ID: \`${a.article_id}\``).join('\n');return`# ChatGPT 에이전트 지침: 기사 다국어 번역 및 Supabase DB 직접 갱신 프로시저 (Agent #${agent})

당신은 뉴스 인텔리전스 포털 전문 다국어 번역 및 인텔리전스 분석 에이전트 [Agent #${agent}]입니다. Supabase를 직접 조회하고 갱신하여 한국어·영어·키냐르완다어 3개 국어 번역을 수행하십시오.
- 담당 그룹: #${groupNumber} · ${range} · 총 ${articles.length}개
- ${onlyRaw?'미처리 집중배정':'일반 배정'}

## ⚠️ 기사 상태 및 연속 작업
1. EXPORTED/RAW/PENDING은 완료가 아닙니다. PROCESSED만 완료로 봅니다.
2. 사용자가 "다음/next/계속"이라고 하면 새 프롬프트를 요구하지 말고 다음 미처리 30개를 DB에서 직접 조회하여 이어갑니다.
3. 기사 1개마다 멈추지 말고 배정된 ${articles.length}개를 끝까지 순차 처리합니다.
4. 기본 모드 A는 기존 PROCESSED를 건너뛰고, 모드 B 요청 시 기존 번역도 다시 처리합니다.
5. 매 처리 구간마다 Agent #${agent}, 그룹 #${groupNumber}, 완료 수/${articles.length}, 진행률을 보고합니다.

## 1. 원문 일괄 조회
\`\`\`sql
SELECT article_id, original_language, original_title, original_body, topic, topic_sub, processing_status, published_at
FROM public.articles
WHERE article_id IN (
    ${ids}
)
ORDER BY published_at DESC;
\`\`\`
결과가 없으면 MAX(published_at), COUNT(*)로 최신 동기화 상태를 확인합니다. 편성 테이블이 없어도 절대 중단하지 않습니다.

## 2. 번역 품질
- 외부 기계번역기에 의존하지 말고 문맥과 저널리즘 품격을 살린 AI 네이티브 번역을 수행합니다.
- title_ko는 한국 뉴스 헤드라인, title_en은 글로벌 뉴스 스타일, title_rw는 자연스러운 Ikinyarwanda로 작성합니다.
- summary_ko/en/rw는 각각 핵심 사실 3문장, 줄바꿈 구분입니다.
- body_ko/en/rw는 원문 사실을 보존하고 문단 사이 빈 줄을 넣어 재문단화합니다. 원문에 없는 사실·인용·숫자를 만들지 않습니다.

## 3. Topic 규칙
- 허용 대분류 9개만 사용: ${TOPICS}
- 3개 언어의 topic은 동일한 영문 표기입니다.
- topic_sub은 현재 항상 General입니다.

## 4. DB 저장 템플릿
\`\`\`sql
UPDATE public.articles SET topic='Economy', topic_sub='General', processing_status='PROCESSED', updated_at=NOW() WHERE article_id='ART-XXXXX';
INSERT INTO public.localized_articles(article_id,lang,title,summary,body,topic,topic_sub,processed_at) VALUES
('ART-XXXXX','ko','한국어 제목','1줄\\n2줄\\n3줄','첫 문단\\n\\n둘째 문단','Economy','General',NOW()),
('ART-XXXXX','en','English Title','Line 1\\nLine 2\\nLine 3','First paragraph.\\n\\nSecond paragraph.','Economy','General',NOW()),
('ART-XXXXX','rw','Umutwe','Umurongo 1\\nUmurongo 2\\nUmurongo 3','Igika cya mbere.\\n\\nIgika cya kabiri.','Economy','General',NOW())
ON CONFLICT(article_id,lang) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary,body=EXCLUDED.body,topic=EXCLUDED.topic,topic_sub=EXCLUDED.topic_sub,processed_at=NOW();
\`\`\`
편성 테이블이 존재하면 그룹 완료 후 DONE/processed_items/raw_items를 갱신합니다.

## 5. 담당 기사 ID
${list}

지금 1번째 기사부터 마지막 기사까지 중단 없이 번역하고 DB 반영을 완료하십시오.`}
async function buildTopicPrompt(batchIndex:number,onlyRaw:boolean){const start=(Math.max(1,batchIndex)-1)*5+1,all:any[]=[];for(let n=start;n<start+5;n++){const g=await groupData(n,onlyRaw);all.push(...(g.articles||[]))}const a=all.slice(0,150);if(!a.length)return'';const rows=a.map((x:any,i:number)=>`${i+1}. [${x.article_number||`#${i+1}`} · \`${x.article_id}\`] ${x.ko?.title||x.original_title||''} | ${String(x.original_body||'').replace(/\s+/g,' ').slice(0,180)}`).join('\n');return`# ChatGPT 에이전트 지침: 150개 기사 일괄 Topic 고속 재결정 (Batch #${batchIndex} · 그룹 #${start}~#${start+4})

당신은 ${a.length}개 기사 Topic 재결정 전문 에이전트입니다.

## ⚠️ 4대 절대 원칙
1. 기존 topic 값을 100% 무시하고 제목과 본문을 바탕으로 새로 판단합니다.
2. EXPORTED/RAW/PENDING도 필수 대상입니다.
3. 제목이 모호하면 반드시 원문 본문 문맥을 참조합니다.
4. Supabase MCP가 연결되어 있으면 SQL 텍스트만 출력하지 말고 실제 DB UPDATE까지 완료하고 성공 행 수를 보고합니다.

## 표준 9대 Topic
- Economy: 경제·금융·은행·투자·통상·기업·산업·예산
- Politics: 정치·정부정책·법률·외교·사법·안보·군사
- AI/Tech: IT·AI·통신·디지털·스타트업·사이버보안
- Education: 교육·학교·대학·장학금·직업훈련·연구
- Sports: 각종 스포츠·경기·선수·대회
- Real Estate: 부동산·주택·토지·건설·인프라·도시개발
- Volunteers: 자원봉사·구호·NGO·자선·기부·사회공헌
- Nature/Living: 환경·기후·농업·보건·질병·병원·생활
- Culture: 문화·예술·역사·영화·음악·축제·관광·공연
- topic_sub은 현재 모든 기사 General 유지

## 일괄 반영
\`\`\`sql
UPDATE public.articles a SET topic=v.topic,topic_sub='General',updated_at=NOW()
FROM (VALUES ('ART-XXXX','Economy') /* ${a.length}개 전체 매핑 */) v(article_id,topic)
WHERE a.article_id=v.article_id;
UPDATE public.localized_articles l SET topic=a.topic,topic_sub=a.topic_sub FROM public.articles a WHERE l.article_id=a.article_id AND a.article_id IN (/* 대상 전체 */);
\`\`\`

## 대상 ${a.length}개
${rows}

누락 없이 전체를 분류하고 실제 DB에 반영하십시오.`}
router.post('/cluster-similar-articles',(_req,res)=>res.status(410).json({error:'Legacy heuristic clustering is disabled. Use /api/story-agent/batch and validate the agent result before any cluster changes.'}));router.get('/supabase/status',async(_req,res)=>{const config=getSupabaseConfig(),test=await testSupabaseConnection();res.json({config:{configured:config.configured,url:config.url?`${config.url.slice(0,18)}...`:''},test,ddl:generateSupabaseDDL()})});router.post('/sync-articles',async(_req,res)=>{try{const test=await testSupabaseConnection();res.json({success:true,count:test.articleCount||0})}catch(err:any){res.status(500).json({success:false,error:err.message})}});router.post('/supabase/config',(_req,res)=>res.status(410).json({error:'Runtime Supabase configuration is environment-only.'}));router.get('/openapi.json',(req,res)=>res.json({openapi:'3.1.0',info:{title:'News Intelligence MCP API',version:'2.0.0'},servers:[{url:`${req.protocol}://${req.get('host')}`}],paths:{}}));router.get('/groups',async(req,res)=>{try{res.json(unprocessed(req.query.unprocessed)?await fetchUnprocessedBatchGroupsDirectly():await fetchBatchGroupsDirectly())}catch(err:any){res.status(500).json({error:err.message})}});router.get('/group/:groupNumber',async(req,res)=>{try{res.json(await groupData(Number(req.params.groupNumber)||1,unprocessed(req.query.unprocessed)))}catch(err:any){res.status(500).json({error:err.message})}});router.get('/prompt/:groupNumber',async(req,res)=>{try{res.json({prompt:await buildAgentPrompt(Number(req.params.groupNumber)||1,unprocessed(req.query.unprocessed))})}catch(err:any){res.status(500).json({error:err.message})}});router.get('/topic-prompt/:batchIndex',async(req,res)=>{try{res.json({prompt:await buildTopicPrompt(Number(req.params.batchIndex)||1,unprocessed(req.query.unprocessed))})}catch(err:any){res.status(500).json({error:err.message})}});router.get('/article/:article_id',async(req,res)=>{const art=await fetchArticleDetailDirectly(req.params.article_id);if(!art)return res.status(404).json({error:'Article not found'});res.json(art)});router.post('/save-article',async(req,res)=>{try{res.json(await saveProcessedArticleDirectly(req.body))}catch(err:any){res.status(500).json({error:err.message})}});router.post('/rpc',async(req,res)=>{const{jsonrpc,id,method,params}=req.body||{};if(jsonrpc!=='2.0')return res.status(400).json({jsonrpc:'2.0',id,error:{code:-32600,message:'Invalid Request'}});try{if(method==='tools/list')return res.json({jsonrpc:'2.0',id,result:{tools:[{name:'get_batch_groups',inputSchema:{type:'object',properties:{}}},{name:'get_group_articles',inputSchema:{type:'object',properties:{group_number:{type:'number'}},required:['group_number']}},{name:'get_raw_article',inputSchema:{type:'object',properties:{article_id:{type:'string'}},required:['article_id']}},{name:'save_processed_article',inputSchema:{type:'object',properties:{article_id:{type:'string'}},required:['article_id']}}]}});if(method==='tools/call'){const name=params?.name,args=params?.arguments||{};let data:any;if(name==='get_batch_groups')data=await fetchBatchGroupsDirectly();else if(name==='get_group_articles')data=await fetchGroupArticlesDirectly(args.group_number||1);else if(name==='get_raw_article')data=await fetchArticleDetailDirectly(args.article_id);else if(name==='save_processed_article')data=await saveProcessedArticleDirectly(args);else return res.status(400).json({jsonrpc:'2.0',id,error:{code:-32601,message:`Tool ${name} not found`}});return res.json({jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(data)}]}})}return res.status(400).json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not implemented'}})}catch(error:any){return res.status(500).json({jsonrpc:'2.0',id,error:{code:-32000,message:error.message}})}});export default router;
