import React, { useState, useEffect, useMemo, useRef } from 'react';
import Markdown from 'react-markdown';
import { Article, ContentBlock } from '../types';
import { api } from '../lib/api';
import {
  X,
  ExternalLink,
  Calendar,
  User,
  Globe,
  Tag,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Layers,
  Image as ImageIcon
} from 'lucide-react';

interface ArticleDetailModalProps {
  articleId: string | null;
  onClose: () => void;
  currentLang?: string;
  onSelectArticle?: (articleId: string) => void;
  onOpenStoryDrawer?: (clusterId: string, clusterTitle: string) => void;
  onOpenStoryCluster?: (clusterId: string, clusterTitle: string) => void;
  articleIds?: string[];
  onNavigateArticle?: (articleId: string) => void;
  onLoadMoreArticles?: () => Promise<string[]>;
  onTagClick?: (tagKey: string) => void;
  activeTagFilters?: string[];
}

export const ArticleDetailModal: React.FC<ArticleDetailModalProps> = ({
  articleId,
  onClose,
  currentLang = 'original',
  onSelectArticle,
  onOpenStoryDrawer,
  onOpenStoryCluster,
  articleIds = [],
  onNavigateArticle,
  onLoadMoreArticles,
  onTagClick,
  activeTagFilters = []
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(Boolean(articleId));
  const [isNavigating, setIsNavigating] = useState<'next' | 'prev' | null>(null);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(articleId);
  const [activeLang, setActiveLang] = useState<'original' | 'ko' | 'en' | 'rw'>(
    (currentLang as any) || 'original'
  );
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number>(0);
  const [expandedSourceArticles, setExpandedSourceArticles] = useState<Record<string, boolean>>({});
  const modalBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentLang && ['original', 'ko', 'en', 'rw'].includes(currentLang)) {
      setActiveLang(currentLang as any);
    }
  }, [currentLang]);

  useEffect(() => {
    setActiveArticleId(articleId);
    if (articleId && articleId !== data?.article?.article_id) {
      setLoading(true);
    }
  }, [articleId]);

  useEffect(() => {
    if (!activeArticleId) return;
    if (data?.article?.article_id === activeArticleId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setSelectedPhotoIndex(0);
    api.getArticleById(activeArticleId)
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load article detail:', err);
        setLoading(false);
      });
  }, [activeArticleId]);

  const article: Article = data?.article;
  const localized = data?.localized;
  const currentLocalized = activeLang !== 'original' ? localized?.[activeLang] : null;

  const displayTitle = currentLocalized?.title || article?.original_title;
  const displaySubtitle = currentLocalized?.subtitle || article?.original_subtitle;
  const displaySummary = currentLocalized?.summary;

  // Compute Prev / Next article IDs
  const currentIndex = activeArticleId && articleIds.length > 0 ? articleIds.indexOf(activeArticleId) : -1;
  const prevId = currentIndex > 0
    ? articleIds[currentIndex - 1]
    : (data?.previousArticles?.[0]?.article_id || null);
  const nextId = currentIndex >= 0 && currentIndex < articleIds.length - 1
    ? articleIds[currentIndex + 1]
    : (data?.futureArticles?.[0]?.article_id || null);

  const handleNavigate = async (targetId: string | null, direction: 'next' | 'prev' = 'next') => {
    if (isNavigating) return;

    let destinationId = targetId;

    // Check if at the end of the loaded 50-batch and clicking Next:
    if ((!destinationId || currentIndex === articleIds.length - 1) && direction === 'next' && onLoadMoreArticles) {
      setIsNavigating('next');
      try {
        const updatedIds = await onLoadMoreArticles();
        const curIdx = activeArticleId ? updatedIds.indexOf(activeArticleId) : -1;
        if (curIdx >= 0 && curIdx < updatedIds.length - 1) {
          destinationId = updatedIds[curIdx + 1];
        }
      } catch (err) {
        console.error('Failed to load next 50 articles batch:', err);
      }
    }

    if (!destinationId) {
      setIsNavigating(null);
      return;
    }

    setIsNavigating(direction);
    try {
      // Pre-fetch article data completely BEFORE changing the view so the user has no blank screen
      const res = await api.getArticleById(destinationId);
      setData(res);
      setActiveArticleId(destinationId);
      setSelectedPhotoIndex(0);
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      if (onNavigateArticle) {
        onNavigateArticle(destinationId);
      } else if (onSelectArticle) {
        onSelectArticle(destinationId);
      }
    } catch (err) {
      console.error('Failed to pre-fetch article:', err);
    } finally {
      setIsNavigating(null);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prevId && !isNavigating) {
        handleNavigate(prevId, 'prev');
      } else if (e.key === 'ArrowRight' && (nextId || onLoadMoreArticles) && !isNavigating) {
        handleNavigate(nextId, 'next');
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevId, nextId, isNavigating, activeArticleId, articleIds]);

  // Aggregate all unique photos associated with this article
  const allImages = useMemo(() => {
    if (!article) return [];
    const imgs: { url: string; caption?: string; credit?: string }[] = [];
    const seen = new Set<string>();

    if (article.lead_image_url && !seen.has(article.lead_image_url)) {
      seen.add(article.lead_image_url);
      imgs.push({ url: article.lead_image_url, caption: 'Lead Photo' });
    }

    (article.image_urls || []).forEach((u, i) => {
      if (u && !seen.has(u)) {
        seen.add(u);
        imgs.push({ url: u, caption: `Photo ${imgs.length + 1}` });
      }
    });

    (article.content_blocks || []).forEach(b => {
      if (b.type === 'image' && b.url && !seen.has(b.url)) {
        seen.add(b.url);
        imgs.push({ url: b.url, caption: b.caption || b.alt, credit: b.credit });
      }
    });

    return imgs;
  }, [article]);

  // Set of image URLs that already have a dedicated position in content blocks
  const inlineImageUrls = useMemo(() => {
    if (!article?.content_blocks) return new Set<string>();
    return new Set(
      article.content_blocks
        .filter(b => b.type === 'image' && b.url)
        .map(b => b.url!)
    );
  }, [article]);

  // Only photos that DO NOT have an original placement in the content flow are shown at the top
  const unpositionedImages = useMemo(() => {
    return allImages.filter(img => !inlineImageUrls.has(img.url));
  }, [allImages, inlineImageUrls]);

  // Reconstructed content blocks preserving inline images in their original positions
  const currentBlocks = useMemo(() => {
    if (activeLang === 'original') {
      return article?.content_blocks || [];
    }
    const loc = localized?.[activeLang];
    if (loc?.content_blocks && loc.content_blocks.length > 0) {
      return loc.content_blocks;
    }
    // If localized body is text
    if (loc?.body) {
      const paragraphs = loc.body.split(/\n\s*\n/).map((p: string) => p.trim()).filter(Boolean);
      // Weave with article.content_blocks image anchors if any exist
      if (article?.content_blocks && article.content_blocks.some(b => b.type === 'image')) {
        const result: any[] = [];
        let pIdx = 0;
        article.content_blocks.forEach(b => {
          if (b.type === 'image') {
            result.push(b);
          } else {
            if (pIdx < paragraphs.length) {
              const rawText = paragraphs[pIdx];
              result.push({
                blockId: `LOC-${pIdx}`,
                type: rawText.startsWith('#') ? 'heading' : 'paragraph',
                text: rawText
              });
              pIdx++;
            }
          }
        });
        while (pIdx < paragraphs.length) {
          const rawText = paragraphs[pIdx];
          result.push({
            blockId: `LOC-${pIdx}`,
            type: rawText.startsWith('#') ? 'heading' : 'paragraph',
            text: rawText
          });
          pIdx++;
        }
        return result;
      }

      // If no image blocks, return localized paragraphs directly
      return paragraphs.map((rawText: string, idx: number) => ({
        blockId: `LOC-${idx}`,
        type: rawText.startsWith('#') ? 'heading' : 'paragraph',
        text: rawText
      }));
    }
    // If no localized translation exists for this language, return empty to trigger fallback notice
    return [];
  }, [activeLang, article, localized]);

  if (!articleId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex justify-center p-3 sm:p-6">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl my-auto flex flex-col max-h-[92vh]">
        {/* Modal Top Bar: Language Switcher, Article Pager, Close */}
        <div className="p-3 sm:p-4 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2 bg-[var(--bg-main)]">
          {/* Language Switcher */}
          <div className="flex items-center space-x-1 bg-[var(--bg-hover)] p-1 rounded-lg border border-[var(--border)] text-xs">
            <button
              onClick={() => setActiveLang('original')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeLang === 'original'
                  ? 'bg-[var(--accent)] !text-white font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              Original ({article?.original_language ? article.original_language.toUpperCase() : 'SRC'})
            </button>
            <button
              onClick={() => setActiveLang('ko')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeLang === 'ko'
                  ? 'bg-[var(--accent)] !text-white font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              한국어 {localized?.ko ? '✓' : ''}
            </button>
            <button
              onClick={() => setActiveLang('en')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeLang === 'en'
                  ? 'bg-[var(--accent)] !text-white font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              English {localized?.en ? '✓' : ''}
            </button>
            <button
              onClick={() => setActiveLang('rw')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeLang === 'rw'
                  ? 'bg-[var(--accent)] !text-white font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              Kinyarwanda {localized?.rw ? '✓' : ''}
            </button>
          </div>

          {/* Previous / Next Article Navigation */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-[var(--bg-hover)] border border-[var(--border)] rounded-lg p-0.5 text-xs">
              <button
                onClick={() => handleNavigate(prevId, 'prev')}
                disabled={!prevId || !!isNavigating}
                className={`px-2 py-1 rounded flex items-center space-x-1 transition-colors ${
                  prevId && !isNavigating
                    ? 'text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-white cursor-pointer'
                    : 'text-gray-500 opacity-40 cursor-not-allowed'
                }`}
                title="Previous Article (Left Arrow)"
              >
                {isNavigating === 'prev' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">
                  {isNavigating === 'prev' ? '불러오는 중...' : '이전 기사'}
                </span>
              </button>

              {currentIndex >= 0 && articleIds.length > 0 && (
                <span className="px-2 text-[11px] text-[var(--text-secondary)] font-mono border-x border-[var(--border)]">
                  {currentIndex + 1} / {articleIds.length}
                </span>
              )}

              <button
                onClick={() => handleNavigate(nextId, 'next')}
                disabled={(!nextId && !onLoadMoreArticles) || !!isNavigating}
                className={`px-2 py-1 rounded flex items-center space-x-1 transition-colors ${
                  (nextId || onLoadMoreArticles) && !isNavigating
                    ? 'text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-white cursor-pointer'
                    : 'text-gray-500 opacity-40 cursor-not-allowed'
                }`}
                title="Next Article (Right Arrow)"
              >
                <span className="hidden sm:inline">
                  {isNavigating === 'next' ? '불러오는 중...' : '다음 기사'}
                </span>
                {isNavigating === 'next' ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent)]" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div ref={modalBodyRef} className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6 relative">
          {/* Subtle loading indicator overlay while pre-fetching next/previous article */}
          {isNavigating && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent animate-pulse" />
          )}

          {loading || !article ? (
            <div className="py-24 text-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[var(--accent)] mx-auto" />
              <div className="text-sm font-medium text-[var(--text-secondary)]">
                Loading intelligence article...
              </div>
            </div>
          ) : (
            <>
              {/* Metadata Badges */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className={`px-2.5 py-1 rounded-md font-bold uppercase tracking-wider ${
                  article?.source_id === 'grouping'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-xs'
                    : 'bg-[var(--accent)]/15 text-[var(--accent)]'
                }`}>
                  {article?.source_id === 'grouping' ? 'Grouping · 종합 AI 리포트' : (article?.source_id || 'UNKNOWN')}
                </span>
                {article?.published_at && (
                  <span className="flex items-center space-x-1 bg-[var(--bg-hover)] px-2.5 py-1 rounded-md">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{article.published_at.slice(0, 16).replace('T', ' ')}</span>
                  </span>
                )}
                {article?.author && (
                  <span className="flex items-center space-x-1 bg-[var(--bg-hover)] px-2.5 py-1 rounded-md">
                    <User className="w-3.5 h-3.5" />
                    <span>{article.author}</span>
                  </span>
                )}
                {(() => {
                  const raw = article?.topic || article?.portal_category_id;
                  const displayCat = (raw && raw !== 'undefined' && raw !== 'null' && raw.trim() !== '') ? raw.trim() : 'General';
                  return (
                    <span className="flex items-center space-x-1 bg-[var(--bg-hover)] px-2.5 py-1 rounded-md">
                      <Globe className="w-3.5 h-3.5" />
                      <span className="uppercase">{displayCat}</span>
                    </span>
                  );
                })()}
                {article?.region && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold text-[11px] uppercase">
                    {article.region}
                  </span>
                )}
              </div>

              {/* Title & Subtitle */}
              <div className="space-y-2">
                <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] leading-tight">
                  {displayTitle}
                </h1>
                {displaySubtitle && (
                  <p className="text-sm font-medium text-[var(--text-secondary)] leading-relaxed italic">
                    {displaySubtitle}
                  </p>
                )}
              </div>

              {/* AI 3-Sentence Summary (if localized) */}
              {displaySummary && (
                <div className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--accent)]/30 space-y-2.5">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-[var(--accent)]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>3-Sentence Intelligence Summary ({activeLang.toUpperCase()})</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-[var(--text-primary)] leading-relaxed">
                    {(() => {
                      // Check if already contains newlines
                      const lines = displaySummary.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
                      if (lines.length >= 2) {
                        return lines.map((line: string, idx: number) => (
                          <div key={idx} className="flex items-start space-x-2">
                            <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] font-mono text-[10px] flex items-center justify-center font-bold mt-0.5">
                              {idx + 1}
                            </span>
                            <p className="flex-1">{line}</p>
                          </div>
                        ));
                      }
                      // Split by sentence delimiters (. / ? / ! followed by space or Korean closing marks)
                      const sentences = displaySummary
                        .split(/(?<=[.?!。])\s+/)
                        .map((s: string) => s.trim())
                        .filter(Boolean);

                      if (sentences.length <= 1) {
                        return <p>{displaySummary}</p>;
                      }

                      return sentences.map((sentence: string, idx: number) => (
                        <div key={idx} className="flex items-start space-x-2">
                          <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] font-mono text-[10px] flex items-center justify-center font-bold mt-0.5">
                            {idx + 1}
                          </span>
                          <p className="flex-1">{sentence}</p>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {/* Top Photo Display: ONLY photos without an original inline position */}
              {unpositionedImages.length > 0 && (
                <div className="space-y-3 p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border)]">
                  <div className="relative rounded-xl overflow-hidden bg-black/40 border border-[var(--border)]">
                    <img
                      src={unpositionedImages[selectedPhotoIndex < unpositionedImages.length ? selectedPhotoIndex : 0]?.url}
                      alt={unpositionedImages[selectedPhotoIndex < unpositionedImages.length ? selectedPhotoIndex : 0]?.caption || 'Article photo'}
                      referrerPolicy="no-referrer"
                      className="w-full max-h-[420px] object-contain mx-auto transition-all duration-200"
                    />
                    {(unpositionedImages[selectedPhotoIndex < unpositionedImages.length ? selectedPhotoIndex : 0]?.caption || unpositionedImages[selectedPhotoIndex < unpositionedImages.length ? selectedPhotoIndex : 0]?.credit) && (
                      <div className="p-2.5 bg-black/75 backdrop-blur-sm text-xs text-slate-200 text-center border-t border-[var(--border)]">
                        <span>{unpositionedImages[selectedPhotoIndex < unpositionedImages.length ? selectedPhotoIndex : 0]?.caption}</span>
                        {unpositionedImages[selectedPhotoIndex < unpositionedImages.length ? selectedPhotoIndex : 0]?.credit && (
                          <span className="text-slate-400 ml-2">Photo: {unpositionedImages[selectedPhotoIndex < unpositionedImages.length ? selectedPhotoIndex : 0]?.credit}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Thumbnail Row if multiple unpositioned photos */}
                  {unpositionedImages.length > 1 && (
                    <div className="flex items-center space-x-2 overflow-x-auto pb-1 pt-1">
                      {unpositionedImages.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedPhotoIndex(idx)}
                          className={`relative shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                            selectedPhotoIndex === idx
                              ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40 scale-105'
                              : 'border-[var(--border)] opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={img.url}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Content Blocks / Body: inline images stay in their original positions */}
              <div className="space-y-4 text-sm text-[var(--text-primary)] leading-relaxed">
                {currentBlocks && currentBlocks.length > 0 ? (
                  currentBlocks.map((blk: ContentBlock, idx: number) => {
                    if (blk.type === 'heading') {
                      return (
                        <div key={blk.blockId || idx} className="pt-4 pb-1">
                          <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] flex items-center space-x-2 border-b border-[var(--border)]/50 pb-1.5">
                            <span className="w-1.5 h-4 rounded-full bg-[var(--accent)] shrink-0 inline-block" />
                            <span>{blk.text?.replace(/^#+\s*/, '')}</span>
                          </h3>
                        </div>
                      );
                    }
                    if (blk.type === 'blockquote') {
                      return (
                        <blockquote
                          key={blk.blockId || idx}
                          className="pl-4 py-2 border-l-3 border-[var(--accent)] italic text-[var(--text-secondary)] my-3 bg-[var(--bg-hover)]/40 rounded-r-lg text-sm"
                        >
                          {blk.text?.replace(/^>\s*/, '')}
                        </blockquote>
                      );
                    }
                    if (blk.type === 'image' && blk.url) {
                      // Photo rendered directly in its original inline position
                      return (
                        <figure key={blk.blockId || idx} className="my-5 space-y-2">
                          <div className="rounded-xl overflow-hidden bg-black/40 border border-[var(--border)] max-w-2xl mx-auto shadow-md">
                            <img
                              src={blk.url}
                              alt={blk.caption || blk.alt || 'Article photo'}
                              referrerPolicy="no-referrer"
                              className="w-full max-h-[480px] object-contain mx-auto transition-transform hover:scale-[1.01] duration-200"
                            />
                          </div>
                          {(blk.caption || blk.credit) && (
                            <figcaption className="text-xs text-center text-[var(--text-secondary)] italic px-2">
                              <span>{blk.caption}</span>
                              {blk.credit && (
                                <span className="ml-2 not-italic font-medium text-[11px] opacity-75">
                                  (Photo: {blk.credit})
                                </span>
                              )}
                            </figcaption>
                          )}
                        </figure>
                      );
                    }
                    return (
                      <div key={blk.blockId || idx} className="text-sm text-[var(--text-primary)]/90 leading-relaxed font-normal">
                        <Markdown
                          components={{
                            h1: ({ children }) => <h3 className="text-lg font-bold text-[var(--text-primary)] pt-3 pb-1">{children}</h3>,
                            h2: ({ children }) => <h3 className="text-base font-bold text-[var(--text-primary)] pt-3 pb-1">{children}</h3>,
                            h3: ({ children }) => <h4 className="text-sm font-bold text-[var(--text-primary)] pt-2 pb-0.5">{children}</h4>,
                            p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                            strong: ({ children }) => <strong className="font-bold text-[var(--text-primary)]">{children}</strong>,
                            a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">{children}</a>
                          }}
                        >
                          {blk.text || ''}
                        </Markdown>
                      </div>
                    );
                  })
                ) : activeLang !== 'original' && !currentLocalized?.body ? (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                    <div className="font-bold flex items-center space-x-1.5">
                      <Sparkles className="w-4 h-4" />
                      <span>선택한 언어({activeLang.toUpperCase()}) 번역본이 아직 등록되지 않았습니다.</span>
                    </div>
                    <p className="text-[var(--text-secondary)]">
                      ChatGPT 다국어 번역 에이전트 작업을 통해 번역이 완료되면 실시간 반영됩니다. 아래에 원문 본문이 표시됩니다.
                    </p>
                    <div className="pt-2 text-sm text-[var(--text-primary)]/90 border-t border-amber-500/20 leading-relaxed font-normal">
                      <Markdown
                        components={{
                          h1: ({ children }) => <h3 className="text-lg font-bold text-[var(--text-primary)] pt-3 pb-1 border-b border-[var(--border)]/40">{children}</h3>,
                          h2: ({ children }) => <h3 className="text-base font-bold text-[var(--text-primary)] pt-3 pb-1">{children}</h3>,
                          h3: ({ children }) => <h4 className="text-sm font-bold text-[var(--text-primary)] pt-2 pb-0.5">{children}</h4>,
                          p: ({ children }) => <p className="mb-3 leading-relaxed whitespace-pre-line">{children}</p>,
                          strong: ({ children }) => <strong className="font-bold text-[var(--text-primary)]">{children}</strong>,
                          blockquote: ({ children }) => <blockquote className="pl-4 py-1.5 border-l-3 border-[var(--accent)] italic text-[var(--text-secondary)] my-3 bg-[var(--bg-hover)]/40 rounded-r-lg">{children}</blockquote>,
                          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline inline-flex items-center gap-0.5">{children} <ExternalLink className="w-3 h-3 inline" /></a>
                        }}
                      >
                        {article.original_body}
                      </Markdown>
                    </div>
                  </div>
                ) : (
                  // Fallback: Localized body paragraphs with markdown support
                  <div className="space-y-3 text-sm text-[var(--text-primary)]/90 leading-relaxed">
                    <Markdown
                      components={{
                        h1: ({ children }) => <h3 className="text-lg font-bold text-[var(--text-primary)] pt-3 pb-1 border-b border-[var(--border)]/40">{children}</h3>,
                        h2: ({ children }) => <h3 className="text-base font-bold text-[var(--text-primary)] pt-3 pb-1">{children}</h3>,
                        h3: ({ children }) => <h4 className="text-sm font-bold text-[var(--text-primary)] pt-2 pb-0.5">{children}</h4>,
                        p: ({ children }) => <p className="mb-3 leading-relaxed whitespace-pre-line">{children}</p>,
                        strong: ({ children }) => <strong className="font-bold text-[var(--text-primary)]">{children}</strong>,
                        blockquote: ({ children }) => <blockquote className="pl-4 py-1.5 border-l-3 border-[var(--accent)] italic text-[var(--text-secondary)] my-3 bg-[var(--bg-hover)]/40 rounded-r-lg">{children}</blockquote>,
                        a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline inline-flex items-center gap-0.5">{children} <ExternalLink className="w-3 h-3 inline" /></a>
                      }}
                    >
                      {currentLocalized?.body || article.original_body}
                    </Markdown>
                  </div>
                )}
              </div>

              {/* Concepts Tags Section with Interactive Filtering */}
              {data?.tags && data.tags.length > 0 && (
                <div className="pt-4 border-t border-[var(--border)] space-y-2">
                  <div className="text-xs font-semibold text-[var(--text-secondary)] flex items-center space-x-1">
                    <Tag className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Concepts & Tags (Click tag to filter news list, re-click to clear):</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {data.tags.map((t: any) => {
                      const isSelected = activeTagFilters.includes(t.key);
                      return (
                        <button
                          key={t.id}
                          onClick={() => onTagClick && onTagClick(t.key)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all flex items-center space-x-1.5 cursor-pointer ${
                            isSelected
                              ? 'bg-[var(--accent)] border-[var(--accent)] text-white shadow-md font-bold'
                              : 'bg-[var(--bg-hover)] border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)]'
                          }`}
                          title={isSelected ? '현재 필터링 중 (클릭시 필터 취소)' : '클릭시 이 테그로 뉴스 리스트 필터링'}
                        >
                          <span>#{t.nameEn || t.key}</span>
                          {isSelected && <span className="ml-1 text-[11px] font-bold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Similar & Chronological Related Articles */}
              {((data?.similarArticles && data.similarArticles.length > 0) ||
                (data?.previousArticles && data.previousArticles.length > 0) ||
                (data?.futureArticles && data.futureArticles.length > 0)) && (
                <div className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] space-y-4">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                    <span className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Article Relations & Chronological Context</span>
                    </span>
                    {data?.storyCluster && onOpenStoryDrawer && (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenStoryDrawer(data.storyCluster.id, data.storyCluster.title);
                        }}
                        className="text-[11px] text-[var(--accent)] hover:underline font-semibold"
                      >
                        {data.storyCluster.title} &rarr;
                      </button>
                    )}
                  </div>

                  {/* 1. Similar Articles */}
                  {data.similarArticles && data.similarArticles.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-[var(--text-primary)] uppercase">
                        Similar Articles ({data.similarArticles.length})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {data.similarArticles.map((rel: any) => (
                          <div
                            key={rel.article_id}
                            onClick={() => handleNavigate(rel.article_id)}
                            className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition-colors space-y-1"
                          >
                            <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                              <span className="font-bold uppercase text-[var(--accent)]">{rel.source_id}</span>
                              <span>{rel.published_at?.slice(0, 10)}</span>
                            </div>
                            <h4 className="text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] line-clamp-2 leading-tight">
                              {rel.original_title}
                            </h4>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. Previous Related Articles */}
                  {data.previousArticles && data.previousArticles.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-[var(--border)]/60">
                      <div className="text-[11px] font-bold text-amber-400 uppercase flex items-center space-x-1">
                        <span>&larr; Previous Related Articles ({data.previousArticles.length})</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {data.previousArticles.map((rel: any) => (
                          <div
                            key={rel.article_id}
                            onClick={() => handleNavigate(rel.article_id)}
                            className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-amber-400/70 cursor-pointer transition-colors space-y-1"
                          >
                            <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                              <span className="font-bold uppercase text-amber-400">{rel.source_id}</span>
                              <span>{rel.published_at?.slice(0, 10)}</span>
                            </div>
                            <h4 className="text-xs font-semibold text-[var(--text-primary)] hover:text-amber-400 line-clamp-2 leading-tight">
                              {rel.original_title}
                            </h4>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. Future Related Articles */}
                  {data.futureArticles && data.futureArticles.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-[var(--border)]/60">
                      <div className="text-[11px] font-bold text-emerald-400 uppercase flex items-center space-x-1">
                        <span>Future / Follow-up Articles &rarr; ({data.futureArticles.length})</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {data.futureArticles.map((rel: any) => (
                          <div
                            key={rel.article_id}
                            onClick={() => handleNavigate(rel.article_id)}
                            className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-emerald-400/70 cursor-pointer transition-colors space-y-1"
                          >
                            <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                              <span className="font-bold uppercase text-emerald-400">{rel.source_id}</span>
                              <span>{rel.published_at?.slice(0, 10)}</span>
                            </div>
                            <h4 className="text-xs font-semibold text-[var(--text-primary)] hover:text-emerald-400 line-clamp-2 leading-tight">
                              {rel.original_title}
                            </h4>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Associated Events & All Co-articles Covering the Events */}
              {data?.relatedEvents && data.relatedEvents.length > 0 && (
                <div className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] space-y-4">
                  <div className="flex items-center space-x-2 text-xs font-bold text-[var(--accent)] uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Associated Events & Related Article Coverage</span>
                  </div>

                  <div className="space-y-4">
                    {data.relatedEvents.map((evt: any) => (
                      <div
                        key={evt.event_id}
                        className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-[var(--text-primary)]">
                              {evt.canonical_name}
                            </h4>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {evt.start_date} {evt.start_time || ''} &middot; {evt.venue ? `${evt.venue}, ` : ''}{evt.city}
                            </p>
                          </div>
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-[var(--accent)]/15 text-[var(--accent)] uppercase">
                            {evt.category}
                          </span>
                        </div>

                        {/* Co-Articles Covering This Event */}
                        {evt.coArticles && evt.coArticles.length > 0 ? (
                          <div className="space-y-1.5 pt-2 border-t border-[var(--border)]/60">
                            <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase">
                              Other Articles Covering This Event ({evt.coArticles.length})
                            </div>
                            <div className="flex space-x-3 overflow-x-auto pb-2 pt-1">
                              {evt.coArticles.map((co: any) => (
                                <div
                                  key={co.article_id}
                                  onClick={() => handleNavigate(co.article_id)}
                                  className="shrink-0 w-56 p-2.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition-all space-y-2 group shadow-sm"
                                >
                                  {co.lead_image_url ? (
                                    <img
                                      src={co.lead_image_url}
                                      alt={co.original_title}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-24 object-cover rounded-md border border-[var(--border)] group-hover:opacity-90"
                                    />
                                  ) : (
                                    <div className="w-full h-24 rounded-md bg-[var(--bg-hover)] flex items-center justify-center text-[10px] text-[var(--text-secondary)] border border-[var(--border)]">
                                      <ImageIcon className="w-5 h-5 opacity-40 mr-1" />
                                      <span>No Photo</span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                                    <span className="font-bold uppercase text-[var(--accent)]">{co.source_id}</span>
                                    <span>{co.published_at?.slice(0, 10)}</span>
                                  </div>
                                  <h5 className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] line-clamp-2 leading-tight">
                                    {co.original_title}
                                  </h5>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-[var(--text-secondary)] italic">
                            No other articles linked to this event yet.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Request 7: 묶음 기사 원문 목록 (말미에 몰아 넣고 숨김 toggle하여 제목만 보여줌, toggle 클릭시 전문 보기 가능) */}
              {Boolean((data?.cluster_articles && data.cluster_articles.length > 0) || (article?.cluster_articles && article.cluster_articles.length > 0)) && (
                <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-main)] border border-indigo-500/30 space-y-4">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                    <div className="flex items-center space-x-2">
                      <span className="p-1 rounded-md bg-indigo-500/20 text-indigo-400">
                        <Layers className="w-4 h-4" />
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                        📦 묶음 기사 원문 목록 (총 {(data?.cluster_articles || article?.cluster_articles || []).length}개 언론사 원문)
                      </h4>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      클릭시 각 언론사 원문 전문 펼침/접기
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {(data?.cluster_articles || article?.cluster_articles || []).map((subArt: any, idx: number) => {
                      const isExpanded = Boolean(expandedSourceArticles[subArt.article_id]);
                      return (
                        <div
                          key={subArt.article_id || idx}
                          className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden transition-all shadow-xs"
                        >
                          {/* Header: Toggle Title */}
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedSourceArticles(prev => ({
                                ...prev,
                                [subArt.article_id]: !prev[subArt.article_id]
                              }));
                            }}
                            className="w-full p-3.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                          >
                            <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                              <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--bg-main)] border border-[var(--border)] text-[var(--accent)]">
                                {subArt.source_id || 'News'}
                              </span>
                              <span className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] truncate">
                                {subArt.original_title}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2 shrink-0">
                              <span className="text-[11px] text-[var(--text-secondary)] hidden sm:inline">
                                {(subArt.published_at || '').slice(0, 10)}
                              </span>
                              <span className="text-xs font-semibold px-2 py-1 rounded bg-[var(--bg-main)] border border-[var(--border)] text-[var(--accent)] hover:text-white flex items-center space-x-1">
                                <span>{isExpanded ? '원문 접기' : '전문 보기'}</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                              </span>
                            </div>
                          </button>

                          {/* Expanded Full Text Body */}
                          {isExpanded && (
                            <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-main)]/60 space-y-3 animate-in fade-in duration-150">
                              <div className="flex flex-wrap items-center justify-between text-xs text-[var(--text-secondary)] pb-2 border-b border-[var(--border)]/40">
                                <div className="flex items-center space-x-3">
                                  {subArt.author && <span>기자: {subArt.author}</span>}
                                  <span>작성일시: {(subArt.published_at || '').replace('T', ' ').slice(0, 19)}</span>
                                </div>
                                {subArt.source_url && (
                                  <a
                                    href={subArt.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[var(--accent)] hover:underline flex items-center space-x-1 text-[11px]"
                                  >
                                    <span>언론사 기사 원문 링크</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>

                              <div className="text-xs sm:text-sm text-[var(--text-primary)]/90 leading-relaxed space-y-2">
                                <Markdown
                                  components={{
                                    p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                                    h1: ({ children }) => <h3 className="text-base font-bold text-[var(--text-primary)] pt-2">{children}</h3>,
                                    h2: ({ children }) => <h4 className="text-sm font-bold text-[var(--text-primary)] pt-1.5">{children}</h4>,
                                    h3: ({ children }) => <h5 className="text-xs font-bold text-[var(--text-primary)] pt-1">{children}</h5>,
                                    strong: ({ children }) => <strong className="font-bold text-[var(--text-primary)]">{children}</strong>,
                                    a: ({ href, children }) => (
                                      <a href={href} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline inline-flex items-center gap-0.5">
                                        {children} <ExternalLink className="w-3 h-3 inline" />
                                      </a>
                                    )
                                  }}
                                >
                                  {subArt.original_body || ''}
                                </Markdown>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-main)] flex items-center justify-between">
          {article && (
            <a
              href={article.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center space-x-1"
            >
              <span>View on {article.source_id.toUpperCase()}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {data?.storyCluster && onOpenStoryDrawer && (
            <button
              onClick={() => {
                onClose();
                onOpenStoryDrawer(data.storyCluster.id, data.storyCluster.title);
              }}
              className="text-xs px-3 py-1.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 font-semibold"
            >
              View Full Story Cluster ({data.relatedArticles?.length + 1} articles)
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-[var(--bg-hover)] hover:bg-[var(--border)] text-xs text-white font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

