export type AccountRole = 'READER' | 'REPORTER' | 'ADMIN';
export type AppMode = 'reader' | 'reporter' | 'admin';

export interface UserProfile {
  id: string;
  email?: string;
  displayName?: string;
  role: AccountRole;
  canPublishDirectly?: boolean;
}

const allowedModes: Record<AccountRole, AppMode[]> = {
  READER: ['reader'],
  REPORTER: ['reader', 'reporter'],
  ADMIN: ['reader', 'reporter', 'admin'],
};

export function canUseMode(role: AccountRole, mode: AppMode): boolean {
  return allowedModes[role].includes(mode);
}

export function defaultModeFor(role: AccountRole): AppMode {
  return role === 'ADMIN' ? 'admin' : role === 'REPORTER' ? 'reporter' : 'reader';
}

export function canWriteArticles(role: AccountRole): boolean {
  return role === 'REPORTER' || role === 'ADMIN';
}

export function canManageNewsroom(role: AccountRole): boolean {
  return role === 'ADMIN';
}
