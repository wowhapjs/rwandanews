import React, { useState, useEffect } from 'react';
import { SourceInfo } from '../types';
import { api } from '../lib/api';
import {
  Database,
  Play,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Clock,
  FileText,
  X,
  Shield,
  Upload
} from 'lucide-react';
import { FacebookCookieModal, FacebookSessionStatus } from '../components/FacebookCookieModal';
import { t } from '../lib/i18n';

interface SourcesViewProps {
  currentLang?: string;
}

export const SourcesView: React.FC<SourcesViewProps> = ({ currentLang }) => {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLogsSource, setSelectedLogsSource] = useState<SourceInfo | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);
  const [isBulkRunning, setIsBulkRunning] = useState<'incremental' | 'backfill' | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [facebookStatus, setFacebookStatus] = useState<FacebookSessionStatus | null>(null);
  const [isFacebookModalOpen, setIsFacebookModalOpen] = useState(false);

  const loadFacebookStatus = async () => {
    try {
      const res = await fetch('/api/facebook-session/status');
      const data: FacebookSessionStatus = await res.json();
      setFacebookStatus(data);
    } catch (err) {
      console.error('Failed to load Facebook session status:', err);
    }
  };

  const loadSources = () => {
    setLoading(true);
    loadFacebookStatus();
    api.getSources()
      .then(res => {
        setSources(res.sources || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load sources:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadSources();
  }, []);

  const handleToggle = async (sourceId: string) => {
    try {
      await api.toggleSource(sourceId);
      loadSources();
    } catch (err: any) {
      alert(`Toggle failed: ${err.message}`);
    }
  };

  const handleCrawl = async (sourceId: string, mode: 'incremental' | 'backfill') => {
    if (sourceId === 'facebook_rwanda' && facebookStatus && !facebookStatus.connected) {
      setIsFacebookModalOpen(true);
      return;
    }

    setRunningSourceId(sourceId);
    try {
      const res = await api.triggerCrawl(sourceId, mode, mode === 'backfill' ? 365 : 1);
      alert(res.message);
      loadSources();
    } catch (err: any) {
      if (err.message && err.message.includes('Facebook 재로그인/인증 필요')) {
        setIsFacebookModalOpen(true);
      }
      alert(`Crawl failed: ${err.message}`);
    } finally {
      setRunningSourceId(null);
    }
  };

  const handleCrawlAll = async (mode: 'incremental' | 'backfill') => {
    setIsBulkRunning(mode);
    setBulkMessage(`Triggering ${mode} crawl for all enabled sources...`);
    try {
      const res = await api.triggerCrawlAll(mode, mode === 'backfill' ? 365 : 1);
      setBulkMessage(res.message || `Started bulk ${mode} crawl across all sources.`);
      setTimeout(() => setBulkMessage(null), 7000);
      loadSources();
    } catch (err: any) {
      setBulkMessage(`Bulk crawl error: ${err.message}`);
    } finally {
      setIsBulkRunning(null);
    }
  };

  const handleViewLogs = async (src: SourceInfo) => {
    setSelectedLogsSource(src);
    try {
      const res = await api.getSourceRuns(src.id);
      setLogs(res.runs || []);
    } catch (err: any) {
      alert(`Failed to load logs: ${err.message}`);
    }
  };

  const isFacebookAuthRequired =
    facebookStatus &&
    (!facebookStatus.connected ||
      facebookStatus.status === 'auth_required' ||
      facebookStatus.status === 'expired' ||
      facebookStatus.status === 'checkpoint' ||
      facebookStatus.status === 'captcha');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center space-x-2">
            <Database className="w-5 h-5 text-[var(--accent)]" />
            <span>{t('sources_title', currentLang)}</span>
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {t('sources_subtitle', currentLang)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsFacebookModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-[#1877F2]/15 border border-[#1877F2]/40 hover:bg-[#1877F2]/25 text-[#1877F2] font-semibold text-xs flex items-center space-x-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{t('sources_fb_session', currentLang)}</span>
          </button>

          <button
            onClick={() => handleCrawlAll('incremental')}
            disabled={isBulkRunning !== null}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-white font-medium text-xs flex items-center space-x-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Play className={`w-3.5 h-3.5 ${isBulkRunning === 'incremental' ? 'animate-spin' : ''}`} />
            <span>{t('sources_crawl_incremental', currentLang)}</span>
          </button>

          <button
            onClick={() => handleCrawlAll('backfill')}
            disabled={isBulkRunning !== null}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-50 text-xs text-[var(--text-primary)] font-medium flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isBulkRunning === 'backfill' ? 'animate-spin text-[var(--accent)]' : ''}`} />
            <span>{t('sources_crawl_backfill', currentLang)}</span>
          </button>

          <button
            onClick={loadSources}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] text-xs text-[var(--text-primary)] flex items-center space-x-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('btn_refresh', currentLang)}</span>
          </button>
        </div>
      </div>

      {/* Facebook Session Alert Banner */}
      {isFacebookAuthRequired && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold">Facebook 재로그인/인증 필요</span>
              <p className="text-[11px] opacity-90 mt-0.5">
                {facebookStatus?.message || 'Facebook 크롤러를 실행하려면 브라우저에서 export한 cookies.txt 세션 업로드가 필요합니다.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsFacebookModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs flex items-center space-x-1.5 self-start sm:self-auto shrink-0 shadow-sm transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>cookies.txt 업로드하기</span>
          </button>
        </div>
      )}

      {bulkMessage && (
        <div className="p-3 bg-[var(--bg-card)] border border-[var(--accent)]/40 rounded-xl text-xs text-[var(--text-primary)] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
            <span>{bulkMessage}</span>
          </div>
          <button onClick={() => setBulkMessage(null)} className="text-[var(--text-secondary)] hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sources Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-main)] border-b border-[var(--border)] text-[var(--text-secondary)] font-semibold">
              <tr>
                <th className="p-4">{t('sources_col_source_domain', currentLang)}</th>
                <th className="p-4">{t('sources_col_region_lang', currentLang)}</th>
                <th className="p-4">{t('sources_col_articles', currentLang)}</th>
                <th className="p-4">{t('sources_col_checkpoint', currentLang)}</th>
                <th className="p-4">{t('sources_col_enabled', currentLang)}</th>
                <th className="p-4 text-right">{t('sources_col_crawl_actions', currentLang)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
              {sources.map(src => {
                const isRunning = runningSourceId === src.id || src.isRunning;
                const isFacebook = src.id === 'facebook_rwanda' || src.domain === 'facebook.com';

                return (
                  <tr key={src.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                    {/* Source Name */}
                    <td className="p-4 space-y-1">
                      <div className="font-bold flex items-center space-x-1.5">
                        <span>{src.name}</span>
                        <a
                          href={src.homeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--text-secondary)] hover:text-white"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] font-mono flex items-center gap-2">
                        <span>{src.domain}</span>
                        {isFacebook && (
                          <button
                            onClick={() => setIsFacebookModalOpen(true)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border inline-flex items-center space-x-1 cursor-pointer ${
                              facebookStatus?.connected
                                ? 'bg-green-500/15 border-green-500/40 text-green-300'
                                : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                            }`}
                          >
                            <Shield className="w-2.5 h-2.5" />
                            <span>
                              {facebookStatus?.connected
                                ? '세션 연동됨'
                                : 'Facebook 재로그인/인증 필요'}
                            </span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Region */}
                    <td className="p-4 space-y-0.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--bg-main)] border border-[var(--border)]">
                        {src.region}
                      </span>
                      <div className="text-[11px] text-[var(--text-secondary)] uppercase">
                        Default: {src.defaultLanguage}
                      </div>
                    </td>

                    {/* Articles Counts */}
                    <td className="p-4 font-mono">
                      <span className="font-bold text-[var(--accent)]">{src.articlesDiscovered}</span> / {src.articlesImported}
                    </td>

                    {/* Checkpoint info */}
                    <td className="p-4 space-y-1 text-[11px] text-[var(--text-secondary)]">
                      <div>
                        Page: <span className="text-[var(--text-primary)] font-bold">{src.checkpoint?.currentPage || 1}</span>
                      </div>
                      {src.lastRun && (
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{(src.lastRun.startedAt || '').slice(0, 16).replace('T', ' ')} ({src.lastRun.status})</span>
                        </div>
                      )}
                    </td>

                    {/* Enabled Toggle */}
                    <td className="p-4">
                      <button
                        onClick={() => handleToggle(src.id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                          src.enabled
                            ? 'bg-green-500/15 text-green-300 border border-green-500/30'
                            : 'bg-red-500/15 text-red-300 border border-red-500/30'
                        }`}
                      >
                        {src.enabled ? 'Active' : 'Disabled'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                      {isFacebook && (
                        <button
                          onClick={() => setIsFacebookModalOpen(true)}
                          className="px-2.5 py-1.5 rounded-md bg-[#1877F2]/10 border border-[#1877F2]/30 hover:border-[#1877F2] text-xs text-[#1877F2] font-semibold inline-flex items-center space-x-1 cursor-pointer"
                          title="Facebook 세션 cookies.txt 관리"
                        >
                          <Upload className="w-3 h-3" />
                          <span>cookies.txt</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleCrawl(src.id, 'incremental')}
                        disabled={isRunning}
                        className="px-2.5 py-1.5 rounded-md bg-[var(--bg-main)] border border-[var(--border)] hover:border-[var(--accent)] text-xs text-[var(--text-primary)] font-semibold inline-flex items-center space-x-1 cursor-pointer"
                        title="Incremental crawl of newest pages"
                      >
                        <Play className="w-3 h-3 text-green-400" />
                        <span>{t('sources_btn_incremental', currentLang)}</span>
                      </button>

                      <button
                        onClick={() => handleCrawl(src.id, 'backfill')}
                        disabled={isRunning}
                        className="px-2.5 py-1.5 rounded-md bg-[var(--bg-main)] border border-[var(--border)] hover:border-[var(--accent)] text-xs text-[var(--text-primary)] font-semibold inline-flex items-center space-x-1 cursor-pointer"
                        title="Historical backfill (365 days)"
                      >
                        <RotateCcw className="w-3 h-3 text-blue-400" />
                        <span>{t('sources_btn_backfill', currentLang)}</span>
                      </button>

                      <button
                        onClick={() => handleViewLogs(src)}
                        className="px-2 py-1.5 rounded-md text-[var(--text-secondary)] hover:text-white cursor-pointer"
                        title={t('sources_btn_logs', currentLang)}
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Logs Modal */}
      {selectedLogsSource && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-2xl my-auto p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Crawl Logs: {selectedLogsSource.name}
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Run history and extraction telemetry
                </p>
              </div>
              <button onClick={() => setSelectedLogsSource(null)} className="text-[var(--text-secondary)] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3">
              {logs.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                  No previous run logs recorded for this source.
                </div>
              ) : (
                logs.map(r => (
                  <div key={r.id} className="p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border)] text-xs space-y-1 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--accent)]">{r.runType.toUpperCase()} ({r.status})</span>
                      <span className="text-[var(--text-secondary)]">{r.startedAt}</span>
                    </div>
                    <div className="text-[var(--text-secondary)]">
                      Discovered: {r.articlesDiscovered} | Imported: {r.articlesImported} | Errors: {r.errorsCount}
                    </div>
                    {r.lastError && (
                      <div className="text-red-400 text-[11px]">
                        Last Error: {r.lastError}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Facebook Session Modal */}
      <FacebookCookieModal
        isOpen={isFacebookModalOpen}
        onClose={() => {
          setIsFacebookModalOpen(false);
          loadSources();
        }}
        onStatusChange={(s) => setFacebookStatus(s)}
      />
    </div>
  );
};
