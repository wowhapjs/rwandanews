import React, { useState, useEffect } from 'react';
import { Article, FacetFilterState, ViewMode, TagInfo } from '../types';
import { api } from '../lib/api';
import { FacetFilterPanel } from '../components/FacetFilterPanel';
import { ArticleImageCarousel } from '../components/ArticleImageCarousel';
import {
  AlignLeft,
  LayoutGrid,
  Image as ImageIcon,
  ArrowUpDown,
  Download,
  Layers,
  Calendar,
  ExternalLink,
  CheckSquare,
  Square,
  Sparkles,
  Package,
  Columns,
  RefreshCw
} from 'lucide-react';
import { t } from '../lib/i18n';

const getDisplayTopic = (art: { topic?: string; portal_category_id?: string }): string => {
  const val = art.topic || art.portal_category_id;
  if (!val || val === 'undefined' || val === 'null' || val.trim() === '') {
    return 'General';
  }
  return val.trim();
};

interface NewsViewProps {
  currentLang: string;
  onSelectArticle: (articleId: string, allIds?: string[]) => void;
  onOpenStoryDrawer: (clusterId: string, clusterTitle: string) => void;
  onOpenTagExplorer: () => void;
  availableTags: TagInfo[];
  filters: FacetFilterState;
  onFilterChange: (filters: FacetFilterState) => void;
}

