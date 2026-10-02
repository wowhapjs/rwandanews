import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  X,
  FileText,
  Shield,
  ExternalLink,
  HelpCircle,
  Copy,
  Check
} from 'lucide-react';

export interface FacebookSessionStatus {
  connected: boolean;
  status: 'connected' | 'unconfigured' | 'expired' | 'auth_required' | 'checkpoint' | 'captcha';
  message: string;
  expiresAt?: string;
  cookiesCount?: number;
  lastCheckedAt?: string;
}

interface FacebookCookieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (status: FacebookSessionStatus) => void;
}

export const FacebookCookieModal: React.FC<FacebookCookieModalProps> = ({
  isOpen,
  onClose,
  onStatusChange
}) => {
  const [status, setStatus] = useState<FacebookSessionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/facebook-session/status');
      const data: FacebookSessionStatus = await res.json();
      setStatus(data);
      if (onStatusChange) onStatusChange(data);
    } catch (err: any) {
      console.error('Failed to fetch Facebook session status:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setActionMessage(null);
      setSelectedFile(null);
      setPastedText('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFileSelected(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setActionMessage(null);
  };

  const handleUpload = async () => {
    if (!selectedFile && (!pasteMode || !pastedText.trim())) {
      setActionMessage({ type: 'error', text: '업로드할 cookies.txt 파일 또는 쿠키 텍스트를 입력해주세요.' });
      return;
    }

    setLoading(true);
    setActionMessage(null);

    try {
      let res: Response;

      if (selectedFile) {
        const formData = new FormData();
        formData.append('cookiesFile', selectedFile);
        res = await fetch('/api/facebook-session/upload-cookies', {
          method: 'POST',
          body: formData
        });
      } else {
        res = await fetch('/api/facebook-session/upload-cookies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookieContent: pastedText })
        });
      }

      const data: FacebookSessionStatus = await res.json();
      setStatus(data);
      if (onStatusChange) onStatusChange(data);

      if (data.connected && data.status === 'connected') {
        setActionMessage({
          type: 'success',
          text: data.message || 'Facebook 세션이 성공적으로 연동되었습니다! 이제 크롤러가 세션을 사용합니다.'
        });
        setSelectedFile(null);
        setPastedText('');
      } else {
        setActionMessage({
          type: 'error',
          text: data.message || 'Facebook 재로그인/인증 필요: 세션 등록에 실패했습니다.'
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `업로드 처리 실패: ${err.message || '네트워크 오류가 발생했습니다.'}`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestSession = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/facebook-session/test', { method: 'POST' });
      const data: FacebookSessionStatus = await res.json();
      setStatus(data);
      if (onStatusChange) onStatusChange(data);

      if (data.connected) {
        setActionMessage({ type: 'success', text: '세션 검증 성공: Facebook에 정상 로그인 상태입니다.' });
      } else {
        setActionMessage({ type: 'error', text: data.message || 'Facebook 재로그인/인증 필요: 세션이 유효하지 않습니다.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `세션 테스트 실패: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Facebook 세션 연결을 해제하고 저장된 세션 파일을 삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await fetch('/api/facebook-session', { method: 'DELETE' });
      await fetchStatus();
      setSelectedFile(null);
      setActionMessage({ type: 'info', text: 'Facebook 세션이 삭제되었습니다.' });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `연결 해제 실패: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const isConnected = status?.connected === true && status?.status === 'connected';
  const isAuthRequired = status?.status === 'auth_required' || status?.status === 'expired' || status?.status === 'checkpoint' || status?.status === 'captcha';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-[var(--bg-main)]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1877F2]/10 border border-[#1877F2]/30 flex items-center justify-center text-[#1877F2]">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Facebook 세션 연동 (cookies.txt)</h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Netscape 형식의 cookies.txt를 업로드하여 안전하게 Facebook 크롤러 세션을 유지합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Status Banner */}
          {status && (
            <div
              className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                isConnected
                  ? 'bg-green-500/10 border-green-500/30 text-green-300'
                  : isAuthRequired
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  : 'bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-secondary)]'
              }`}
            >
              <div className="flex items-start space-x-2.5">
                {isConnected ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                ) : isAuthRequired ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <HelpCircle className="w-4 h-4 text-[var(--text-secondary)] shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <span>
                      {isConnected
                        ? 'Facebook 세션 연동됨 (Active)'
                        : isAuthRequired
                        ? 'Facebook 재로그인/인증 필요'
                        : 'Facebook 세션 미연동'}
                    </span>
                    {status.cookiesCount && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/40 border border-current font-mono">
                        {status.cookiesCount} cookies
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-0.5 opacity-90">{status.message}</p>
                  {status.expiresAt && (
                    <p className="text-[10px] opacity-75 mt-1">
                      세션 만료 예정: {new Date(status.expiresAt).toLocaleString('ko-KR')}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-1.5 shrink-0">
                {isConnected && (
                  <>
                    <button
                      onClick={handleTestSession}
                      disabled={loading}
                      className="px-2.5 py-1 rounded bg-[var(--bg-card)] border border-[var(--border)] hover:border-current text-[11px] font-medium flex items-center space-x-1"
                      title="Facebook 접속 테스트"
                    >
                      <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                      <span>테스트</span>
                    </button>
                    <button
                      onClick={handleDisconnect}
                      disabled={loading}
                      className="px-2.5 py-1 rounded bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 text-red-300 text-[11px] font-medium flex items-center space-x-1"
                      title="세션 삭제"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>삭제</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Action Message Alert */}
          {actionMessage && (
            <div
              className={`p-3 rounded-xl border flex items-center space-x-2 text-xs ${
                actionMessage.type === 'success'
                  ? 'bg-green-500/15 border-green-500/40 text-green-300'
                  : actionMessage.type === 'error'
                  ? 'bg-red-500/15 border-red-500/40 text-red-300'
                  : 'bg-blue-500/15 border-blue-500/40 text-blue-300'
              }`}
            >
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{actionMessage.text}</span>
            </div>
          )}

          {/* How to export guide toggle */}
          <div className="bg-[var(--bg-main)] border border-[var(--border)] rounded-xl p-3">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="w-full flex items-center justify-between text-[11px] font-semibold text-[var(--accent)] hover:underline"
            >
              <span className="flex items-center space-x-1.5">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>브라우저에서 cookies.txt 파일 추출하는 방법 보기</span>
              </span>
              <span>{showGuide ? '접기 ▲' : '자세히 ▼'}</span>
            </button>

            {showGuide && (
              <div className="mt-3 pt-3 border-t border-[var(--border)] text-[11px] space-y-2 text-[var(--text-secondary)]">
                <p>1. Chrome 또는 Firefox 확장 프로그램 <strong>&quot;Get cookies.txt LOCALLY&quot;</strong> 또는 <strong>&quot;cookie-editor&quot;</strong>를 설치합니다.</p>
                <p>2. 브라우저에서 <strong>facebook.com</strong>에 접속하여 정상적으로 로그인합니다.</p>
                <p>3. 설치한 확장 프로그램 아이콘을 클릭하고 <strong>&quot;Export&quot;</strong>를 눌러 <code>cookies.txt</code> 파일을 저장합니다.</p>
                <p>4. 다운로드된 <code>cookies.txt</code> 파일을 아래 영역에 드래그하거나 선택하여 업로드합니다.</p>
                <p className="text-[10px] text-amber-300/90 pt-1">
                  * 주의: Facebook 도메인(.facebook.com) 쿠키만 파싱되어 사용되며, 업로드 완료 후 원본 파일은 서버에서 즉시 삭제됩니다.
                </p>
              </div>
            )}
          </div>

          {/* Mode Switch (File Upload vs Direct Paste) */}
          <div className="flex border-b border-[var(--border)] gap-4 text-xs font-semibold">
            <button
              onClick={() => setPasteMode(false)}
              className={`pb-2 border-b-2 transition-all ${
                !pasteMode
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              파일 업로드 (Drag & Drop)
            </button>
            <button
              onClick={() => setPasteMode(true)}
              className={`pb-2 border-b-2 transition-all ${
                pasteMode
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              텍스트 직접 붙여넣기
            </button>
          </div>

          {/* Dropzone Area */}
          {!pasteMode ? (
            <div>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 scale-[1.01]'
                    : selectedFile
                    ? 'border-green-500/50 bg-green-500/5'
                    : 'border-[var(--border)] hover:border-[var(--accent)]/60 bg-[var(--bg-main)]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={handleFileInput}
                  className="hidden"
                />

                <div className="flex flex-col items-center justify-center space-y-2.5">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                      selectedFile
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--accent)]'
                    }`}
                  >
                    {selectedFile ? <FileText className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
                  </div>

                  <div>
                    {selectedFile ? (
                      <div className="space-y-1">
                        <p className="font-bold text-[var(--text-primary)] text-sm">{selectedFile.name}</p>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          {(selectedFile.size / 1024).toFixed(1)} KB · 파일이 준비되었습니다. 아래 [세션 연동 시작] 버튼을 눌러주세요.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-bold text-[var(--text-primary)] text-sm">
                          cookies.txt 파일을 여기에 드래그하거나 클릭하여 선택
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          Netscape HTTP Cookie File (.txt) 형식 지원
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {selectedFile && (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="text-[11px] text-[var(--text-secondary)] hover:text-red-400 flex items-center space-x-1"
                  >
                    <X className="w-3 h-3" />
                    <span>선택 취소</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1 font-medium">
                Netscape 형식의 쿠키 텍스트 붙여넣기:
              </label>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="# Netscape HTTP Cookie File&#10;.facebook.com	TRUE	/	TRUE	1798329382	c_user	1000123...&#10;#HttpOnly_.facebook.com	TRUE	/	TRUE	1798329382	xs	32%3Aabc..."
                rows={7}
                className="w-full p-3 font-mono text-[11px] rounded-xl bg-[var(--bg-main)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-[var(--text-primary)] resize-none"
              />
            </div>
          )}

          {/* Security & Architecture Guarantees */}
          <div className="p-3 rounded-xl bg-[var(--bg-main)]/60 border border-[var(--border)] text-[10px] space-y-1 text-[var(--text-secondary)]">
            <div className="font-semibold text-[var(--text-primary)] flex items-center space-x-1">
              <Shield className="w-3 h-3 text-[var(--accent)]" />
              <span>보안 및 세션 처리 원칙</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 leading-relaxed">
              <li>업로드된 파일은 <strong>메모리에서만 일시 파싱</strong>되며, 원본 파일은 서버에 장기 보관되지 않고 즉시 파기됩니다.</li>
              <li>오직 <code>.facebook.com</code> 도메인 쿠키만 선별하여 Playwright 세션에 주입합니다.</li>
              <li>쿠키 값 및 인증 정보는 <strong>서버 로그나 브라우저 콘솔, API 응답에 일절 노출되지 않습니다.</strong></li>
              <li>CAPTCHA 자동 우회는 지원하지 않으며, 추가 보안 확인이 필요한 경우 사용자에게 안내합니다.</li>
            </ul>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-main)] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-white text-xs font-semibold transition-colors"
          >
            닫기
          </button>

          <button
            onClick={handleUpload}
            disabled={loading || (!selectedFile && (!pasteMode || !pastedText.trim()))}
            className="px-5 py-2 rounded-xl bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-md flex items-center space-x-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? '세션 확인 및 등록 중...' : '세션 연동 시작'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
