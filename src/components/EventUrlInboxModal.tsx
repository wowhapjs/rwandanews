import React, { useState, useEffect } from 'react';
import { EventUrlItem } from '../types';
import { api } from '../lib/api';
import { X, Globe, Plus, Download, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface EventUrlInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBatchCreated?: () => void;
}

export const EventUrlInboxModal: React.FC<EventUrlInboxModalProps> = ({
  isOpen,
  onClose,
  onBatchCreated
}) => {
  const [urls, setUrls] = useState<EventUrlItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingText, setFetchingText] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const loadInbox = () => {
    setLoading(true);
    api.getEventInbox()
      .then(res => {
        setUrls(res.urls || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load event inbox:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) loadInbox();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddUrls = async () => {
    if (!inputText.trim()) return;
    try {
      const res = await api.addEventUrls(inputText);
      alert(`Added ${res.added} URL(s) to Inbox (${res.existing} already existed, ${res.invalid} invalid).`);
      setInputText('');
      loadInbox();
    } catch (err: any) {
      alert(`Error adding URLs: ${err.message}`);
    }
  };

  const handleFetchAll = async () => {
    setFetchingText(true);
    try {
      const res = await api.fetchQueuedEventUrls();
      alert(`Fetched readable text for ${res.successCount} of ${res.processed} URLs.`);
      loadInbox();
    } catch (err: any) {
      alert(`Fetch error: ${err.message}`);
    } finally {
      setFetchingText(false);
    }
  };

  const handleCreateBatch = async () => {
    const readyUrls = urls.filter(u => u.status === 'READY');
    const targetIds = selectedIds.length > 0
      ? selectedIds
      : readyUrls.map(u => u.id);

    if (targetIds.length === 0) {
      alert('No READY URLs available to export. Please fetch text for queued URLs first.');
      return;
    }

    try {
      const res = await api.createEventUrlBatch(targetIds);
      alert(`Created AI Event URL Batch (${res.itemCount} items). Downloading XLSX...`);
      window.location.href = res.downloadUrl;
      loadInbox();
      if (onBatchCreated) onBatchCreated();
    } catch (err: any) {
      alert(`Failed to create batch: ${err.message}`);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAllReady = () => {
    const readyIds = urls.filter(u => u.status === 'READY').map(u => u.id);
    setSelectedIds(readyIds);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex justify-center p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-main)]">
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-[var(--accent)]" />
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Event URL Inbox</h3>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Accumulate and batch external event web pages without immediate AI API costs
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--text-secondary)] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Add URLs input */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--text-secondary)]">
              Paste Event Page URLs (Single or Multi-line / Comma-separated)
            </label>
            <textarea
              rows={3}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="https://example.com/events/kigali-summit&#10;https://another-site.org/conference"
              className="w-full p-2.5 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <div className="flex justify-end">
              <button
                onClick={handleAddUrls}
                disabled={!inputText.trim()}
                className="px-3 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50 flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add URLs to Inbox</span>
              </button>
            </div>
          </div>

          {/* Action Bar */}
          <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2 text-xs">
              <button
                onClick={handleFetchAll}
                disabled={fetchingText}
                className="px-3 py-1.5 rounded-md bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)] flex items-center space-x-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${fetchingText ? 'animate-spin' : ''}`} />
                <span>{fetchingText ? 'Fetching HTML...' : 'Fetch Text for Queued'}</span>
              </button>
              <button
                onClick={selectAllReady}
                className="px-2.5 py-1.5 rounded-md text-[var(--text-secondary)] hover:text-white text-xs"
              >
                Select All Ready
              </button>
            </div>

            <button
              onClick={handleCreateBatch}
              className="px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white text-xs font-semibold flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Batch to Excel</span>
            </button>
          </div>

          {/* URL List */}
          <div className="space-y-2">
            {urls.length === 0 ? (
              <div className="text-center py-12 text-xs text-[var(--text-secondary)]">
                No URLs currently in Inbox. Paste links above to begin.
              </div>
            ) : (
              urls.map(item => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    className={`p-3 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-all ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                        : 'border-[var(--border)] bg-[var(--bg-main)] hover:border-[var(--text-secondary)]'
                    }`}
                  >
                    <div className="space-y-1 flex-1 pr-3">
                      <div className="font-semibold text-[var(--text-primary)] truncate">
                        {item.fetched_title || item.url}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] truncate">
                        {item.url}
                      </div>
                      {item.fetched_text && (
                        <div className="text-[11px] text-[var(--text-secondary)] line-clamp-1 italic">
                          "{item.fetched_text.slice(0, 100)}..."
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.status === 'READY'
                          ? 'bg-green-500/15 text-green-300 border border-green-500/30'
                          : item.status === 'QUEUED'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : item.status === 'FETCHING'
                          ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                          : 'bg-red-500/15 text-red-300 border border-red-500/30'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-main)] flex justify-between items-center text-xs text-[var(--text-secondary)]">
          <span>{urls.filter(u => u.status === 'READY').length} URLs ready for AI Extraction</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--bg-hover)] text-xs text-white font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
