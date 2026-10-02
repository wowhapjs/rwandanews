import React, { useState, useEffect } from 'react';
import { EventCandidate } from '../types';
import { api } from '../lib/api';
import {
  X,
  GitMerge,
  Check,
  Ban,
  Calendar,
  MapPin,
  Building,
  CheckSquare,
  Square,
  RefreshCw,
  Award
} from 'lucide-react';

interface EventDuplicateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActionComplete: () => void;
}

export const EventDuplicateReviewModal: React.FC<EventDuplicateReviewModalProps> = ({
  isOpen,
  onClose,
  onActionComplete
}) => {
  const [candidates, setCandidates] = useState<EventCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  // Store chosen surviving target for each candidate: cand.id -> 'target' | 'source'
  const [chosenTarget, setChosenTarget] = useState<Record<string, 'target' | 'source'>>({});
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchCandidates = () => {
    setLoading(true);
    api.getEventCandidates()
      .then(res => {
        const list = res.candidates || [];
        setCandidates(list);
        // Default target is 'target' (existing canonical)
        const initTarget: Record<string, 'target' | 'source'> = {};
        list.forEach(c => {
          initTarget[c.id] = 'target';
        });
        setChosenTarget(initTarget);
        setSelectedCandidateIds([]);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load duplicate candidates:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) {
      setActionNotice(null);
      fetchCandidates();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSelectCandidate = (candId: string) => {
    setSelectedCandidateIds(prev =>
      prev.includes(candId) ? prev.filter(id => id !== candId) : [...prev, candId]
    );
  };

  const handleSelectAll = () => {
    if (selectedCandidateIds.length === candidates.length) {
      setSelectedCandidateIds([]);
    } else {
      setSelectedCandidateIds(candidates.map(c => c.id));
    }
  };

  const handleMerge = async (cand: EventCandidate) => {
    setProcessingId(cand.id);
    setActionNotice(null);
    try {
      const keep = chosenTarget[cand.id] || 'target';
      // If keep === 'target', source is cand.source_event_id, target is cand.target_event_id
      // If keep === 'source', source is cand.target_event_id, target is cand.source_event_id
      const sourceId = keep === 'target' ? cand.source_event_id : cand.target_event_id;
      const targetId = keep === 'target' ? cand.target_event_id : cand.source_event_id;

      await api.mergeEvents(sourceId, targetId, cand.id);
      setActionNotice(`Successfully merged into ${keep === 'target' ? 'existing' : 'incoming'} event!`);
      fetchCandidates();
      onActionComplete();
    } catch (err: any) {
      setActionNotice(`Merge error: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (cand: EventCandidate) => {
    setProcessingId(cand.id);
    setActionNotice(null);
    try {
      await api.rejectCandidate(cand.id);
      setActionNotice('Marked as separate events.');
      fetchCandidates();
      onActionComplete();
    } catch (err: any) {
      setActionNotice(`Reject error: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Batch merge selected candidates
  const handleBatchMerge = async () => {
    if (selectedCandidateIds.length === 0) return;
    setBatchProcessing(true);
    setActionNotice(`Batch merging ${selectedCandidateIds.length} candidate pairs...`);

    let successCount = 0;
    for (const candId of selectedCandidateIds) {
      const cand = candidates.find(c => c.id === candId);
      if (!cand) continue;
      try {
        const keep = chosenTarget[cand.id] || 'target';
        const sourceId = keep === 'target' ? cand.source_event_id : cand.target_event_id;
        const targetId = keep === 'target' ? cand.target_event_id : cand.source_event_id;
        await api.mergeEvents(sourceId, targetId, cand.id);
        successCount++;
      } catch (err) {
        console.error(`Failed to merge candidate ${candId}:`, err);
      }
    }

    setBatchProcessing(false);
    setActionNotice(`Batch merge complete: ${successCount} pairs merged.`);
    fetchCandidates();
    onActionComplete();
  };

  // Batch reject (keep separate) selected candidates
  const handleBatchReject = async () => {
    if (selectedCandidateIds.length === 0) return;
    setBatchProcessing(true);
    setActionNotice(`Marking ${selectedCandidateIds.length} pairs as separate...`);

    let successCount = 0;
    for (const candId of selectedCandidateIds) {
      try {
        await api.rejectCandidate(candId);
        successCount++;
      } catch (err) {
        console.error(`Failed to reject candidate ${candId}:`, err);
      }
    }

    setBatchProcessing(false);
    setActionNotice(`Batch action complete: ${successCount} pairs marked separate.`);
    fetchCandidates();
    onActionComplete();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex justify-center p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-main)]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[var(--accent)]/15 rounded-xl text-[var(--accent)]">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
                <span>Event Duplicate Review & Deduplication</span>
                {candidates.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300">
                    {candidates.length} candidates
                  </span>
                )}
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Review similar event pairs, pick which canonical event survives, or batch process multiple at once
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[var(--text-secondary)] hover:text-white rounded-lg hover:bg-[var(--bg-hover)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Notice banner */}
        {actionNotice && (
          <div className="px-4 py-2 bg-[var(--accent)]/10 border-b border-[var(--accent)]/30 text-xs text-[var(--text-primary)] font-medium flex items-center justify-between">
            <span>{actionNotice}</span>
            <button onClick={() => setActionNotice(null)} className="text-[var(--text-secondary)] hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Batch Action Toolbar */}
        {candidates.length > 0 && (
          <div className="px-5 py-2.5 bg-[var(--bg-hover)]/60 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={handleSelectAll}
                className="flex items-center space-x-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium"
              >
                {selectedCandidateIds.length === candidates.length && candidates.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                <span>Select All ({selectedCandidateIds.length}/{candidates.length})</span>
              </button>
            </div>

            {selectedCandidateIds.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-[var(--text-secondary)]">
                  Batch ({selectedCandidateIds.length} selected):
                </span>
                <button
                  type="button"
                  onClick={handleBatchMerge}
                  disabled={batchProcessing}
                  className="px-3 py-1 bg-[var(--accent)] text-white rounded-lg font-semibold hover:opacity-90 flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {batchProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5" />}
                  <span>Merge All Selected</span>
                </button>
                <button
                  type="button"
                  onClick={handleBatchReject}
                  disabled={batchProcessing}
                  className="px-3 py-1 border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  <span>Keep Separate All Selected</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Candidate List */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {loading ? (
            <div className="py-20 text-center text-xs text-[var(--text-secondary)] flex flex-col items-center space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin text-[var(--accent)]" />
              <span>Loading review candidates...</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <Check className="w-10 h-10 text-emerald-400 mx-auto" />
              <div className="text-sm font-bold text-[var(--text-primary)]">All Clear!</div>
              <div className="text-xs text-[var(--text-secondary)]">
                No ambiguous duplicate candidates pending review.
              </div>
            </div>
          ) : (
            candidates.map(cand => {
              const src = cand.sourceEvent;
              const tgt = cand.targetEvent;
              const matchPercent = Math.round(cand.similarity_score * 100);
              const isSelected = selectedCandidateIds.includes(cand.id);
              const keepTarget = chosenTarget[cand.id] || 'target';

              return (
                <div
                  key={cand.id}
                  className={`bg-[var(--bg-main)] border rounded-2xl p-4 sm:p-5 space-y-4 transition-all ${
                    isSelected ? 'border-[var(--accent)] shadow-sm' : 'border-[var(--border)]'
                  }`}
                >
                  {/* Top Header: Select Checkbox, Score, Match Reasons & Individual Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectCandidate(cand.id)}
                        className="w-4 h-4 rounded bg-[var(--bg-card)] border-[var(--border)] text-[var(--accent)] cursor-pointer"
                      />
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          {matchPercent}% Match
                        </span>
                        <span className="text-xs text-[var(--text-secondary)]">
                          {cand.match_reasons.join(' &middot; ')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleReject(cand)}
                        disabled={processingId === cand.id || batchProcessing}
                        className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] hover:text-white flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Keep Separate</span>
                      </button>
                      <button
                        onClick={() => handleMerge(cand)}
                        disabled={processingId === cand.id || batchProcessing}
                        className="px-3.5 py-1.5 rounded-xl bg-[var(--accent)] text-xs text-white font-semibold hover:opacity-90 flex items-center space-x-1.5 transition-opacity disabled:opacity-50 shadow-sm"
                      >
                        {processingId === cand.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <GitMerge className="w-3.5 h-3.5" />
                        )}
                        <span>Merge (Keep {keepTarget === 'target' ? 'B' : 'A'})</span>
                      </button>
                    </div>
                  </div>

                  {/* Surviving Target Selector Bar */}
                  <div className="bg-[var(--bg-hover)]/40 p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[var(--text-secondary)] flex items-center space-x-1.5">
                      <Award className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Choose Surviving Event (Final Remaining):</span>
                    </span>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setChosenTarget(prev => ({ ...prev, [cand.id]: 'source' }))}
                        className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center space-x-1.5 ${
                          keepTarget === 'source'
                            ? 'bg-[var(--accent)] text-white shadow-sm font-semibold'
                            : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        <span>Keep Event A (Incoming)</span>
                        {keepTarget === 'source' && <Check className="w-3 h-3 text-white" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setChosenTarget(prev => ({ ...prev, [cand.id]: 'target' }))}
                        className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center space-x-1.5 ${
                          keepTarget === 'target'
                            ? 'bg-[var(--accent)] text-white shadow-sm font-semibold'
                            : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        <span>Keep Event B (Existing Canonical)</span>
                        {keepTarget === 'target' && <Check className="w-3 h-3 text-white" />}
                      </button>
                    </div>
                  </div>

                  {/* Side-by-Side Comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {/* Event A (Incoming Candidate) */}
                    <div
                      onClick={() => setChosenTarget(prev => ({ ...prev, [cand.id]: 'source' }))}
                      className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2.5 text-xs ${
                        keepTarget === 'source'
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]'
                          : 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-amber-300 uppercase tracking-wider text-[10px]">
                          Event A &middot; Incoming ({src.event_id})
                        </div>
                        {keepTarget === 'source' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent)] text-white">
                            SURVIVING FINAL
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-secondary)]">Click to keep this</span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">
                        {src.canonical_name}
                      </div>
                      {src.subtitle && (
                        <div className="text-[var(--text-secondary)] italic">{src.subtitle}</div>
                      )}
                      <div className="space-y-1.5 text-[var(--text-secondary)] pt-1">
                        <div className="flex items-center space-x-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />
                          <span>{src.start_date} {src.start_time || ''}</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[var(--accent)]" />
                          <span>{src.venue || 'No venue'} &middot; {src.city}</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <Building className="w-3.5 h-3.5 text-[var(--accent)]" />
                          <span>{src.organizer || 'No organizer'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Event B (Existing Canonical) */}
                    <div
                      onClick={() => setChosenTarget(prev => ({ ...prev, [cand.id]: 'target' }))}
                      className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2.5 text-xs ${
                        keepTarget === 'target'
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]'
                          : 'border-[var(--border)] bg-[var(--bg-hover)] hover:border-[var(--accent)]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-[var(--text-secondary)] uppercase tracking-wider text-[10px]">
                          Event B &middot; Existing ({tgt.event_id})
                        </div>
                        {keepTarget === 'target' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent)] text-white">
                            SURVIVING FINAL
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-secondary)]">Click to keep this</span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">
                        {tgt.canonical_name}
                      </div>
                      {tgt.subtitle && (
                        <div className="text-[var(--text-secondary)] italic">{tgt.subtitle}</div>
                      )}
                      <div className="space-y-1.5 text-[var(--text-secondary)] pt-1">
                        <div className="flex items-center space-x-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />
                          <span>{tgt.start_date} {tgt.start_time || ''}</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[var(--accent)]" />
                          <span>{tgt.venue || 'No venue'} &middot; {tgt.city}</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <Building className="w-3.5 h-3.5 text-[var(--accent)]" />
                          <span>{tgt.organizer || 'No organizer'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-main)] flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">
            Tip: Merging combines linked articles and redirects future references to the chosen final event.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[var(--bg-hover)] text-xs text-white font-semibold hover:bg-[var(--accent)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
