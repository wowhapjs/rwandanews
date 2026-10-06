import { useEffect, useState } from 'react';
import { AppMode, canUseMode, defaultModeFor, UserProfile } from '../auth/roles';

const STORAGE_KEY = 'jsrdnews-app-mode';

export function useAppMode(profile: UserProfile | null) {
  const role = profile?.role ?? 'MEMBER';
  const [mode, setModeState] = useState<AppMode>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) as AppMode | null : null;
    return saved && canUseMode(role, saved) ? saved : defaultModeFor(role);
  });

  useEffect(() => {
    if (!canUseMode(role, mode)) setModeState(defaultModeFor(role));
  }, [role, mode]);

  const setMode = (next: AppMode) => {
    if (!canUseMode(role, next)) throw new Error(`Role ${role} cannot enter ${next} mode`);
    setModeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  return { mode, setMode, role };
}
