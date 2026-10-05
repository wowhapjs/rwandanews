import type { ParsedArticle } from '../types';
import type { SourceValidationIssue, SourceValidationResult } from './types';

export function validateParsedArticle(article: ParsedArticle): SourceValidationResult {
  const issues: SourceValidationIssue[] = [];
  const required = (field: string, value: unknown) => { if (typeof value !== 'string' || !value.trim()) issues.push({ field, code: 'REQUIRED', message: `${field} is required`, severity: 'error' }); };
  required('sourceId', article.sourceId); required('sourceUrl', article.sourceUrl); required('canonicalUrl', article.canonicalUrl); required('originalTitle', article.originalTitle); required('originalBody', article.originalBody); required('publishedAt', article.publishedAt);
  if (article.publishedAt && Number.isNaN(Date.parse(article.publishedAt))) issues.push({ field: 'publishedAt', code: 'INVALID_DATE', message: 'publishedAt must be a valid source-derived date', severity: 'error' });
  if (article.canonicalUrl) { try { const url = new URL(article.canonicalUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); } catch { issues.push({ field: 'canonicalUrl', code: 'INVALID_URL', message: 'canonicalUrl must be HTTP(S)', severity: 'error' }); } }
  if (!article.contentBlocks?.length) issues.push({ field: 'contentBlocks', code: 'EMPTY_BLOCKS', message: 'No structured content blocks were extracted', severity: 'warning' });
  return { ok: !issues.some(i => i.severity === 'error'), issues };
}
