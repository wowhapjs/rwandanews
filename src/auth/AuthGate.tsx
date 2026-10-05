import React, { ReactNode } from 'react';
import type { AppMode, UserProfile } from './roles';
import { canUseMode } from './roles';

export function AuthGate({ profile, mode, children, onSignIn }: { profile: UserProfile | null; mode: AppMode; children: ReactNode; onSignIn: () => void }) {
  if (mode === 'reader') return <>{children}</>;
  if (!profile) return <main className="mx-auto max-w-md p-6 text-center"><h1 className="text-2xl font-bold">로그인이 필요합니다</h1><p className="mt-2 text-slate-600">기자 및 관리자 기능은 인증된 계정만 사용할 수 있습니다.</p><button type="button" onClick={onSignIn} className="mt-6 min-h-11 rounded-lg bg-slate-900 px-5 font-semibold text-white">로그인 / 가입</button></main>;
  if (!canUseMode(profile.role, mode)) return <main className="p-6"><h1 className="text-xl font-bold">접근 권한이 없습니다</h1></main>;
  return <>{children}</>;
}
