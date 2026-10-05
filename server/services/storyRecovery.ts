export const DEFAULT_RECOVERY_LIMIT = 150;

export interface ClusterAssociationSnapshot {
  articleId: string;
  clusterId: string;
  changedAt?: string;
}

export interface ClusterRecoveryPlan {
  operation: 'UNLINK_RECENT_ASSOCIATIONS';
  limit: number;
  associations: ClusterAssociationSnapshot[];
  createdAt: string;
}

export function buildClusterRecoveryPlan(associations: ClusterAssociationSnapshot[], limit = DEFAULT_RECOVERY_LIMIT): ClusterRecoveryPlan {
  if (!Number.isInteger(limit) || limit < 1 || limit > DEFAULT_RECOVERY_LIMIT) throw new Error(`Recovery limit must be between 1 and ${DEFAULT_RECOVERY_LIMIT}`);
  const selected = associations.filter(item => item.articleId && item.clusterId).slice(0, limit);
  return { operation: 'UNLINK_RECENT_ASSOCIATIONS', limit, associations: selected, createdAt: new Date().toISOString() };
}

export function assertRecoveryPlan(plan: ClusterRecoveryPlan): void {
  if (plan.operation !== 'UNLINK_RECENT_ASSOCIATIONS') throw new Error('Unsupported recovery operation');
  if (plan.associations.length > DEFAULT_RECOVERY_LIMIT) throw new Error('Recovery plan exceeds maximum association count');
  const ids = new Set<string>();
  for (const item of plan.associations) {
    if (!item.articleId || !item.clusterId) throw new Error('Recovery snapshot is incomplete');
    if (ids.has(item.articleId)) throw new Error(`Duplicate article in recovery plan: ${item.articleId}`);
    ids.add(item.articleId);
  }
}

export function buildRestoreMap(plan: ClusterRecoveryPlan): Map<string, string> {
  assertRecoveryPlan(plan);
  return new Map(plan.associations.map(item => [item.articleId, item.clusterId]));
}
