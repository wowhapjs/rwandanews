import React, { useState, useEffect } from 'react';
import {
  Database,
  Bot,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  Play,
  Layers,
  Info,
  ChevronRight,
  Eye,
  Filter,
  CheckCircle,
  ExternalLink,
  BookOpen,
  Tag,
  Sparkles,
  UploadCloud
} from 'lucide-react';
import { t } from '../lib/i18n';

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

interface GroupArticle {
  global_index: number;
  group_index: number;
  article_number: string;
  article_id: string;
  source_id: string;
  source_name: string;
  source_url: string;
  original_language: string;
  original_title: string;
  original_subtitle?: string;
  original_body: string;
  published_at: string;
  portal_category_id: string;
  processing_status: string;
  has_ko: boolean;
  has_en: boolean;
  has_rw: boolean;
  word_count_ko?: number;
  word_count_en?: number;
  word_count_rw?: number;
  body_words_ko?: number;
  body_words_en?: number;
  body_words_rw?: number;
  original_word_count?: number;
}

function getAgentBadge(agentNum: number) {
  switch (agentNum) {
    case 1:
      return {
        bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        dot: 'bg-emerald-400',
        border: 'border-emerald-500/40',
        name: 'Agent #1'
      };
    case 2:
      return {
        bg: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
        dot: 'bg-blue-400',
        border: 'border-blue-500/40',
        name: 'Agent #2'
      };
    case 3:
      return {
        bg: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
        dot: 'bg-purple-400',
        border: 'border-purple-500/40',
        name: 'Agent #3'
      };
    case 4:
      return {
        bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        dot: 'bg-amber-400',
        border: 'border-amber-500/40',
        name: 'Agent #4'
      };
    case 5:
    default:
      return {
        bg: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        dot: 'bg-rose-400',
        border: 'border-rose-500/40',
        name: 'Agent #5'
      };
  }
}

interface SupabaseMcpWorkspaceProps {
  currentLang?: string;
}

