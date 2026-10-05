import type { DiscoveryOptions, DiscoveryResult, ParsedArticle, SourceMetadata } from '../types';

export const SOURCE_PROTOCOL_VERSION = 2 as const;

export interface SourceProtocolContext {
  signal?: AbortSignal;
  now: () => Date;
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => void;
}

export interface SourceValidationIssue {
  field: string;
  code: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface SourceValidationResult {
  ok: boolean;
  issues: SourceValidationIssue[];
}

export interface SourceHealthSnapshot {
  sourceId: string;
  status: 'HEALTHY' | 'WARNING' | 'BROKEN' | 'DISABLED';
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  discovered?: number;
  parsed?: number;
  parseSuccessRate?: number;
}

export interface SourceAdapterV2 {
  readonly protocolVersion: typeof SOURCE_PROTOCOL_VERSION;
  getMetadata(): SourceMetadata;
  discover(options: DiscoveryOptions, context: SourceProtocolContext): Promise<DiscoveryResult>;
  fetch(url: string, context: SourceProtocolContext): Promise<string>;
  parse(html: string, url: string, context: SourceProtocolContext): Promise<ParsedArticle | null>;
  normalize(article: ParsedArticle, context: SourceProtocolContext): ParsedArticle;
  validate(article: ParsedArticle, context: SourceProtocolContext): Promise<SourceValidationResult> | SourceValidationResult;
}

export interface SourcePipelineResult {
  article: ParsedArticle | null;
  validation: SourceValidationResult;
  duplicateOf?: string;
}
