import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { MobileReaderShell } from './MobileReaderShell';
import { ReaderHome, ReaderArticleCard } from './ReaderHome';
import { ReaderArticle, ReaderArticleDetail } from './ReaderArticle';

export function ReaderApp() {
  const [cards, setCards] = useState<ReaderArticleCard[]>([]); const [selected, setSelected] = useState<ReaderArticleDetail | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { api.getArticles({ sort: 'newest', limit: 30, offset: 0 }).then(res => setCards((res.articles || []).map((a: any) => ({ id: a.article_id, title: a.title || a.original_title || 'Untitled', summary: a.summary || a.subtitle, imageUrl: a.lead_image_url, source: a.source_name || a.source_id, publishedLabel: a.published_at ? new Date(a.published_at).toLocaleString() : undefined })))).finally(() => setLoading(false)); }, []);
  const open = async (id: string) => { const res = await api.getArticleById(id); const a = res.article || res; setSelected({ title: a.title || a.original_title || 'Untitled', subtitle: a.subtitle || a.original_subtitle, body: a.body_markdown || a.original_body || a.body || '', imageUrl: a.lead_image_url, author: a.author, source: a.source_name || a.source_id, publishedLabel: a.published_at ? new Date(a.published_at).toLocaleString() : undefined }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return <MobileReaderShell onSearch={() => {}}>{loading ? <p className="p-6 text-center text-sm text-slate-500">뉴스를 불러오는 중…</p> : selected ? <><button type="button" onClick={() => setSelected(null)} className="mx-4 mt-4 min-h-11 text-sm font-semibold">← 최신 뉴스</button><ReaderArticle article={selected}/></> : <ReaderHome articles={cards} onOpen={id => void open(id)}/>}</MobileReaderShell>;
}
