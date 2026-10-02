import { Router } from 'express';
import { db } from '../db/database.js';
import { eventService } from '../services/events.js';
import { eventInboxService } from '../services/eventInbox.js';
import { excelService } from '../services/excel.js';

const router = Router();

// GET /api/events - List events with facet & calendar filters
router.get('/', (req, res) => {
  const {
    year,
    month,
    regions,
    categories,
    aiStatus,
    sources,
    languages,
    tags,
    excludeCategories,
    excludeRegions,
    excludeSources,
    excludeLanguages,
    excludeTags,
    city,
    eventType,
    venue,
    organizer,
    status,
    search,
    lang = 'original'
  } = req.query;

  let allEvents = Object.values(db.core.events);

  // Exclude Filters
  if (excludeCategories) {
    const exList = (excludeCategories as string).split(',').filter(Boolean);
    allEvents = allEvents.filter(e => {
      const evCat = (e.category || '').toLowerCase();
      return !exList.some(c => {
        const cl = c.toLowerCase();
        if (cl.includes('educat') && (evCat.includes('educat') || evCat.includes('school') || evCat.includes('acad'))) return true;
        if (cl.includes('tech') && (evCat.includes('tech') || evCat.includes('ai') || evCat.includes('conference'))) return true;
        if (cl.includes('econ') && (evCat.includes('econ') || evCat.includes('business') || evCat.includes('investment'))) return true;
        if (cl.includes('sport') && evCat.includes('sport')) return true;
        if (cl.includes('politic') && (evCat.includes('politic') || evCat.includes('gov'))) return true;
        if (cl.includes('volunt') && (evCat.includes('volunt') || evCat.includes('communit'))) return true;
        if (cl.includes('nature') && (evCat.includes('nature') || evCat.includes('festival') || evCat.includes('cultur'))) return true;
        return e.category === c || evCat.includes(cl);
      });
    });
  }

  if (excludeRegions) {
    const exRegList = (excludeRegions as string).split(',').map(r => r.toLowerCase()).filter(Boolean);
    allEvents = allEvents.filter(e => {
      const country = (e.country || '').toLowerCase();
      const cityLower = (e.city || '').toLowerCase();
      return !exRegList.some(r => country.includes(r) || cityLower.includes(r));
    });
  }

  if (excludeTags) {
    const exTagList = (excludeTags as string).split(',').filter(Boolean);
    allEvents = allEvents.filter(e => {
      const evtTags = [
        ...(db.en.eventTags[e.event_id] || []),
        ...(db.ko.eventTags[e.event_id] || []),
        ...(db.rw.eventTags[e.event_id] || [])
      ];
      return !exTagList.some(t => evtTags.includes(t));
    });
  }

  // 1. Month / Year filter (for Calendar Month view)
  if (year && month) {
    const yStr = String(year);
    const mStr = String(month).padStart(2, '0');
    const monthPrefix = `${yStr}-${mStr}`;

    // Event overlaps this month if start_date <= monthEnd and end_date >= monthStart
    allEvents = allEvents.filter(e => {
      const eStart = e.start_date.slice(0, 7);
      const eEnd = (e.end_date || e.start_date).slice(0, 7);
      return monthPrefix >= eStart && monthPrefix <= eEnd;
    });
  }

  // 2. Regions filter (rwanda, korea, africa, world)
  if (regions) {
    const regList = (regions as string).split(',').map(r => r.toLowerCase()).filter(Boolean);
    if (regList.length > 0) {
      allEvents = allEvents.filter(e => {
        const country = (e.country || '').toLowerCase();
        const cityLower = (e.city || '').toLowerCase();
        const artIds = db.core.eventArticles[e.event_id] || [];
        const artRegions = artIds.map(aid => {
          const art = db.core.articles[aid];
          if (!art) return '';
          return ((art as any).region || db.core.sources[art.source_id]?.region || '').toLowerCase();
        });

        return regList.some(r =>
          country.includes(r) ||
          cityLower.includes(r) ||
          (r === 'rwanda' && (country.includes('rwanda') || cityLower.includes('kigali'))) ||
          (r === 'korea' && (country.includes('korea') || cityLower.includes('seoul'))) ||
          artRegions.includes(r)
        );
      });
    }
  }

  // 3. Categories (Main Topics)
  if (categories) {
    const catList = (categories as string).split(',').filter(Boolean);
    if (catList.length > 0) {
      allEvents = allEvents.filter(e => {
        const evCat = (e.category || '').toLowerCase();
        return catList.some(c => {
          const cl = c.toLowerCase();
          if (cl.includes('educat') && (evCat.includes('educat') || evCat.includes('school') || evCat.includes('acad'))) return true;
          if (cl.includes('tech') && (evCat.includes('tech') || evCat.includes('ai') || evCat.includes('conference'))) return true;
          if (cl.includes('econ') && (evCat.includes('econ') || evCat.includes('business') || evCat.includes('investment'))) return true;
          if (cl.includes('sport') && evCat.includes('sport')) return true;
          if (cl.includes('politic') && (evCat.includes('politic') || evCat.includes('gov'))) return true;
          if (cl.includes('volunt') && (evCat.includes('volunt') || evCat.includes('communit'))) return true;
          if (cl.includes('nature') && (evCat.includes('nature') || evCat.includes('festival') || evCat.includes('cultur'))) return true;
          return e.category === c || evCat.includes(cl);
        });
      });
    }
  }

  // 4. AI Processed filter
  if (aiStatus) {
    const stList = (aiStatus as string).split(',').map(s => s.toLowerCase()).filter(Boolean);
    if (stList.length > 0) {
      allEvents = allEvents.filter(e => {
        const hasKo = !!db.ko.eventText[e.event_id];
        const hasEn = !!db.en.eventText[e.event_id];
        const isDone = hasKo || hasEn;
        if (stList.includes('done') && isDone) return true;
        if (stList.includes('waiting') && !isDone) return true;
        return false;
      });
    }
  }

  // Row 2: Sources (via related articles)
  if (sources) {
    const srcList = (sources as string).split(',').filter(Boolean);
    if (srcList.length > 0) {
      allEvents = allEvents.filter(e => {
        const artIds = db.core.eventArticles[e.event_id] || [];
        return artIds.some(aid => {
          const art = db.core.articles[aid];
          return art && srcList.includes(art.source_id);
        });
      });
    }
  }

  // Row 4: Tags
  if (tags) {
    const tagList = (tags as string).split(',').filter(Boolean);
    if (tagList.length > 0) {
      allEvents = allEvents.filter(e => {
        const evtTags = [
          ...(db.en.eventTags[e.event_id] || []),
          ...(db.ko.eventTags[e.event_id] || []),
          ...(db.rw.eventTags[e.event_id] || [])
        ];
        return tagList.some(t => evtTags.includes(t));
      });
    }
  }

  // Secondary Event Filters
  if (city) {
    allEvents = allEvents.filter(e => e.city?.toLowerCase() === (city as string).toLowerCase());
  }
  if (eventType) {
    allEvents = allEvents.filter(e => e.category === eventType || e.event_type === eventType);
  }
  if (venue) {
    allEvents = allEvents.filter(e => e.venue?.toLowerCase().includes((venue as string).toLowerCase()));
  }
  if (organizer) {
    allEvents = allEvents.filter(e => e.organizer?.toLowerCase().includes((organizer as string).toLowerCase()));
  }
  if (status) {
    allEvents = allEvents.filter(e => e.status === status);
  }

  // Search
  if (search) {
    const q = (search as string).toLowerCase().trim();
    allEvents = allEvents.filter(e =>
      e.canonical_name.toLowerCase().includes(q) ||
      (e.subtitle && e.subtitle.toLowerCase().includes(q)) ||
      (e.venue && e.venue.toLowerCase().includes(q)) ||
      (e.organizer && e.organizer.toLowerCase().includes(q))
    );
  }

  // Order by start_date, then start_time
  allEvents.sort((a, b) => {
    const dateCmp = a.start_date.localeCompare(b.start_date);
    if (dateCmp !== 0) return dateCmp;
    if (a.all_day && !b.all_day) return -1;
    if (!a.all_day && b.all_day) return 1;
    return (a.start_time || '00:00').localeCompare(b.start_time || '00:00');
  });

  // Attach localized names and related article count
  const results = allEvents.map(evt => {
    const koText = db.ko.eventText[evt.event_id];
    const enText = db.en.eventText[evt.event_id];
    const rwText = db.rw.eventText[evt.event_id];

    const event_name_ko = koText?.canonical_name || (evt as any).event_name_ko || '';
    const event_subtitle_ko = koText?.subtitle || (evt as any).event_subtitle_ko || '';
    const event_name_en = enText?.canonical_name || (evt as any).event_name_en || '';
    const event_subtitle_en = enText?.subtitle || (evt as any).event_subtitle_en || '';
    const event_name_rw = rwText?.canonical_name || (evt as any).event_name_rw || '';
    const event_subtitle_rw = rwText?.subtitle || (evt as any).event_subtitle_rw || '';

    let displayName = evt.canonical_name;
    let displaySubtitle = evt.subtitle;

    if (lang === 'ko') {
      displayName = event_name_ko || displayName;
      displaySubtitle = event_subtitle_ko || displaySubtitle;
    } else if (lang === 'en') {
      displayName = event_name_en || displayName;
      displaySubtitle = event_subtitle_en || displaySubtitle;
    } else if (lang === 'rw') {
      displayName = event_name_rw || displayName;
      displaySubtitle = event_subtitle_rw || displaySubtitle;
    }

    const relatedArticleIds = db.core.eventArticles[evt.event_id] || [];
    const relatedArticles = relatedArticleIds.map(id => {
      const art = db.core.articles[id];
      if (!art) return null;

      let artTitle = art.original_title;
      if (lang === 'ko' && db.ko.articles[art.article_id]?.title) {
        artTitle = db.ko.articles[art.article_id].title;
      } else if (lang === 'en' && db.en.articles[art.article_id]?.title) {
        artTitle = db.en.articles[art.article_id].title;
      }

      return {
        article_id: art.article_id,
        original_title: artTitle,
        source_id: art.source_id,
        published_at: art.published_at,
        lead_image_url: art.lead_image_url || art.image_urls?.[0] || null,
        image_urls: art.image_urls || []
      };
    }).filter(Boolean);

    const tagConceptIds = db.en.eventTags[evt.event_id] || db.ko.eventTags[evt.event_id] || [];
    const tagsInfo = tagConceptIds.map(tcId => {
      const concept = db.core.tagConcepts[tcId];
      return {
        id: tcId,
        key: concept?.key,
        name: db.en.tags[tcId]?.name || db.ko.tags[tcId]?.name || concept?.key
      };
    });

    return {
      ...evt,
      event_name_ko,
      event_subtitle_ko,
      event_name_en,
      event_subtitle_en,
      event_name_rw,
      event_subtitle_rw,
      displayName,
      displaySubtitle,
      relatedArticles,
      tags: tagsInfo
    };
  });

  res.json({
    total: results.length,
    events: results
  });
});

