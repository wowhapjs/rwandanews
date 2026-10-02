import { Article, EventCandidate, EventItem, EventUrlItem, SourceInfo, TagInfo, AiBatch, IntegratedArticle, SentenceTrace } from '../types';

export const api = {
  // Articles
  async getArticles(params: Record<string, string | number>): Promise<{ total: number; articles: Article[] }> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        searchParams.set(k, String(v));
      }
    });
    const res = await fetch(`/api/articles?${searchParams.toString()}`);
    return res.json();
  },

  async getArticleById(id: string): Promise<any> {
    const res = await fetch(`/api/articles/${id}`);
    return res.json();
  },

  async getStoryCluster(clusterId: string, lang?: string): Promise<{ cluster: any; articles: Article[] }> {
    const res = await fetch(`/api/articles/story-cluster/${clusterId}${lang ? `?lang=${lang}` : ''}`);
    return res.json();
  },

  async manageStoryCluster(data: any): Promise<any> {
    const res = await fetch('/api/articles/story-cluster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // Events
  async getEvents(params: Record<string, string | number>): Promise<{ total: number; events: EventItem[] }> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        searchParams.set(k, String(v));
      }
    });
    const res = await fetch(`/api/events?${searchParams.toString()}`);
    return res.json();
  },

  async createEvent(data: Partial<EventItem>): Promise<{ event: EventItem; status: string }> {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async getEventCandidates(): Promise<{ candidates: EventCandidate[] }> {
    const res = await fetch('/api/events/candidates');
    return res.json();
  },

  async mergeEvents(sourceEventId: string, targetCanonicalId: string, candidateId?: string): Promise<{ success: boolean }> {
    const res = await fetch('/api/events/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceEventId, targetCanonicalId, candidateId })
    });
    return res.json();
  },

  async rejectCandidate(candidateId: string): Promise<{ success: boolean }> {
    const res = await fetch('/api/events/reject-candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId })
    });
    return res.json();
  },

  async deleteEvent(eventId: string): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
    return res.json();
  },

  async aiDeduplicateEvents(): Promise<{ success: boolean; mergedCount: number; linkedArticleCount: number; message: string }> {
    const res = await fetch('/api/events/ai-deduplicate', { method: 'POST' });
    return res.json();
  },

  async exportEvents(ids?: string[]): Promise<void> {
    const query = ids && ids.length > 0 ? `?ids=${ids.join(',')}` : '';
    const res = await fetch(`/api/events/export${query}`);
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EVENTS_EXPORT_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  async getEventInbox(): Promise<{ urls: EventUrlItem[] }> {
    const res = await fetch('/api/events/inbox');
    return res.json();
  },

  async addEventUrls(urls: string): Promise<{ added: number; existing: number; invalid: number }> {
    const res = await fetch('/api/events/inbox/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    });
    return res.json();
  },

  async fetchQueuedEventUrls(): Promise<any> {
    const res = await fetch('/api/events/inbox/fetch', { method: 'POST' });
    return res.json();
  },

  // Sources
  async getSources(): Promise<{ sources: SourceInfo[] }> {
    const res = await fetch('/api/sources');
    return res.json();
  },

  async triggerCrawl(sourceId: string, mode: 'incremental' | 'backfill', days = 365): Promise<any> {
    const res = await fetch(`/api/sources/${sourceId}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, days })
    });
    return res.json();
  },

  async triggerCrawlAll(mode: 'incremental' | 'backfill' = 'incremental', days = 365): Promise<any> {
    const res = await fetch('/api/sources/crawl-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, days })
    });
    return res.json();
  },

  async toggleSource(sourceId: string): Promise<{ success: boolean; enabled: boolean }> {
    const res = await fetch(`/api/sources/${sourceId}/toggle`, { method: 'POST' });
    return res.json();
  },

  async getSourceRuns(sourceId: string): Promise<{ runs: any[] }> {
    const res = await fetch(`/api/sources/${sourceId}/runs`);
    return res.json();
  },

  // AI Workspace
  async getAiMetrics(): Promise<any> {
    const res = await fetch('/api/ai/metrics');
    return res.json();
  },

  async getAiBatches(): Promise<{ batches: AiBatch[] }> {
    const res = await fetch('/api/ai/batches');
    return res.json();
  },

  async deleteAllAiBatches(): Promise<{ success: boolean; count: number; message: string }> {
    const res = await fetch('/api/ai/batches', { method: 'DELETE' });
    return res.json();
  },

  async deleteAiBatch(batchId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/ai/batch/${batchId}`, { method: 'DELETE' });
    return res.json();
  },

  async resetExportedArticles(): Promise<{ success: boolean; resetCount: number; message: string }> {
    const res = await fetch('/api/ai/reset-exported', { method: 'POST' });
    return res.json();
  },

  async createArticleBatch(articleIds?: string[], batchName?: string, includeProcessed = false): Promise<any> {
    const res = await fetch('/api/ai/batch/article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleIds, batchName, includeProcessed })
    });
    return res.json();
  },

  async startMultiArticleBatchExport(options?: { articleIds?: string[]; batchName?: string; chunkSize?: number; targetTotal?: number; includeProcessed?: boolean }): Promise<{
    success: boolean;
    jobId: string;
    totalChunks: number;
    message: string;
  }> {
    const res = await fetch('/api/ai/batch/multi-article/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {})
    });
    return res.json();
  },

  async getMultiArticleBatchProgress(jobId: string): Promise<{
    id: string;
    status: 'PROCESSING' | 'COMPLETED' | 'ERROR';
    current: number;
    total: number;
    progress: number;
    message: string;
    result?: {
      batchId: string;
      zipFilename: string;
      downloadZipUrl: string;
      fileCount: number;
      totalArticles: number;
    };
    error?: string;
  }> {
    const res = await fetch(`/api/ai/batch/multi-article/progress/${jobId}`);
    return res.json();
  },

  async createMultiArticleBatch(options?: { articleIds?: string[]; batchName?: string; chunkSize?: number; targetTotal?: number; includeProcessed?: boolean }): Promise<{
    success: boolean;
    batchId: string;
    zipFilename: string;
    downloadZipUrl: string;
    fileCount: number;
    totalArticles: number;
    error?: string;
  }> {
    const res = await fetch('/api/ai/batch/multi-article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {})
    });
    return res.json();
  },

  async createEventUrlBatch(urlIds?: string[]): Promise<any> {
    const res = await fetch('/api/ai/batch/event-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urlIds })
    });
    return res.json();
  },

  async createIntegratedBatch(articleIds: string[], topicTitle: string): Promise<any> {
    const res = await fetch('/api/ai/batch/integrated', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleIds, topicTitle })
    });
    return res.json();
  },

  async previewExcelImport(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/ai/import/preview', {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  async previewMultiExcelImport(files: File[]): Promise<any> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const res = await fetch('/api/ai/import/preview', {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  async commitExcelImport(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/ai/import/commit', {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  async commitMultiExcelImport(files: File[]): Promise<any> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const res = await fetch('/api/ai/import/commit', {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  async groupSimilarArticles(articleIds?: string[]): Promise<any> {
    const res = await fetch('/api/articles/group-similar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleIds })
    });
    return res.json();
  },

  async getIntegratedArticles(): Promise<{ articles: IntegratedArticle[] }> {
    const res = await fetch('/api/ai/integrated-articles');
    return res.json();
  },

  async getIntegratedArticleDetail(id: string): Promise<{ article: IntegratedArticle; sentences: SentenceTrace[]; sourceArticles: Article[] }> {
    const res = await fetch(`/api/ai/integrated-articles/${id}`);
    return res.json();
  },

  // Tags
  async getTags(search?: string, type?: string): Promise<{ tags: TagInfo[] }> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (type) params.set('type', type);
    const res = await fetch(`/api/tags?${params.toString()}`);
    return res.json();
  },

  // Settings & Saved Views
  async getSettings(): Promise<{ settings: any }> {
    const res = await fetch('/api/settings');
    return res.json();
  },

  async updateSettings(settings: any): Promise<any> {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return res.json();
  },

  async getSavedViews(): Promise<{ views: any[] }> {
    const res = await fetch('/api/settings/saved-views');
    return res.json();
  },

  async saveEventView(name: string, filterState: any): Promise<any> {
    const res = await fetch('/api/settings/saved-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, filterState })
    });
    return res.json();
  },

  async deleteSavedView(id: string): Promise<any> {
    const res = await fetch(`/api/settings/saved-views/${id}`, { method: 'DELETE' });
    return res.json();
  }
};
