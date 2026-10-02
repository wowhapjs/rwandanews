import React, { useState, useEffect } from 'react';
import { PortalTheme } from '../types';
import { api } from '../lib/api';
import { Sliders, Save, Check } from 'lucide-react';
import { FacebookSessionSetup } from '../components/FacebookSessionSetup';
import { SupabaseSettingsCard } from '../components/SupabaseSettingsCard';

interface SettingsViewProps {
  currentTheme: PortalTheme;
  onThemeChange: (theme: PortalTheme) => void;
  currentLang: string;
  onLangChange: (lang: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentTheme,
  onThemeChange,
  currentLang,
  onLangChange
}) => {
  const [settings, setSettings] = useState<any>({
    defaultLanguage: 'original',
    defaultTheme: 'BLACK',
    defaultNewsViewMode: 'PHOTO_TEXT',
    defaultEventViewMode: 'MONTH',
    defaultEventListMode: 'CARD',
    eventAutoMergeThreshold: 0.95,
    eventReviewThreshold: 0.70,
    defaultTimezone: 'Africa/Kigali',
    articleBatchTarget: 20,
    articleBatchMax: 25,
    crawlerIntervalMinutes: 60,
    crawlerRateLimitMs: 500
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then(res => {
      if (res.settings) setSettings(res.settings);
    });
  }, []);

  const handleSave = async () => {
    try {
      await api.updateSettings(settings);
      onThemeChange(settings.defaultTheme);
      onLangChange(settings.defaultLanguage);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-[var(--accent)]" />
            <span>Portal Settings & Deduplication Configuration</span>
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Configure system defaults, event matching thresholds, and offline processing parameters
          </p>
        </div>

        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] flex items-center space-x-1.5"
        >
          {saved ? <Check className="w-3.5 h-3.5 text-green-300" /> : <Save className="w-3.5 h-3.5" />}
          <span>{saved ? 'Saved!' : 'Save Settings'}</span>
        </button>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 space-y-6 text-xs">
        {/* Appearance & Defaults */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)] border-b border-[var(--border)] pb-2">
            Appearance & Language
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                Portal Theme
              </label>
              <select
                value={settings.defaultTheme}
                onChange={e => {
                  setSettings({ ...settings, defaultTheme: e.target.value });
                  onThemeChange(e.target.value as PortalTheme);
                }}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              >
                <option value="BLACK">BLACK (Midnight Slate)</option>
                <option value="BLUE">BLUE (Intelligence Navy)</option>
                <option value="PINK">PINK (Rose Wine)</option>
                <option value="RAINBOW">RAINBOW (Chromatic Obsidian)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                Default Portal Language
              </label>
              <select
                value={settings.defaultLanguage}
                onChange={e => {
                  setSettings({ ...settings, defaultLanguage: e.target.value });
                  onLangChange(e.target.value);
                }}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              >
                <option value="original">Original (Source Language)</option>
                <option value="ko">Korean (한국어)</option>
                <option value="en">English (English)</option>
                <option value="rw">Kinyarwanda (Ikinyarwanda)</option>
              </select>
            </div>
          </div>
        </div>

        {/* View Mode Defaults */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)] border-b border-[var(--border)] pb-2">
            View Modes & Timezone
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                Default News View Mode
              </label>
              <select
                value={settings.defaultNewsViewMode}
                onChange={e => setSettings({ ...settings, defaultNewsViewMode: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              >
                <option value="PHOTO_TEXT">Photo + Text (Magazine)</option>
                <option value="CARD">Card Grid</option>
                <option value="TEXT">Compact Text</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                Default Events View
              </label>
              <select
                value={settings.defaultEventViewMode}
                onChange={e => setSettings({ ...settings, defaultEventViewMode: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              >
                <option value="MONTH">Month Calendar View</option>
                <option value="LIST">List View</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                Default Timezone
              </label>
              <input
                type="text"
                value={settings.defaultTimezone}
                onChange={e => setSettings({ ...settings, defaultTimezone: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                placeholder="Africa/Kigali"
              />
            </div>
          </div>
        </div>

        {/* Event Deduplication Thresholds */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)] border-b border-[var(--border)] pb-2">
            Event Deduplication Matching Thresholds
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] space-y-2">
              <label className="block font-semibold text-emerald-400">
                Auto-Merge Threshold (Default: 0.95 / 95%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.8"
                max="1.0"
                value={settings.eventAutoMergeThreshold}
                onChange={e => setSettings({ ...settings, eventAutoMergeThreshold: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              />
              <p className="text-[11px] text-[var(--text-secondary)]">
                Incoming events matching name, date, and venue with score &ge; this threshold are merged automatically.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] space-y-2">
              <label className="block font-semibold text-amber-400">
                Duplicate Review Threshold (Default: 0.70 / 70%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.5"
                max="0.94"
                value={settings.eventReviewThreshold}
                onChange={e => setSettings({ ...settings, eventReviewThreshold: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              />
              <p className="text-[11px] text-[var(--text-secondary)]">
                Incoming events matching between this score and Auto-Merge are sent to Duplicate Review.
              </p>
            </div>
          </div>
        </div>

        {/* AI Batch Limits */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)] border-b border-[var(--border)] pb-2">
            AI Batch Export Limits
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                Target Article Batch Size
              </label>
              <input
                type="number"
                value={settings.articleBatchTarget}
                onChange={e => setSettings({ ...settings, articleBatchTarget: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                Max Article Batch Size (Upper Cap)
              </label>
              <input
                type="number"
                value={settings.articleBatchMax}
                onChange={e => setSettings({ ...settings, articleBatchMax: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              />
            </div>
          </div>
        </div>
      </div>
      <SupabaseSettingsCard />
      <FacebookSessionSetup />
    </div>
  );
};
