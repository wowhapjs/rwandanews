export type NewsroomAuditAction =
  | 'ARTICLE_CREATE'
  | 'ARTICLE_UPDATE'
  | 'ARTICLE_SUBMIT_REVIEW'
  | 'ARTICLE_PUBLISH'
  | 'ARTICLE_UNPUBLISH'
  | 'ARTICLE_ARCHIVE'
  | 'IMAGE_UPLOAD'
  | 'ROLE_CHANGE'
  | 'SOURCE_CHANGE'
  | 'STORY_AGENT_APPLY'
  | 'STORY_CLUSTER_UNLINK'
  | 'STORY_CLUSTER_RESTORE';

export interface NewsroomAuditEvent {
  id?: string;
  actorId: string;
  action: NewsroomAuditAction;
  targetType: 'article' | 'user' | 'source' | 'story_cluster' | 'batch';
  targetId: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
}
