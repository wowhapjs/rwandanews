import React, { useState } from 'react';
import { EventItem } from '../types';
import { api } from '../lib/api';
import { X, Calendar, Plus, AlertCircle, CheckCircle } from 'lucide-react';

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventCreated: () => void;
}

export const AddEventModal: React.FC<AddEventModalProps> = ({
  isOpen,
  onClose,
  onEventCreated
}) => {
  const [formData, setFormData] = useState<Partial<EventItem>>({
    canonical_name: '',
    subtitle: '',
    description: '',
    start_date: new Date().toISOString().slice(0, 10),
    start_time: '09:00',
    end_date: new Date().toISOString().slice(0, 10),
    end_time: '17:00',
    all_day: false,
    venue: '',
    city: 'Kigali',
    country: 'Rwanda',
    organizer: '',
    category: 'Business / Investment',
    status: 'confirmed',
    price_text: 'Free',
    official_url: '',
    registration_url: ''
  });

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'merged' | 'candidate'; message: string } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.canonical_name || !formData.start_date) return;

    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.createEvent(formData);
      if (res.status === 'merged') {
        setFeedback({
          type: 'merged',
          message: `Auto-merged into existing canonical event "${res.event.canonical_name}" (>=95% similarity match).`
        });
      } else if (res.status === 'candidate_queued') {
        setFeedback({
          type: 'candidate',
          message: `Created event "${res.event.canonical_name}". Also flagged for Duplicate Review (70-94% similarity match).`
        });
      } else {
        setFeedback({
          type: 'success',
          message: `Successfully created event "${res.event.canonical_name}".`
        });
      }
      setTimeout(() => {
        onEventCreated();
        onClose();
      }, 1800);
    } catch (err: any) {
      alert(`Error creating event: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex justify-center p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl my-auto flex flex-col">
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-main)]">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Add Event Manually</h3>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--text-secondary)] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
          {feedback && (
            <div className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${
              feedback.type === 'merged'
                ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                : feedback.type === 'candidate'
                ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
                : 'bg-green-500/15 border border-green-500/30 text-green-300'
            }`}>
              {feedback.type === 'merged' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
              <span>{feedback.message}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Event Name *</label>
            <input
              type="text"
              required
              value={formData.canonical_name}
              onChange={e => setFormData({ ...formData, canonical_name: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="e.g. Kigali Tech Summit 2026"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Subtitle / Summary</label>
            <input
              type="text"
              value={formData.subtitle || ''}
              onChange={e => setFormData({ ...formData, subtitle: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="Brief tagline or theme"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={formData.start_date}
                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">End Date</label>
              <input
                type="date"
                value={formData.end_date}
                onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="all-day-checkbox"
              checked={formData.all_day}
              onChange={e => setFormData({ ...formData, all_day: e.target.checked })}
              className="rounded bg-[var(--bg-main)] border-[var(--border)] text-[var(--accent)]"
            />
            <label htmlFor="all-day-checkbox" className="text-xs text-[var(--text-secondary)] font-medium">
              All Day Event
            </label>
          </div>

          {!formData.all_day && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Start Time</label>
                <input
                  type="time"
                  value={formData.start_time || '09:00'}
                  onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">End Time</label>
                <input
                  type="time"
                  value={formData.end_time || '17:00'}
                  onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Venue</label>
              <input
                type="text"
                value={formData.venue || ''}
                onChange={e => setFormData({ ...formData, venue: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none"
                placeholder="e.g. Kigali Convention Centre"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">City</label>
              <input
                type="text"
                value={formData.city || 'Kigali'}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Organizer</label>
              <input
                type="text"
                value={formData.organizer || ''}
                onChange={e => setFormData({ ...formData, organizer: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none"
                placeholder="e.g. RDB / MINICT"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Category</label>
              <select
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none"
              >
                <option value="Government">Government</option>
                <option value="Business / Investment">Business / Investment</option>
                <option value="Conference / Technology">Conference / Technology</option>
                <option value="Culture / Festival">Culture / Festival</option>
                <option value="Concert / Entertainment">Concert / Entertainment</option>
                <option value="Education">Education</option>
                <option value="Sports">Sports</option>
                <option value="Exhibition">Exhibition</option>
                <option value="Community">Community</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-xs text-white font-semibold hover:bg-[var(--accent-hover)] flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{loading ? 'Evaluating...' : 'Create Event'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
