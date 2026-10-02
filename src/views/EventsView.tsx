import React, { useState, useEffect } from 'react';
import { EventItem, FacetFilterState, ViewMode, TagInfo } from '../types';
import { api } from '../lib/api';
import { FacetFilterPanel } from '../components/FacetFilterPanel';
import {
  Calendar as CalendarIcon,
  List,
  ChevronLeft,
  ChevronRight,
  Plus,
  Globe,
  GitMerge,
  Bookmark,
  MapPin,
  Clock,
  Building,
  ExternalLink,
  AlignLeft,
  LayoutGrid,
  Image as ImageIcon,
  Trash2,
  Sparkles,
  Download,
  CheckCircle2
} from 'lucide-react';
import { t } from '../lib/i18n';

interface EventsViewProps {
  currentLang: string;
  onOpenAddEvent: () => void;
  onOpenDuplicateReview: () => void;
  onOpenEventInbox: () => void;
  onSelectArticle: (articleId: string) => void;
  onOpenTagExplorer: () => void;
  availableTags: TagInfo[];
  filters: FacetFilterState;
  onFilterChange: (filters: FacetFilterState) => void;
  pendingCandidateCount?: number;
  queuedUrlCount?: number;
}

export const EventsView: React.FC<EventsViewProps> = ({
  currentLang,
  onOpenAddEvent,
  onOpenDuplicateReview,
  onOpenEventInbox,
  onSelectArticle,
  onOpenTagExplorer,
  availableTags,
  filters,
  onFilterChange,
  pendingCandidateCount = 0,
  queuedUrlCount = 0
}) => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'MONTH' | 'LIST'>('MONTH');
  const [listSubMode, setListSubMode] = useState<ViewMode>('CARD');

  // Calendar State (Default September 2026 for current context)
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentMonth, setCurrentMonth] = useState(9); // 1-12

  // Secondary Event Filters
  const [cityFilter, setCityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Selected Day Modal for "+X more" events
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);
  // Selected single event detail
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Saved views
  const [savedViews, setSavedViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>('');
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchEvents = () => {
    setLoading(true);
    const params: any = {
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
      search: filters.search,
      city: cityFilter,
      eventType: categoryFilter,
      status: statusFilter,
      lang: currentLang
    };

    if (viewMode === 'MONTH') {
      params.year = currentYear;
      params.month = currentMonth;
    }

    api.getEvents(params)
      .then(res => {
        setEvents(res.events || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load events:', err);
        setLoading(false);
      });
  };

  const handleRunAiDeduplicate = async () => {
    setIsDeduplicating(true);
    setActionNotice(null);
    try {
      const res = await api.aiDeduplicateEvents();
      if (res.success) {
        setActionNotice(`AI 중복 검토 완료: ${res.mergedCount}개 이벤트 병합, ${res.linkedArticleCount}개 기사 신규 연결`);
        fetchEvents();
      } else {
        alert(res.message || 'AI 중복 검토 실패');
      }
    } catch (err: any) {
      alert(`중복 검토 오류: ${err.message}`);
    } finally {
      setIsDeduplicating(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    setIsDeletingEvent(true);
    try {
      const res = await api.deleteEvent(eventId);
      if (res.success) {
        setSelectedEvent(null);
        setShowDeleteConfirm(false);
        setActionNotice('이벤트가 성공적으로 삭제되었습니다.');
        fetchEvents();
      } else {
        setActionNotice(res.message || '삭제에 실패했습니다.');
      }
    } catch (err: any) {
      setActionNotice(`삭제 오류: ${err.message}`);
    } finally {
      setIsDeletingEvent(false);
    }
  };

  const handleExportEvents = async () => {
    try {
      await api.exportEvents();
    } catch (err: any) {
      alert(`Export 실패: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [filters, currentYear, currentMonth, viewMode, cityFilter, categoryFilter, statusFilter, currentLang]);

  useEffect(() => {
    api.getSavedViews().then(res => setSavedViews(res.views || []));
  }, []);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const handleSaveView = async () => {
    const name = prompt('Enter a name for this Saved Event View:', 'Custom Filter View');
    if (!name) return;
    const res = await api.saveEventView(name, {
      filters,
      cityFilter,
      categoryFilter,
      statusFilter
    });
    setSavedViews(prev => [...prev, res.view]);
    setActiveViewId(res.view.id);
  };

  const handleSelectSavedView = (viewId: string) => {
    setActiveViewId(viewId);
    if (!viewId) return;
    const found = savedViews.find(v => v.id === viewId);
    if (found && found.filter_state) {
      const fs = found.filter_state;
      if (fs.filters) onFilterChange(fs.filters);
      if (fs.cityFilter !== undefined) setCityFilter(fs.cityFilter);
      if (fs.categoryFilter !== undefined) setCategoryFilter(fs.categoryFilter);
      if (fs.statusFilter !== undefined) setStatusFilter(fs.statusFilter);
    }
  };

  // Category Color Map
  const getCategoryTheme = (category: string) => {
    switch (category) {
      case 'Government':
        return { bg: 'bg-blue-900/60 text-blue-200 border-blue-700/80', dot: 'bg-blue-400' };
      case 'Business / Investment':
        return { bg: 'bg-emerald-900/60 text-emerald-200 border-emerald-700/80', dot: 'bg-emerald-400' };
      case 'Conference / Technology':
        return { bg: 'bg-cyan-900/60 text-cyan-200 border-cyan-700/80', dot: 'bg-cyan-400' };
      case 'Culture / Festival':
        return { bg: 'bg-purple-900/60 text-purple-200 border-purple-700/80', dot: 'bg-purple-400' };
      case 'Concert / Entertainment':
        return { bg: 'bg-pink-900/60 text-pink-200 border-pink-700/80', dot: 'bg-pink-400' };
      case 'Education':
        return { bg: 'bg-amber-900/60 text-amber-200 border-amber-700/80', dot: 'bg-amber-400' };
      case 'Sports':
        return { bg: 'bg-red-900/60 text-red-200 border-red-700/80', dot: 'bg-red-400' };
      case 'Exhibition':
        return { bg: 'bg-teal-900/60 text-teal-200 border-teal-700/80', dot: 'bg-teal-400' };
      default:
        return { bg: 'bg-slate-800/80 text-slate-200 border-slate-700', dot: 'bg-slate-400' };
    }
  };

  // Monthly Calendar Matrix Generation
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 = Sun
  const monthName = new Date(currentYear, currentMonth - 1, 1).toLocaleString('default', { month: 'long' });

  // Group events by date (YYYY-MM-DD)
  const eventsByDate: Record<string, EventItem[]> = {};
  events.forEach(e => {
    const sDate = e.start_date;
    const eDate = e.end_date || e.start_date;

    // Traverse all days between start_date and end_date
    const cur = new Date(sDate);
    const end = new Date(eDate);
    while (cur <= end) {
      const dStr = cur.toISOString().slice(0, 10);
      if (!eventsByDate[dStr]) eventsByDate[dStr] = [];
      if (!eventsByDate[dStr].some(x => x.event_id === e.event_id)) {
        eventsByDate[dStr].push(e);
      }
      cur.setDate(cur.getDate() + 1);
    }
  });

  const secondaryEventControls = (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <span className="font-semibold text-[var(--text-secondary)]">{t('event_facets', currentLang)}</span>

      {/* City */}
      <select
        value={cityFilter}
        onChange={e => setCityFilter(e.target.value)}
        className="px-2.5 py-1 bg-[var(--bg-main)] border border-[var(--border)] rounded-md text-[var(--text-primary)] cursor-pointer"
      >
        <option value="">{t('all_cities', currentLang)}</option>
        <option value="Kigali">Kigali</option>
        <option value="Seoul">Seoul</option>
        <option value="Huye">Huye</option>
        <option value="Rubavu">Rubavu</option>
      </select>

      {/* Category */}
      <select
        value={categoryFilter}
        onChange={e => setCategoryFilter(e.target.value)}
        className="px-2.5 py-1 bg-[var(--bg-main)] border border-[var(--border)] rounded-md text-[var(--text-primary)] cursor-pointer"
      >
        <option value="">{t('all_categories', currentLang)}</option>
        <option value="Government">Government</option>
        <option value="Business / Investment">Business / Investment</option>
        <option value="Conference / Technology">Conference / Technology</option>
        <option value="Culture / Festival">Culture / Festival</option>
        <option value="Concert / Entertainment">Concert / Entertainment</option>
        <option value="Education">Education</option>
        <option value="Sports">Sports</option>
      </select>

      {/* Status */}
      <select
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value)}
        className="px-2.5 py-1 bg-[var(--bg-main)] border border-[var(--border)] rounded-md text-[var(--text-primary)] cursor-pointer"
      >
        <option value="">{t('all_statuses', currentLang)}</option>
        <option value="confirmed">{t('status_confirmed', currentLang)}</option>
        <option value="unconfirmed">{t('status_unconfirmed', currentLang)}</option>
      </select>

      {/* Saved Views Dropdown */}
      <div className="flex items-center space-x-1.5 ml-auto">
        <Bookmark className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
        <select
          value={activeViewId}
          onChange={e => handleSelectSavedView(e.target.value)}
          className="px-2.5 py-1 bg-[var(--bg-main)] border border-[var(--border)] rounded-md text-[var(--text-primary)] cursor-pointer"
        >
          <option value="">{t('saved_views_placeholder', currentLang)}</option>
          {savedViews.map(sv => (
            <option key={sv.id} value={sv.id}>{sv.name}</option>
          ))}
        </select>
        <button
          onClick={handleSaveView}
          className="px-2 py-1 text-xs border border-[var(--border)] rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white cursor-pointer"
        >
          {t('btn_save_view', currentLang)}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Shared 4-Row Faceted Filter Panel */}
      <FacetFilterPanel
        filters={filters}
        onChange={onFilterChange}
        availableTags={availableTags}
        onOpenTagExplorer={onOpenTagExplorer}
        secondaryEventControls={secondaryEventControls}
      />

      {/* Events Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 shadow-sm">
        {/* Left: View Mode Toggle (MONTH vs LIST) */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-[var(--bg-main)] border border-[var(--border)] rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setViewMode('MONTH')}
              className={`px-3 py-1 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer ${
                viewMode === 'MONTH'
                  ? 'bg-[var(--accent)] text-white font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>{t('view_month', currentLang)}</span>
            </button>
            <button
              onClick={() => setViewMode('LIST')}
              className={`px-3 py-1 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer ${
                viewMode === 'LIST'
                  ? 'bg-[var(--accent)] text-white font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>{t('view_list', currentLang)}</span>
            </button>
          </div>

          {/* If in LIST view, submode buttons */}
          {viewMode === 'LIST' && (
            <div className="flex items-center bg-[var(--bg-main)] border border-[var(--border)] rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setListSubMode('TEXT')}
                className={`px-2 py-0.5 rounded cursor-pointer ${listSubMode === 'TEXT' ? 'bg-[var(--accent)] text-white font-semibold' : 'text-[var(--text-secondary)]'}`}
              >
                <AlignLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => setListSubMode('CARD')}
                className={`px-2 py-0.5 rounded cursor-pointer ${listSubMode === 'CARD' ? 'bg-[var(--accent)] text-white font-semibold' : 'text-[var(--text-secondary)]'}`}
              >
                <LayoutGrid className="w-3 h-3" />
              </button>
              <button
                onClick={() => setListSubMode('PHOTO_TEXT')}
                className={`px-2 py-0.5 rounded cursor-pointer ${listSubMode === 'PHOTO_TEXT' ? 'bg-[var(--accent)] text-white font-semibold' : 'text-[var(--text-secondary)]'}`}
              >
                <ImageIcon className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Month Navigator (if in Month view) */}
          {viewMode === 'MONTH' && (
            <div className="flex items-center space-x-1.5">
              <button
                onClick={handlePrevMonth}
                className="p-1 rounded bg-[var(--bg-main)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-bold text-[var(--text-primary)] px-2">
                {monthName} {currentYear}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1 rounded bg-[var(--bg-main)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Actions: AI Deduplicate, Export, URL Inbox, Duplicate Review, Add Event */}
        <div className="flex flex-wrap items-center gap-2">
          {/* AI Deduplicate Button */}
          <button
            onClick={handleRunAiDeduplicate}
            disabled={isDeduplicating}
            className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm cursor-pointer"
            title="AI 중복 검토 및 기사 자동 연결 (Deduplicate & link articles)"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isDeduplicating ? 'animate-spin' : ''}`} />
            <span>{isDeduplicating ? t('btn_ai_dedup_running', currentLang) : t('btn_ai_dedup', currentLang)}</span>
          </button>

          {/* Export Events Excel Button */}
          <button
            onClick={handleExportEvents}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-hover)] hover:border-[var(--accent)] text-xs text-[var(--text-primary)] flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Export events with multilingual names to Excel"
          >
            <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">{t('btn_export_excel', currentLang)}</span>
          </button>

          <button
            onClick={onOpenEventInbox}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-hover)] text-xs text-[var(--text-primary)] hover:border-[var(--accent)] flex items-center space-x-1.5 cursor-pointer"
            title="Event URL Inbox"
          >
            <Globe className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">{t('btn_url_inbox', currentLang)}</span>
            {queuedUrlCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-[var(--accent)] text-white font-bold">
                {queuedUrlCount}
              </span>
            )}
          </button>

          <button
            onClick={onOpenDuplicateReview}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-hover)] text-xs text-[var(--text-primary)] hover:border-[var(--accent)] flex items-center space-x-1.5 cursor-pointer"
            title="Event Duplicate Review Candidates"
          >
            <GitMerge className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">{t('btn_duplicate_review', currentLang)}</span>
            {pendingCandidateCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500 text-black font-bold">
                {pendingCandidateCount}
              </span>
            )}
          </button>

          <button
            onClick={onOpenAddEvent}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('btn_add_event', currentLang)}</span>
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{actionNotice}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-emerald-400 hover:text-white ml-2 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Events Display */}
      {viewMode === 'MONTH' ? (
        /* MONTHLY CALENDAR VIEW */
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
          {/* Calendar Weekday Header */}
          <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--bg-main)] text-center text-xs font-bold text-[var(--text-secondary)] py-2.5">
            <div>{t('dow_sun', currentLang)}</div>
            <div>{t('dow_mon', currentLang)}</div>
            <div>{t('dow_tue', currentLang)}</div>
            <div>{t('dow_wed', currentLang)}</div>
            <div>{t('dow_thu', currentLang)}</div>
            <div>{t('dow_fri', currentLang)}</div>
            <div>{t('dow_sat', currentLang)}</div>
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-[var(--border)]">
            {/* Blank cells before 1st day of month */}
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
              <div key={`blank-${idx}`} className="min-h-[110px] sm:min-h-[125px] bg-[var(--bg-main)]/40 p-1 opacity-40" />
            ))}

            {/* Days of the month */}
            {Array.from({ length: daysInMonth }).map((_, dayIdx) => {
              const day = dayIdx + 1;
              const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvents = eventsByDate[dateStr] || [];

              const visibleEvents = dayEvents.slice(0, 3);
              const extraCount = dayEvents.length - visibleEvents.length;

              return (
                <div
                  key={dateStr}
                  className="min-h-[110px] sm:min-h-[125px] p-1.5 flex flex-col justify-between hover:bg-[var(--bg-hover)]/30 transition-colors"
                >
                  {/* Day Number Header */}
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-[var(--text-secondary)] px-1">
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Day Event Bars (Continuous multi-day bars) */}
                  <div className="space-y-1 flex-1">
                    {visibleEvents.map(evt => {
                      const theme = getCategoryTheme(evt.category);
                      return (
                        <div
                          key={evt.event_id}
                          onClick={() => setSelectedEvent(evt)}
                          className={`event-bar px-1.5 py-0.5 rounded border text-[11px] font-medium truncate cursor-pointer flex items-center space-x-1 shadow-sm ${theme.bg}`}
                          title={`${evt.displayName || evt.canonical_name} (${evt.category})`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${theme.dot}`} />
                          <span className="truncate">{evt.displayName || evt.canonical_name}</span>
                        </div>
                      );
                    })}

                    {extraCount > 0 && (
                      <button
                        onClick={() => setDayModalDate(dateStr)}
                        className="w-full text-left text-[10px] font-bold text-[var(--accent)] hover:underline px-1"
                      >
                        +{extraCount} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* LIST VIEW */
        <div className="space-y-3">
          {events.length === 0 ? (
            <div className="py-24 text-center bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl">
              <div className="text-sm font-bold text-[var(--text-primary)]">No events found matching current criteria</div>
            </div>
          ) : (
            events.map(evt => {
              const theme = getCategoryTheme(evt.category);
              return (
                <div
                  key={evt.event_id}
                  onClick={() => setSelectedEvent(evt)}
                  className="bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] rounded-xl p-4 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center space-x-2 text-xs">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${theme.bg}`}>
                        {evt.category}
                      </span>
                      <span className="text-[var(--accent)] font-semibold flex items-center space-x-1">
                        <CalendarIcon className="w-3.5 h-3.5" />
                        <span>{evt.start_date} {evt.start_time ? `at ${evt.start_time}` : ''}</span>
                        {evt.end_date && evt.end_date !== evt.start_date && (
                          <span> &ndash; {evt.end_date}</span>
                        )}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                      {evt.displayName || evt.canonical_name}
                    </h3>

                    {evt.displaySubtitle && (
                      <p className="text-xs text-[var(--text-secondary)] italic">
                        {evt.displaySubtitle}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)] pt-1">
                      {(evt.venue || evt.city) && (
                        <span className="flex items-center space-x-1">
                          <MapPin className="w-3 h-3 text-[var(--accent)]" />
                          <span>{evt.venue ? `${evt.venue}, ${evt.city}` : evt.city}</span>
                        </span>
                      )}
                      {evt.organizer && (
                        <span className="flex items-center space-x-1">
                          <Building className="w-3 h-3 text-[var(--accent)]" />
                          <span>{evt.organizer}</span>
                        </span>
                      )}
                      {evt.price_text && (
                        <span className="font-semibold text-emerald-400">
                          {evt.price_text}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center space-x-2">
                    <button className="px-3 py-1.5 rounded-md bg-[var(--bg-hover)] hover:bg-[var(--accent)] hover:text-white text-xs font-semibold text-[var(--text-primary)] transition-colors">
                      View Details &rarr;
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Day Events Modal (for +X more) */}
      {dayModalDate && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-lg my-auto p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Events for {dayModalDate}
              </h3>
              <button onClick={() => setDayModalDate(null)} className="text-[var(--text-secondary)] hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {(eventsByDate[dayModalDate] || []).map(evt => {
                const theme = getCategoryTheme(evt.category);
                return (
                  <div
                    key={evt.event_id}
                    onClick={() => {
                      setDayModalDate(null);
                      setSelectedEvent(evt);
                    }}
                    className="p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className={`px-2 py-0.2 rounded border text-[10px] font-bold ${theme.bg}`}>
                        {evt.category}
                      </span>
                      <span className="text-[var(--text-secondary)]">{evt.start_time || 'All Day'}</span>
                    </div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">
                      {evt.displayName || evt.canonical_name}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {evt.venue || evt.city}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-xl my-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--accent)]/15 text-[var(--accent)]">
                  {selectedEvent.category}
                </span>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  {selectedEvent.displayName || selectedEvent.canonical_name}
                </h2>
                {selectedEvent.displaySubtitle && (
                  <p className="text-xs text-[var(--text-secondary)] italic">
                    {selectedEvent.displaySubtitle}
                  </p>
                )}
              </div>
              <button onClick={() => setSelectedEvent(null)} className="text-[var(--text-secondary)] hover:text-white">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] text-xs text-[var(--text-secondary)]">
              <div>
                <span className="font-semibold text-[var(--text-primary)] block">Dates & Time:</span>
                <span>{selectedEvent.start_date} {selectedEvent.start_time || ''}</span>
                {selectedEvent.end_date && selectedEvent.end_date !== selectedEvent.start_date && (
                  <span> &ndash; {selectedEvent.end_date}</span>
                )}
              </div>
              <div>
                <span className="font-semibold text-[var(--text-primary)] block">Location:</span>
                <span>{selectedEvent.venue || 'TBA'}</span>
                <div>{selectedEvent.city}, {selectedEvent.country}</div>
              </div>
              <div>
                <span className="font-semibold text-[var(--text-primary)] block">Organizer:</span>
                <span>{selectedEvent.organizer || 'Official Organizers'}</span>
              </div>
              <div>
                <span className="font-semibold text-[var(--text-primary)] block">Admission:</span>
                <span className="text-emerald-400 font-semibold">{selectedEvent.price_text || 'Free'}</span>
              </div>
            </div>

            {/* Description */}
            {selectedEvent.description && (
              <div className="text-xs text-[var(--text-primary)] leading-relaxed space-y-1">
                <span className="font-semibold text-[var(--text-secondary)]">Description:</span>
                <p className="whitespace-pre-line">{selectedEvent.description}</p>
              </div>
            )}

            {/* Related Articles with Horizontal Scrollable Image Thumbnails */}
            {selectedEvent.relatedArticles && selectedEvent.relatedArticles.length > 0 && (
              <div className="p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="font-semibold text-[var(--accent)] uppercase tracking-wider flex items-center space-x-1.5">
                    <span>관련 기사 / Associated Reports</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] font-bold text-[10px]">
                      {selectedEvent.relatedArticles.length}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--text-secondary)]">좌우로 스크롤하여 확인</span>
                </div>

                {/* Horizontal Scroll Area */}
                <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-thin">
                  {selectedEvent.relatedArticles.map(art => (
                    <div
                      key={art.article_id}
                      onClick={() => {
                        setSelectedEvent(null);
                        onSelectArticle(art.article_id);
                      }}
                      className="w-56 sm:w-64 shrink-0 bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] rounded-lg overflow-hidden cursor-pointer transition-all flex flex-col group shadow-sm"
                    >
                      <div className="w-full aspect-video bg-[var(--bg-hover)] relative overflow-hidden">
                        {art.lead_image_url ? (
                          <img
                            src={art.lead_image_url}
                            alt={art.original_title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            referrerPolicy="no-referrer"
                            onError={e => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                            <ImageIcon className="w-6 h-6 opacity-40" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 flex-1 flex flex-col justify-between space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-primary)] font-bold uppercase">
                            {art.source_id}
                          </span>
                          <span>{art.published_at?.slice(0, 10)}</span>
                        </div>
                        <h4 className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] line-clamp-2 leading-snug">
                          {art.original_title}
                        </h4>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* External Links & Delete Action */}
            <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 font-semibold flex items-center space-x-1.5 transition-colors"
                    title="이벤트 영구 삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>이벤트 삭제</span>
                  </button>
                ) : (
                  <div className="flex items-center space-x-2 bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-lg">
                    <span className="text-red-400 font-medium text-[11px]">정말 삭제하시겠습니까?</span>
                    <button
                      onClick={() => handleDeleteEvent(selectedEvent.event_id)}
                      disabled={isDeletingEvent}
                      className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-xs transition-colors disabled:opacity-50"
                    >
                      {isDeletingEvent ? '삭제 중...' : '네, 삭제합니다'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-2 py-1 bg-[var(--bg-main)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white rounded text-xs transition-colors"
                    >
                      취소
                    </button>
                  </div>
                )}

                {selectedEvent.official_url && (
                  <a
                    href={selectedEvent.official_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--accent)] hover:underline flex items-center space-x-1"
                  >
                    <span>Official Page</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {selectedEvent.registration_url && (
                  <a
                    href={selectedEvent.registration_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline flex items-center space-x-1"
                  >
                    <span>Register</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setSelectedEvent(null);
                }}
                className="px-4 py-1.5 rounded-lg bg-[var(--bg-hover)] text-white font-semibold hover:bg-[var(--accent)] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
