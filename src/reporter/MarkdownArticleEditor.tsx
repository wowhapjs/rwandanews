import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export interface ReporterDraft {
  title: string;
  subtitle: string;
  body: string;
}

export function MarkdownArticleEditor({ value, onChange, onSave, onSubmit }: { value: ReporterDraft; onChange: (value: ReporterDraft) => void; onSave: () => void; onSubmit: () => void }) {
  const [view, setView] = useState<'edit' | 'split' | 'preview'>('split');
  const preview = useMemo(() => value.body, [value.body]);
  const editor = <textarea aria-label="기사 Markdown" className="min-h-[55vh] w-full resize-y rounded-xl border border-slate-300 p-4 font-mono text-base leading-7 outline-none focus:ring-2" value={value.body} onChange={e => onChange({ ...value, body: e.target.value })} placeholder="Markdown으로 기사를 작성하세요…" />;
  const rendered = <article className="prose prose-slate min-h-[55vh] max-w-none rounded-xl border border-slate-200 bg-white p-5"><ReactMarkdown>{preview}</ReactMarkdown></article>;
  return <section className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-6">
    <input aria-label="기사 제목" className="w-full rounded-xl border p-3 text-xl font-bold" value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} placeholder="기사 제목" />
    <input aria-label="기사 부제" className="w-full rounded-xl border p-3" value={value.subtitle} onChange={e => onChange({ ...value, subtitle: e.target.value })} placeholder="부제 (선택)" />
    <div className="flex flex-wrap gap-2">{(['edit','split','preview'] as const).map(item => <button type="button" key={item} onClick={() => setView(item)} className="min-h-11 rounded-lg border px-4 capitalize">{item}</button>)}</div>
    <div className={view === 'split' ? 'grid gap-4 lg:grid-cols-2' : ''}>{view !== 'preview' && editor}{view !== 'edit' && rendered}</div>
    <div className="sticky bottom-2 flex justify-end gap-2 rounded-xl bg-white/95 p-2 shadow"><button type="button" onClick={onSave} className="min-h-11 rounded-lg border px-4">임시저장</button><button type="button" onClick={onSubmit} className="min-h-11 rounded-lg bg-slate-900 px-4 font-semibold text-white">검토 요청</button></div>
  </section>;
}
