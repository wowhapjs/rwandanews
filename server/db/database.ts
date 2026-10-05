import { ArticleRecord, AiBatchRecord, EventMatchCandidateRecord, EventRecord, EventUrlRecord, IntegratedArticleRecord, IntegratedSentenceRecord, IntegratedSentenceSourceRecord, LocalizedArticleRecord, LocalizedEventTextRecord, LocalizedTagRecord, SavedEventViewRecord, SourceCheckpointRecord, SourceRecord, SourceRunRecord, StoryClusterRecord, TagAliasRecord, TagConceptRecord, ArticleRelationsRecord } from './types.js';

export interface PortalCoreSchema {
  sources: Record<string, SourceRecord>; sourceRuns: Record<string, SourceRunRecord>; sourceCheckpoints: Record<string, SourceCheckpointRecord>;
  articles: Record<string, ArticleRecord>; duplicateGroups: Record<string, {id:string;canonicalArticleId:string;articleIds:string[]}>;
  storyClusters: Record<string, StoryClusterRecord>; storyClusterArticles: Record<string,string[]>; articleRelations?: Record<string,ArticleRelationsRecord>;
  tagConcepts: Record<string,TagConceptRecord>; tagAliases: Record<string,TagAliasRecord>; events: Record<string,EventRecord>; eventArticles: Record<string,string[]>;
  eventMatchCandidates: Record<string,EventMatchCandidateRecord>; eventMergeHistory: Record<string,{id:string;canonicalEventId:string;mergedEvent:EventRecord;timestamp:string}>;
  eventUrls: Record<string,EventUrlRecord>; aiBatches: Record<string,AiBatchRecord>; integratedArticles: Record<string,IntegratedArticleRecord>;
  integratedSentences: Record<string,IntegratedSentenceRecord>; integratedSentenceSources: Record<string,IntegratedSentenceSourceRecord>; savedEventViews: Record<string,SavedEventViewRecord>; settings: Record<string,any>;
}
export interface LocalizedSchema { articles:Record<string,LocalizedArticleRecord>; tags:Record<string,LocalizedTagRecord>; articleTags:Record<string,string[]>; eventText:Record<string,LocalizedEventTextRecord>; eventTags:Record<string,string[]>; }
const defaults=()=>({defaultLanguage:'original',portalTheme:'BLACK',defaultNewsViewMode:'PHOTO_TEXT',defaultEventListViewMode:'CARD',articleBatchTarget:20,articleBatchMax:25,articleCharLimit:300000,eventBatchTarget:20,eventBatchMax:30,eventCharLimit:250000,crawlerIntervalMinutes:60,eventAutoMergeThreshold:.95,eventReviewThreshold:.70,defaultTimezone:'Africa/Kigali'});
const emptyCore=():PortalCoreSchema=>({sources:{},sourceRuns:{},sourceCheckpoints:{},articles:{},duplicateGroups:{},storyClusters:{},storyClusterArticles:{},tagConcepts:{},tagAliases:{},events:{},eventArticles:{},eventMatchCandidates:{},eventMergeHistory:{},eventUrls:{},aiBatches:{},integratedArticles:{},integratedSentences:{},integratedSentenceSources:{},savedEventViews:{},settings:defaults()});
const emptyLoc=():LocalizedSchema=>({articles:{},tags:{},articleTags:{},eventText:{},eventTags:{}});
const coreCollections=['sourceRuns','sourceCheckpoints','duplicateGroups','storyClusters','storyClusterArticles','articleRelations','tagConcepts','tagAliases','events','eventArticles','eventMatchCandidates','eventMergeHistory','eventUrls','aiBatches','integratedArticles','integratedSentences','integratedSentenceSources','savedEventViews'] as const;
const locCollections=['tags','articleTags','eventText','eventTags'] as const;
export class DatabaseManager {
  public isSupabasePrimary=true; public core=emptyCore(); public ko=emptyLoc(); public en=emptyLoc(); public rw=emptyLoc(); private saveTimer:NodeJS.Timeout|null=null;
  public getLocalizedSchema(lang:string){return lang==='ko'?this.ko:lang==='en'?this.en:lang==='rw'?this.rw:null;}
  public async initDatabase():Promise<void>{if(!await this.loadFromSupabase()) throw new Error('Supabase is required; local database fallback is disabled');}
  public async loadFromSupabase():Promise<boolean>{
    const {getSupabaseClient}=await import('./supabase.js'); const client=getSupabaseClient(); if(!client)return false;
    const [src,kv,arts,loc]=await Promise.all([client.from('sources').select('*'),client.from('portal_kv').select('*'),client.from('articles').select('*'),client.from('localized_articles').select('*')]);
    for(const r of [src,kv,arts,loc]) if(r.error) throw r.error;
    this.core=emptyCore(); this.ko=emptyLoc(); this.en=emptyLoc(); this.rw=emptyLoc();
    for(const s of src.data||[]) this.core.sources[s.id]={id:s.id,domain:s.domain,name:s.name,region:s.region,type:s.type,defaultLanguage:s.default_language,homeUrl:s.home_url,enabled:s.enabled,createdAt:s.created_at,updatedAt:s.updated_at};
    for(const a of arts.data||[]) this.core.articles[a.article_id]=a as ArticleRecord;
    for(const l of loc.data||[]){const schema=this.getLocalizedSchema(l.lang); if(schema)schema.articles[l.article_id]=l as LocalizedArticleRecord;}
    for(const row of kv.data||[]){if(row.collection==='settings'&&row.key==='global')this.core.settings={...this.core.settings,...row.value}; else if(coreCollections.includes(row.collection as any))(this.core as any)[row.collection][row.key]=row.value; else {for(const lang of ['ko','en','rw'] as const){const prefix=lang+'_'; if(row.collection.startsWith(prefix)){const k=row.collection.slice(prefix.length); if(locCollections.includes(k as any))(this[lang] as any)[k][row.key]=row.value;}}}}
    console.log(`[DatabaseManager] Supabase-only runtime loaded ${Object.keys(this.core.articles).length} articles, ${Object.keys(this.core.sources).length} sources.`); return true;
  }
  public save(){if(this.saveTimer)clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>void this.flushToSupabase(),250);}
  public saveSync(){this.save();}
  public syncChangesToSupabase(){this.save();}
  private async flushToSupabase(){
    const {getSupabaseClient,syncArticlesChunkToSupabase}=await import('./supabase.js'); const client=getSupabaseClient(); if(!client)throw new Error('Supabase unavailable');
    const sources=Object.values(this.core.sources).map((s:any)=>({id:s.id,domain:s.domain,name:s.name,region:s.region,type:s.type,default_language:s.defaultLanguage,home_url:s.homeUrl,enabled:s.enabled,created_at:s.createdAt||new Date().toISOString(),updated_at:new Date().toISOString()})); if(sources.length){const r=await client.from('sources').upsert(sources,{onConflict:'id'});if(r.error)throw r.error;}
    const arts=Object.values(this.core.articles); for(let i=0;i<arts.length;i+=100){const r=await syncArticlesChunkToSupabase(arts.slice(i,i+100));if(r.error)throw new Error(r.error);}
    const localized:any[]=[]; for(const lang of ['ko','en','rw'] as const)for(const [id,a] of Object.entries(this[lang].articles))localized.push({...a,article_id:id,lang}); for(let i=0;i<localized.length;i+=100){const r=await client.from('localized_articles').upsert(localized.slice(i,i+100),{onConflict:'article_id,lang'});if(r.error)throw r.error;}
    const kv:any[]=[{collection:'settings',key:'global',value:this.core.settings}]; for(const c of coreCollections)for(const [key,value] of Object.entries((this.core as any)[c]||{}))kv.push({collection:c,key,value}); for(const lang of ['ko','en','rw'] as const)for(const c of locCollections)for(const [key,value] of Object.entries((this[lang] as any)[c]||{}))kv.push({collection:`${lang}_${c}`,key,value}); for(let i=0;i<kv.length;i+=200){const r=await client.from('portal_kv').upsert(kv.slice(i,i+200),{onConflict:'collection,key'});if(r.error)throw r.error;}
  }
}
export const db=new DatabaseManager();
