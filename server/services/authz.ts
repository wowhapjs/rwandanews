export type ServerRole = 'READER' | 'REPORTER' | 'ADMIN';

export interface AuthenticatedActor {
  id: string;
  role: ServerRole;
  canPublishDirectly?: boolean;
}

export function requireRole(actor: AuthenticatedActor | null | undefined, roles: ServerRole[]): AuthenticatedActor {
  if (!actor) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  if (!roles.includes(actor.role)) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  return actor;
}

export function requireReporter(actor: AuthenticatedActor | null | undefined): AuthenticatedActor {
  return requireRole(actor, ['REPORTER', 'ADMIN']);
}

export function requireAdmin(actor: AuthenticatedActor | null | undefined): AuthenticatedActor {
  return requireRole(actor, ['ADMIN']);
}

export function canEditOwnedArticle(actor: AuthenticatedActor, authorId: string): boolean {
  return actor.role === 'ADMIN' || (actor.role === 'REPORTER' && actor.id === authorId);
}
