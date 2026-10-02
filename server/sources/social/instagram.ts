import { BaseSourceAdapter } from '../base.js';
import {
  DiscoveryOptions,
  DiscoveryResult,
  ParsedArticle,
  SourceMetadata
} from '../types.js';

export class InstagramRwandaAdapter extends BaseSourceAdapter {
  getMetadata(): SourceMetadata {
    return {
      id: 'instagram_rwanda',
      domain: 'instagram.com',
      name: 'Instagram - Rwanda & Kigali',
      region: 'rwanda',
      type: 'social',
      defaultLanguage: 'en',
      homeUrl: 'https://www.instagram.com/explore/tags/kigali/',
      sections: [
        { id: 'tag_kigali', name: '#kigali Tag Feed', path: '/explore/tags/kigali/' },
        { id: 'tag_rwanda', name: '#rwanda Tag Feed', path: '/explore/tags/rwanda/' }
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
