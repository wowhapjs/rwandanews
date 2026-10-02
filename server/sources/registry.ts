import { SourceAdapter } from './types.js';
import { KigaliTodayAdapter } from './rwanda/news/www.kigalitoday.com.js';
import { KtPressAdapter } from './rwanda/news/www.ktpress.rw.js';
import { NewTimesAdapter } from './rwanda/news/www.newtimes.co.rw.js';
import { RdbAdapter } from './rwanda/government/rdb.rw.js';
import { RebAdapter } from './rwanda/government/www.reb.gov.rw.js';
import { FuturesAdapter } from './korea/news/futures.re.kr.js';
import { FacebookRwandaAdapter } from './social/facebook.js';
import { XRwandaAdapter } from './social/x.js';
import { InstagramRwandaAdapter } from './social/instagram.js';
import { YouTubeRwandaAdapter } from './social/youtube.js';

export class SourceRegistry {
  private adapters: Map<string, SourceAdapter> = new Map();

  constructor() {
    this.register(new KigaliTodayAdapter());
    this.register(new KtPressAdapter());
    this.register(new NewTimesAdapter());
    this.register(new RdbAdapter());
    this.register(new RebAdapter());
    this.register(new FuturesAdapter());
    this.register(new FacebookRwandaAdapter());
    this.register(new XRwandaAdapter());
    this.register(new InstagramRwandaAdapter());
    this.register(new YouTubeRwandaAdapter());
    // NOTE: www.gov.rw and www.rca.gov.rw are strictly excluded from active sources
    // per Requirements 47 & 113.
  }

  register(adapter: SourceAdapter): void {
    const meta = adapter.getMetadata();
    this.adapters.set(meta.id, adapter);
  }

  getAdapter(id: string): SourceAdapter | undefined {
    return this.adapters.get(id);
  }

  getAllAdapters(): SourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAllMetadata() {
    return this.getAllAdapters().map(a => a.getMetadata());
  }
}

export const sourceRegistry = new SourceRegistry();
