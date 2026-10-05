export type ArticleWorkflowState = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type WorkflowRole = 'REPORTER' | 'ADMIN';

const transitions: Record<ArticleWorkflowState, ArticleWorkflowState[]> = {
  DRAFT: ['IN_REVIEW', 'ARCHIVED'],
  IN_REVIEW: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['IN_REVIEW', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

export function canTransitionArticle(from: ArticleWorkflowState, to: ArticleWorkflowState, role: WorkflowRole, canPublishDirectly = false): boolean {
  if (!transitions[from].includes(to)) return false;
  if (to === 'PUBLISHED') return role === 'ADMIN' || canPublishDirectly;
  return true;
}

export function assertArticleTransition(from: ArticleWorkflowState, to: ArticleWorkflowState, role: WorkflowRole, canPublishDirectly = false): void {
  if (!canTransitionArticle(from, to, role, canPublishDirectly)) throw new Error(`Article transition not permitted: ${from} -> ${to}`);
}
