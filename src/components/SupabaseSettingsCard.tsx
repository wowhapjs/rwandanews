import React, { useState, useEffect } from 'react';
import { Database, CheckCircle2, AlertTriangle, RefreshCw, Key, Globe, Eye, EyeOff } from 'lucide-react';

export const SupabaseSettingsCard: React.FC = () => {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/mcp/supabase/status');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to load Supabase status:', err);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSaveAndTest = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/mcp/supabase/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, key })
      });
      const data = await res.json();
      setMessage(data.test?.message || '설정이 저장되었습니다.');
      loadStatus();
    } catch (err: any) {
      setMessage(`저장 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isConnected = status?.test?.success === true;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>Supabase 데이터베이스 연동 &amp; MCP</span>
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            개인 Supabase가 주 데이터베이스로 연결되어 기사를 영구 저장하고, ChatGPT MCP 에이전트와 직결하여 실시간 번역을 수행합니다.
          </p>
        </div>

        <button
          onClick={loadStatus}
          className="p-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] hover:border-emerald-500 text-[var(--text-secondary)] hover:text-white transition-colors self-start sm:self-auto"
          title="상태 새로고침"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Status banner */}
      <div
        className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
          isConnected
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
        }`}
      >
        <div className="flex items-center space-x-2.5">
          {isConnected ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span>{status?.test?.message || '연결 상태를 확인 중입니다...'}</span>
        </div>

        {isConnected && (
          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            {status?.test?.articleCount ?? 0} Articles Active
          </span>
        )}
      </div>

      {message && (
        <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-500/30 text-xs text-blue-200">
          {message}
        </div>
      )}

      {/* Settings Form */}
      <div className="space-y-3 pt-1">
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center space-x-1">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>Supabase Project URL</span>
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={status?.config?.url || 'https://xxxxxxxxxxxx.supabase.co'}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] focus:border-emerald-500 focus:outline-none text-xs font-mono text-[var(--text-primary)]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center space-x-1">
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Supabase API Key (service_role 또는 anon key)</span>
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={status?.config?.configured ? '••••••••••••••••••••••••••••••••' : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'}
              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] focus:border-emerald-500 focus:outline-none text-xs font-mono text-[var(--text-primary)]"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-2.5 text-[var(--text-secondary)] hover:text-white"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSaveAndTest}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center space-x-1.5 transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? '연결 확인 중...' : '설정 저장 및 연결 테스트'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
