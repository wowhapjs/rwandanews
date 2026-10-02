import { Router } from 'express';
import { db } from '../db/database.js';

const router = Router();

// GET /api/tags - List tag concepts with usage counts and localized names
router.get('/', (req, res) => {
  const { search, type } = req.query;
  const q = search ? (search as string).toLowerCase().trim() : '';

  // Collect all known concept IDs and raw tag keys across all articles and events
  const allTagIds = new Set<string>(Object.keys(db.core.tagConcepts || {}));

  const collectTagIds = (mapping: Record<string, string[]>) => {
    for (const tags of Object.values(mapping || {})) {
      if (Array.isArray(tags)) {
        for (const t of tags) {
          if (t) allTagIds.add(t);
        }
      }
    }
  };

  collectTagIds(db.en.articleTags);
  collectTagIds(db.ko.articleTags);
  collectTagIds(db.rw.articleTags);
  collectTagIds(db.en.eventTags);
  collectTagIds(db.ko.eventTags);
  collectTagIds(db.rw.eventTags);

  const enriched = Array.from(allTagIds).map(id => {
    const concept = db.core.tagConcepts[id];
    const key = concept?.key || id;
    const typeVal = concept?.type || 'topic';

    const nameEn = db.en.tags[id]?.name || concept?.key || id;
    const nameKo = db.ko.tags[id]?.name || nameEn;
    const nameRw = db.rw.tags[id]?.name || nameEn;

    // Articles with this tag (unique article count across languages)
    const matchingArtIds = new Set<string>();
    for (const [artId, tags] of Object.entries(db.en.articleTags || {})) {
      if (tags.includes(id) || tags.includes(key)) matchingArtIds.add(artId);
    }
    for (const [artId, tags] of Object.entries(db.ko.articleTags || {})) {
      if (tags.includes(id) || tags.includes(key)) matchingArtIds.add(artId);
    }
    for (const [artId, tags] of Object.entries(db.rw.articleTags || {})) {
      if (tags.includes(id) || tags.includes(key)) matchingArtIds.add(artId);
    }
    const articleCount = matchingArtIds.size;

    // Events with this tag (unique event count across languages)
    const matchingEventIds = new Set<string>();
    for (const [evId, tags] of Object.entries(db.en.eventTags || {})) {
      if (tags.includes(id) || tags.includes(key)) matchingEventIds.add(evId);
    }
    for (const [evId, tags] of Object.entries(db.ko.eventTags || {})) {
      if (tags.includes(id) || tags.includes(key)) matchingEventIds.add(evId);
    }
    for (const [evId, tags] of Object.entries(db.rw.eventTags || {})) {
      if (tags.includes(id) || tags.includes(key)) matchingEventIds.add(evId);
    }
    const eventCount = matchingEventIds.size;

    return {
      id,
      key,
      name: nameEn,
      type: typeVal,
      nameEn,
      nameKo,
      nameRw,
      articleCount,
      eventCount,
      totalCount: articleCount + eventCount
    };
  });

  let filtered = enriched;
  if (q) {
    filtered = enriched.filter(t =>
      t.key.toLowerCase().includes(q) ||
      t.nameEn.toLowerCase().includes(q) ||
      t.nameKo.toLowerCase().includes(q) ||
      t.nameRw.toLowerCase().includes(q)
    );
  }

  // Sort by popularity (totalCount desc)
  filtered.sort((a, b) => b.totalCount - a.totalCount);

  res.json({ tags: filtered });
});

export default router;
