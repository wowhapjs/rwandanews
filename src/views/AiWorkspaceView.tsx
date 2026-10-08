import React, { useState, useEffect } from 'react';
import { AiBatch, IntegratedArticle, Article } from '../types';
import { api } from '../lib/api';
import {
  Layers,
  Upload,
  Download,
  Copy,
  Check,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  FileText,
  Clock,
  Sparkles,
  ExternalLink,
  Package,
  Files,
  RefreshCw,
  Filter,
  Trash2,
  Loader2,
  RotateCcw,
  Database
} from 'lucide-react';
import { SupabaseMcpWorkspace } from '../components/SupabaseMcpWorkspace';
import { t } from '../lib/i18n';

interface AiWorkspaceViewProps {
  onSelectArticle: (articleId: string) => void;
  onOpenIntegratedModal: (integratedArticleId: string) => void;
  onOpenEventInbox: () => void;
  currentLang?: string;
}


type BinaryDownloadKind = 'zip' | 'xlsx';

function getDownloadFilename(
  contentDisposition: string | null,
  fallbackFilename: string
): string {
  if (!contentDisposition) return fallbackFilename;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/["']/g, '').trim());
    } catch {
      // Fall through to the regular filename parser.
    }
  }

  const regularMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return regularMatch?.[1]?.trim() || fallbackFilename;
}

