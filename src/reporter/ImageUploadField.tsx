import React, { useRef, useState } from 'react';

export interface UploadedArticleImage { url: string; alt?: string; caption?: string; credit?: string; }

export function ImageUploadField({ upload, onUploaded }: { upload: (file: File) => Promise<UploadedArticleImage>; onUploaded: (image: UploadedArticleImage) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const choose = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError('');
    try { onUploaded(await upload(file)); } catch (err) { setError(err instanceof Error ? err.message : '업로드에 실패했습니다.'); } finally { setBusy(false); }
  };
  return <div className="space-y-2"><input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e => void choose(e.target.files?.[0])} /><button type="button" disabled={busy} onClick={() => input.current?.click()} className="min-h-11 rounded-lg border px-4 font-semibold disabled:opacity-50">{busy ? '업로드 중…' : '사진 업로드'}</button>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
