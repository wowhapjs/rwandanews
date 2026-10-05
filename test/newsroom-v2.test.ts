import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseMode } from '../src/auth/roles';
import { assertArticleTransition, canTransitionArticle } from '../server/services/articleWorkflow';
import { buildClusterRecoveryPlan, buildRestoreMap } from '../server/services/storyRecovery';
import { buildStoryAgentCommand, parseStoryAgentResult } from '../server/services/storyAgentProtocol';
import { validateArticleImageUpload } from '../server/services/imageUploadPolicy';

test('role presentation modes never grant admin mode to reporter', () => {
  assert.equal(canUseMode('ADMIN', 'reader'), true);
  assert.equal(canUseMode('ADMIN', 'reporter'), true);
  assert.equal(canUseMode('REPORTER', 'admin'), false);
  assert.equal(canUseMode('READER', 'reporter'), false);
});

test('publishing requires admin or direct-publish policy', () => {
  assert.equal(canTransitionArticle('IN_REVIEW', 'PUBLISHED', 'REPORTER'), false);
  assert.equal(canTransitionArticle('IN_REVIEW', 'PUBLISHED', 'REPORTER', true), true);
  assert.equal(canTransitionArticle('IN_REVIEW', 'PUBLISHED', 'ADMIN'), true);
  assert.throws(() => assertArticleTransition('DRAFT', 'PUBLISHED', 'ADMIN'));
});

test('cluster recovery is bounded and reversible', () => {
  const rows = Array.from({ length: 180 }, (_, i) => ({ articleId: `a${i}`, clusterId: `c${i}` }));
  const plan = buildClusterRecoveryPlan(rows);
  assert.equal(plan.associations.length, 150);
  assert.equal(buildRestoreMap(plan).get('a0'), 'c0');
  assert.throws(() => buildClusterRecoveryPlan(rows, 151));
});

test('story agent result is batch-bound and rejects unknown articles', () => {
  const command = buildStoryAgentCommand('batch-1', [{ articleId: 'a1', title: 'Example' }]);
  assert.match(command, /BATCH_ID: batch-1/);
  const result = parseStoryAgentResult(JSON.stringify({ protocolVersion: 1, batchId: 'batch-1', assignments: [{ articleId: 'a1', clusterKey: 'event-1', confidence: 0.8 }] }), 'batch-1', new Set(['a1']));
  assert.equal(result.assignments[0].clusterKey, 'event-1');
  assert.throws(() => parseStoryAgentResult(JSON.stringify({ protocolVersion: 1, batchId: 'batch-1', assignments: [{ articleId: 'other', clusterKey: null }] }), 'batch-1', new Set(['a1'])));
});

test('image policy rejects unsupported or oversized files', () => {
  assert.doesNotThrow(() => validateArticleImageUpload({ mimetype: 'image/webp', size: 1024, originalname: 'news.webp' }));
  assert.throws(() => validateArticleImageUpload({ mimetype: 'image/svg+xml', size: 1024, originalname: 'x.svg' }));
  assert.throws(() => validateArticleImageUpload({ mimetype: 'image/jpeg', size: 11 * 1024 * 1024, originalname: 'huge.jpg' }));
});
