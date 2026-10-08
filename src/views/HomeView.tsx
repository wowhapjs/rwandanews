import React, { useEffect, useState } from 'react';
import { Article, EventItem, ActiveTab } from '../types';
import { api } from '../lib/api';
import {
  Newspaper,
  Calendar,
  Layers,
  Database,
  ArrowRight,
  TrendingUp,
  MapPin,
  Sparkles
} from 'lucide-react';
import { t } from '../lib/i18n';

const getDisplayTopic = (art: { topic?: string }): string => {
  const val = art.topic;
  if (!val || val === 'undefined' || val === 'null' || val.trim() === '') {
    return 'General';
  }
  return val.trim();
};

interface HomeViewProps {
  onNavigate: (tab: ActiveTab) => void;
  onSelectArticle: (articleId: string) => void;
  currentLang?: string;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate, onSelectArticle, currentLang }) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [recentArticles, setRecentArticles] = useState<Article[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    Promise.all([
      api.getAiMetrics(),
      api.getArticles({ limit: 6, sort: 'newest', ...(currentLang ? { lang: currentLang } : {}) }),
      api.getEvents({ limit: 5, ...(currentLang ? { lang: currentLang } : {}) })
    ])
      .then(([metricsRes, articlesRes, eventsRes]) => {
        setMetrics(metricsRes);
        setRecentArticles(articlesRes.articles || []);
        setUpcomingEvents(eventsRes.events || []);
      })
      .catch(err => {
        console.error('Error loading dashboard:', err);
      });
  }, [currentLang]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* Top Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div
          onClick={() => onNavigate('NEWS')}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 cursor-pointer hover:border-[var(--accent)] transition-all space-y-1"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="font-semibold">{t('home_tracked_articles', currentLang)}</span>
            <Newspaper className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {metrics?.articles?.total || recentArticles.length}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            {metrics?.articles?.processed || 0} {t('home_stat_processed', currentLang)} &middot; {metrics?.articles?.raw || 0} {t('home_stat_raw', currentLang)}
          </div>
        </div>

        <div
          onClick={() => onNavigate('EVENTS')}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 cursor-pointer hover:border-[var(--accent)] transition-all space-y-1"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="font-semibold">{t('home_verified_events', currentLang)}</span>
            <Calendar className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {metrics?.events || upcomingEvents.length}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            {t('home_events_desc', currentLang)}
          </div>
        </div>

        <div
          onClick={() => onNavigate('AI_WORKSPACE')}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 cursor-pointer hover:border-[var(--accent)] transition-all space-y-1"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="font-semibold">{t('home_ai_batches', currentLang)}</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {metrics?.batches || 0}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            {t('home_pipeline_sub', currentLang)}
          </div>
        </div>

        <div
          onClick={() => onNavigate('SOURCES')}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 cursor-pointer hover:border-[var(--accent)] transition-all space-y-1"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="font-semibold">{t('home_registered_sources', currentLang)}</span>
            <Database className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            6
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            {t('home_sources_desc', currentLang)}
          </div>
        </div>
      </div>

      {/* Main Grid: Latest Intelligence + Upcoming Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Latest Articles */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                {t('home_latest_stream', currentLang)}
              </h2>
            </div>
            <button
              onClick={() => onNavigate('NEWS')}
              className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center space-x-1 cursor-pointer"
            >
              <span>{t('home_view_all_news', currentLang)}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {recentArticles.map(art => (
              <div
                key={art.article_id}
                onClick={() => onSelectArticle(art.article_id)}
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--accent)] transition-all cursor-pointer flex flex-col justify-between space-y-2.5"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                    <span className={`font-bold px-2 py-0.5 rounded uppercase text-[10px] ${
                      art.source_id === 'grouping'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                        : 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    }`}>
                      {art.source_id === 'grouping' ? 'Grouping · 종합' : art.source_id}
                    </span>
                    <span>{(art.published_at || '').slice(0, 10)}</span>
                  </div>

                  <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] line-clamp-2 leading-snug">
                    {art.displayTitle || art.original_title}
                  </h3>

                  <p className="text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
                    {art.displaySummary}
                  </p>
                </div>

                <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span className="uppercase font-mono text-[10px]">
                    {(art.original_language || '').toUpperCase()} &middot; {getDisplayTopic(art)}
                  </span>
                  {art.relatedStoriesCount > 0 && (
                    <span className="text-[var(--accent)] font-semibold">
                      Related &middot; {art.relatedStoriesCount}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right 1 Col: Upcoming Events */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                {t('home_upcoming_events', currentLang)}
              </h2>
            </div>
            <button
              onClick={() => onNavigate('EVENTS')}
              className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center space-x-1 cursor-pointer"
            >
              <span>{t('home_explore_calendar', currentLang)}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3.5 space-y-3">
            {upcomingEvents.map(evt => (
              <div
                key={evt.event_id}
                className="p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border)] hover:border-[var(--accent)] transition-all space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-emerald-400">
                    {evt.start_date}
                  </span>
                  <span className="px-2 py-0.2 rounded text-[10px] bg-[var(--bg-hover)] text-[var(--text-secondary)] font-medium">
                    {evt.category}
                  </span>
                </div>

                <h4 className="text-xs font-bold text-[var(--text-primary)] line-clamp-2">
                  {evt.displayName || evt.canonical_name}
                </h4>

                {(evt.venue || evt.city) && (
                  <div className="text-[11px] text-[var(--text-secondary)] flex items-center space-x-1">
                    <MapPin className="w-3 h-3 text-[var(--accent)] shrink-0" />
                    <span className="truncate">{evt.venue ? `${evt.venue}, ${evt.city}` : evt.city}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* AI Pipeline Quick Callout */}
          <div className="p-4 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-[var(--accent)]">
              <Sparkles className="w-4 h-4" />
              <span>{t('home_pipeline_title', currentLang)}</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {t('home_pipeline_desc', currentLang)}
            </p>
            <button
              onClick={() => onNavigate('AI_WORKSPACE')}
              className="px-3 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
            >
              {t('nav_ai_workspace', currentLang)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
