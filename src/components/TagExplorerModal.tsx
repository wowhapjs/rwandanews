import React, { useState } from 'react';
import { TagInfo } from '../types';
import { X, Search, Tag as TagIcon, Check } from 'lucide-react';

interface TagExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableTags: TagInfo[];
  selectedTagIds?: string[];
  onToggleTag?: (tagId: string) => void;
  onSelectTag?: (tagKey: string) => void;
}

export const TagExplorerModal: React.FC<TagExplorerModalProps> = ({
  isOpen,
  onClose,
  availableTags,
  selectedTagIds = [],
  onToggleTag,
  onSelectTag
}) => {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  if (!isOpen) return null;

  const tagTypes = ['ALL', 'TOPIC', 'ORGANIZATION', 'PLACE', 'PERSON', 'INDUSTRY'];

  const filtered = availableTags.filter(t => {
    const matchesSearch =
      t.key.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = selectedType === 'ALL' || t.type === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TagIcon className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Tag Explorer
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Type filter */}
        <div className="p-4 border-b border-[var(--border)] space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="text"
              placeholder="Search concepts, organizations, people, places..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-md text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {tagTypes.map(type => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  selectedType === type
                    ? 'bg-[var(--accent)] text-white font-semibold'
                    : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Tag List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-[var(--text-secondary)]">
              No matching tags found
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filtered.map(tag => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => {
                      if (onToggleTag) onToggleTag(tag.id);
                      if (onSelectTag) onSelectTag(tag.key);
                    }}
                    className={`p-2.5 rounded-lg border text-left flex items-start justify-between transition-all ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-white'
                        : 'border-[var(--border)] bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                        <span>{tag.name}</span>
                        {tag.type && (
                          <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-black/40 text-[var(--text-secondary)] font-mono">
                            {tag.type}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        {tag.key} &middot; {tag.articleCount || 0} articles, {tag.eventCount || 0} events
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-[var(--accent)] shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] flex justify-between items-center bg-[var(--bg-main)]">
          <div className="text-xs text-[var(--text-secondary)]">
            {selectedTagIds.length} tags selected
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[var(--accent)] text-white rounded-md text-xs font-semibold hover:bg-[var(--accent-hover)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
