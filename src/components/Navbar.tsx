import React from 'react';
import { ActiveTab, PortalTheme } from '../types';
import {
  Newspaper,
  Calendar,
  Layers,
  Database,
  Sliders,
  Home,
  Palette,
  Globe
} from 'lucide-react';
import { t } from '../lib/i18n';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  currentTheme: PortalTheme;
  onThemeChange: (theme: PortalTheme) => void;
  currentLang: string;
  onLangChange: (lang: string) => void;
  pendingAiCount?: number;
  pendingCandidatesCount?: number;
  queuedUrlCount?: number;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  currentTheme,
  onThemeChange,
  currentLang,
  onLangChange,
  pendingAiCount = 0,
  pendingCandidatesCount = 0,
  queuedUrlCount = 0,
  searchQuery = '',
  onSearchChange
}) => {
  const [isLangOpen, setIsLangOpen] = React.useState(false);
  const [isThemeOpen, setIsThemeOpen] = React.useState(false);
  const langRef = React.useRef<HTMLDivElement>(null);
  const themeRef = React.useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setIsLangOpen(false);
      }
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setIsThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'HOME', label: t('nav_home', currentLang), icon: <Home className="w-4 h-4" /> },
    { id: 'NEWS', label: t('nav_news', currentLang), icon: <Newspaper className="w-4 h-4" /> },
    { id: 'EVENTS', label: t('nav_events', currentLang), icon: <Calendar className="w-4 h-4" />, badge: pendingCandidatesCount },
    { id: 'SOURCES', label: t('nav_sources', currentLang), icon: <Database className="w-4 h-4" /> },
    { id: 'AI_WORKSPACE', label: t('nav_ai_workspace', currentLang), icon: <Layers className="w-4 h-4" />, badge: pendingAiCount || queuedUrlCount },
    { id: 'SETTINGS', label: t('nav_settings', currentLang), icon: <Sliders className="w-4 h-4" /> }
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border)] bg-[var(--bg-main)]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Brand & Portal Type */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange('HOME')}>
          <div className="w-9 h-9 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/40 flex items-center justify-center text-[var(--accent)] font-bold text-base">
            PN
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
              {t('brand_title', currentLang)}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] font-medium">
              {t('brand_subtitle', currentLang)}
            </div>
          </div>
        </div>

        {/* Primary Navigation */}
        <nav className="hidden md:flex items-center space-x-1">
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-btn-${item.id.toLowerCase()}`}
                onClick={() => onTabChange(item.id)}
                title={item.label}
                className={`relative px-3 py-2 rounded-md text-xs font-semibold tracking-wider transition-colors flex items-center space-x-1.5 ${
                  isActive
                    ? 'bg-[var(--accent)] !text-white shadow-sm font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {item.icon}
                <span className="hidden lg:inline">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`ml-1 px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                    isActive ? 'bg-white text-[var(--accent)]' : 'bg-[var(--accent)] !text-white'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Controls: Theme & Language (Collapses to icons only when inactive) */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {/* Language Selector Popover */}
          <div className="relative" ref={langRef}>
            <button
              type="button"
              onClick={() => {
                setIsLangOpen(prev => !prev);
                setIsThemeOpen(false);
              }}
              title={`Language: ${currentLang.toUpperCase()}`}
              aria-label="Language options"
              className={`p-1.5 rounded-lg border transition-colors flex items-center justify-center ${
                isLangOpen
                  ? 'bg-[var(--accent)] !text-white border-[var(--accent)] shadow-sm'
                  : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]'
              }`}
            >
              <Globe className="w-4 h-4" />
            </button>

            {isLangOpen && (
              <div className="absolute right-0 mt-1.5 w-36 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl py-1 z-50 text-xs">
                {[
                  { id: 'original', label: 'Original' },
                  { id: 'ko', label: 'KO (한국어)' },
                  { id: 'en', label: 'EN (English)' },
                  { id: 'rw', label: 'RW (Kinyarwanda)' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onLangChange(opt.id);
                      setIsLangOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 transition-colors ${
                      currentLang === opt.id
                        ? 'bg-[var(--accent)] !text-white font-semibold'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Theme Selector Popover */}
          <div className="relative" ref={themeRef}>
            <button
              type="button"
              onClick={() => {
                setIsThemeOpen(prev => !prev);
                setIsLangOpen(false);
              }}
              title={`Skin: ${currentTheme}`}
              aria-label="Color skin theme options"
              className={`p-1.5 rounded-lg border transition-colors flex items-center justify-center ${
                isThemeOpen
                  ? 'bg-[var(--accent)] !text-white border-[var(--accent)] shadow-sm'
                  : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]'
              }`}
            >
              <Palette className="w-4 h-4" />
            </button>

            {isThemeOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl py-1 z-50 text-xs">
                {[
                  { id: 'BLACK', label: 'Black (Midnight Slate)' },
                  { id: 'BLUE', label: 'Blue (Intelligence Navy)' },
                  { id: 'PINK', label: 'Pink (Rose Wine)' },
                  { id: 'RAINBOW', label: 'Rainbow (Chromatic Violet)' }
                ].map(thm => (
                  <button
                    key={thm.id}
                    onClick={() => {
                      onThemeChange(thm.id as PortalTheme);
                      setIsThemeOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 transition-colors ${
                      currentTheme === thm.id
                        ? 'bg-[var(--accent)] !text-white font-semibold'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {thm.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Nav Bar - Icon only on small screens to prevent layout breakage */}
      <div className="md:hidden grid grid-cols-6 border-t border-[var(--border)] px-2 py-1.5 bg-[var(--bg-main)]">
        {navItems.map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              title={item.label}
              aria-label={item.label}
              className={`p-2 rounded-lg text-xs font-medium relative flex items-center justify-center transition-colors mx-auto ${
                isActive
                  ? 'bg-[var(--accent)] !text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {item.icon}
              {/* Only show icon, no text label on small screens */}
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`absolute -top-1 -right-1 px-1 min-w-4 text-[9px] rounded-full font-bold text-center leading-tight ${
                  isActive ? 'bg-white text-[var(--accent)]' : 'bg-[var(--accent)] !text-white'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