export const NewsView: React.FC<NewsViewProps> = ({
  currentLang,
  onSelectArticle,
  onOpenStoryDrawer,
  onOpenTagExplorer,
  availableTags,
  filters,
  onFilterChange
}) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('PHOTO_TEXT');
  const [columnQty, setColumnQty] = useState<number>(3);
  const [includeProcessed, setIncludeProcessed] = useState<boolean>(true);
  const [sort, setSort] = useState<'newest' | 'oldest' | 'recently_collected' | 'source'>('newest');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [groupingMessage, setGroupingMessage] = useState<string | null>(null);

  // Initial fetch (first 50 articles)
  const fetchArticles = (resetOffset = true) => {
    if (resetOffset) {
      setLoading(true);
      setOffset(0);
    }
    const currentOffset = resetOffset ? 0 : offset;

    api.getArticles({
      categories: filters.categories.join(','),
      regions: (filters.regions || []).join(','),
      aiStatus: (filters.aiStatus || []).join(','),
      sources: filters.sources.join(','),
      languages: filters.languages.join(','),
      tags: filters.tags.join(','),
      excludeCategories: (filters.excludeCategories || []).join(','),
      excludeRegions: (filters.excludeRegions || []).join(','),
      excludeSources: (filters.excludeSources || []).join(','),
      excludeLanguages: (filters.excludeLanguages || []).join(','),
      excludeTags: (filters.excludeTags || []).join(','),
      tagLogic: filters.tagLogic,
      search: filters.search,
      sort,
      lang: currentLang,
      limit: 50,
      offset: currentOffset
    })
      .then(res => {
        const fetched = res.articles || [];
        const totalCount = res.total || 0;
        setTotal(totalCount);
        if (resetOffset) {
          setArticles(fetched);
          setOffset(fetched.length);
          setHasMore(fetched.length < totalCount);
        } else {
          setArticles(prev => {
            const existingIds = new Set(prev.map(a => a.article_id));
            const newItems = fetched.filter(a => !existingIds.has(a.article_id));
            const updated = [...prev, ...newItems];
            setHasMore(updated.length < totalCount);
            return updated;
          });
          setOffset(prev => prev + fetched.length);
        }
        setLoading(false);
        setLoadingMore(false);
      })
      .catch(err => {
        console.error('Failed to load articles:', err);
        setLoading(false);
        setLoadingMore(false);
      });
  };

  // Load next 50 articles on scroll
  const loadMoreArticles = () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);

    api.getArticles({
      categories: filters.categories.join(','),
      regions: (filters.regions || []).join(','),
      aiStatus: (filters.aiStatus || []).join(','),
      sources: filters.sources.join(','),
      languages: filters.languages.join(','),
      tags: filters.tags.join(','),
      excludeCategories: (filters.excludeCategories || []).join(','),
      excludeRegions: (filters.excludeRegions || []).join(','),
      excludeSources: (filters.excludeSources || []).join(','),
      excludeLanguages: (filters.excludeLanguages || []).join(','),
      excludeTags: (filters.excludeTags || []).join(','),
      tagLogic: filters.tagLogic,
      search: filters.search,
      sort,
      lang: currentLang,
      limit: 50,
      offset: articles.length
    })
      .then(res => {
        const fetched = res.articles || [];
        const totalCount = res.total || 0;
        setTotal(totalCount);
        setArticles(prev => {
          const existingIds = new Set(prev.map(a => a.article_id));
          const newItems = fetched.filter(a => !existingIds.has(a.article_id));
          const combined = [...prev, ...newItems];
          setHasMore(combined.length < totalCount && fetched.length > 0);
          return combined;
        });
        setOffset(prev => prev + fetched.length);
        setLoadingMore(false);
      })
      .catch(err => {
        console.error('Failed to load more articles:', err);
        setLoadingMore(false);
      });
  };

  useEffect(() => {
    fetchArticles(true);
  }, [filters, sort, currentLang]);

  // Window scroll listener for Facebook-style infinite scroll (50 items per batch)
  useEffect(() => {
    const handleScroll = () => {
      if (loading || loadingMore || !hasMore) return;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      // When within 300px of bottom, trigger next 50 articles
      if (scrollY + windowHeight >= documentHeight - 300) {
        loadMoreArticles();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loading, loadingMore, hasMore, articles.length, filters, sort, currentLang]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === articles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(articles.map(a => a.article_id));
    }
  };

  const handleCreateAiBatch = async () => {
    const targetIds = selectedIds.length > 0 ? selectedIds : articles.map(a => a.article_id).slice(0, 25);
    setBatchActionLoading(true);
    try {
      const res = await api.createArticleBatch(targetIds, `News Batch (${targetIds.length} items)`, includeProcessed);
      alert(`Created AI Article Processing Batch (${res.itemCount} items). Downloading XLSX...`);
      window.location.href = res.downloadUrl;
      setSelectedIds([]);
      fetchArticles();
    } catch (err: any) {
      alert(`Failed to create AI batch: ${err.message}`);
    } finally {
      setBatchActionLoading(false);
    }
  };

  const handleCreateMultiBatchZip = async () => {
    const targetIds = selectedIds.length > 0 ? selectedIds : undefined;
    setBatchActionLoading(true);
    try {
      const res = await api.createMultiArticleBatch({
        articleIds: targetIds,
        chunkSize: 25,
        targetTotal: targetIds ? targetIds.length : 2500,
        includeProcessed
      });

      if (!res.success) {
        alert(`Failed to generate 100-file batch: ${res.error || 'Unknown error'}`);
        return;
      }

      alert(`Successfully packaged ${res.totalArticles} articles into ${res.fileCount} Excel files (25 articles each). Downloading ZIP package...`);
      window.location.href = res.downloadZipUrl;
      setSelectedIds([]);
      fetchArticles();
    } catch (err: any) {
      alert(`Multi-batch ZIP creation failed: ${err.message}`);
    } finally {
      setBatchActionLoading(false);
    }
  };

  const handleGroupSimilarArticles = async () => {
    setBatchActionLoading(true);
    setGroupingMessage('Grouping similar articles and examining titles & dates...');
    try {
      const targetIds = selectedIds.length > 0 ? selectedIds : undefined;
      const res = await api.groupSimilarArticles(targetIds);
      setGroupingMessage(res.message || 'Article relations & chronological links updated!');
      setTimeout(() => setGroupingMessage(null), 6000);
      fetchArticles();
    } catch (err: any) {
      alert(`Grouping failed: ${err.message}`);
      setGroupingMessage(null);
    } finally {
      setBatchActionLoading(false);
    }
  };

  const handleCreateIntegratedBatch = async () => {
    if (selectedIds.length < 2) {
      alert('Please select at least 2 articles covering the same topic to synthesize an integrated article.');
      return;
    }
    const topic = prompt('Enter a topic headline for the integrated article:', 'Synthesized Intelligence Report');
    if (!topic) return;

    setBatchActionLoading(true);
    try {
      const res = await api.createIntegratedBatch(selectedIds, topic);
      alert(`Created Integrated Article Batch (${res.itemCount} sources). Downloading XLSX...`);
      window.location.href = res.downloadUrl;
      setSelectedIds([]);
    } catch (err: any) {
      alert(`Failed to create integrated batch: ${err.message}`);
    } finally {
      setBatchActionLoading(false);
    }
  };

  const getGridClass = (qty: number) => {
    switch (qty) {
      case 1:
        return 'grid grid-cols-1 gap-4';
      case 2:
        return 'grid grid-cols-1 sm:grid-cols-2 gap-4';
      case 3:
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';
      case 4:
        return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4';
      case 5:
        return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3';
      default:
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Shared 4-Row Faceted Filter Panel */}
      <FacetFilterPanel
        filters={filters}
        onChange={onFilterChange}
        availableTags={availableTags}
        onOpenTagExplorer={onOpenTagExplorer}
      />

      {groupingMessage && (
        <div className="p-3 bg-[var(--bg-card)] border border-[var(--accent)]/50 rounded-xl text-xs text-[var(--text-primary)] flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <span>{groupingMessage}</span>
          </div>
          <button onClick={() => setGroupingMessage(null)} className="text-xs text-[var(--text-secondary)] hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar: View Modes, Dynamic Column Qty, Sort, Bulk Selection Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 shadow-sm">
        {/* Left: View Mode Toggle, Column Qty, Total Count */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-[var(--bg-main)] border border-[var(--border)] rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setViewMode('TEXT')}
              className={`px-2.5 py-1 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer ${
                viewMode === 'TEXT'
                  ? 'bg-[var(--accent)] text-white font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
              title="Multi-column Text View"
            >
              <AlignLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('view_mode_text', currentLang)}</span>
            </button>

            <button
              onClick={() => setViewMode('CARD')}
              className={`px-2.5 py-1 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer ${
                viewMode === 'CARD'
                  ? 'bg-[var(--accent)] text-white font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
              title="Card View with Photos and Left/Right Swapper"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('view_mode_card', currentLang)}</span>
            </button>

            <button
              onClick={() => setViewMode('PHOTO_TEXT')}
              className={`px-2.5 py-1 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer ${
                viewMode === 'PHOTO_TEXT'
                  ? 'bg-[var(--accent)] text-white font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
              title="Photo + Text Magazine View"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('view_mode_photo_text', currentLang)}</span>
            </button>
          </div>

          {/* Dynamic Column Quantity Setting for TEXT and CARD modes (1~5) */}
          {(viewMode === 'TEXT' || viewMode === 'CARD') && (
            <div className="flex items-center space-x-1 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-2 py-0.5 text-xs">
              <span className="text-[var(--text-secondary)] flex items-center space-x-1 font-medium mr-1">
                <Columns className="w-3 h-3 text-[var(--accent)]" />
                <span>{t('cols_label', currentLang)}</span>
              </span>
              {[1, 2, 3, 4, 5].map(qty => (
                <button
                  key={qty}
                  onClick={() => setColumnQty(qty)}
                  className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[11px] transition-colors cursor-pointer ${
                    columnQty === qty
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)]'
                  }`}
                  title={`${qty} Column${qty > 1 ? 's' : ''}`}
                >
                  {qty}
                </button>
              ))}
            </div>
          )}

          <span className="text-xs text-[var(--text-secondary)] font-medium">
            {total} {t('articles_unit', currentLang)}
          </span>
        </div>

        {/* Right: Sort, Processed Option, & Bulk Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Include processed articles for updates toggle */}
          <label className="flex items-center space-x-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none px-2 py-1 rounded bg-[var(--bg-main)] border border-[var(--border)] hover:border-[var(--accent)]/50">
            <input
              type="checkbox"
              checked={includeProcessed}
              onChange={e => setIncludeProcessed(e.target.checked)}
              className="rounded bg-[var(--bg-main)] border-[var(--border)] text-[var(--accent)] w-3.5 h-3.5"
            />
            <span className="hidden sm:inline">{t('allow_processed_updates', currentLang)}</span>
            <span className="sm:hidden">Updates</span>
          </label>

          {/* Multi-selection toggle */}
          <button
            onClick={handleSelectAll}
            className="text-xs text-[var(--text-secondary)] hover:text-white flex items-center space-x-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-main)] cursor-pointer"
          >
            {selectedIds.length === articles.length && articles.length > 0 ? (
              <CheckSquare className="w-3.5 h-3.5 text-[var(--accent)]" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            <span className="hidden md:inline">
              {selectedIds.length === articles.length && articles.length > 0
                ? t('deselect_all', currentLang)
                : t('select_all', currentLang)}
            </span>
          </button>

          {/* Group Similar Articles Button */}
          <button
            onClick={handleGroupSimilarArticles}
            disabled={batchActionLoading}
            className="px-2.5 py-1 bg-[var(--bg-main)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-primary)] rounded-md text-xs font-semibold flex items-center space-x-1 cursor-pointer"
            title="Group similar articles by examining titles & dates"
          >
            <Sparkles className="w-3 h-3 text-[var(--accent)]" />
            <span className="hidden sm:inline">Group Similar</span>
          </button>

          {/* Synthesize selection */}
          {selectedIds.length >= 2 && (
            <button
              onClick={handleCreateIntegratedBatch}
              disabled={batchActionLoading}
              className="px-2.5 py-1 bg-[var(--accent)] text-white rounded-md text-xs font-semibold flex items-center space-x-1 cursor-pointer"
              title="Synthesize selected articles into one cohesive article"
            >
              <Layers className="w-3 h-3" />
              <span>{t('synthesize_report', currentLang)} ({selectedIds.length})</span>
            </button>
          )}

          {/* Sort Selector */}
          <div className="flex items-center bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs">
            <ArrowUpDown className="w-3 h-3 text-[var(--text-secondary)] mr-1.5" />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as any)}
              className="bg-transparent text-[var(--text-primary)] focus:outline-none cursor-pointer text-xs"
            >
              <option value="newest" className="bg-[#151719] text-white">{t('sort_newest', currentLang)}</option>
              <option value="oldest" className="bg-[#151719] text-white">{t('sort_oldest', currentLang)}</option>
              <option value="recently_collected" className="bg-[#151719] text-white">Recently Collected</option>
              <option value="source" className="bg-[#151719] text-white">By Source</option>
            </select>
          </div>
        </div>
      </div>

      {/* Articles Stream */}
      {loading ? (
        <div className="py-24 text-center text-xs text-[var(--text-secondary)] animate-pulse">
          {t('loading_articles', currentLang)}
        </div>
      ) : articles.length === 0 ? (
        <div className="py-24 text-center bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl space-y-2">
          <div className="text-sm font-bold text-[var(--text-primary)]">{t('no_articles_found', currentLang)}</div>
          <div className="text-xs text-[var(--text-secondary)]">Try clearing some filter criteria above.</div>
        </div>
      ) : viewMode === 'TEXT' ? (
        /* 1. TEXT VIEW (Dynamic Multi-Column List 1~5) */
        <div className={getGridClass(columnQty)}>
          {articles.map(art => {
            const isSelected = selectedIds.includes(art.article_id);
            return (
              <div
                key={art.article_id}
                className={`bg-[var(--bg-card)] border rounded-xl p-3.5 hover:bg-[var(--bg-hover)] transition-all flex flex-col justify-between space-y-2.5 ${
                  isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)]'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(art.article_id)}
                        className="rounded bg-[var(--bg-main)] border-[var(--border)] text-[var(--accent)]"
                      />
                      <span className={`font-bold uppercase px-1.5 py-0.5 rounded text-[10px] ${
                        art.source_id === 'grouping'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                          : 'bg-[var(--bg-main)] text-[var(--text-primary)]'
                      }`}>
                        {art.source_id === 'grouping' ? 'Grouping · 종합' : art.source_id}
                      </span>
                    </div>
                    <span>{(art.published_at || '').slice(0, 10)}</span>
                  </div>

                  <h3
                    onClick={() => onSelectArticle(art.article_id, articles.map(a => a.article_id))}
                    className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer line-clamp-2 leading-snug"
                  >
                    {art.displayTitle || art.original_title}
                  </h3>

                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                    {art.displaySummary}
                  </p>
                </div>

                <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                  <span className="uppercase font-mono">
                    {getDisplayTopic(art)} &middot; {art.original_language}
                  </span>

                  {art.relatedStoriesCount > 0 && art.story_cluster_id && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onOpenStoryDrawer(art.story_cluster_id!, art.displayTitle);
                      }}
                      className="text-[var(--accent)] font-semibold hover:underline"
                    >
                      Related &middot; {art.relatedStoriesCount}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'CARD' ? (
        /* 2. CARD VIEW (Multi-column with Photo & Left/Right Swapping mode) */
        <div className={getGridClass(columnQty)}>
          {articles.map(art => {
            const isSelected = selectedIds.includes(art.article_id);
            return (
              <div
                key={art.article_id}
                className={`bg-[var(--bg-card)] border rounded-xl p-3.5 sm:p-4 flex flex-col justify-between transition-all space-y-3 ${
                  isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] hover:border-[var(--accent)]'
                }`}
              >
                <div className="space-y-2.5">
                  {/* Card Header: Source, Date, Checkbox */}
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(art.article_id)}
                        className="rounded bg-[var(--bg-main)] border-[var(--border)] text-[var(--accent)]"
                      />
                      <span className={`font-bold px-2 py-0.5 rounded uppercase text-[10px] ${
                        art.source_id === 'grouping'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                          : 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                      }`}>
                        {art.source_id === 'grouping' ? 'Grouping · 종합' : art.source_id}
                      </span>
                    </div>
                    <span>{(art.published_at || '').slice(0, 10)}</span>
                  </div>

                  {/* Photo Display with Left/Right Swapping Mode */}
                  <ArticleImageCarousel
                    leadImageUrl={art.lead_image_url}
                    imageUrls={art.image_urls}
                    contentBlocks={art.content_blocks}
                    altTitle={art.displayTitle || art.original_title}
                    onClick={() => onSelectArticle(art.article_id, articles.map(a => a.article_id))}
                    aspectRatioClass="aspect-video"
                  />

                  {/* Title */}
                  <h3
                    onClick={() => onSelectArticle(art.article_id, articles.map(a => a.article_id))}
                    className="text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer line-clamp-2 leading-snug"
                  >
                    {art.displayTitle || art.original_title}
                  </h3>

                  {/* Summary */}
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
                    {art.displaySummary}
                  </p>
                </div>

                {/* Card Footer */}
                <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span className="uppercase font-mono text-[10px]">
                    {getDisplayTopic(art)}
                  </span>

                  {art.relatedStoriesCount > 0 && art.story_cluster_id && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onOpenStoryDrawer(art.story_cluster_id!, art.displayTitle);
                      }}
                      className="px-2 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] font-bold hover:bg-[var(--accent)]/25 transition-colors text-[10px]"
                    >
                      Related Story &middot; {art.relatedStoriesCount}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 3. PHOTO + TEXT MAGAZINE VIEW (With Left/Right Photo Swapping Mode) */
        <div className="space-y-4">
          {articles.map(art => {
            const isSelected = selectedIds.includes(art.article_id);
            const hasPhotos = !!art.lead_image_url || (art.image_urls && art.image_urls.length > 0);

            return (
              <div
                key={art.article_id}
                className={`bg-[var(--bg-card)] border rounded-2xl overflow-hidden pr-4 sm:pr-5 flex flex-col md:flex-row gap-5 transition-all ${
                  isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] hover:border-[var(--accent)]'
                }`}
              >
                {/* Checkbox and Left Photo Carousel - flush to top, bottom, left */}
                <div className="relative shrink-0 flex flex-col md:flex-row items-center md:items-stretch">
                  <div className="absolute top-2 left-2 z-20 bg-black/40 rounded p-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(art.article_id)}
                      className="rounded bg-[var(--bg-main)] border-[var(--border)] text-[var(--accent)] block"
                    />
                  </div>

                  {hasPhotos && (
                    <div className="w-full md:w-64 lg:w-72 h-48 md:h-full shrink-0">
                      <ArticleImageCarousel
                        leadImageUrl={art.lead_image_url}
                        imageUrls={art.image_urls}
                        contentBlocks={art.content_blocks}
                        altTitle={art.displayTitle}
                        onClick={() => onSelectArticle(art.article_id, articles.map(a => a.article_id))}
                        aspectRatioClass="w-full h-full min-h-[160px]"
                        className="w-full h-full rounded-none md:rounded-l-2xl border-0"
                      />
                    </div>
                  )}
                </div>

                {/* Content Details with py-5 for top/bottom padding */}
                <div className="flex-1 flex flex-col justify-between space-y-2 py-4 sm:py-5 pl-4 sm:pl-0">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span className={`font-bold px-2 py-0.5 rounded uppercase text-[10px] ${
                        art.source_id === 'grouping'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                          : 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                      }`}>
                        {art.source_id === 'grouping' ? 'Grouping · 종합' : art.source_id}
                      </span>
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>{(art.published_at || '').slice(0, 10)}</span>
                      </span>
                      <span className="uppercase text-[10px] font-mono">
                        {art.original_language}
                      </span>
                      <span className="uppercase text-[10px] font-mono text-[var(--accent)]">
                        {getDisplayTopic(art)}
                      </span>

                      {art.relatedStoriesCount > 0 && art.story_cluster_id && (
                        <button
                          onClick={() => onOpenStoryDrawer(art.story_cluster_id!, art.displayTitle)}
                          className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25"
                        >
                          Related Story &middot; {art.relatedStoriesCount}
                        </button>
                      )}
                    </div>

                    <h2
                      onClick={() => onSelectArticle(art.article_id, articles.map(a => a.article_id))}
                      className="text-base sm:text-lg font-bold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer leading-snug"
                    >
                      {art.displayTitle || art.original_title}
                    </h2>

                    {art.displaySubtitle && (
                      <p className="text-xs text-[var(--text-secondary)] italic">
                        {art.displaySubtitle}
                      </p>
                    )}

                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
                      {art.displaySummary}
                    </p>
                  </div>

                  {/* Tags & Action Bar */}
                  <div className="pt-2 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {(art.tags || []).slice(0, 4).map(t => (
                        <span
                          key={t.id}
                          className="px-2 py-0.5 rounded text-[10px] bg-[var(--bg-main)] border border-[var(--border)] text-[var(--text-secondary)]"
                        >
                          {t.name || t.key}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center space-x-3 text-xs">
                      <button
                        onClick={() => onSelectArticle(art.article_id)}
                        className="text-[var(--accent)] font-semibold hover:underline"
                      >
                        Read Article &rarr;
                      </button>
                      <a
                        href={art.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--text-secondary)] hover:text-white flex items-center space-x-1"
                      >
                        <span>Source</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Infinite Scroll Indicator / Load More */}
      {loadingMore && (
        <div className="py-6 flex items-center justify-center space-x-2 text-xs text-[var(--text-secondary)]">
          <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent)]" />
          <span>Loading more articles (50 items)...</span>
        </div>
      )}

      {!loading && !loadingMore && hasMore && articles.length > 0 && (
        <div className="py-6 flex justify-center">
          <button
            onClick={loadMoreArticles}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-primary)] shadow-sm transition-all flex items-center space-x-2"
          >
            <span>Load Next 50 Articles</span>
            <span className="text-[var(--text-secondary)]">({articles.length} of {total})</span>
          </button>
        </div>
      )}

      {!hasMore && articles.length > 0 && (
        <div className="py-6 text-center text-xs text-[var(--text-secondary)]">
          All {total} articles loaded.
        </div>
      )}
    </div>
  );
};