export const SupabaseMcpWorkspace: React.FC<SupabaseMcpWorkspaceProps> = ({ currentLang = 'original' }) => {
  const [groups, setGroups] = useState<BatchGroupInfo[]>([]);
  const [totalRaw, setTotalRaw] = useState(0);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalArticles, setTotalArticles] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedGroupNumber, setSelectedGroupNumber] = useState<number>(1);
  const [selectedGroupArticles, setSelectedGroupArticles] = useState<GroupArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [copiedPromptGroup, setCopiedPromptGroup] = useState<number | null>(null);
  const [copiedTopicBatch, setCopiedTopicBatch] = useState<number | null>(null);
  const [copiedGeneralPrompt, setCopiedGeneralPrompt] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [supabaseStatus, setSupabaseStatus] = useState<any>(null);
  const [promptViewMode, setPromptViewMode] = useState<'DB_MCP' | 'EXCEL'>('DB_MCP');
  const [previewArticle, setPreviewArticle] = useState<GroupArticle | null>(null);
  const [groupFilter, setGroupFilter] = useState<'ALL' | 'UNPROCESSED' | 'DONE'>('ALL');
  const [hoveredGroupInfo, setHoveredGroupInfo] = useState<number | null>(null);
  const [hoveredPromptBtn, setHoveredPromptBtn] = useState<number | null>(null);
  const [hoveredViewBtn, setHoveredViewBtn] = useState<number | null>(null);
  const [hoveredArticlePreview, setHoveredArticlePreview] = useState<string | null>(null);
  const [detailFilter, setDetailFilter] = useState<'ALL' | 'RAW' | 'PROCESSED'>('ALL');

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mcp/groups');
      const data = await res.json();
      setGroups(data.groups || []);
      setTotalRaw(data.totalRaw || 0);
      setTotalProcessed(data.totalProcessed || 0);
      setTotalArticles(data.totalArticles || 0);
    } catch (err) {
      console.error('Failed to load batch groups:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSupabaseStatus = async () => {
    try {
      const res = await fetch('/api/mcp/supabase/status');
      const data = await res.json();
      setSupabaseStatus(data);
    } catch (err) {
      console.error('Failed to load Supabase status:', err);
    }
  };

  const loadGroupArticles = async (groupNum: number) => {
    setArticlesLoading(true);
    try {
      const res = await fetch(`/api/mcp/group/${groupNum}`);
      const data = await res.json();
      setSelectedGroupArticles(data.articles || []);
    } catch (err) {
      console.error('Failed to load group articles:', err);
    } finally {
      setArticlesLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
    loadSupabaseStatus();
  }, []);

  useEffect(() => {
    if (selectedGroupNumber) {
      loadGroupArticles(selectedGroupNumber);
    }
  }, [selectedGroupNumber]);

  const handleCopyPrompt = async (groupNum: number) => {
    try {
      const res = await fetch(`/api/mcp/prompt/${groupNum}`);
      const data = await res.json();
      await navigator.clipboard.writeText(data.prompt);
      setCopiedPromptGroup(groupNum);
      setTimeout(() => setCopiedPromptGroup(null), 3000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  };

  const handleCopyTopicPrompt = async (batchIdx: number) => {
    try {
      const res = await fetch(`/api/mcp/topic-prompt/${batchIdx}`);
      const data = await res.json();
      await navigator.clipboard.writeText(data.prompt);
      setCopiedTopicBatch(batchIdx);
      setTimeout(() => setCopiedTopicBatch(null), 3000);
    } catch (err) {
      console.error('Failed to copy 150-item topic prompt:', err);
    }
  };

  const handleSaveSupabaseConfig = async () => {
    try {
      const res = await fetch('/api/mcp/supabase/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: supabaseUrl, key: supabaseKey })
      });
      const data = await res.json();
      alert(data.test?.message || 'Supabase 설정이 저장되었습니다.');
      setShowConfigModal(false);
      loadSupabaseStatus();
    } catch (err: any) {
      alert(`저장 실패: ${err.message}`);
    }
  };

  const [syncingArticles, setSyncingArticles] = useState(false);

  const handleSyncArticles = async () => {
    setSyncingArticles(true);
    try {
      const res = await fetch('/api/mcp/sync-articles', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Supabase에 기사가 성공적으로 동기화되었습니다.');
        loadSupabaseStatus();
        loadGroups();
      } else {
        alert(`동기화 실패: ${data.error}`);
      }
    } catch (err: any) {
      alert(`동기화 오류: ${err.message}`);
    } finally {
      setSyncingArticles(false);
    }
  };

  const getGeneralDbPrompt = () => {
    return `# ChatGPT 에이전트 지침: Supabase DB 직접 번역 및 갱신 프로시저 (No Localhost)

당신은 뉴스 인텔리전스 포털 전문 다국어 번역 및 분석 에이전트입니다.
Supabase 데이터베이스의 \`public.articles\`를 직접 조회하고 고품질 3개 국어(한국어, 영어, 키냐르완다어) 번역을 수행하여 \`public.localized_articles\` 및 \`public.articles\`에 직접 반영합니다.

## ⚡ 1. 작업 시작 전 DB 환경 확인 및 오류 방지 규칙 (필독)
1. **편성 테이블 (\`public.agent_batch_assignments\`) 부재 시**:
   - 만약 DB에 \`public.agent_batch_assignments\` 테이블이 없더라도 **절대 작업을 중단하지 마십시오.**
   - 배정 정보(그룹 번호 및 기사 ID 목록)가 지침서에 명시되어 있으므로 곧바로 \`public.articles\` 원문 조회 및 \`public.localized_articles\` 저장 단계로 직행하십시오.
2. **원문 전문(\`original_body\`) 조회 및 0건 시 대처**:
   - 기사 원문 전문은 \`SELECT article_id, original_title, original_body, portal_category_id, published_at FROM public.articles WHERE article_id IN (...) ORDER BY published_at DESC;\` 로 일괄 조회합니다.
   - 만약 쿼리 결과가 0건이라면 \`SELECT MAX(published_at) FROM public.articles;\` 로 DB의 최신 일자를 파악하고, 사용자에게 포털 화면에서 [동기화]를 눌러주시거나 기사 원문을 직접 전달해달라고 브리핑하십시오.
3. **실제 DB 스키마 100% 준수**:
   - \`public.localized_articles\`의 언어 컬럼은 \`language\`가 아니라 반드시 **\`lang\`** ('ko', 'en', 'rw')입니다.
   - **\`word_count\` 컬럼은 DB 스키마에 존재하지 않으므로 SQL에 절대 포함하지 마십시오.**

## 🎯 2. 핵심 실행 프로시저 및 행동 수칙
1. **AI 네이티브 직접 번역 절대 원칙 (기계 번역 프로그램 금지)**:
   - 구글 번역기, 파파고 등 단순 기계 번역 프로그램을 돌리지 말고, 저널리즘 인텔리전스 품질의 자연스러운 AI 직접 번역을 수행합니다.
2. **연속 완수 목표 (하나만 하고 멈추지 말 것)**:
   - 기사 하나 끝날 때마다 멈춰서 다음 지시를 기다리지 말고, 배정된 30개 기사를 처음부터 끝까지 쉬지 않고 순차적으로 완수하는 것을 목표로 연속 진행합니다.
3. **사용자 '계속' / '다음' 지시 처리**:
   - 사용자가 '계속', '다음', 'next', 'continue' 등을 지시하면, 멈춤 없이 다음 순번 기사를 진행하거나 현재 그룹이 완료되었을 경우 다음 배정 그룹의 과제를 연속해서 이어갑니다.
4. **에이전트 모드 (ChatGPT 내 직접 지시 지원)**:
   - 🅰️ [모드 A: 진행한 번역은 건너뛰기 (기본값)] - 이미 번역된 기사는 건너뛰고 미처리 기사만 처리.
   - 🅱️ [모드 B: 진행한 번역도 다시하기 (강제 재번역)] - 모든 기사를 최신 품질로 새롭게 번역하여 UPDATE.
5. **실시간 수시 브리핑 및 % 보고**:
   - 매 기사마다 사용자에게 [전체 업무 패키지 수 / 현재 진행 상황 / 진행률(%)]을 명확히 보고합니다. (예: \`[Agent #1] 그룹 #1 | 진행: 5/30 기사 완료 (16.7%)\`)
6. **본문 리파라그래프**:
   - 가독성을 위해 문단과 문단 사이에 반드시 빈 줄(double line-break \`\\n\\n\`)을 삽입합니다.

## 💾 3. Supabase DB 직접 반영 SQL (실제 DB 스키마 완벽 준수)
\`\`\`sql
-- 1) 메인 기사 topic 및 PROCESSED 상태 업데이트
UPDATE public.articles
SET 
  topic = 'Economy', -- 9대 표준 영문 Topic 중 택 1
  processing_status = 'PROCESSED',
  updated_at = NOW()
WHERE article_id = 'ART-XXXXX';

-- 2) 3개 국어 번역문 저장 (컬럼: lang 사용, word_count 없음)
INSERT INTO public.localized_articles (
  article_id,
  lang,
  title,
  summary,
  body,
  topic,
  processed_at
) VALUES 
  ('ART-XXXXX', 'ko', '한국어 제목', '요약 1\\n요약 2\\n요약 3', '첫 번째 문단입니다.\\n\\n두 번째 문단입니다.', 'Economy', NOW()),
  ('ART-XXXXX', 'en', 'English Title', 'Summary 1\\nSummary 2\\nSummary 3', 'First paragraph.\\n\\nSecond paragraph.', 'Economy', NOW()),
  ('ART-XXXXX', 'rw', 'Umutwe mu Kinyarwanda', 'Incamake 1\\nIncamake 2\\nIncamake 3', 'Igika cya mbere.\\n\\nIgika cya kabiri.', 'Economy', NOW())
ON CONFLICT (article_id, lang) 
DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  topic = EXCLUDED.topic,
  processed_at = NOW();
\`\`\``;
  };

  const getExcelPrompt = () => {
    return `# ChatGPT 지침: 엑셀 워크북 일괄 처리 (Excel Batch Workflow)

1. INPUT 및 CONTENT_BLOCKS 시트의 원문 기사를 읽고 다음 시트에 작성하십시오:
   - OUTPUT_KO: title_ko, summary_ko (3줄), body_ko (문단 간 빈 줄 구분)
   - OUTPUT_EN: title_en, summary_en (3줄), body_en (문단 간 빈 줄 구분)
   - OUTPUT_RW: title_rw, summary_rw (3줄), body_rw (문단 간 빈 줄 구분)
2. topic은 영문(Economy, AI/Tech 등)으로 기입합니다.
3. 기계 번역이 아닌 고품질 AI 네이티브 번역을 수행합니다.
4. 리파라그래프된 본문은 별도 컬럼이 아닌 body_*에 문단 간 빈 줄을 두고 직접 입력합니다.`;
  };

  // Filter groups
  const unprocessedGroupsCount = groups.filter(g => g.raw_items > 0).length;
  const completedGroupsCount = groups.filter(g => g.status === 'DONE').length;

  const filteredGroups = groups.filter(g => {
    if (groupFilter === 'UNPROCESSED') return g.raw_items > 0;
    if (groupFilter === 'DONE') return g.status === 'DONE';
    return true;
  });

  const selectedGroup = groups.find(g => g.group_number === selectedGroupNumber);
  const selectedAgentNum = selectedGroup ? selectedGroup.agent_number : ((selectedGroupNumber - 1) % 5) + 1;
  const selectedAgentBadge = getAgentBadge(selectedAgentNum);

  return (
    <div className="space-y-6">
      {/* Top Banner: Supabase Connection & Overview */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Database className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center space-x-2">
                <span>{t('mcp_workspace_title', currentLang)}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Zero-Cache Direct Supabase
                </span>
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              서버 내부 메모리 복사 없이 Supabase를 직접 조회 및 갱신합니다. 에이전트와 DB 간의 업데이트가 즉시 실시간 반영됩니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSyncArticles}
              disabled={syncingArticles}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/40 hover:bg-emerald-600/30 text-xs font-semibold text-emerald-300 flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="내부 메모리 캐시 없이 Supabase를 직접 조회하고 상태를 확인합니다"
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${syncingArticles ? 'animate-spin' : ''}`} />
              <span>{syncingArticles ? '조회 중...' : 'Supabase 직접 연동 상태'}</span>
            </button>

            <button
              onClick={() => setShowConfigModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] hover:border-emerald-500 text-xs font-semibold text-[var(--text-primary)] flex items-center space-x-1.5 transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>Supabase 연결 정보</span>
            </button>

            <button
              onClick={() => {
                loadGroups();
                loadSupabaseStatus();
                if (selectedGroupNumber) loadGroupArticles(selectedGroupNumber);
              }}
              className="p-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-secondary)] hover:text-white transition-colors"
              title={t('btn_refresh', currentLang)}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Supabase Status Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
          <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Supabase 주 DB:</span>
            <span className="font-bold text-emerald-400 flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>연결됨 ({totalArticles.toLocaleString()}건)</span>
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">{t('status_raw', currentLang)}:</span>
            <span className="font-bold text-amber-400 font-mono">{totalRaw.toLocaleString()}건</span>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">{t('status_processed', currentLang)}:</span>
            <span className="font-bold text-emerald-400 font-mono">
              {totalProcessed.toLocaleString()}건 / {totalArticles.toLocaleString()}건
            </span>
          </div>
        </div>
      </div>

      {/* Prompts Section: Dedicated DB vs Excel Prompt Provider */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="flex items-center space-x-2">
            <Bot className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">ChatGPT 프롬프트 제공 및 5인 에이전트 지침</h3>
          </div>

          {/* Prompt Mode Toggle */}
          <div className="flex items-center space-x-1 p-1 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl text-xs">
            <button
              onClick={() => setPromptViewMode('DB_MCP')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                promptViewMode === 'DB_MCP'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              DB 직결 / MCP 방식 프롬프트
            </button>
            <button
              onClick={() => setPromptViewMode('EXCEL')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                promptViewMode === 'EXCEL'
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              엑셀 일괄 방식 프롬프트
            </button>
          </div>
        </div>

        {promptViewMode === 'DB_MCP' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">
                기본 프로시저: <strong>1기사씩 순차 진행 → Topic(영문) → Title(KO/EN/RW) → 3줄 Summary(KO/EN/RW) → Reparagraphed Body(KO/EN/RW) → DB 저장 및 flag 검증</strong>
              </span>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(getGeneralDbPrompt());
                  setCopiedGeneralPrompt(true);
                  setTimeout(() => setCopiedGeneralPrompt(false), 3000);
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center space-x-1.5 transition-all shadow-sm"
              >
                {copiedGeneralPrompt ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedGeneralPrompt ? t('btn_copied', currentLang) : 'DB 방식 프롬프트 복사'}</span>
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-primary)] leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap select-all">
              {getGeneralDbPrompt()}
            </pre>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">
                엑셀 패키지 방식: 엑셀 파일(25개 단위)을 다운로드하여 ChatGPT에 첨부 시 사용하는 시스템 프롬프트입니다.
              </span>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(getExcelPrompt());
                  setCopiedGeneralPrompt(true);
                  setTimeout(() => setCopiedGeneralPrompt(false), 3000);
                }}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:opacity-90 text-white font-bold flex items-center space-x-1.5 transition-all shadow-sm"
              >
                {copiedGeneralPrompt ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedGeneralPrompt ? t('btn_copied', currentLang) : '엑셀 방식 프롬프트 복사'}</span>
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-primary)] leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap select-all">
              {getExcelPrompt()}
            </pre>
          </div>
        )}
      </div>

      {/* 30-item Batch Groups Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm space-y-3 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>{t('batch_table_title', currentLang)}</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {t('batch_table_desc', currentLang)}
            </p>
          </div>

          {/* Filtering Interface and Refresh Button */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center space-x-1.5 p-1 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl text-xs">
              <button
                onClick={() => setGroupFilter('ALL')}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  groupFilter === 'ALL'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-white'
                }`}
              >
                {t('filter_all', currentLang)} ({groups.length})
              </button>
              <button
                onClick={() => setGroupFilter('UNPROCESSED')}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  groupFilter === 'UNPROCESSED'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-white'
                }`}
              >
                {t('filter_all', currentLang) === 'All' ? 'Pending' : '미처리/진행중'} ({unprocessedGroupsCount})
              </button>
              <button
                onClick={() => setGroupFilter('DONE')}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  groupFilter === 'DONE'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-white'
                }`}
              >
                {t('status_done', currentLang)} ({completedGroupsCount})
              </button>
            </div>

            {/* Refresh & Re-partition Button */}
            <button
              onClick={async () => {
                await loadGroups();
                await loadSupabaseStatus();
                if (selectedGroupNumber) await loadGroupArticles(selectedGroupNumber);
              }}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] hover:border-emerald-500 text-xs font-semibold text-[var(--text-primary)] hover:text-emerald-400 flex items-center space-x-1.5 transition-all shadow-sm cursor-pointer"
              title="현황 새로고침 및 전체 5인 에이전트 업무 재편성"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t('btn_refresh_repartition', currentLang)}</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-main)] border-b border-[var(--border)] text-[var(--text-secondary)] font-semibold">
              <tr>
                <th className="p-3.5">{t('col_group_agent', currentLang)}</th>
                <th className="p-3.5">{t('col_number_range', currentLang)}</th>
                <th className="p-3.5 text-center">{t('col_total_articles', currentLang)}</th>
                <th className="p-3.5 text-center">{t('col_raw_articles', currentLang)}</th>
                <th className="p-3.5 text-center">{t('col_processed_articles', currentLang)}</th>
                <th className="p-3.5 text-center">{t('col_status', currentLang)}</th>
                <th className="p-3.5 text-right">{t('col_agent_action', currentLang)}</th>
                {/* 150-Item Batch Topic Action Column (Right of Agent Actions, 1 per 5 rows) */}
                <th className="p-3.5 text-center w-36 border-l border-[var(--border)]">{t('col_batch_150_topic', currentLang)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
              {filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs text-[var(--text-secondary)]">
                    {groupFilter === 'UNPROCESSED'
                      ? '미처리 기사 그룹이 없습니다. 모든 기사가 처리 완료되었습니다!'
                      : groupFilter === 'DONE'
                      ? '완료된 기사 그룹이 아직 없습니다.'
                      : '기사 그룹을 불러오는 중입니다...'}
                  </td>
                </tr>
              ) : (
                filteredGroups.map((grp, idx) => {
                  const isSelected = selectedGroupNumber === grp.group_number;
                  const isCopied = copiedPromptGroup === grp.group_number;
                  const agentBadge = getAgentBadge(grp.agent_number);

                  // 150-article batch calculation: 1 button per 5 rows
                  const isBatchStart = idx % 5 === 0;
                  const batchIndex = Math.floor((grp.group_number - 1) / 5) + 1;
                  const batchSpan = Math.min(5, filteredGroups.length - idx);

                  return (
                    <tr
                      key={grp.group_number}
                      onClick={() => setSelectedGroupNumber(grp.group_number)}
                      className={`cursor-pointer transition-colors relative ${
                        isSelected
                          ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
                          : 'hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {/* Group & 5-Agent Rotation */}
                      <td className="p-3.5 font-bold">
                        <div className="flex items-center space-x-2">
                          <span className="w-6 h-6 rounded-lg bg-[var(--bg-main)] border border-[var(--border)] flex items-center justify-center text-[10px] font-mono text-[var(--text-secondary)]">
                            {grp.group_number}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center space-x-1.5 ${agentBadge.bg}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${agentBadge.dot}`}></span>
                            <span>{agentBadge.name}</span>
                          </span>
                        </div>
                      </td>

                      {/* Numbering range in #YYMMDD-번호 */}
                      <td className="p-3.5 font-mono font-bold text-indigo-400">
                        {grp.number_range || `${grp.start_code} ~ ${grp.end_code}`}
                      </td>

                      {/* Total */}
                      <td className="p-3.5 text-center font-bold">{grp.total_items}</td>

                      {/* RAW count */}
                      <td className="p-3.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-bold ${
                            grp.raw_items > 0
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {grp.raw_items}
                        </span>
                      </td>

                      {/* PROCESSED count */}
                      <td className="p-3.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-bold ${
                            grp.processed_items === grp.total_items
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : grp.processed_items > 0
                              ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {grp.processed_items}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="p-3.5 text-center">
                        {grp.status === 'DONE' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{t('status_done', currentLang)}</span>
                          </span>
                        )}
                        {grp.status === 'IN_PROGRESS' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 inline-flex items-center space-x-1">
                            <Play className="w-2.5 h-2.5" />
                            <span>{t('status_in_progress', currentLang)}</span>
                          </span>
                        )}
                        {grp.status === 'PENDING' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-500/15 text-gray-400 border border-gray-500/30">
                            {t('status_pending', currentLang)}
                          </span>
                        )}
                      </td>

                      {/* Actions & Info Tooltip - Compact Icons with Tooltips */}
                      <td className="p-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end space-x-1.5">
                          {/* 1) Info Icon with Tooltip showing Article ID range & details */}
                          <div className="relative group/info">
                            <button
                              type="button"
                              className="p-1.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-indigo-400 hover:border-indigo-400 transition-colors"
                              title="기사 ID 범위 및 상세 정보 보기"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>

                            <div className="absolute right-0 bottom-full mb-2 hidden group-hover/info:block z-50 w-72 p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl text-left text-[11px] pointer-events-none space-y-1.5 text-[var(--text-primary)]">
                              <div className="font-bold text-indigo-300 flex items-center space-x-1">
                                <Info className="w-3.5 h-3.5" />
                                <span>그룹 #{grp.group_number} ({agentBadge.name}) 상세</span>
                              </div>
                              <div className="font-mono text-[10px] bg-[var(--bg-main)] p-2 rounded border border-[var(--border)] space-y-1">
                                <div><span className="text-[var(--text-secondary)]">기사 ID 범위:</span> {grp.first_article_id} ~ {grp.last_article_id}</div>
                                <div><span className="text-[var(--text-secondary)]">넘버링:</span> {grp.number_range}</div>
                                <div><span className="text-[var(--text-secondary)]">배정:</span> 총 {grp.total_items}건 (미처리 {grp.raw_items} / 완료 {grp.processed_items})</div>
                              </div>
                              <div className="text-[10px] text-[var(--text-secondary)]">
                                출처: {Object.entries(grp.source_summary).map(([k, v]) => `${k}(${v})`).join(', ')}
                              </div>
                            </div>
                          </div>

                          {/* 2) Copy Prompt Icon Button with Tooltip */}
                          <div className="relative group/prompt">
                            <button
                              type="button"
                              onClick={() => handleCopyPrompt(grp.group_number)}
                              className={`p-1.5 rounded-lg border transition-all ${
                                isCopied
                                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                                  : 'bg-[var(--bg-main)] border-[var(--border)] text-emerald-400 hover:border-emerald-500 hover:bg-emerald-500/10'
                              }`}
                              title={`${agentBadge.name} 프롬프트 복사`}
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Bot className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <div className="absolute right-0 bottom-full mb-2 hidden group-hover/prompt:block z-50 whitespace-nowrap px-2.5 py-1 bg-black/90 text-white text-[11px] rounded-lg shadow-xl pointer-events-none border border-[var(--border)]">
                              {isCopied ? t('btn_copied', currentLang) : `${agentBadge.name} ${t('btn_copy_agent_prompt', currentLang)}`}
                            </div>
                          </div>

                          {/* 3) View 30 Articles Icon Button with Tooltip */}
                          <div className="relative group/view">
                            <button
                              type="button"
                              onClick={() => setSelectedGroupNumber(grp.group_number)}
                              className={`p-1.5 rounded-lg border transition-all ${
                                isSelected
                                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                  : 'bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)]'
                              }`}
                              title={`그룹 #${grp.group_number} 기사 30개 상세 목록 보기`}
                            >
                              <Layers className="w-3.5 h-3.5" />
                            </button>

                            <div className="absolute right-0 bottom-full mb-2 hidden group-hover/view:block z-50 whitespace-nowrap px-2.5 py-1 bg-black/90 text-white text-[11px] rounded-lg shadow-xl pointer-events-none border border-[var(--border)]">
                              그룹 #{grp.group_number} 담당 기사 30개 상세 보기
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 150-Item Batch Topic Action: 1 per 5 rows spanning 5 rows */}
                      {isBatchStart && (
                        <td
                          rowSpan={batchSpan}
                          className="p-3 text-center border-l border-[var(--border)] align-middle bg-[var(--bg-main)]/40"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-col items-center justify-center space-y-1.5 p-2 rounded-xl border border-purple-500/30 bg-purple-500/10">
                            <div className="flex items-center space-x-1 text-purple-300 font-bold text-[11px]">
                              <Tag className="w-3.5 h-3.5" />
                              <span>150개 Topic</span>
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                              그룹 #{grp.group_number}~#{Math.min(grp.group_number + 4, groups.length)}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyTopicPrompt(batchIndex)}
                              className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] inline-flex items-center space-x-1 shadow-sm transition-all"
                              title={t('btn_150_topic_tooltip', currentLang)}
                            >
                              {copiedTopicBatch === batchIndex ? (
                                <Check className="w-3 h-3 text-white" />
                              ) : (
                                <Copy className="w-3 h-3 text-white" />
                              )}
                              <span>{copiedTopicBatch === batchIndex ? t('btn_copied', currentLang) : t('btn_150_topic_prompt', currentLang)}</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Group Detailed 30 Articles View */}
      {selectedGroupNumber && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold border inline-flex items-center space-x-1.5 ${selectedAgentBadge.bg}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${selectedAgentBadge.dot}`}></span>
                  <span>{selectedAgentBadge.name}</span>
                </span>
                <span>{t('detail_table_title', currentLang)} (그룹 #{selectedGroupNumber} · 30개 단위)</span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[11px] font-mono">
                  {selectedGroup?.number_range || `Group #${selectedGroupNumber}`}
                </span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {t('detail_table_desc', currentLang)}
              </p>
            </div>

            <div className="flex items-center space-x-2 self-start sm:self-auto">
              {/* Refresh icon button for Agent Detailed Articles List */}
              <button
                onClick={() => loadGroupArticles(selectedGroupNumber)}
                disabled={articlesLoading}
                className="p-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] hover:border-emerald-500 text-[var(--text-secondary)] hover:text-emerald-400 transition-colors cursor-pointer"
                title={t('btn_refresh', currentLang)}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${articlesLoading ? 'animate-spin text-emerald-400' : ''}`} />
              </button>

              <button
                onClick={() => handleCopyPrompt(selectedGroupNumber)}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5 transition-all shadow-sm"
              >
                {copiedPromptGroup === selectedGroupNumber ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{selectedAgentBadge.name} {t('btn_copy_agent_prompt', currentLang)}</span>
              </button>
            </div>
          </div>

          {articlesLoading ? (
            <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
              기사 목록을 불러오는 중입니다...
            </div>
          ) : selectedGroupArticles.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
              해당 그룹에 기사가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-main)] border-b border-[var(--border)] text-[var(--text-secondary)] font-semibold">
                  <tr>
                    <th className="p-3 w-32">{t('col_numbering', currentLang)}</th>
                    <th className="p-3 w-36">{t('col_source_date', currentLang)}</th>
                    <th className="p-3 min-w-[280px]">{t('col_original_title', currentLang)}</th>
                    <th className="p-3 text-center w-36">{t('col_3lang_translation', currentLang)}</th>
                    <th className="p-3 text-center w-28">{t('col_processing_flag', currentLang)}</th>
                    <th className="p-3 text-right w-20">{t('col_preview', currentLang)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
                  {selectedGroupArticles.map((art) => (
                    <tr key={art.article_id} className="hover:bg-[var(--bg-hover)] transition-colors">
                      {/* Formatted Numbering */}
                      <td className="p-3 font-mono font-bold text-indigo-400">
                        <div>{art.article_number}</div>
                        <div className="text-[10px] text-[var(--text-secondary)] font-normal">
                          {art.group_index}/30
                        </div>
                      </td>

                      {/* Source & Date */}
                      <td className="p-3 space-y-0.5">
                        <div className="font-semibold text-[11px]">{art.source_name}</div>
                        <div className="text-[10px] text-[var(--text-secondary)]">
                          {(art.published_at || '').slice(0, 10)}
                        </div>
                      </td>

                      {/* Multi-line Title without truncation */}
                      <td className="p-3 min-w-[280px] max-w-lg whitespace-normal break-words leading-relaxed text-xs font-medium">
                        <a
                          href={art.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-[var(--accent)] hover:underline inline-flex items-baseline space-x-1"
                        >
                          <span>{art.original_title}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60 inline ml-1" />
                        </a>
                      </td>

                      {/* 3-Language Translation with Tooltip Word Counts */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center justify-center space-x-1 font-mono text-[10px]">
                          {/* KO Badge */}
                          <div className="relative group/ko">
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold cursor-help transition-colors ${
                                art.has_ko
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                              }`}
                            >
                              KO {art.has_ko ? '✓' : '-'}
                            </span>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/ko:block z-50 whitespace-nowrap px-2.5 py-1 bg-black/90 text-white text-[11px] rounded-lg shadow-xl pointer-events-none border border-[var(--border)]">
                              {art.has_ko ? `한국어 번역 완료: 총 ${art.word_count_ko ?? 0}단어` : '한국어 번역 미완료'}
                            </div>
                          </div>

                          {/* EN Badge */}
                          <div className="relative group/en">
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold cursor-help transition-colors ${
                                art.has_en
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                  : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                              }`}
                            >
                              EN {art.has_en ? '✓' : '-'}
                            </span>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/en:block z-50 whitespace-nowrap px-2.5 py-1 bg-black/90 text-white text-[11px] rounded-lg shadow-xl pointer-events-none border border-[var(--border)]">
                              {art.has_en ? `영어 번역 완료: 총 ${art.word_count_en ?? 0} words` : '영어 번역 미완료'}
                            </div>
                          </div>

                          {/* RW Badge */}
                          <div className="relative group/rw">
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold cursor-help transition-colors ${
                                art.has_rw
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                  : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                              }`}
                            >
                              RW {art.has_rw ? '✓' : '-'}
                            </span>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/rw:block z-50 whitespace-nowrap px-2.5 py-1 bg-black/90 text-white text-[11px] rounded-lg shadow-xl pointer-events-none border border-[var(--border)]">
                              {art.has_rw ? `키냐르완다어 번역 완료: 총 ${art.word_count_rw ?? 0} words` : '르완다어 번역 미완료'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Processing Flag */}
                      <td className="p-3 text-center">
                        {art.processing_status === 'PROCESSED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>PROCESSED</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            RAW
                          </span>
                        )}
                      </td>

                      {/* Preview Icon with Hover Tooltip */}
                      <td className="p-3 text-right relative">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() => setPreviewArticle(art)}
                            onMouseEnter={() => setHoveredArticlePreview(art.article_id)}
                            onMouseLeave={() => setHoveredArticlePreview(null)}
                            className="p-1.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border)] hover:border-indigo-400 text-indigo-400 hover:text-white transition-all shadow-sm"
                            title="기사 미리보기 열기"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Hover Preview Tooltip Card */}
                          {hoveredArticlePreview === art.article_id && (
                            <div className="absolute right-0 bottom-full mb-2 z-50 w-80 p-3.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl text-left text-[11px] pointer-events-none space-y-2 text-[var(--text-primary)]">
                              <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
                                <span className="font-mono text-indigo-300 font-bold">{art.article_number}</span>
                                <span className="text-[10px] text-[var(--text-secondary)]">{art.source_name}</span>
                              </div>
                              <h4 className="font-bold text-xs leading-snug line-clamp-2">{art.original_title}</h4>
                              <p className="text-[11px] text-[var(--text-secondary)] line-clamp-4 leading-relaxed font-mono bg-[var(--bg-main)] p-2 rounded border border-[var(--border)]">
                                {art.original_body?.slice(0, 260) || '(본문 없음)'}...
                              </p>
                              <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] pt-1">
                                <span>원문: {art.original_word_count ?? 0}단어</span>
                                <span className="text-emerald-400 font-semibold">클릭하여 전체 보기</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Article Detail / Translation Preview Modal */}
      {previewArticle && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-[var(--border)] bg-[var(--bg-main)] flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono text-indigo-400 font-bold">
                  {previewArticle.article_number} (Agent #{selectedAgentNum}) · {previewArticle.article_id}
                </span>
                <h3 className="text-sm font-bold text-[var(--text-primary)] mt-1">{previewArticle.original_title}</h3>
              </div>
              <button
                onClick={() => setPreviewArticle(null)}
                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 text-[11px] text-[var(--text-secondary)] bg-[var(--bg-main)] p-3 rounded-xl border border-[var(--border)]">
                <div>출처: <span className="font-semibold text-[var(--text-primary)]">{previewArticle.source_name}</span></div>
                <div>작성일자: <span className="font-semibold text-[var(--text-primary)]">{previewArticle.published_at?.slice(0, 16)}</span></div>
                <div>상태: <span className="font-bold text-emerald-400">{previewArticle.processing_status}</span></div>
                <div>
                  원문 링크: <a href={previewArticle.source_url} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline inline-flex items-center space-x-1"><span>원문 사이트 열기</span><ExternalLink className="w-2.5 h-2.5 ml-1" /></a>
                </div>
              </div>

              {/* Translation Status Badges with Word Counts */}
              <div className="p-3 bg-[var(--bg-main)] rounded-xl border border-[var(--border)] space-y-2">
                <span className="text-[11px] font-bold text-[var(--text-secondary)]">3개 국어 번역 현황 및 단어 수:</span>
                <div className="grid grid-cols-3 gap-2">
                  <div className={`p-2.5 rounded-lg border text-center ${previewArticle.has_ko ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-gray-500/10 border-gray-500/20 text-gray-400'}`}>
                    <div className="font-bold">한국어 (KO)</div>
                    <div className="text-[10px] font-mono mt-0.5">{previewArticle.has_ko ? `${previewArticle.word_count_ko ?? 0}단어` : '미완료'}</div>
                  </div>
                  <div className={`p-2.5 rounded-lg border text-center ${previewArticle.has_en ? 'bg-blue-500/10 border-blue-500/30 text-blue-300' : 'bg-gray-500/10 border-gray-500/20 text-gray-400'}`}>
                    <div className="font-bold">영어 (EN)</div>
                    <div className="text-[10px] font-mono mt-0.5">{previewArticle.has_en ? `${previewArticle.word_count_en ?? 0} words` : '미완료'}</div>
                  </div>
                  <div className={`p-2.5 rounded-lg border text-center ${previewArticle.has_rw ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' : 'bg-gray-500/10 border-gray-500/20 text-gray-400'}`}>
                    <div className="font-bold">르완다어 (RW)</div>
                    <div className="text-[10px] font-mono mt-0.5">{previewArticle.has_rw ? `${previewArticle.word_count_rw ?? 0} words` : '미완료'}</div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-[var(--text-primary)] mb-1">원문 본문 (Original Body - {previewArticle.original_word_count ?? 0}단어)</h4>
                <div className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] font-mono text-[11px] whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed text-[var(--text-secondary)]">
                  {previewArticle.original_body}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-main)] flex justify-end">
              <button
                onClick={() => setPreviewArticle(null)}
                className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-xs font-semibold hover:border-emerald-500"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supabase Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Supabase 데이터베이스 연결 정보</span>
              </h3>
              <button onClick={() => setShowConfigModal(false)} className="text-[var(--text-secondary)] hover:text-white">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] font-semibold mb-1">Supabase Project URL</label>
                <input
                  type="text"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder={supabaseStatus?.config?.url || 'https://xxxxxxxx.supabase.co'}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] focus:border-emerald-500 font-mono text-xs text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-semibold mb-1">Supabase API Key</label>
                <input
                  type="password"
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  placeholder="••••••••••••••••••••••••••••••••"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] focus:border-emerald-500 font-mono text-xs text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-3.5 py-1.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] text-xs font-semibold"
              >
                닫기
              </button>
              <button
                onClick={handleSaveSupabaseConfig}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                저장 및 확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
