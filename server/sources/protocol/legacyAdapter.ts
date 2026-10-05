import type { SourceAdapter } from '../types';
import type { SourceAdapterV2, SourceProtocolContext } from './types';
import { validateParsedArticle } from './defaultValidation';

export function adaptLegacySource(adapter: SourceAdapter): SourceAdapterV2 {
  return {
    protocolVersion: 2,
    getMetadata: () => adapter.getMetadata(),
    discover: (options) => adapter.discoverArticles(options),
    fetch: (url) => adapter.fetchArticle(url),
    parse: (html, url) => adapter.parseArticle(html, url),
    normalize: (article) => adapter.normalizeArticle(article),
    validate: (article) => validateParsedArticle(article),
  };
}

export function defaultSourceProtocolContext(): SourceProtocolContext {
  return { now: () => new Date(), log: (level, message, data) => { if (level === 'error' || level === 'warn') console[level](`[source-v2] ${message}`, data || {}); } };
}
