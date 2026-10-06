import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { isSupabaseReady } from './server/db/supabaseStore.js';
import articlesRouter from './server/routes/articles.js';
import eventsRouter from './server/routes/events.js';
import sourcesRouter from './server/routes/sources.js';
import aiWorkspaceRouter from './server/routes/aiWorkspace.js';
import tagsRouter from './server/routes/tags.js';
import settingsRouter from './server/routes/settings.js';
import facebookSessionRouter from './server/routes/facebookSession.js';
import mcpRouter from './server/routes/mcp.js';
import storyAgentRouter from './server/routes/storyAgent.js';
import reporterRouter from './server/routes/reporter.js';
import adminNewsroomRouter from './server/routes/adminNewsroom.js';
import accountRouter from './server/routes/account.js';
async function startServer(){if(!isSupabaseReady())throw new Error('Supabase configuration is required.');const app=express();const PORT=Number(process.env.PORT||3000);app.use(express.json({limit:'50mb'}));app.use(express.urlencoded({extended:true,limit:'50mb'}));app.get('/api/auth/config.js',(_req,res)=>{const url=process.env.SUPABASE_URL?.trim()||'';const key=process.env.SUPABASE_ANON_KEY?.trim()||process.env.SUPABASE_PUBLISHABLE_KEY?.trim()||'';res.type('application/javascript').send(`window.__JSRD_SUPABASE__=${JSON.stringify({url,key})};`)});app.use('/api/articles',articlesRouter);app.use('/api/events',eventsRouter);app.use('/api/sources',sourcesRouter);app.use('/api/ai',aiWorkspaceRouter);app.use('/api/story-agent',storyAgentRouter);app.use('/api/reporter',reporterRouter);app.use('/api/admin',adminNewsroomRouter);app.use('/api/account',accountRouter);app.use('/api/tags',tagsRouter);app.use('/api/settings',settingsRouter);app.use('/api/facebook-session',facebookSessionRouter);app.use('/api/mcp',mcpRouter);app.get('/api/health',(_req,res)=>res.json({status:'ok',service:'personal-news-intelligence-portal'}));if(process.env.NODE_ENV!=='production'){const vite=await createViteServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}else{const distPath=path.join(process.cwd(),'dist');app.use(express.static(distPath));app.get('*',(_req,res)=>res.sendFile(path.join(distPath,'index.html')));}app.listen(PORT,'0.0.0.0',()=>console.log(`Server running on http://0.0.0.0:${PORT}`));}
startServer().catch(err=>{console.error('Fatal server startup error:',err);process.exit(1);});
