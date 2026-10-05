import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ArticleRecord } from './types.js';

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';
export interface SupabaseConfig { url:string; key:string; configured:boolean }

export function getSupabaseConfig():SupabaseConfig {
  const url=process.env.SUPABASE_URL?.trim()||'';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()||process.env.SUPABASE_KEY?.trim()||process.env.SUPABASE_ANON_KEY?.trim()||'';
  return {url,key,configured:Boolean(url&&key)};
}
export function getSupabaseClient():SupabaseClient|null {
  const c=getSupabaseConfig(); if(!c.configured)return null;
  const k=`${c.url}::${c.key}`; if(cachedClient&&cachedConfigKey===k)return cachedClient;
  cachedClient=createClient(c.url,c.key,{auth:{persistSession:false}}); cachedConfigKey=k; return cachedClient;
}
export async function testSupabaseConnection(){
  const client=getSupabaseClient(); if(!client)return{success:false,message:'Supabase URL/Key is not configured',tablesExist:false};
  const {count,error}=await client.from('articles').select('article_id',{count:'exact',head:true});
  if(error)return{success:false,message:error.message,tablesExist:false};
  return{success:true,message:`Supabase connected (${count??0} articles)`,tablesFound:['articles','localized_articles','sources','portal_kv'],articleCount:count??0,tablesExist:true};
}
export function generateSupabaseDDL(){return '-- Supabase schema is managed by project migrations. Runtime schema mutation is disabled.';}
function iso(v?:string|null){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();}
export async function syncArticlesChunkToSupabase(articles:ArticleRecord[]){
  const client=getSupabaseClient(); if(!client)throw new Error('Supabase is required'); if(!articles.length)return{success:true,count:0};
  const rows=articles.map((a:any)=>({article_id:a.article_id,source_id:a.source_id,source_url:a.source_url,canonical_url:a.canonical_url,original_language:a.original_language,original_title:a.original_title,original_subtitle:a.original_subtitle,original_body:a.original_body,author:a.author,published_at:iso(a.published_at),collected_at:iso(a.collected_at)||new Date().toISOString(),source_section:a.source_section,source_subcategory:a.source_subcategory,portal_category_id:a.portal_category_id,topic:a.topic||a.portal_category_id,lead_image_url:a.lead_image_url,image_urls:a.image_urls||[],content_blocks:a.content_blocks||[],processing_status:a.processing_status||'RAW',normalized_title:a.normalized_title,content_hash:a.content_hash,story_cluster_id:a.story_cluster_id,created_at:iso(a.created_at)||new Date().toISOString(),updated_at:new Date().toISOString()}));
  const {error}=await client.from('articles').upsert(rows,{onConflict:'article_id'}); if(error)return{success:false,count:0,error:error.message}; return{success:true,count:rows.length};
}
