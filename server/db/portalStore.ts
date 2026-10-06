import { getSupabaseClient } from './supabase.js';

function client() {
  const value = getSupabaseClient();
  if (!value) throw new Error('Supabase is not configured.');
  return value;
}

export async function getPortalValue<T>(collection: string, key: string): Promise<T | null> {
  const { data, error } = await client().from('portal_kv').select('value').eq('collection', collection).eq('key', key).maybeSingle();
  if (error) throw error;
  return (data?.value as T | undefined) ?? null;
}

export async function listPortalValues<T>(collection: string): Promise<Record<string, T>> {
  const { data, error } = await client().from('portal_kv').select('key,value').eq('collection', collection);
  if (error) throw error;
  return Object.fromEntries((data || []).map((row: any) => [row.key, row.value as T]));
}

export async function putPortalValue<T>(collection: string, key: string, value: T): Promise<void> {
  const { error } = await client().from('portal_kv').upsert({ collection, key, value }, { onConflict: 'collection,key' });
  if (error) throw error;
}

export async function removePortalValue(collection: string, key: string): Promise<void> {
  const { error } = await client().from('portal_kv').delete().eq('collection', collection).eq('key', key);
  if (error) throw error;
}

export async function getSettings(): Promise<Record<string, any>> {
  return (await getPortalValue<Record<string, any>>('settings', 'global')) || {};
}

export async function updateSettings(updates: Record<string, any>): Promise<Record<string, any>> {
  const next = { ...(await getSettings()), ...updates };
  await putPortalValue('settings', 'global', next);
  return next;
}

export async function listSources(): Promise<any[]> {
  const { data, error } = await client().from('sources').select('*');
  if (error) throw error;
  return data || [];
}

export async function setSourceEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await client().from('sources').update({ enabled, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function listLocalizedRows(lang?: string): Promise<any[]> {
  let query = client().from('localized_articles').select('*');
  if (lang) query = query.eq('lang', lang);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
