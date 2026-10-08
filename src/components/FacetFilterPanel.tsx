import React, { useState, useEffect } from 'react';
import { FacetFilterState, TagInfo } from '../types';
import { api } from '../lib/api';
import { Filter, X, Plus, Search, Ban, ChevronDown, ChevronUp } from 'lucide-react';
import { t } from '../lib/i18n';

interface FacetFilterPanelProps {
  filters: FacetFilterState;
  onChange: (filters: FacetFilterState) => void;
  availableTags?: TagInfo[];
  onOpenTagExplorer?: () => void;
  secondaryEventControls?: React.ReactNode;
  currentLang?: string;
}

export const FacetFilterPanel: React.FC<FacetFilterPanelProps> = ({
  filters,
  onChange,
  availableTags: propAvailableTags = [],
  onOpenTagExplorer,
  secondaryEventControls,
  currentLang = 'original'
}) => {
  // Collapse state: default collapsed, showing ONLY active filters. Toggle with filter icon.
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  // Exclude mode toggle: when active, clicking items adds them to exclude filters (rendered in red)
  const [excludeMode, setExcludeMode] = useState<boolean>(false);
  const [queriedTags, setQueriedTags] = useState<TagInfo[]>([]);
  const [showAllTags, setShowAllTags] = useState<boolean>(false);

  // Real-time query all existing tags
  useEffect(() => {
    let isMounted = true;
    api.getTags().then(res => {
      if (isMounted && res.tags) {
        setQueriedTags(res.tags);
      }
    }).catch(err => {
      console.error('Failed to load real-time tags for filter:', err);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const allAvailableTags = queriedTags.length > 0 ? queriedTags : propAvailableTags;

  // Primary Row 1: single authoritative topic vocabulary.
  const categories = [
    { id: 'General', label: 'General' },
    { id: 'Politics', label: 'Politics' },
    { id: 'Economy', label: 'Economy' },
    { id: 'Real Estate', label: 'Real Estate' },
    { id: 'AI/Tech', label: 'AI/Tech' },
    { id: 'Education', label: 'Education' },
    { id: 'Sports', label: 'Sports' },
    { id: 'Volunteers', label: 'Volunteers' },
    { id: 'Nature/Living', label: 'Nature/Living' },
    { id: 'Culture', label: 'Culture' },
  ];

  // Region Categories (rwanda/korea/africa/world)
  const regions = [
    { id: 'rwanda', label: 'Rwanda' },
    { id: 'korea', label: 'Korea' },
    { id: 'africa', label: 'Africa' },
    { id: 'world', label: 'World' },
  ];

  // AI Processed Status
  const aiStatuses = [
    { id: 'Done', label: 'Done (Processed)' },
    { id: 'Waiting', label: 'Waiting (Pending)' },
  ];

  // Primary Row 2: Source Page / Domain
  const sources = [
    { id: 'kigalitoday', label: 'Kigali Today' },
    { id: 'newtimes', label: 'The New Times' },
    { id: 'ktpress', label: 'KT Press' },
    { id: 'rdb', label: 'RDB' },
    { id: 'reb', label: 'REB' },
    { id: 'futures', label: 'Futures Korea' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'x', label: 'X (Twitter)' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'youtube', label: 'YouTube' },
  ];

  // Primary Row 3: Original Language
  const languages = [
    { id: 'rw', label: 'RW' },
    { id: 'en', label: 'EN' },
    { id: 'ko', label: 'KO' },
    { id: 'fr', label: 'FR' },
  ];

  const toggleArrayItem = (list: string[] = [], item: string): string[] => {
    return list.includes(item) ? list.filter(x => x !== item) : [...list, item];
  };

  // Generic handler considering excludeMode
  const handleItemClick = (
    type: 'categories' | 'regions' | 'sources' | 'languages' | 'tags',
    itemId: string
  ) => {
    const incKey = type;
    const excKey = ('exclude' + type.charAt(0).toUpperCase() + type.slice(1)) as keyof FacetFilterState;

    const currentInc = (filters[incKey] as string[]) || [];
    const currentExc = ((filters[excKey] as string[]) || []);

    if (excludeMode) {
      // Toggle exclusion: add/remove from exclude list, and ensure it's removed from include list
      const isAlreadyExcluded = currentExc.includes(itemId);
      const nextExc = isAlreadyExcluded
        ? currentExc.filter(x => x !== itemId)
        : [...currentExc, itemId];
      const nextInc = currentInc.filter(x => x !== itemId);

      onChange({
        ...filters,
        [incKey]: nextInc,
        [excKey]: nextExc
      });
    } else {
      // Normal inclusion: add/remove from include list, and ensure it's removed from exclude list
      const isAlreadyIncluded = currentInc.includes(itemId);
      const nextInc = isAlreadyIncluded
        ? currentInc.filter(x => x !== itemId)
        : [...currentInc, itemId];
      const nextExc = currentExc.filter(x => x !== itemId);

      onChange({
        ...filters,
        [incKey]: nextInc,
        [excKey]: nextExc
      });
    }
  };

  const handleAiStatusToggle = (stId: string) => {
    onChange({ ...filters, aiStatus: toggleArrayItem(filters.aiStatus || [], stId) });
  };

  const handleClearAll = () => {
    onChange({
      regions: [],
      categories: [],
      aiStatus: [],
      sources: [],
      languages: [],
      tags: [],
      tagLogic: 'AND',
      search: '',
      excludeCategories: [],
      excludeRegions: [],
      excludeSources: [],
      excludeLanguages: [],
      excludeTags: []
    });
  };

  const hasActiveFilters =
    (filters.regions && filters.regions.length > 0) ||
    filters.categories.length > 0 ||
    (filters.aiStatus && filters.aiStatus.length > 0) ||
    filters.sources.length > 0 ||
    filters.languages.length > 0 ||
    filters.tags.length > 0 ||
    Boolean(filters.search && filters.search.trim().length > 0) ||
    (filters.excludeCategories && filters.excludeCategories.length > 0) ||
    (filters.excludeRegions && filters.excludeRegions.length > 0) ||
    (filters.excludeSources && filters.excludeSources.length > 0) ||
    (filters.excludeLanguages && filters.excludeLanguages.length > 0) ||
    (filters.excludeTags && filters.excludeTags.length > 0);

  const activeFilterCount =
    (filters.regions?.length || 0) +
    (filters.categories?.length || 0) +
    (filters.aiStatus?.length || 0) +
    (filters.sources?.length || 0) +
    (filters.languages?.length || 0) +
    (filters.tags?.length || 0) +
    (filters.search && filters.search.trim() ? 1 : 0) +
    (filters.excludeCategories?.length || 0) +
    (filters.excludeRegions?.length || 0) +
    (filters.excludeSources?.length || 0) +
    (filters.excludeLanguages?.length || 0) +
    (filters.excludeTags?.length || 0);

  // Helper to determine item button style based on Include / Exclude state
  const getItemClass = (isIncluded: boolean, isExcluded: boolean) => {
    if (isExcluded) {
      return 'bg-red-500/20 text-red-400 border border-red-500/60 font-semibold line-through decoration-red-400';
    }
    if (isIncluded) {
      return 'bg-[var(--accent)] !text-white font-semibold shadow-sm';
    }
    return 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent';
  };

  // Popular / representative tags from real-time query
  const displayedTags = showAllTags ? allAvailableTags : allAvailableTags.slice(0, 16);

  const renderActiveChips = () => (
    <div className="flex flex-wrap items-center gap-1.5 flex-1">
      {/* Include Categories */}
      {filters.categories.map(cId => {
        const label = categories.find(c => c.id === cId)?.label || cId;
        return (
          <span
            key={cId}
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] bg-[var(--accent)]/15 border border-[var(--accent)]/40 text-[var(--accent)] font-medium"
          >
            <span>{t('filter_categories', currentLang)}: {label}</span>
            <button onClick={() => handleItemClick('categories', cId)} className="hover:text-red-400 ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      {/* Exclude Categories */}
      {(filters.excludeCategories || []).map(cId => {
        const label = categories.find(c => c.id === cId)?.label || cId;
        return (
          <span
            key={`ex-${cId}`}
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] bg-red-500/20 border border-red-500/50 text-red-300 font-medium"
          >
            <Ban className="w-2.5 h-2.5 text-red-400" />
            <span>NOT {t('filter_categories', currentLang)}: {label}</span>
            <button onClick={() => handleItemClick('categories', cId)} className="hover:text-white ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      {/* Regions */}
      {(filters.regions || []).map(rId => {
        const label = regions.find(r => r.id === rId)?.label || rId;
        return (
          <span
            key={rId}
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-medium"
          >
            <span>{t('filter_regions', currentLang)}: {label}</span>
            <button onClick={() => handleItemClick('regions', rId)} className="hover:text-red-400 ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      {(filters.excludeRegions || []).map(rId => {
        const label = regions.find(r => r.id === rId)?.label || rId;
        return (
          <span
            key={`ex-${rId}`}
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] bg-red-500/20 border border-red-500/50 text-red-300 font-medium"
          >
            <Ban className="w-2.5 h-2.5 text-red-400" />
            <span>NOT {t('filter_regions', currentLang)}: {label}</span>
            <button onClick={() => handleItemClick('regions', rId)} className="hover:text-white ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      {/* AI Status */}
      {(filters.aiStatus || []).map(sId => {
        const label = aiStatuses.find(s => s.id === sId)?.label || sId;
        return (
          <span
            key={sId}
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] bg-purple-500/15 border border-purple-500/40 text-purple-300 font-medium"
          >
            <span>AI: {label}</span>
            <button onClick={() => handleAiStatusToggle(sId)} className="hover:text-red-400 ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      {/* Sources */}
      {filters.sources.map(sId => {
        const label = sources.find(s => s.id === sId)?.label || sId;
        return (
          <span
            key={sId}
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] bg-blue-500/15 border border-blue-500/40 text-blue-300 font-medium"
          >
            <span>{t('filter_sources', currentLang)}: {label}</span>
            <button onClick={() => handleItemClick('sources', sId)} className="hover:text-red-400 ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      {(filters.excludeSources || []).map(sId => {
        const label = sources.find(s => s.id === sId)?.label || sId;
        return (
          <span
            key={`ex-${sId}`}
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] bg-red-500/20 border border-red-500/50 text-red-300 font-medium"
          >
            <Ban className="w-2.5 h-2.5 text-red-400" />
            <span>NOT {t('filter_sources', currentLang)}: {label}</span>
            <button onClick={() => handleItemClick('sources', sId)} className="hover:text-white ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      {/* Languages */}
      {filters.languages.map(lId => {
        const label = languages.find(l => l.id === lId)?.label || lId.toUpperCase();
        return (
          <span
            key={lId}
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] bg-amber-500/15 border border-amber-500/40 text-amber-300 font-medium"
          >
            <span>{t('filter_languages', currentLang)}: {label}</span>
            <button onClick={() => handleItemClick('languages', lId)} className="hover:text-red-400 ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      {(filters.excludeLanguages || []).map(lId => {
        const label = languages.find(l => l.id === lId)?.label || lId.toUpperCase();
        return (
          <span
            key={`ex-${lId}`}
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] bg-red-500/20 border border-red-500/50 text-red-300 font-medium"
          >
            <Ban className="w-2.5 h-2.5 text-red-400" />
            <span>NOT {t('filter_languages', currentLang)}: {label}</span>
            <button onClick={() => handleItemClick('languages', lId)} className="hover:text-white ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      {/* Tags */}
      {filters.tags.map(tId => {
        const found = allAvailableTags.find(a => a.id === tId || a.key === tId);
        const label = found?.name || found?.key || tId;
        return (
          <span
            key={tId}
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 font-medium"
          >
            <span>#{label}</span>
            <button onClick={() => handleItemClick('tags', tId)} className="hover:text-red-400 ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      {(filters.excludeTags || []).map(tId => {
        const found = allAvailableTags.find(a => a.id === tId || a.key === tId);
        const label = found?.name || found?.key || tId;
        return (
          <span
            key={`ex-${tId}`}
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] bg-red-500/20 border border-red-500/50 text-red-300 font-medium"
          >
            <Ban className="w-2.5 h-2.5 text-red-400" />
            <span>NOT #{label}</span>
            <button onClick={() => handleItemClick('tags', tId)} className="hover:text-white ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      {/* Search */}
      {filters.search && (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] bg-[var(--bg-main)] border border-[var(--accent)] text-[var(--accent)] font-medium">
          <span>{t('filter_search', currentLang)}: "{filters.search}"</span>
          <button onClick={() => onChange({ ...filters, search: '' })} className="hover:text-red-400 ml-0.5">
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Clear All */}
      <button
        type="button"
        onClick={handleClearAll}
        className="text-[11px] font-semibold text-[var(--accent)] hover:underline ml-1 cursor-pointer"
      >
        {t('filter_reset', currentLang)}
      </button>
    </div>
  );

  return (
    <div className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3">
      {/* Collapsed / Active Filters Bar with Filter Icon Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Filter Toggle Button */}
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
              isExpanded
                ? 'bg-[var(--accent)] text-white shadow-sm ring-2 ring-[var(--accent)]/30'
                : hasActiveFilters
                ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/50 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white'
                : 'bg-[var(--bg-main)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)]'
            }`}
            title={t('filter_options', currentLang)}
          >
            <Filter className={`w-3.5 h-3.5 ${hasActiveFilters ? 'text-inherit' : 'text-[var(--accent)]'}`} />
            <span>{isExpanded ? t('filter_collapse', currentLang) : t('filter_options', currentLang)}</span>
            {hasActiveFilters && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-bold">
                {activeFilterCount}
              </span>
            )}
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 ml-0.5 opacity-70" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-70" />
            )}
          </button>

          {/* Active Filter Chips or Clean Notice */}
          {hasActiveFilters ? (
            renderActiveChips()
          ) : (
            <span className="text-xs text-[var(--text-secondary)] pl-1">
              {t('filter_none_active', currentLang)}
            </span>
          )}
        </div>

        {/* Keyword Search */}
        <div className="relative w-full sm:w-56 shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder={t('search_placeholder', currentLang)}
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
            className="w-full pl-8 pr-7 py-1.5 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]"
          />
          {filters.search && (
            <button
              onClick={() => onChange({ ...filters, search: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Selection Options: Only displayed when isExpanded is true */}
      {isExpanded && (
        <div className="pt-3 border-t border-[var(--border)] space-y-3.5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--border)] text-xs">
            <span className="font-bold text-[var(--text-primary)] flex items-center space-x-1.5">
              <Filter className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>{t('filter_options', currentLang)}</span>
            </span>

            <div className="flex items-center space-x-2">
              {/* Exclude Mode Toggle Button */}
              <button
                type="button"
                onClick={() => setExcludeMode(prev => !prev)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                  excludeMode
                    ? 'bg-red-500 text-white shadow-md animate-pulse'
                    : 'bg-[var(--bg-main)] text-[var(--text-secondary)] hover:text-red-400 border border-[var(--border)]'
                }`}
                title={excludeMode ? 'Exclude Mode Active: Click items to exclude (mark red)' : 'Click to enable Exclude Mode'}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{excludeMode ? t('filter_exclude_mode', currentLang) : t('filter_include_mode', currentLang)}</span>
              </button>

              {/* Tag Match Mode (AND / OR) */}
              <div className="flex items-center bg-[var(--bg-main)] border border-[var(--border)] rounded-lg p-0.5 text-[11px]">
                <button
                  onClick={() => onChange({ ...filters, tagLogic: 'AND' })}
                  className={`px-2 py-0.5 rounded-md ${
                    filters.tagLogic === 'AND'
                      ? 'bg-[var(--accent)] !text-white font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  AND
                </button>
                <button
                  onClick={() => onChange({ ...filters, tagLogic: 'OR' })}
                  className={`px-2 py-0.5 rounded-md ${
                    filters.tagLogic === 'OR'
                      ? 'bg-[var(--accent)] !text-white font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  OR
                </button>
              </div>
            </div>
          </div>

          {/* Primary Facet Rows */}
          <div className="space-y-3 text-xs">
            {/* ROW 1: TOPIC CATEGORY */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-2">
              <span className="w-28 shrink-0 font-semibold text-[var(--text-secondary)] pt-1">
                Category:
              </span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                <button
                  onClick={() => onChange({ ...filters, categories: [], excludeCategories: [] })}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    filters.categories.length === 0 && (!filters.excludeCategories || filters.excludeCategories.length === 0)
                      ? 'bg-[var(--accent)] !text-white font-semibold'
                      : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  All
                </button>
                {categories.map(c => {
                  const isSelected = filters.categories.includes(c.id);
                  const isExcluded = (filters.excludeCategories || []).includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleItemClick('categories', c.id)}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${getItemClass(isSelected, isExcluded)}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ROW 2: REGION */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-2">
              <span className="w-28 shrink-0 font-semibold text-[var(--text-secondary)] pt-1">
                Region:
              </span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                <button
                  onClick={() => onChange({ ...filters, regions: [], excludeRegions: [] })}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    (!filters.regions || filters.regions.length === 0) &&
                    (!filters.excludeRegions || filters.excludeRegions.length === 0)
                      ? 'bg-[var(--accent)] !text-white font-semibold'
                      : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  All
                </button>
                {regions.map(r => {
                  const isSelected = (filters.regions || []).includes(r.id);
                  const isExcluded = (filters.excludeRegions || []).includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleItemClick('regions', r.id)}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${getItemClass(isSelected, isExcluded)}`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ROW 3: AI PROCESSED */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-2">
              <span className="w-28 shrink-0 font-semibold text-[var(--text-secondary)] pt-1">
                AI Status:
              </span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                <button
                  onClick={() => onChange({ ...filters, aiStatus: [] })}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    !filters.aiStatus || filters.aiStatus.length === 0
                      ? 'bg-[var(--accent)] !text-white font-semibold'
                      : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  All
                </button>
                {aiStatuses.map(s => {
                  const isSelected = (filters.aiStatus || []).includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleAiStatusToggle(s.id)}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent)] !text-white font-semibold'
                          : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ROW 4: SOURCES */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-2">
              <span className="w-28 shrink-0 font-semibold text-[var(--text-secondary)] pt-1">
                Source:
              </span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                <button
                  onClick={() => onChange({ ...filters, sources: [], excludeSources: [] })}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    filters.sources.length === 0 && (!filters.excludeSources || filters.excludeSources.length === 0)
                      ? 'bg-[var(--accent)] !text-white font-semibold'
                      : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  All
                </button>
                {sources.map(s => {
                  const isSelected = filters.sources.includes(s.id);
                  const isExcluded = (filters.excludeSources || []).includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleItemClick('sources', s.id)}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${getItemClass(isSelected, isExcluded)}`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ROW 5: LANGUAGES */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-2">
              <span className="w-28 shrink-0 font-semibold text-[var(--text-secondary)] pt-1">
                Language:
              </span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                <button
                  onClick={() => onChange({ ...filters, languages: [], excludeLanguages: [] })}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    filters.languages.length === 0 && (!filters.excludeLanguages || filters.excludeLanguages.length === 0)
                      ? 'bg-[var(--accent)] !text-white font-semibold'
                      : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  All
                </button>
                {languages.map(l => {
                  const isSelected = filters.languages.includes(l.id);
                  const isExcluded = (filters.excludeLanguages || []).includes(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => handleItemClick('languages', l.id)}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${getItemClass(isSelected, isExcluded)}`}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ROW 6: TAGS */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-2">
              <span className="w-28 shrink-0 font-semibold text-[var(--text-secondary)] pt-1">
                Tags:
              </span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                <button
                  onClick={() => onChange({ ...filters, tags: [], excludeTags: [] })}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    filters.tags.length === 0 && (!filters.excludeTags || filters.excludeTags.length === 0)
                      ? 'bg-[var(--accent)] !text-white font-semibold'
                      : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  All
                </button>
                {displayedTags.map(tag => {
                  const tId = tag.key || tag.id;
                  const isSelected = filters.tags.includes(tId) || filters.tags.includes(tag.id);
                  const isExcluded = (filters.excludeTags || []).includes(tId) || (filters.excludeTags || []).includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleItemClick('tags', tId)}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${getItemClass(isSelected, isExcluded)}`}
                    >
                      #{tag.name || tag.key}
                    </button>
                  );
                })}

                {allAvailableTags.length > 16 && (
                  <button
                    onClick={() => setShowAllTags(!showAllTags)}
                    className="px-2.5 py-1 rounded-md text-xs text-[var(--accent)] hover:underline"
                  >
                    {showAllTags ? 'Show Less' : `+${allAvailableTags.length - 16} more`}
                  </button>
                )}

                {onOpenTagExplorer && (
                  <button
                    onClick={onOpenTagExplorer}
                    className="px-2.5 py-1 rounded-md text-xs border border-dashed border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] flex items-center space-x-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Tag Explorer</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Optional Secondary Event Controls (for Events View) */}
      {secondaryEventControls && (
        <div className="pt-2 border-t border-[var(--border)]">
          {secondaryEventControls}
        </div>
      )}
    </div>
  );
};
