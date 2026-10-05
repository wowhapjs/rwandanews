import type { ParsedArticle } from '../sources/types';
import type { SourceAdapterV2, SourcePipelineResult, SourceProtocolContext } from '../sources/protocol/types';

export interface SourcePipelineHooks {
  findDuplicate(article: ParsedArticle): Promise<string | undefined>;
  store(article: ParsedArticle): Promise<void>;
  postProcess?(article: ParsedArticle): Promise<void>;
}

export async function ingestDiscoveredArticle(adapter: SourceAdapterV2, url: string, context: SourceProtocolContext, hooks: SourcePipelineHooks): Promise<SourcePipelineResult> {
  const html = await adapter.fetch(url, context);
  const parsed = await adapter.parse(html, url, context);
  if (!parsed) return { article: null, validation: { ok: false, issues: [{ field: 'article', code: 'PARSE_EMPTY', message: 'Adapter returned no article', severity: 'error' }] } };
  const article = adapter.normalize(parsed, context);
  const validation = await adapter.validate(article, context);
  if (!validation.ok) return { article, validation };
  const duplicateOf = await hooks.findDuplicate(article);
  if (duplicateOf) return { article, validation, duplicateOf };
  await hooks.store(article);
  if (hooks.postProcess) await hooks.postProcess(article);
  return { article, validation };
}
