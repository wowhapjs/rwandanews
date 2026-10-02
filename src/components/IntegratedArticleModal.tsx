import React, { useState, useEffect } from 'react';
import { IntegratedArticle, SentenceTrace, Article } from '../types';
import { api } from '../lib/api';
import { X, Layers, ExternalLink, BookOpen, Quote } from 'lucide-react';

interface IntegratedArticleModalProps {
  integratedArticleId: string | null;
  onClose: () => void;
}

export const IntegratedArticleModal: React.FC<IntegratedArticleModalProps> = ({
  integratedArticleId,
  onClose
}) => {
  const [data, setData] = useState<{
    article: IntegratedArticle;
    sentences: SentenceTrace[];
    sourceArticles: Article[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSentence, setActiveSentence] = useState<SentenceTrace | null>(null);

  useEffect(() => {
    if (!integratedArticleId) return;
    setLoading(true);
    api.getIntegratedArticleDetail(integratedArticleId)
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load integrated article detail:', err);
        setLoading(false);
      });
  }, [integratedArticleId]);

  if (!integratedArticleId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex justify-center p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-main)]">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-[var(--accent)]" />
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Integrated Intelligence Synthesis
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Synthesized across {data?.sourceArticles?.length || 0} source articles with sentence-level provenance
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--text-secondary)] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading || !data ? (
            <div className="py-20 text-center text-xs text-[var(--text-secondary)] animate-pulse">
              Loading synthesized article...
            </div>
          ) : (
            <>
              {/* Title & Subtitle */}
              <div className="space-y-1.5">
                <span className="px-2.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[var(--accent)]/15 text-[var(--accent)]">
                  Integrated Story
                </span>
                <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">
                  {data.article.title}
                </h1>
                {data.article.subtitle && (
                  <p className="text-xs text-[var(--text-secondary)] italic">
                    {data.article.subtitle}
                  </p>
                )}
              </div>

              {/* Source Articles Badges */}
              <div className="p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] space-y-2">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  Source Articles Synthesized:
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.sourceArticles.map(src => (
                    <a
                      key={src.article_id}
                      href={src.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-md bg-[var(--bg-hover)] border border-[var(--border)] text-xs text-[var(--text-primary)] hover:border-[var(--accent)] flex items-center space-x-1.5"
                    >
                      <span className="font-bold text-[var(--accent)]">{src.source_id.toUpperCase()}</span>
                      <span className="truncate max-w-[200px]">{src.original_title}</span>
                      <ExternalLink className="w-3 h-3 text-[var(--text-secondary)]" />
                    </a>
                  ))}
                </div>
              </div>

              {/* Body with Interactive Sentence Footnotes */}
              <div className="space-y-4 text-sm text-[var(--text-primary)] leading-relaxed">
                <div className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border)]">
                  <p className="space-x-1">
                    {data.sentences.map(sent => {
                      const isHighlighted = activeSentence?.sentence_id === sent.sentence_id;
                      return (
                        <span
                          key={sent.sentence_id}
                          className={`transition-colors rounded px-0.5 ${
                            isHighlighted ? 'bg-[var(--accent)]/20 text-white font-medium' : ''
                          }`}
                        >
                          <span>{sent.sentence_text}</span>
                          {sent.sources.length > 0 && (
                            <button
                              onClick={() => setActiveSentence(sent)}
                              className="ml-0.5 inline-flex items-center justify-center text-[10px] font-bold text-[var(--accent)] hover:underline px-1 py-0.2 rounded hover:bg-[var(--accent)]/10"
                              title="Inspect source fragment trace"
                            >
                              [{sent.sentence_index}]
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </p>
                </div>
              </div>

              {/* Sentence Footnote Source Trace Popover / Panel */}
              {activeSentence && (
                <div className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--accent)]/40 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--accent)] flex items-center space-x-1">
                      <Quote className="w-3.5 h-3.5" />
                      <span>Sentence [{activeSentence.sentence_index}] Source Evidence Trace</span>
                    </span>
                    <button
                      onClick={() => setActiveSentence(null)}
                      className="text-[var(--text-secondary)] hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {activeSentence.sources.map(src => (
                      <div
                        key={src.id}
                        className="p-2.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--border)] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[var(--text-primary)]">
                            {src.source_title || 'Source Reference'}
                          </span>
                          {src.source_url && (
                            <a
                              href={src.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--accent)] hover:underline flex items-center space-x-1"
                            >
                              <span>Original URL</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <p className="text-[var(--text-secondary)] italic">
                          "{src.source_fragment}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-main)] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--bg-hover)] text-xs text-white font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
