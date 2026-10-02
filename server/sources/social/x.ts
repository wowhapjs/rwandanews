import { BaseSourceAdapter } from '../base.js';
import {
  DiscoveryOptions,
  DiscoveryResult,
  ParsedArticle,
  SourceMetadata
} from '../types.js';

export class XRwandaAdapter extends BaseSourceAdapter {
  getMetadata(): SourceMetadata {
    return {
      id: 'x_rwanda',
      domain: 'x.com',
      name: 'X (Twitter) - Rwanda & Kigali',
      region: 'rwanda',
      type: 'social',
      defaultLanguage: 'en',
      homeUrl: 'https://x.com/search?q=(rwanda%20OR%20kigali)&f=live',
      sections: [
        { id: 'all_rwanda', name: 'Posts matching "rwanda" OR "kigali"', path: '/search?q=(rwanda%20OR%20kigali)&f=live' },
        { id: 'kigali_live', name: 'Kigali Live Updates', path: '/search?q=kigali&f=live' }
      ],
      enabled: false
    };
  }

  async discoverArticles(_options: DiscoveryOptions): Promise<DiscoveryResult> {
    return {
      articles: [],
      lastSuccessfulPage: 1,
      completed: true
    };
  }

  async fetchArticle(_url: string): Promise<string> {
    return '';
  }

  async parseArticle(_html: string, _url: string): Promise<ParsedArticle | null> {
    return null;
  }
}
