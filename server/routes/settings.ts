import { Router } from 'express';
import { db } from '../db/database.js';

const router = Router();

// GET /api/settings
router.get('/', (req, res) => {
  res.json({ settings: db.core.settings });
});

// POST /api/settings - Update settings
router.post('/', (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Invalid settings body' });
  }

  db.core.settings = {
    ...db.core.settings,
    ...updates
  };
  db.save();
  res.json({ success: true, settings: db.core.settings });
});

// Saved Views endpoints
router.get('/saved-views', (req, res) => {
  const views = Object.values(db.core.savedEventViews);
  res.json({ views });
});

router.post('/saved-views', (req, res) => {
  const { name, filterState } = req.body;
  if (!name) return res.status(400).json({ error: 'View name is required' });

  const id = `VIEW-${Date.now().toString(36)}`;
  db.core.savedEventViews[id] = {
    id,
    name,
    filter_state: filterState || {},
    created_at: new Date().toISOString()
  };
  db.save();
  res.json({ success: true, view: db.core.savedEventViews[id] });
});

router.delete('/saved-views/:id', (req, res) => {
  delete db.core.savedEventViews[req.params.id];
  db.save();
  res.json({ success: true });
});

export default router;
