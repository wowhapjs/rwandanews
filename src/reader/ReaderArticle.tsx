import React from 'react';
import ReactMarkdown from 'react-markdown';

export interface ReaderArticleDetail { title: string; subtitle?: string; body: string; imageUrl?: string; author?: string; source?: string; publishedLabel?: string; }

export function ReaderArticle({ article }: { article: ReaderArticleDetail }) {
  return <article className="px-4 py-6"><header><h1 className="text-3xl font-black leading-tight tracking-tight">{article.title}</h1>{article.subtitle && <p className="mt-3 text-lg leading-7 text-slate-600">{article.subtitle}</p>}<p className="mt-4 text-sm text-slate-500">{[article.author, article.source, article.publishedLabel].filter(Boolean).join(' · ')}</p></header>{article.imageUrl && <img src={article.imageUrl} alt="" className="mt-6 aspect-[16/9] w-full rounded-xl object-cover"/>}<div className="prose prose-slate mt-7 max-w-none text-[17px] leading-8"><ReactMarkdown>{article.body}</ReactMarkdown></div></article>;
}
