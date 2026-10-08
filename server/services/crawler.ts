import { sourceRegistry } from '../sources/registry.js';
import { contentHash, normalizeTitle } from '../sources/utils/hash.js';
import { ArticleRecord } from '../db/types.js';
import { insertArticleDirectly, isArticleUrlExistingDirectly } from '../db/supabaseStore.js';
import { getPortalValue, listSources, putPortalValue } from '../db/portalStore.js';

export class CrawlerService {
  private activeRuns=new Map<string,boolean>();
  async runCrawl(sourceId:string,mode:'backfill'|'incremental',daysToBackfill=365):Promise<{success:boolean;discovered:number;imported:number;message:string}>{
    if(this.activeRuns.get(sourceId))return{success:false,discovered:0,imported:0,message:`Crawl already running for ${sourceId}`};
    const adapter=sourceRegistry.getAdapter(sourceId);if(!adapter)return{success:false,discovered:0,imported:0,message:`Unknown source ${sourceId}`};
    this.activeRuns.set(sourceId,true);const runId=`RUN-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;const cutoffDate=mode==='backfill'?new Date(Date.now()-daysToBackfill*86400000):undefined;
    const checkpoint:any=await getPortalValue('sourceCheckpoints',sourceId);const checkpointPage=mode==='backfill'&&checkpoint?checkpoint.currentPage:1;
    const run:any={id:runId,sourceId,runType:mode,startedAt:new Date().toISOString(),status:'running',articlesDiscovered:0,articlesImported:0,errorsCount:0,lastSuccessfulPage:checkpointPage};await putPortalValue('sourceRuns',runId,run);
    let discoveredCount=0,importedCount=0;
    try{const discovery=await adapter.discoverArticles({mode,cutoffDate,checkpointPage,maxPagesPerSection:mode==='backfill'?50:2});discoveredCount=discovery.articles.length;run.articlesDiscovered=discoveredCount;run.lastSuccessfulPage=discovery.lastSuccessfulPage;await putPortalValue('sourceCheckpoints',sourceId,{sourceId,section:'all',currentPage:discovery.lastSuccessfulPage,lastSuccessfulPage:discovery.lastSuccessfulPage,oldestDateReached:discovery.oldestDateReached?.toISOString(),checkpointTime:new Date().toISOString()});
      const sources=await listSources();const sourceRegion=(id:string)=>sources.find((s:any)=>s.id===id)?.region||'undefined';
      for(const hint of discovery.articles){if(await isArticleUrlExistingDirectly(hint.url))continue;try{await new Promise(r=>setTimeout(r,500));const html=await adapter.fetchArticle(hint.url);const parsed=await adapter.parseArticle(html,hint.url);if(!parsed){run.errorsCount++;continue;}const articleId=`ART-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;const newArticle:ArticleRecord={article_id:articleId,source_id:parsed.sourceId,source_url:parsed.sourceUrl,canonical_url:parsed.canonicalUrl,original_language:parsed.originalLanguage,original_title:parsed.originalTitle,original_subtitle:parsed.originalSubtitle,original_body:parsed.originalBody,author:parsed.author,published_at:parsed.publishedAt,collected_at:new Date().toISOString(),source_section:parsed.sourceSection,topic:'General',topic_sub:'General',region:parsed.region||sourceRegion(parsed.sourceId),lead_image_url:parsed.leadImageUrl,image_urls:parsed.imageUrls,content_blocks:parsed.contentBlocks,processing_status:'RAW',normalized_title:normalizeTitle(parsed.originalTitle),content_hash:contentHash(parsed.originalBody),created_at:new Date().toISOString()};await insertArticleDirectly(newArticle);importedCount++;run.articlesImported=importedCount;}catch(itemErr:any){run.errorsCount++;run.lastError=itemErr.message||'Error fetching article';}await putPortalValue('sourceRuns',runId,run);}
      run.status='completed';run.completedAt=new Date().toISOString();await putPortalValue('sourceRuns',runId,run);return{success:true,discovered:discoveredCount,imported:importedCount,message:`Successfully completed crawl for ${adapter.getMetadata().name}`};
    }catch(err:any){run.status='failed';run.completedAt=new Date().toISOString();run.lastError=err.message||'Crawl failed';await putPortalValue('sourceRuns',runId,run);return{success:false,discovered:discoveredCount,imported:importedCount,message:`Crawl error: ${err.message}`};}finally{this.activeRuns.delete(sourceId);}
  }
  isSourceRunning(sourceId:string){return!!this.activeRuns.get(sourceId);}
  async runCrawlAll(mode:'backfill'|'incremental',daysToBackfill=365){const allMeta=sourceRegistry.getAllMetadata();const records=await listSources();const enabledSources=allMeta.filter(meta=>{const rec:any=records.find((r:any)=>r.id===meta.id);return rec?rec.enabled!==false:meta.enabled;});(async()=>{for(const src of enabledSources){try{await this.runCrawl(src.id,mode,daysToBackfill);await new Promise(r=>setTimeout(r,1000));}catch(e){console.error(`Error in runCrawlAll for source ${src.id}:`,e);}}})();return{totalStarted:enabledSources.length,message:`Started ${mode} crawl for ${enabledSources.length} sources`};}
}
export const crawlerService=new CrawlerService();
