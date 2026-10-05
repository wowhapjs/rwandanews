import React, { useState } from 'react';

export function StoryAgentPanel({ command, onValidate, onPreviewRecovery }: { command: string; onValidate: (json: string) => Promise<void>; onPreviewRecovery: (limit: number) => Promise<void> }) {
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(command); };
  const validate = async () => { setBusy(true); try { await onValidate(result); } finally { setBusy(false); } };
  return <section className="space-y-5"><div className="rounded-xl border p-4"><h2 className="text-lg font-bold">AI Agent Story Clustering</h2><p className="mt-1 text-sm text-slate-600">명령을 AI Agent에 복사하고 JSON 결과를 붙여넣습니다. 검증 및 변경 미리보기 전에는 DB에 적용하지 않습니다.</p><button type="button" onClick={() => void copy()} className="mt-3 min-h-11 rounded-lg border px-4 font-semibold">Agent Command 복사</button><textarea aria-label="AI Agent JSON 결과" className="mt-4 min-h-52 w-full rounded-lg border p-3 font-mono text-sm" value={result} onChange={e => setResult(e.target.value)} placeholder="JSON 결과 붙여넣기"/><button type="button" disabled={busy || !result.trim()} onClick={() => void validate()} className="mt-2 min-h-11 rounded-lg bg-slate-900 px-4 font-semibold text-white disabled:opacity-50">검증 및 변경 미리보기</button></div><div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h2 className="font-bold">Grouping Recovery</h2><p className="mt-1 text-sm">최근 article↔cluster association 최대 150건을 먼저 미리보기한 뒤 해제할 수 있습니다. 복원 snapshot을 보존합니다.</p><button type="button" onClick={() => void onPreviewRecovery(150)} className="mt-3 min-h-11 rounded-lg border border-amber-500 bg-white px-4 font-semibold">최근 150건 묶기 해제 미리보기</button></div></section>;
}
