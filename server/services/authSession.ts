import type { AuthenticatedActor, ServerRole } from './authz';

export interface AuthClaims { sub?: string; email?: string; role?: string; can_publish_directly?: boolean; }

export function actorFromClaims(claims: AuthClaims | null | undefined): AuthenticatedActor | null {
  if (!claims?.sub) return null;
  const role: ServerRole = claims.role === 'ADMIN' ? 'ADMIN' : claims.role === 'REPORTER' ? 'REPORTER' : 'READER';
  return { id: claims.sub, role, canPublishDirectly: claims.can_publish_directly === true };
}

export function assertTrustedRoleSource(claims: AuthClaims, profileRole?: ServerRole): ServerRole {
  // The client-selected presentation mode is deliberately not accepted here.
  // Callers should resolve profileRole from the authenticated server-side profile store.
  if (profileRole) return profileRole;
  return claims.role === 'ADMIN' ? 'ADMIN' : claims.role === 'REPORTER' ? 'REPORTER' : 'READER';
}
