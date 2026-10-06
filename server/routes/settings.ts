import { Router } from 'express';
import { getSupabaseClient } from '../db/supabase.js';

const router = Router();
const defaults = () => ({defaultLanguage:'original',portalTheme:'BLACK',defaultNewsViewMode:'PHOTO_TEXT',defaultEventListViewMode:'CARD',articleBatchTarget:20,articleBatchMax:25,articleCharLimit:300000,eventBatchTarget:20,eventBatchMax:30,eventCharLimit:250000,crawlerIntervalMinutes:60,eventAutoMergeThreshold:.95,eventReviewThreshold:.70,defaultTimezone:'Africa/Kigali'});
const client = () => { const c=getSupabaseClient(); if(!c) throw new Error('Supabase is not configured'); return c; };

router.get('/', async (_req,res)=>{
  try { const {data,error}=await client().from('portal_kv').select('value').eq('collection','settings').eq('key','global').maybeSingle(); if(error) throw error; res.json({settings:{...defaults(),...(data?.value||{})}}); }
  catch(e){res.status(503).json({error:e instanceof Error?e.message:'Supabase unavailable'});}
});
router.post('/', async (req,res)=>{
  try { const updates=req.body; if(!updates||typeof updates!=='object') return res.status(400).json({error:'Invalid settings body'}); const c=client(); const {data:old,error:readError}=await c.from('portal_kv').select('value').eq('collection','settings').eq('key','global').maybeSingle(); if(readError) throw readError; const settings={...defaults(),...(old?.value||{}),...updates}; const {error}=await c.from('portal_kv').upsert({collection:'settings',key:'global',value:settings,updated_at:new Date().toISOString()},{onConflict:'collection,key'}); if(error) throw error; res.json({success:true,settings}); }
  catch(e){res.status(503).json({error:e instanceof Error?e.message:'Supabase unavailable'});}
});
router.get('/saved-views', async (_req,res)=>{
  try { const {data,error}=await client().from('portal_kv').select('value').eq('collection','savedEventViews'); if(error) throw error; res.json({views:(data||[]).map(r=>r.value)}); }
  catch(e){res.status(503).json({error:e instanceof Error?e.message:'Supabase unavailable'});}
});
router.post('/saved-views', async (req,res)=>{
  try { const {name,filterState}=req.body; if(!name) return res.status(400).json({error:'View name is required'}); const id=`VIEW-${Date.now().toString(36)}`; const view={id,name,filter_state:filterState||{},created_at:new Date().toISOString()}; const {error}=await client().from('portal_kv').upsert({collection:'savedEventViews',key:id,value:view,updated_at:new Date().toISOString()},{onConflict:'collection,key'}); if(error) throw error; res.json({success:true,view}); }
  catch(e){res.status(503).json({error:e instanceof Error?e.message:'Supabase unavailable'});}
});
router.delete('/saved-views/:id', async (req,res)=>{
  try { const {error}=await client().from('portal_kv').delete().eq('collection','savedEventViews').eq('key',req.params.id); if(error) throw error; res.json({success:true}); }
  catch(e){res.status(503).json({error:e instanceof Error?e.message:'Supabase unavailable'});}
});
export default router;
