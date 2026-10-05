export const STORY_AGENT_PROTOCOL_VERSION = 1 as const;

export interface StoryAgentArticle {
  articleId: string;
  title: string;
  body?: string;
  sourceId?: string;
  publishedAt?: string;
  existingClusterId?: string | null;
}

export interface StoryAgentAssignment {
  articleId: string;
  clusterKey: string | null;
  confidence?: number;
  reason?: string;
}

export interface StoryAgentResult {
  protocolVersion: typeof STORY_AGENT_PROTOCOL_VERSION;
  batchId: string;
  assignments: StoryAgentAssignment[];
}

export function buildStoryAgentCommand(batchId: string, articles: StoryAgentArticle[]): string {
  return [
    'TASK: STORY_CLUSTER',
    `PROTOCOL_VERSION: ${STORY_AGENT_PROTOCOL_VERSION}`,
    `BATCH_ID: ${batchId}`,
    '',
    'Determine which articles describe the same real-world event.',
    'Rules:',
    '- Same topic or named person alone is not sufficient.',
    '- Event, location, actors and timeframe should correspond.',
    '- Do not merge uncertain articles.',
    '- Existing clusters may be reused only when the event actually matches.',
    '- Return JSON only. Do not include Markdown fences.',
    '',
    'Expected shape:',
    JSON.stringify({ protocolVersion: 1, batchId, assignments: [{ articleId: 'id', clusterKey: 'event-key-or-null', confidence: 0.9, reason: 'short reason' }] }, null, 2),
    '',
    'ARTICLES:',
    JSON.stringify(articles, null, 2),
  ].join('\n');
}

export function parseStoryAgentResult(input: string, expectedBatchId: string, allowedArticleIds: Set<string>): StoryAgentResult {
  const parsed = JSON.parse(input) as Partial<StoryAgentResult>;
  if (parsed.protocolVersion !== STORY_AGENT_PROTOCOL_VERSION) throw new Error('Unsupported story-agent protocol version');
  if (parsed.batchId !== expectedBatchId) throw new Error('Batch id mismatch');
  if (!Array.isArray(parsed.assignments)) throw new Error('assignments must be an array');
  const seen = new Set<string>();
  for (const assignment of parsed.assignments) {
    if (!assignment || typeof assignment.articleId !== 'string') throw new Error('Invalid assignment articleId');
    if (!allowedArticleIds.has(assignment.articleId)) throw new Error(`Article is not in this batch: ${assignment.articleId}`);
    if (seen.has(assignment.articleId)) throw new Error(`Duplicate assignment: ${assignment.articleId}`);
    seen.add(assignment.articleId);
    if (assignment.clusterKey !== null && typeof assignment.clusterKey !== 'string') throw new Error('clusterKey must be a string or null');
    if (assignment.confidence !== undefined && (typeof assignment.confidence !== 'number' || assignment.confidence < 0 || assignment.confidence > 1)) throw new Error('confidence must be between 0 and 1');
  }
  return parsed as StoryAgentResult;
}
