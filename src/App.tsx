import React, { useState, useEffect } from 'react';
import { ActiveTab, PortalTheme, FacetFilterState, TagInfo } from './types';
import { api } from './lib/api';
import { Navbar } from './components/Navbar';
import { TagExplorerModal } from './components/TagExplorerModal';
import { ArticleDetailModal } from './components/ArticleDetailModal';
import { StoryDrawer } from './components/StoryDrawer';
import { AddEventModal } from './components/AddEventModal';
import { EventDuplicateReviewModal } from './components/EventDuplicateReviewModal';
import { EventUrlInboxModal } from './components/EventUrlInboxModal';
import { IntegratedArticleModal } from './components/IntegratedArticleModal';
import { ErrorBoundary } from './components/ErrorBoundary';

import { HomeView } from './views/HomeView';
import { NewsView } from './views/NewsView';
import { EventsView } from './views/EventsView';
import { AiWorkspaceView } from './views/AiWorkspaceView';
import { SourcesView } from './views/SourcesView';
import { SettingsView } from './views/SettingsView';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('HOME');
  const [theme, setTheme] = useState<PortalTheme>(() => {
    try {
      const saved = localStorage.getItem('portal_theme');
      if (saved && ['BLACK', 'PINK', 'BLUE', 'RAINBOW'].includes(saved)) {
        return saved as PortalTheme;
      }
    } catch {}
    return 'BLACK';
  });
  const [currentLang, setCurrentLang] = useState<string>('original');
  const [searchQuery, setSearchQuery] = useState('');

  // Global Facet Filters
  const [filters, setFilters] = useState<FacetFilterState>({
    categories: [],
    regions: [],
    aiStatus: [],
    sources: [],
    languages: [],
    tags: [],
    tagLogic: 'OR',
    search: '',
    excludeCategories: [],
    excludeRegions: [],
    excludeSources: [],
    excludeLanguages: [],
    excludeTags: []
  });

  // Modal / Drawer States
  const [isTagExplorerOpen, setIsTagExplorerOpen] = useState(false);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [currentArticleIds, setCurrentArticleIds] = useState<string[]>([]);
  const [storyDrawerCluster, setStoryDrawerCluster] = useState<{ id: string; title: string } | null>(null);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [isDuplicateReviewOpen, setIsDuplicateReviewOpen] = useState(false);
  const [isEventInboxOpen, setIsEventInboxOpen] = useState(false);
  const [selectedIntegratedId, setSelectedIntegratedId] = useState<string | null>(null);

  // Tags & Badges
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [pendingCandidateCount, setPendingCandidateCount] = useState(0);
  const [queuedUrlCount, setQueuedUrlCount] = useState(0);

  const handleSelectArticle = (id: string, allIds?: string[]) => {
    setSelectedArticleId(id);
    if (allIds && allIds.length > 0) {
      setCurrentArticleIds(allIds);
    }
  };

  const handleLoadMoreArticles = async (): Promise<string[]> => {
    try {
      const res = await api.getArticles({
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
        sort: 'newest',
        lang: currentLang,
        limit: 50,
        offset: currentArticleIds.length
      });
      const newArticles = res.articles || [];
      if (newArticles.length > 0) {
        const newIds = newArticles.map(a => a.article_id);
        const updated = Array.from(new Set([...currentArticleIds, ...newIds]));
        setCurrentArticleIds(updated);
        return updated;
      }
      return currentArticleIds;
    } catch (err) {
      console.error('Failed to load more articles for detail modal:', err);
      return currentArticleIds;
    }
  };

  const handleToggleTagFilter = (tagKey: string) => {
    setFilters(prev => {
      const exists = prev.tags.includes(tagKey);
      return {
        ...prev,
        tags: exists ? prev.tags.filter(t => t !== tagKey) : [...prev.tags, tagKey]
      };
    });
    setSelectedArticleId(null);
    setActiveTab('NEWS');
  };

  // Sync theme to document element and classList
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.remove(
      'theme-black', 'theme-pink', 'theme-blue', 'theme-rainbow',
      'theme-BLACK', 'theme-PINK', 'theme-BLUE', 'theme-RAINBOW'
    );
    document.documentElement.classList.add(`theme-${theme.toLowerCase()}`);
    try {
      localStorage.setItem('portal_theme', theme);
    } catch {}
  }, [theme]);

  // Load initial settings and badges
  const refreshBadgesAndTags = () => {
    api.getTags().then(res => setTags(res.tags || []));
    api.getEventCandidates().then(res => setPendingCandidateCount(res.candidates?.length || 0));
    api.getEventInbox().then(res => {
      const queued = (res.urls || []).filter((u: any) => u.status === 'READY' || u.status === 'QUEUED').length;
      setQueuedUrlCount(queued);
    });
  };

  useEffect(() => {
    api.getSettings().then(res => {
      if (res.settings) {
        const localTheme = localStorage.getItem('portal_theme');
        if (!localTheme && res.settings.defaultTheme) {
          setTheme(res.settings.defaultTheme);
        }
        if (res.settings.defaultLanguage) setCurrentLang(res.settings.defaultLanguage);
      }
    });
    refreshBadgesAndTags();
  }, []);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setFilters(prev => ({ ...prev, search: query }));
    if (activeTab !== 'NEWS' && activeTab !== 'EVENTS') {
      setActiveTab('NEWS');
    }
  };

  const handleSelectTagFromExplorer = (tagKey: string) => {
    setFilters(prev => {
      if (prev.tags.includes(tagKey)) return prev;
      return { ...prev, tags: [...prev.tags, tagKey] };
    });
    if (activeTab !== 'NEWS' && activeTab !== 'EVENTS') {
      setActiveTab('NEWS');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] flex flex-col font-sans transition-colors duration-200">
      {/* Global Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentTheme={theme}
        onThemeChange={setTheme}
        currentLang={currentLang}
        onLangChange={setCurrentLang}
        searchQuery={searchQuery}
        onSearchChange={handleSearch}
        pendingCandidatesCount={pendingCandidateCount}
        queuedUrlCount={queuedUrlCount}
      />

      {/* Main View Router */}
      <main className="flex-1 pb-16">
        <ErrorBoundary fallbackTitle="An error occurred displaying this view. Please click to reload.">
          {activeTab === 'HOME' && (
            <HomeView
              onNavigate={setActiveTab}
              onSelectArticle={handleSelectArticle}
              currentLang={currentLang}
            />
          )}

          {activeTab === 'NEWS' && (
            <NewsView
              currentLang={currentLang}
              onSelectArticle={handleSelectArticle}
              onOpenStoryDrawer={(id, title) => setStoryDrawerCluster({ id, title })}
              onOpenTagExplorer={() => setIsTagExplorerOpen(true)}
              availableTags={tags}
              filters={filters}
              onFilterChange={setFilters}
            />
          )}

          {activeTab === 'EVENTS' && (
            <EventsView
              currentLang={currentLang}
              onOpenAddEvent={() => setIsAddEventOpen(true)}
              onOpenDuplicateReview={() => setIsDuplicateReviewOpen(true)}
              onOpenEventInbox={() => setIsEventInboxOpen(true)}
              onSelectArticle={handleSelectArticle}
              onOpenTagExplorer={() => setIsTagExplorerOpen(true)}
              availableTags={tags}
              filters={filters}
              onFilterChange={setFilters}
              pendingCandidateCount={pendingCandidateCount}
              queuedUrlCount={queuedUrlCount}
            />
          )}

          {activeTab === 'AI_WORKSPACE' && (
            <AiWorkspaceView
              currentLang={currentLang}
              onSelectArticle={handleSelectArticle}
              onOpenIntegratedModal={setSelectedIntegratedId}
              onOpenEventInbox={() => setIsEventInboxOpen(true)}
            />
          )}

          {activeTab === 'SOURCES' && (
            <SourcesView currentLang={currentLang} />
          )}

          {activeTab === 'SETTINGS' && (
            <SettingsView
              currentTheme={theme}
              onThemeChange={setTheme}
              currentLang={currentLang}
              onLangChange={setCurrentLang}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Global Modals & Drawers */}
      <TagExplorerModal
        isOpen={isTagExplorerOpen}
        onClose={() => setIsTagExplorerOpen(false)}
        availableTags={tags}
        onSelectTag={handleSelectTagFromExplorer}
      />

      <ErrorBoundary>
        <ArticleDetailModal
          articleId={selectedArticleId}
          onClose={() => setSelectedArticleId(null)}
          currentLang={currentLang}
          onSelectArticle={handleSelectArticle}
          onOpenStoryCluster={(id: string, title: string) => setStoryDrawerCluster({ id, title })}
          onOpenStoryDrawer={(id: string, title: string) => setStoryDrawerCluster({ id, title })}
          articleIds={currentArticleIds}
          onNavigateArticle={(id) => setSelectedArticleId(id)}
          onLoadMoreArticles={handleLoadMoreArticles}
          onTagClick={handleToggleTagFilter}
          activeTagFilters={filters.tags}
        />
      </ErrorBoundary>

      <StoryDrawer
        clusterId={storyDrawerCluster?.id}
        clusterTitle={storyDrawerCluster?.title || ''}
        isOpen={!!storyDrawerCluster}
        onClose={() => setStoryDrawerCluster(null)}
        onSelectArticle={handleSelectArticle}
        currentLang={currentLang}
      />

      <AddEventModal
        isOpen={isAddEventOpen}
        onClose={() => setIsAddEventOpen(false)}
        onEventCreated={refreshBadgesAndTags}
      />

      <EventDuplicateReviewModal
        isOpen={isDuplicateReviewOpen}
        onClose={() => setIsDuplicateReviewOpen(false)}
        onActionComplete={refreshBadgesAndTags}
      />

      <EventUrlInboxModal
        isOpen={isEventInboxOpen}
        onClose={() => setIsEventInboxOpen(false)}
        onBatchCreated={refreshBadgesAndTags}
      />

      <IntegratedArticleModal
        integratedArticleId={selectedIntegratedId}
        onClose={() => setSelectedIntegratedId(null)}
      />
    </div>
  );
}
