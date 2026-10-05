import React, { useEffect, useState } from 'react';
import App from './App';
import { AuthScreen } from './auth/AuthScreen';
import { RoleModeSwitcher } from './components/RoleModeSwitcher';
import { getBrowserSupabase, loadCurrentProfile, signInWithEmail, signUpWithEmail } from './auth/supabaseAuth';
import type { UserProfile } from './auth/roles';
import { useAppMode } from './hooks/useAppMode';
import { ReaderApp } from './reader/ReaderApp';
import { ReporterDesk } from './reporter/ReporterDesk';
import { MarkdownArticleEditor, ReporterDraft } from './reporter/MarkdownArticleEditor';

export function NewsroomRoot() {
  const [profile, setProfile] = useState<UserProfile | null>(null); const [authReady, setAuthReady] = useState(false); const [showAuth, setShowAuth] = useState(false); const [editing, setEditing] = useState(false); const [draft, setDraft] = useState<ReporterDraft>({ title: '', subtitle: '', body: '' });
  useEffect(() => { let alive = true; loadCurrentProfile().then(p => { if (alive) setProfile(p); }).catch(() => {}).finally(() => { if (alive) setAuthReady(true); }); let unsub: (() => void) | undefined; try { const { data } = getBrowserSupabase().auth.onAuthStateChange(() => { loadCurrentProfile().then(setProfile).catch(() => setProfile(null)); }); unsub = () => data.subscription.unsubscribe(); } catch {} return () => { alive = false; unsub?.(); }; }, []);
  const { mode, setMode } = useAppMode(profile);
  const authenticate = (fn: (e:string,p:string)=>Promise<void>) => async (email:string,password:string) => { await fn(email,password); setShowAuth(false); setProfile(await loadCurrentProfile()); };
  if (!authReady) return <main className="p-6 text-center">Loading…</main>;
  if (showAuth) return <AuthScreen onSignIn={authenticate(signInWithEmail)} onSignUp={authenticate(signUpWithEmail)}/>;
  if (mode === 'reader') return <div><div className="fixed right-2 top-16 z-50">{profile ? <RoleModeSwitcher profile={profile} mode={mode} onChange={setMode}/> : <button type="button" onClick={() => setShowAuth(true)} className="min-h-10 rounded-lg border bg-white px-3 text-sm font-semibold shadow">로그인</button>}</div><ReaderApp/></div>;
  if (!profile) return <AuthScreen onSignIn={authenticate(signInWithEmail)} onSignUp={authenticate(signUpWithEmail)}/>;
  return <div><div className="sticky top-0 z-[70] flex justify-end border-b bg-white p-2"><RoleModeSwitcher profile={profile} mode={mode} onChange={setMode}/></div>{mode === 'reporter' ? editing ? <MarkdownArticleEditor value={draft} onChange={setDraft} onSave={() => {}} onSubmit={() => {}}/> : <ReporterDesk articles={[]} onCreate={() => setEditing(true)} onOpen={() => setEditing(true)}/> : <App/>}</div>;
}
