import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, RefreshCw, Upload, ExternalLink, CheckCircle2, Trash2 } from 'lucide-react';
import { FacebookCookieModal, FacebookSessionStatus } from './FacebookCookieModal';

export const FacebookSessionSetup: React.FC = () => {
  const [status, setStatus] = useState<FacebookSessionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/facebook-session/status');
      const data: FacebookSessionStatus = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to load Facebook session status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleTestSession = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/facebook-session/test', { method: 'POST' });
      const data: FacebookSessionStatus = await res.json();
      setStatus(data);
      setActionMessage(data.message);
    } catch (err: any) {
      setActionMessage(`테스트 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Facebook 세션 연결을 해제하고 저장된 세션 파일을 삭제하시겠습니까?')) return;
    setLoading(true);
    setActionMessage(null);
    try {
      await fetch('/api/facebook-session', { method: 'DELETE' });
      await fetchStatus();
      setActionMessage('Facebook 세션이 삭제되었습니다.');
    } catch (err: any) {
      setActionMessage(`삭제 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isConnected = status?.connected === true && status?.status === 'connected';
  const isAuthRequired =
    status?.status === 'auth_required' ||
    status?.status === 'expired' ||
    status?.status === 'checkpoint' ||
    status?.status === 'captcha';

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-[#1877F2]" />
            <span>Facebook 브라우저 세션 관리 (cookies.txt)</span>
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            사용자 브라우저에서 export한 Netscape 형식의 cookies.txt를 통해 크롤러 인증 세션을 유지합니다.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-3.5 py-1.5 rounded-xl bg-[#1877F2] hover:bg-[#1877F2]/90 text-white font-semibold text-xs flex items-center space-x-1.5 transition-all shadow-sm shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>cookies.txt 업로드</span>
        </button>
      </div>

      {/* Status Card */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isConnected
            ? 'bg-green-500/10 border-green-500/30'
            : isAuthRequired
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-[var(--bg-main)] border-[var(--border)]'
        }`}
      >
        <div className="flex items-start space-x-3">
          {isConnected ? (
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          ) : isAuthRequired ? (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-[var(--text-secondary)] flex items-center justify-center shrink-0 mt-0.5" />
          )}

          <div>
            <div className="text-xs font-bold flex items-center space-x-2">
              <span
                className={
                  isConnected
                    ? 'text-green-300'
                    : isAuthRequired
                    ? 'text-amber-200'
                    : 'text-[var(--text-primary)]'
                }
              >
                {isConnected
                  ? 'Facebook 세션 연동 완료'
                  : isAuthRequired
                  ? 'Facebook 재로그인/인증 필요'
                  : 'Facebook 세션 미연동'}
              </span>
              {status?.cookiesCount && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 border border-current font-mono text-[var(--text-secondary)]">
                  {status.cookiesCount} cookies
                </span>
              )}
            </div>

            <p className="text-[11px] text-[var(--text-secondary)] mt-1">
              {status?.message || 'cookies.txt 파일을 업로드하여 Facebook 크롤러를 활성화하세요.'}
            </p>

            {status?.expiresAt && (
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                만료 일시: {new Date(status.expiresAt).toLocaleString('ko-KR')}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-white"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {isConnected && (
            <>
              <button
                onClick={handleTestSession}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-current text-xs font-medium text-[var(--text-primary)]"
              >
                세션 테스트
              </button>
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 text-red-300 text-xs font-medium"
              >
                연결 해제
              </button>
            </>
          )}

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:opacity-90 text-white text-xs font-semibold"
          >
            {isConnected ? '쿠키 갱신' : 'cookies.txt 업로드'}
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="text-xs p-2.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border)] text-[var(--text-secondary)]">
          {actionMessage}
        </div>
      )}

      {/* Security Principles */}
      <div className="p-3 rounded-xl bg-[var(--bg-main)]/50 border border-[var(--border)] text-[10px] text-[var(--text-secondary)] space-y-1">
        <div className="font-semibold text-[var(--text-primary)]">쿠키 세션 운영 원칙</div>
        <p>
          - Netscape 형식의 <code>cookies.txt</code>에서 <code>.facebook.com</code> 쿠키만 선별하여 Playwright 세션에 적용합니다.
        </p>
        <p>
          - 업로드된 파일은 처리 즉시 삭제되며, 로그인 정보나 쿠키 값은 화면, 로그, 콘솔 어디에도 노출되지 않습니다.
        </p>
        <p>
          - CAPTCHA는 자동 우회하지 않으며, 추가 보안 인증(checkpoint 등) 필요 시 사용자에게 재로그인을 안내합니다.
        </p>
      </div>

      {/* Modal */}
      <FacebookCookieModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          fetchStatus();
        }}
        onStatusChange={(newStatus) => setStatus(newStatus)}
      />
    </div>
  );
};