// DELETE /api/events/:id - Delete an event
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const success = eventService.deleteEvent(id);
  if (!success) {
    return res.status(404).json({ error: 'Event not found' });
  }
  res.json({ success: true, message: `Event ${id} deleted.` });
});

// POST /api/events/ai-deduplicate - Run AI deduplication and co-reporting article linking
router.post('/ai-deduplicate', (req, res) => {
  try {
    const result = eventService.deduplicateAndLinkEvents();
    res.json({
      success: true,
      mergedCount: result.mergedCount,
      linkedArticlesCount: result.linkedArticlesCount,
      message: `AI Event Review Complete: Merged ${result.mergedCount} duplicate events and linked ${result.linkedArticlesCount} co-reporting articles.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI Deduplication failed' });
  }
});

// GET /api/events/candidates - Pending duplicate candidate matches for Review UI
router.get('/candidates', (req, res) => {
  const pending = Object.values(db.core.eventMatchCandidates).filter(c => c.status === 'PENDING');
  const enriched = pending.map(cand => {
    const sourceEvent = db.core.events[cand.source_event_id];
    const targetEvent = db.core.events[cand.target_event_id];
    return {
      ...cand,
      sourceEvent,
      targetEvent
    };
  }).filter(c => c.sourceEvent && c.targetEvent);

  res.json({ candidates: enriched });
});

// POST /api/events - Create new event manually (with deduplication check)
router.post('/', (req, res) => {
  const eventData = req.body;
  if (!eventData.canonical_name || !eventData.start_date) {
    return res.status(400).json({ error: 'Event name and start date are required' });
  }

  const result = eventService.createOrMergeEvent({
    ...eventData,
    created_manually: true
  });

  res.json(result);
});

// POST /api/events/merge - Merge two events manually
router.post('/merge', (req, res) => {
  const { sourceEventId, targetCanonicalId, candidateId } = req.body;
  if (!sourceEventId || !targetCanonicalId) {
    return res.status(400).json({ error: 'sourceEventId and targetCanonicalId are required' });
  }

  const success = eventService.mergeEvents(sourceEventId, targetCanonicalId, candidateId);
  res.json({ success });
});

// POST /api/events/reject-candidate - Reject candidate
router.post('/reject-candidate', (req, res) => {
  const { candidateId } = req.body;
  if (!candidateId) return res.status(400).json({ error: 'candidateId is required' });
  const success = eventService.rejectCandidate(candidateId);
  res.json({ success });
});

// GET /api/events/inbox - Event URL Inbox
router.get('/inbox', (req, res) => {
  const urls = Object.values(db.core.eventUrls).sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  res.json({ urls });
});

// POST /api/events/inbox/add - Add URLs to Inbox
router.post('/inbox/add', (req, res) => {
  const { urls } = req.body;
  if (!urls || typeof urls !== 'string') {
    return res.status(400).json({ error: 'urls string is required' });
  }
  const result = eventInboxService.addUrls(urls);
  res.json(result);
});

// POST /api/events/inbox/fetch - Fetch readable text for queued URLs
router.post('/inbox/fetch', async (req, res) => {
  const result = await eventInboxService.fetchAllQueued();
  res.json(result);
});

// GET /api/events/export - Export events to XLSX with multilingual columns
router.get('/export', (req, res) => {
  const { ids } = req.query;
  const eventIds = ids ? (ids as string).split(',').filter(Boolean) : undefined;
  const { buffer, filename } = excelService.generateEventsExportWorkbook(eventIds);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

export default router;