async function downloadBinaryFile(
  url: string,
  fallbackFilename: string,
  kind: BinaryDownloadKind
): Promise<void> {
  const expectedMime =
    kind === 'zip'
      ? 'application/zip'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: `${expectedMime}, application/octet-stream;q=0.9, */*;q=0.1`
    }
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Download failed (${response.status} ${response.statusText})`
      + (errorText ? `: ${errorText.slice(0, 300)}` : '')
    );
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (
    contentType.includes('text/html')
    || contentType.includes('application/json')
  ) {
    const preview = new TextDecoder()
      .decode(bytes.slice(0, Math.min(bytes.length, 500)))
      .replace(/\s+/g, ' ')
      .trim();

    throw new Error(
      `Expected ${kind.toUpperCase()} but the server returned ${contentType || 'text content'}.`
      + (preview ? ` Response: ${preview.slice(0, 240)}` : '')
    );
  }

  /**
   * XLSX files are ZIP containers too, so both valid .zip and .xlsx downloads
   * must start with the standard PK signature.
   */
  const hasPkSignature =
    bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && (
      (bytes[2] === 0x03 && bytes[3] === 0x04)
      || (bytes[2] === 0x05 && bytes[3] === 0x06)
      || (bytes[2] === 0x07 && bytes[3] === 0x08)
    );

  if (!hasPkSignature) {
    const preview = new TextDecoder()
      .decode(bytes.slice(0, Math.min(bytes.length, 300)))
      .replace(/\s+/g, ' ')
      .trim();

    throw new Error(
      `The downloaded response is not a valid ${kind.toUpperCase()} file.`
      + (preview ? ` Response starts with: ${preview.slice(0, 180)}` : '')
    );
  }

  const filename = getDownloadFilename(
    response.headers.get('content-disposition'),
    fallbackFilename
  );

  const blob = new Blob([arrayBuffer], {
    type: contentType || expectedMime
  });

  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }
}

export const AiWorkspaceView: React.FC<AiWorkspaceViewProps> = ({
  onSelectArticle,
  onOpenIntegratedModal,
  onOpenEventInbox,
  currentLang = 'original'
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'SUPABASE_MCP' | 'BATCHES' | 'IMPORT' | 'INTEGRATED'>('SUPABASE_MCP');
  const [metrics, setMetrics] = useState<any>(null);
  const [batches, setBatches] = useState<AiBatch[]>([]);
  const [integratedArticles, setIntegratedArticles] = useState<IntegratedArticle[]>([]);
  const [pendingArticles, setPendingArticles] = useState<Article[]>([]);
  const [selectedArtIds, setSelectedArtIds] = useState<string[]>([]);
  const [includeProcessed, setIncludeProcessed] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [groupingMessage, setGroupingMessage] = useState<string | null>(null);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null);
  const [isDeletingBatches, setIsDeletingBatches] = useState(false);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);

  // Progress Bar state for 100 Excel files ZIP generation
  const [exportProgress, setExportProgress] = useState<{
    active: boolean;
    jobId: string | null;
    progress: number;
    current: number;
    total: number;
    message: string;
    status: 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
    downloadZipUrl?: string;
    zipFilename?: string;
  }>({
    active: false,
    jobId: null,
    progress: 0,
    current: 0,
    total: 0,
    message: '',
    status: 'IDLE'
  });

  // Multi-file import state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const loadData = () => {
    api.getAiMetrics().then(res => setMetrics(res));
    api.getAiBatches().then(res => setBatches(res.batches || []));
    api.getIntegratedArticles().then(res => setIntegratedArticles(res.articles || []));
    api.getArticles({ limit: 100, sort: 'newest' }).then(res => {
      // Filter RAW, EXPORT_READY, PARTIAL, or PROCESSED if includeProcessed is true
      const pending = (res.articles || []).filter(
        a => includeProcessed ||
          a.processing_status === 'RAW' ||
          a.processing_status === 'EXPORT_READY' ||
          a.processing_status === 'PARTIAL'
      );
      setPendingArticles(pending);
    });
  };

  useEffect(() => {
    loadData();
  }, [includeProcessed]);

  const handleExportArticles = async () => {
    const targetIds = selectedArtIds.length > 0
      ? selectedArtIds
      : pendingArticles.map(a => a.article_id).slice(0, 25);

    if (targetIds.length === 0) {
      alert('No articles selected for export.');
      return;
    }

    try {
      const res = await api.createArticleBatch(targetIds, undefined, includeProcessed);
      alert(`Created AI Batch (${res.itemCount} articles). Downloading Excel workbook...`);

      await downloadBinaryFile(
        res.downloadUrl,
        res.filename || 'AI_ARTICLE_BATCH.xlsx',
        'xlsx'
      );

      setSelectedArtIds([]);
      loadData();
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    }
  };

  const handleExportMultiBatchZip = async () => {
    setIsExportingZip(true);
    setExportProgress({
      active: true,
      jobId: null,
      progress: 1,
      current: 0,
      total: 100,
      message: 'Initializing multi-file export engine (preparing 100 Excel workbooks)...',
      status: 'PROCESSING'
    });

    try {
      const targetIds = selectedArtIds.length > 0 ? selectedArtIds : undefined;
      const startRes = await api.startMultiArticleBatchExport({
        articleIds: targetIds,
        chunkSize: 25,
        targetTotal: targetIds ? targetIds.length : 2500,
        includeProcessed
      });

      if (!startRes.success) {
        throw new Error(startRes.message || 'Failed to initialize export package');
      }

      const jobId = startRes.jobId;
      setExportProgress(prev => ({
        ...prev,
        jobId,
        total: startRes.totalChunks,
        message: `Packaging started for ${startRes.totalChunks} Excel files...`
      }));

      // Poll progress every 350ms
      const pollTimer = setInterval(async () => {
        try {
          const job = await api.getMultiArticleBatchProgress(jobId);
          if (!job) return;

          setExportProgress({
            active: true,
            jobId,
            progress: job.progress,
            current: job.current,
            total: job.total,
            message: job.message || `Generating Excel files (${job.current}/${job.total})...`,
            status: job.status,
            downloadZipUrl: job.result?.downloadZipUrl,
            zipFilename: job.result?.zipFilename
          });

          if (job.status === 'COMPLETED') {
            clearInterval(pollTimer);
            setIsExportingZip(false);
            setSelectedArtIds([]);
            loadData();

            // Automatically download through fetch -> validated binary -> Blob.
            // Direct <a href> navigation can be intercepted by hosted preview/auth
            // layers and save an HTML login/cookie page with a .zip extension.
            if (job.result?.downloadZipUrl) {
              try {
                await downloadBinaryFile(
                  job.result.downloadZipUrl,
                  job.result.zipFilename || 'AI_BATCH_PACKAGE.zip',
                  'zip'
                );
              } catch (downloadErr: any) {
                console.error('Automatic ZIP download failed:', downloadErr);

                setExportProgress(prev => ({
                  ...prev,
                  message:
                    `Package was created, but automatic download failed: `
                    + `${downloadErr?.message || 'Unknown download error'}. `
                    + `Use "Download ZIP Again" to retry.`
                }));

                alert(
                  `ZIP package was created, but the browser did not receive a valid ZIP file.\n\n`
                  + `${downloadErr?.message || 'Unknown download error'}`
                );
              }
            }
          } else if (job.status === 'ERROR') {
            clearInterval(pollTimer);
            setIsExportingZip(false);
            alert(`Batch packaging error: ${job.error || job.message}`);
          }
        } catch (pollErr) {
          console.error('Progress poll error:', pollErr);
        }
      }, 350);

    } catch (err: any) {
      setIsExportingZip(false);
      setExportProgress(prev => ({
        ...prev,
        status: 'ERROR',
        message: err.message || 'Failed to start export'
      }));
      alert(`Export multi-batch error: ${err.message}`);
    }
  };

  const executeDeleteAllBatches = async () => {
    setIsDeletingBatches(true);
    try {
      const res = await api.deleteAllAiBatches();
      setBatchNotice(`모든 AI Article Package가 삭제되었습니다 (${res.count}개 삭제, ${(res as any).resetArticles ?? 0}개 기사 RAW 복원).`);
      setTimeout(() => setBatchNotice(null), 5000);
      setShowDeleteAllConfirm(false);
      loadData();
    } catch (err: any) {
      setBatchNotice(`패키지 삭제 실패: ${err.message}`);
    } finally {
      setIsDeletingBatches(false);
    }
  };

  const executeDeleteSingleBatch = async (batchId: string) => {
    try {
      const res = await api.deleteAiBatch(batchId);
      setBatchNotice(`패키지 (${batchId}) 삭제 완료 (${(res as any).resetArticles ?? 0}개 기사 RAW 복원)`);
      setTimeout(() => setBatchNotice(null), 4000);
      setBatchToDelete(null);
      loadData();
    } catch (err: any) {
      setBatchNotice(`삭제 실패: ${err.message}`);
    }
  };

  const handleResetExported = async () => {
    try {
      const res = await api.resetExportedArticles();
      setBatchNotice(`복원 완료: ${res.resetCount}개의 EXPORTED 기사가 RAW 상태로 복원되었습니다.`);
      setTimeout(() => setBatchNotice(null), 5000);
      loadData();
    } catch (err: any) {
      alert(`상태 초기화 실패: ${err.message}`);
    }
  };

  const handleGroupSimilar = async () => {
    setGroupingMessage('Grouping similar articles and examining titles & dates...');
    try {
      const targetIds = selectedArtIds.length > 0 ? selectedArtIds : undefined;
      const res = await api.groupSimilarArticles(targetIds);
      setGroupingMessage(res.message || 'Successfully updated article relations and chronological links!');
      setTimeout(() => setGroupingMessage(null), 6000);
      loadData();
    } catch (err: any) {
      alert(`Grouping failed: ${err.message}`);
      setGroupingMessage(null);
    }
  };

  const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setUploadFiles(files);
    setImportSuccess(null);

    // Run multi-file preview
    try {
      const res = await api.previewMultiExcelImport(files);
      setPreviewResult(res.preview);
    } catch (err: any) {
      alert(`Error reading files: ${err.message}`);
    }
  };

  const handleCommitImport = async () => {
    if (uploadFiles.length === 0) return;
    setImporting(true);
    try {
      const res = await api.commitMultiExcelImport(uploadFiles);
      if (res.success) {
        setImportSuccess(`Successfully imported ${res.importedCount} articles across ${res.fileCount || uploadFiles.length} files! Database relations and re-paragraphed text updated.`);
        setPreviewResult(null);
        setUploadFiles([]);
        loadData();
      } else {
        alert(`Import errors: ${(res.errors || []).join(', ')}`);
      }
    } catch (err: any) {
      alert(`Failed to commit import: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const copyPromptText = () => {
    const prompt = `Please act as a senior multilingual news intelligence editor. I have attached Excel workbook(s) containing raw collected news articles in the INPUT and CONTENT_BLOCKS sheets. Process all articles strictly following the instructions in the INSTRUCTIONS sheet:

1. MANDATORY AI NATIVE TRANSLATION (NO TRANSLATION APIs):
Do NOT use mechanical translation APIs or word-for-word translation tools (such as Google Translate). Perform natural, idiomatic, high-quality AI native translations into Korean (OUTPUT_KO), English (OUTPUT_EN), and Kinyarwanda (OUTPUT_RW) with professional journalistic tone.

2. DIRECT RE-PARAGRAPHING (NO SEPARATE reparagraphed_body COLUMNS):
Write the re-paragraphed text directly into body_ko, body_en, and body_rw with clean, well-spaced paragraphs (3-5 sentences each separated by double line breaks). Even if an article is already in English or Korean, re-paragraph directly into body_* for optimal readability.

3. SCANNED DOCUMENT PHOTOS:
If an article has no body text but contains scanned document photos (see document_images/ or image URLs in INPUT), read the document text, draft a complete news article in body_*, and formulate descriptive headlines instead of generic placeholder titles (e.g. 'Name change request').

4. SIMILAR ARTICLES, TAGS & EVENTS:
Link contemporaneous similar articles and chronological background/future articles in SIMILAR_ARTICLES, extract multilingual concept tags in ARTICLE_TAGS, and detect event candidates in EVENT_CANDIDATES.

5. PRESERVE ALL IDs:
Keep article_id, block_id, and image_id unchanged. Return the completed Excel workbook(s) for download.`;
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Overview Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 space-y-1">
          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">{t('ai_metric_raw', currentLang)}</div>
          <div className="text-xl font-bold text-amber-400">{metrics?.articles?.raw ?? 0}</div>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 space-y-1">
          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">{t('ai_metric_exported', currentLang)}</div>
          <div className="text-xl font-bold text-blue-400">{metrics?.articles?.exported ?? 0}</div>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 space-y-1">
          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">{t('ai_metric_partial', currentLang)}</div>
          <div className="text-xl font-bold text-purple-400">{metrics?.articles?.partial ?? 0}</div>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 space-y-1">
          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">{t('ai_metric_processed', currentLang)}</div>
          <div className="text-xl font-bold text-green-400">{metrics?.articles?.processed ?? 0}</div>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 space-y-1">
          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">{t('ai_metric_batches', currentLang)}</div>
          <div className="text-xl font-bold text-[var(--text-primary)]">{metrics?.batches ?? 0}</div>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 space-y-1">
          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">{t('ai_metric_url_inbox', currentLang)}</div>
          <div className="text-xl font-bold text-cyan-400">{metrics?.queuedUrls ?? 0}</div>
        </div>
      </div>

      {groupingMessage && (
        <div className="p-3 bg-[var(--bg-card)] border border-[var(--accent)]/50 rounded-xl text-xs text-[var(--text-primary)] flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <span>{groupingMessage}</span>
          </div>
          <button onClick={() => setGroupingMessage(null)} className="text-xs text-[var(--text-secondary)] hover:text-white cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-2 text-xs">
        <button
          onClick={() => setActiveSubTab('SUPABASE_MCP')}
          className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all flex items-center space-x-1.5 shadow-sm cursor-pointer ${
            activeSubTab === 'SUPABASE_MCP'
              ? 'bg-emerald-600 text-white'
              : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>{t('ai_tab_mcp', currentLang)}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('BATCHES')}
          className={`px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer ${
            activeSubTab === 'BATCHES'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)]'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>{t('ai_tab_export_batches', currentLang)}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('IMPORT')}
          className={`px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer ${
            activeSubTab === 'IMPORT'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{t('ai_tab_import_workbooks', currentLang)}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('INTEGRATED')}
          className={`px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer ${
            activeSubTab === 'INTEGRATED'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{t('ai_tab_integrated_articles', currentLang)} ({integratedArticles.length})</span>
        </button>
      </div>

      {/* SubTab 0: Supabase DB & ChatGPT MCP */}
      {activeSubTab === 'SUPABASE_MCP' && (
        <SupabaseMcpWorkspace currentLang={currentLang} />
      )}

      {/* SubTab 1: Export Batches & Prompt Copy */}
      {activeSubTab === 'BATCHES' && (
        <div className="space-y-6">
          {/* Instructions and Copy Prompt Box */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-[var(--accent)] uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>ChatGPT Offline Multi-Batch Processing Workflow</span>
              </div>
              <button
                onClick={copyPromptText}
                className="px-3 py-1.5 rounded-md bg-[var(--bg-hover)] hover:bg-[var(--accent)] hover:text-white text-xs font-semibold text-[var(--text-primary)] flex items-center space-x-1.5 transition-colors"
              >
                {copiedPrompt ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPrompt ? 'Copied Prompt!' : 'Copy ChatGPT Instructions Prompt'}</span>
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Export raw and processed articles into automated Excel workbooks (25 articles each) to respect ChatGPT context windows. Even if the language is the same as the original article, columns will be updated with re-paragraphed text. ChatGPT also groups similar articles by examining titles and dates to establish chronological background links.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {/* Export 100 Files in ZIP (2500 articles at once) */}
              <button
                onClick={handleExportMultiBatchZip}
                disabled={isExportingZip}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm"
              >
                {isExportingZip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
                <span>
                  {isExportingZip
                    ? `Packaging 100 Files (${exportProgress.progress}%)...`
                    : `Export 100 Files ZIP (2,500 Articles Max)`}
                </span>
              </button>

              {/* Export Single Batch (25 articles) */}
              <button
                onClick={handleExportArticles}
                disabled={isExportingZip}
                className="px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 flex items-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export 1 File Batch ({selectedArtIds.length > 0 ? selectedArtIds.length : Math.min(25, pendingArticles.length)} articles)</span>
              </button>

              {/* Group Similar Articles */}
              <button
                onClick={handleGroupSimilar}
                disabled={isExportingZip}
                className="px-3.5 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-50 text-xs text-[var(--text-primary)] flex items-center space-x-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Group Similar & Date Relations</span>
              </button>

              <button
                onClick={onOpenEventInbox}
                className="px-3.5 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-white flex items-center space-x-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Event URL Inbox ({metrics?.queuedUrls || 0})</span>
              </button>
            </div>

            {/* Live Progress Bar for 100 Files ZIP Generation */}
            {exportProgress.active && (
              <div className="mt-4 p-4 rounded-xl bg-[var(--bg-main)] border border-indigo-500/30 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 font-bold text-[var(--text-primary)]">
                    {exportProgress.status === 'PROCESSING' && (
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    )}
                    {exportProgress.status === 'COMPLETED' && (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    )}
                    {exportProgress.status === 'ERROR' && (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span>
                      {exportProgress.status === 'PROCESSING' && 'Packaging 100 Excel Files in Progress'}
                      {exportProgress.status === 'COMPLETED' && '100 Files ZIP Package Ready!'}
                      {exportProgress.status === 'ERROR' && 'Export Encountered An Error'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-indigo-400 text-xs">
                      {exportProgress.progress}% ({exportProgress.current} / {exportProgress.total || 100} files)
                    </span>
                    {exportProgress.status !== 'PROCESSING' && (
                      <button
                        onClick={() => setExportProgress(prev => ({ ...prev, active: false }))}
                        className="text-[11px] text-[var(--text-secondary)] hover:text-white underline ml-2"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar track & fill */}
                <div className="w-full bg-[var(--bg-card)] rounded-full h-3 overflow-hidden border border-[var(--border)] relative">
                  <div
                    className={`h-full transition-all duration-300 ease-out rounded-full ${
                      exportProgress.status === 'COMPLETED'
                        ? 'bg-gradient-to-r from-emerald-500 to-green-400'
                        : exportProgress.status === 'ERROR'
                        ? 'bg-red-500'
                        : 'bg-gradient-to-r from-indigo-500 via-indigo-400 to-cyan-400'
                    }`}
                    style={{ width: `${Math.max(2, Math.min(100, exportProgress.progress))}%` }}
                  />
                </div>

                {/* Status description */}
                <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] font-mono">
                  <span className="truncate pr-2">{exportProgress.message}</span>
                  {exportProgress.status === 'COMPLETED' && exportProgress.downloadZipUrl && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await downloadBinaryFile(
                            exportProgress.downloadZipUrl!,
                            exportProgress.zipFilename || 'AI_BATCH_PACKAGE.zip',
                            'zip'
                          );
                        } catch (err: any) {
                          alert(
                            `ZIP download failed:\n${err?.message || 'Unknown download error'}`
                          );
                        }
                      }}
                      className="shrink-0 px-2.5 py-1 rounded bg-green-600 hover:bg-green-500 text-white font-bold text-xs flex items-center space-x-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download ZIP Again</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Pending & Processed Articles List with Selection */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Articles Available for AI Processing ({pendingArticles.length})
                </h3>
                <span className="text-xs text-[var(--text-secondary)]">
                  Chunks of 25 articles packaged per file (up to 100 files for 2,500 articles at once)
                </span>
              </div>

              {/* Selection & Processed Toggle Controls */}
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-1.5 text-xs text-[var(--text-primary)] cursor-pointer select-none bg-[var(--bg-main)] px-2.5 py-1 rounded-md border border-[var(--border)] hover:border-[var(--accent)]">
                  <input
                    type="checkbox"
                    checked={includeProcessed}
                    onChange={e => setIncludeProcessed(e.target.checked)}
                    className="rounded bg-[var(--bg-main)] border-[var(--border)] text-[var(--accent)] w-3.5 h-3.5"
                  />
                  <span>Allow selecting processed articles for updates</span>
                </label>

                <button
                  onClick={() => {
                    if (selectedArtIds.length === pendingArticles.length) {
                      setSelectedArtIds([]);
                    } else {
                      setSelectedArtIds(pendingArticles.map(a => a.article_id));
                    }
                  }}
                  className="text-xs text-[var(--text-secondary)] hover:text-white px-2 py-1 rounded border border-[var(--border)]"
                >
                  {selectedArtIds.length === pendingArticles.length && pendingArticles.length > 0
                    ? 'Deselect All'
                    : `Select All (${pendingArticles.length})`}
                </button>
              </div>
            </div>

            <div className="divide-y divide-[var(--border)] max-h-96 overflow-y-auto">
              {pendingArticles.map(art => {
                const isSelected = selectedArtIds.includes(art.article_id);
                const isProcessed = art.processing_status === 'PROCESSED';

                return (
                  <div
                    key={art.article_id}
                    onClick={() => {
                      setSelectedArtIds(prev =>
                        prev.includes(art.article_id) ? prev.filter(x => x !== art.article_id) : [...prev, art.article_id]
                      );
                    }}
                    className="py-2.5 px-2 hover:bg-[var(--bg-hover)] cursor-pointer flex items-center justify-between text-xs transition-colors"
                  >
                    <div className="flex items-center space-x-3 flex-1 pr-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded bg-[var(--bg-main)] border-[var(--border)] text-[var(--accent)]"
                      />
                      <div>
                        <div className="font-semibold text-[var(--text-primary)] line-clamp-1">
                          {art.original_title}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {art.source_id.toUpperCase()} &middot; {art.published_at.slice(0, 10)} &middot; {art.original_body.length} chars
                        </div>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                      isProcessed
                        ? 'bg-green-500/15 text-green-300'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}>
                      {art.processing_status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Past Batches History */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                AI Batch History ({batches.length})
              </h3>
              <div className="flex items-center space-x-2">
                {metrics?.articles?.exported > 0 && (
                  <button
                    type="button"
                    onClick={handleResetExported}
                    className="px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                    title="Reset all EXPORTED articles back to RAW"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>EXPORTED 기사 RAW 복원 ({metrics.articles.exported}개)</span>
                  </button>
                )}

                {batches.length > 0 && (
                  <div>
                    {showDeleteAllConfirm ? (
                      <div className="flex items-center space-x-2 bg-red-500/10 border border-red-500/40 px-3 py-1 rounded-lg text-xs">
                        <span className="text-red-300 font-medium">정말 모든 패키지를 삭제하시겠습니까?</span>
                        <button
                          type="button"
                          onClick={executeDeleteAllBatches}
                          disabled={isDeletingBatches}
                          className="px-2.5 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white font-bold transition-colors"
                        >
                          {isDeletingBatches ? '삭제 중...' : '예, 전체 삭제'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDeleteAllConfirm(false)}
                          className="px-2 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowDeleteAllConfirm(true)}
                        className="px-2.5 py-1 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                        title="Delete all AI article packages"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>말아놓은 AI 패키지 전체 삭제</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {batchNotice && (
              <div className="px-3 py-2 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-semibold">
                {batchNotice}
              </div>
            )}

            {batches.length === 0 ? (
              <div className="text-xs text-[var(--text-secondary)] py-6 text-center italic bg-[var(--bg-main)] rounded-xl border border-[var(--border)]">
                No active AI article packages. Export new batches using the buttons above.
              </div>
            ) : (
              <div className="space-y-2">
                {batches.map(b => {
                  const isZip = b.filename?.endsWith('.zip');
                  const downloadUrl = isZip
                    ? `/api/ai/batch/${b.batch_id}/download-zip`
                    : `/api/ai/batch/${b.batch_id}/download`;
                  const isConfirmingThis = batchToDelete === b.batch_id;

                  return (
                    <div
                      key={b.batch_id}
                      className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] flex items-center justify-between text-xs hover:border-[var(--accent)]/50 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-[var(--text-primary)] flex items-center space-x-2">
                          {isZip && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              ZIP PACKAGE
                            </span>
                          )}
                          <span>{b.name}</span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {b.item_count} items &middot; {b.filename} &middot; {b.created_at.slice(0, 16).replace('T', ' ')}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await downloadBinaryFile(
                                downloadUrl,
                                b.filename || (isZip ? 'AI_BATCH_PACKAGE.zip' : 'AI_ARTICLE_BATCH.xlsx'),
                                isZip ? 'zip' : 'xlsx'
                              );
                            } catch (err: any) {
                              setBatchNotice(`${isZip ? 'ZIP' : 'XLSX'} download failed: ${err?.message || 'Unknown error'}`);
                            }
                          }}
                          className="px-3 py-1.5 rounded-md bg-[var(--bg-hover)] hover:bg-[var(--accent)] hover:text-white font-semibold text-[var(--text-primary)] flex items-center space-x-1.5 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{isZip ? 'Download ZIP Package' : 'Download XLSX'}</span>
                        </button>

                        {isConfirmingThis ? (
                          <div className="flex items-center space-x-1 bg-red-500/15 border border-red-500/40 px-2 py-1 rounded-md text-[11px]">
                            <span className="text-red-300">삭제?</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                executeDeleteSingleBatch(b.batch_id);
                              }}
                              className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white font-bold transition-colors"
                            >
                              확인
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBatchToDelete(null);
                              }}
                              className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white transition-colors"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBatchToDelete(b.batch_id);
                            }}
                            className="p-1.5 rounded-md bg-[var(--bg-hover)] hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-300 transition-colors"
                            title="Delete this package"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SubTab 2: Import Excel Workbooks or Bulk ZIP Package */}
      {activeSubTab === 'IMPORT' && (
        <div className="space-y-6">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Upload Completed Excel Workbooks (ZIP Package or Multiple Excel Files)
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Upload a completed ZIP package (containing 100 Excel workbooks) or select multiple .xlsx files from ChatGPT. The system automatically extracts all workbooks, updates localized tables, re-paragraphed texts (even if language matches original), concept tags, event candidates, and similar article links all at once.
              </p>
            </div>

            {/* Dropzone with multiple file and ZIP support */}
            <div className="border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] rounded-xl p-8 text-center space-y-3 cursor-pointer transition-colors bg-[var(--bg-main)]">
              <Files className="w-10 h-10 text-[var(--accent)] mx-auto" />
              <div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Click or drag to select ZIP package (.zip) or Excel workbooks (.xlsx) &mdash; bulk upload enabled
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-1">
                  Upload a single ZIP package containing up to 100 Excel files, or select multiple .xlsx files at once
                </div>
              </div>
              <input
                type="file"
                multiple
                accept=".xlsx, .xls, .zip, application/zip, application/x-zip-compressed, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFilesChange}
                className="w-full text-xs text-[var(--text-secondary)] file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[var(--accent)] file:text-white"
              />
            </div>

            {/* Selected files count indicator */}
            {uploadFiles.length > 0 && (
              <div className="p-3 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl flex items-center justify-between text-xs">
                <span className="text-[var(--text-primary)] font-semibold flex items-center space-x-2">
                  <FileSpreadsheet className="w-4 h-4 text-[var(--accent)]" />
                  <span>{uploadFiles.length} file{uploadFiles.length > 1 ? 's' : ''} staged for import</span>
                </span>
                <button
                  onClick={() => {
                    setUploadFiles([]);
                    setPreviewResult(null);
                  }}
                  className="text-[var(--text-secondary)] hover:text-white text-xs underline"
                >
                  Clear Selection
                </button>
              </div>
            )}

            {/* Import Success Message */}
            {importSuccess && (
              <div className="p-4 rounded-xl bg-green-500/15 border border-green-500/30 text-green-300 text-xs flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{importSuccess}</span>
              </div>
            )}

            {/* Validation Preview Card */}
            {previewResult && (
              <div className="p-5 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                    Aggregated Pre-Import Validation Preview
                  </span>
                  <span className="text-xs font-semibold text-green-400">
                    {previewResult.totalArticles} Valid Article IDs Matched Across {uploadFiles.length} File{uploadFiles.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-[var(--bg-hover)]">
                    <span className="text-[11px] text-[var(--text-secondary)] block">Korean (KO)</span>
                    <span className="text-sm font-bold text-[var(--text-primary)]">{previewResult.koCount}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[var(--bg-hover)]">
                    <span className="text-[11px] text-[var(--text-secondary)] block">English (EN)</span>
                    <span className="text-sm font-bold text-[var(--text-primary)]">{previewResult.enCount}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[var(--bg-hover)]">
                    <span className="text-[11px] text-[var(--text-secondary)] block">Kinyarwanda (RW)</span>
                    <span className="text-sm font-bold text-[var(--text-primary)]">{previewResult.rwCount}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[var(--bg-hover)]">
                    <span className="text-[11px] text-[var(--text-secondary)] block">Event Candidates</span>
                    <span className="text-sm font-bold text-emerald-400">{previewResult.eventCandidatesCount}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[var(--bg-hover)]">
                    <span className="text-[11px] text-[var(--text-secondary)] block">Concept Tags</span>
                    <span className="text-sm font-bold text-purple-400">{previewResult.tagsCount}</span>
                  </div>
                </div>

                {previewResult.warnings && previewResult.warnings.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs space-y-1">
                    <div className="font-bold flex items-center space-x-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Validation Notes:</span>
                    </div>
                    {previewResult.warnings.slice(0, 5).map((w: string, i: number) => (
                      <div key={i}>&bull; {w}</div>
                    ))}
                    {previewResult.warnings.length > 5 && (
                      <div className="text-[11px] text-amber-400/80 italic">
                        ...and {previewResult.warnings.length - 5} more warnings
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleCommitImport}
                    disabled={importing || previewResult.totalArticles === 0}
                    className="px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-bold flex items-center space-x-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {importing
                        ? `Importing & Synchronizing ${uploadFiles.length} File${uploadFiles.length > 1 ? 's' : ''}...`
                        : `Commit and Import ${previewResult.totalArticles} Records`}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SubTab 3: Integrated Syntheses */}
      {activeSubTab === 'INTEGRATED' && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Synthesized Integrated Articles ({integratedArticles.length})
            </h3>
            <div className="space-y-3">
              {integratedArticles.map(ia => (
                <div
                  key={ia.integrated_article_id}
                  onClick={() => onOpenIntegratedModal(ia.integrated_article_id)}
                  className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition-all space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-[var(--accent)]/15 text-[var(--accent)]">
                      {ia.topic}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      Synthesized from {ia.source_article_ids.length} sources
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-[var(--text-primary)] leading-snug">
                    {ia.title}
                  </h4>

                  {ia.subtitle && (
                    <p className="text-xs text-[var(--text-secondary)] italic">
                      {ia.subtitle}
                    </p>
                  )}

                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                    {ia.body}
                  </p>

                  <div className="pt-1 text-xs font-semibold text-[var(--accent)] hover:underline flex items-center space-x-1">
                    <span>Inspect Sentence Evidence Traces &rarr;</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

