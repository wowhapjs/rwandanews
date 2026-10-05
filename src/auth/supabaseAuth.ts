import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from './roles';

let client: SupabaseClient | null = null;
export function getBrowserSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL; const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase authentication is not configured');
  client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }); return client;
}
export async function signInWithEmail(email: string, password: string) { const { error } = await getBrowserSupabase().auth.signInWithPassword({ email, password }); if (error) throw error; }
export async function signUpWithEmail(email: string, password: string) { const { error } = await getBrowserSupabase().auth.signUp({ email, password }); if (error) throw error; }
export async function signOut() { const { error } = await getBrowserSupabase().auth.signOut(); if (error) throw error; }
export async function loadCurrentProfile(): Promise<UserProfile | null> {
  const supabase = getBrowserSupabase(); const { data: { user }, error } = await supabase.auth.getUser(); if (error || !user) return null;
  const { data } = await supabase.from('newsroom_profiles').select('user_id,display_name,role,can_publish_directly').eq('user_id', user.id).maybeSingle();
  const role = data?.role === 'ADMIN' ? 'ADMIN' : data?.role === 'REPORTER' ? 'REPORTER' : 'READER';
  return { id: user.id, email: user.email, displayName: data?.display_name ?? undefined, role, canPublishDirectly: data?.can_publish_directly === true || data?.can_publish_directly === 1 };
}
