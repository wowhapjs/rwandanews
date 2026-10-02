import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { seedInitialData } from './server/db/seed.js';
import { db } from './server/db/database.js';
import articlesRouter from './server/routes/articles.js';
import eventsRouter from './server/routes/events.js';
import sourcesRouter from './server/routes/sources.js';
import aiWorkspaceRouter from './server/routes/aiWorkspace.js';
import tagsRouter from './server/routes/tags.js';
import settingsRouter from './server/routes/settings.js';
import facebookSessionRouter from './server/routes/facebookSession.js';
import mcpRouter from './server/routes/mcp.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Global middlewares
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Seed initial data & check if Supabase is primary
  try {
    seedInitialData();
    await db.initDatabase();
  } catch (err) {
    console.error('Error during initial seed/init:', err);
  }

  // API Routes FIRST
  app.use('/api/articles', articlesRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/sources', sourcesRouter);
  app.use('/api/ai', aiWorkspaceRouter);
  app.use('/api/tags', tagsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/facebook-session', facebookSessionRouter);
  app.use('/api/mcp', mcpRouter);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'personal-news-intelligence-portal' });
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
