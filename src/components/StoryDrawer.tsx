import React, { useState, useEffect } from 'react';
import { Article } from '../types';
import { api } from '../lib/api';
import { X, Layers, ExternalLink, Calendar, BookOpen } from 'lucide-react';

interface StoryDrawerProps {
  clusterId?: string | null;
  clusterTitle?: string;
  isOpen?: boolean;
  articles?: Article[];
  onClose: () => void;
  onSelectArticle: (articleId: string) => void;
  currentLang?: string;
}

export const StoryDrawer: React.FC<StoryDrawerProps> = ({
  clusterId,
  clusterTitle,
  isOpen = true,
  articles: propArticles,
  onClose,
  onSelectArticle,
  currentLang
}) => {
  const [clusterArticles, setClusterArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (propArticles && propArticles.length > 0) {
      setClusterArticles(propArticles);
      return;
    }

    if (clusterId) {
      setLoading(true);
      api.getStoryCluster(clusterId, currentLang)
        .then(res => {
          setClusterArticles(res.articles || []);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load story cluster:', err);
          setLoading(false);
        });
    }
  }, [clusterId, propArticles, currentLang]);

  if (!isOpen || !clusterId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-xl bg-[var(--bg-card)] border-l border-[var(--border)] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-start justify-between bg-[var(--bg-main)]">
          <div>
            <div className="flex items-center space-x-2 text-[var(--accent)] text-xs font-bold uppercase tracking-wider mb-1">
              <Layers className="w-3.5 h-3.5" />
              <span>Story Cluster Intelligence</span>
            </div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              {clusterTitle || 'Cross-Source Story Group'}
            </h2>
            <div className="text-xs text-[var(--text-secondary)] mt-1">
              {clusterArticles.length} reports tracked across independent news outlets
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Story articles list */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {loading ? (
            <div className="py-20 text-center text-xs text-[var(--text-secondary)]">
              Loading clustered articles...
            </div>
          ) : clusterArticles.length === 0 ? (
            <div className="py-20 text-center text-xs text-[var(--text-secondary)]">
              No articles found in this story cluster.
            </div>
          ) : (
            clusterArticles.map(art => (
              <div
                key={art.article_id}
                className="bg-[var(--bg-main)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--accent)] transition-all space-y-2.5"
              >
                <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span className="font-semibold px-2 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-primary)] uppercase">
                    {art.source_id}
                  </span>
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3 h-3" />
                    <span>{art.published_at.slice(0, 10)}</span>
                  </span>
                </div>

                <h4 className="text-sm font-bold text-[var(--text-primary)] leading-snug">
                  {art.displayTitle || art.original_title}
                </h4>

                {art.displaySubtitle && (
                  <p className="text-xs text-[var(--text-secondary)] italic">
                    {art.displaySubtitle}
                  </p>
                )}

                <p className="text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
                  {art.displaySummary || art.original_body.slice(0, 200) + '...'}
                </p>

                <div className="pt-2 flex items-center justify-between border-t border-[var(--border)] text-xs">
                  <button
                    onClick={() => {
                      onClose();
                      onSelectArticle(art.article_id);
                    }}
                    className="text-[var(--accent)] font-semibold flex items-center space-x-1 hover:underline"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Read Full Article</span>
                  </button>

                  <a
                    href={art.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center space-x-1"
                  >
                    <span>Original Source</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-main)] flex justify-between items-center text-xs text-[var(--text-secondary)]">
          <span>Clustered deterministically by title similarity & publication proximity.</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-[var(--bg-hover)] text-white hover:bg-[var(--border)] font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
