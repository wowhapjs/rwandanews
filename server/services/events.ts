import { db } from '../db/database.js';
import { EventRecord } from '../db/types.js';
import { calculateSimilarity, stringSimilarityRatio } from '../sources/utils/hash.js';

export interface EventMatchEvaluation {
  action: 'AUTO_MERGE' | 'REVIEW' | 'NEW';
  matchedEventId?: string;
  similarityScore: number;
  reasons: string[];
}

export class EventService {
  /**
   * Matches an incoming event candidate against existing canonical events.
   */
  evaluateEventMatch(incoming: Partial<EventRecord>): EventMatchEvaluation {
    const autoThreshold = db.core.settings.eventAutoMergeThreshold || 0.95;
    const reviewThreshold = db.core.settings.eventReviewThreshold || 0.70;

    let bestMatchId: string | undefined;
    let highestScore = 0;
    let bestReasons: string[] = [];

    const existingEvents = Object.values(db.core.events);

    for (const existing of existingEvents) {
      const reasons: string[] = [];
      let totalWeight = 0;
      let weightedScore = 0;

      // 1. Name Similarity (Weight: 40)
      const nameRatio = stringSimilarityRatio(incoming.canonical_name || '', existing.canonical_name || '');
      const tokenSim = calculateSimilarity(incoming.canonical_name || '', existing.canonical_name || '');
      const nameScore = Math.max(nameRatio, tokenSim);
      weightedScore += nameScore * 40;
      totalWeight += 40;
      if (nameScore > 0.7) {
        reasons.push(`High name similarity (${Math.round(nameScore * 100)}%)`);
      }

      // 2. Start Date (Weight: 30)
      if (incoming.start_date && existing.start_date) {
        totalWeight += 30;
        if (incoming.start_date === existing.start_date) {
          weightedScore += 30;
          reasons.push(`Exact start date match: ${incoming.start_date}`);
        } else {
          // Check date proximity
          const diffDays = Math.abs(
            (new Date(incoming.start_date).getTime() - new Date(existing.start_date).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDays <= 1) {
            weightedScore += 15;
            reasons.push(`Close start date: ±1 day`);
          }
        }
      }

      // 3. Venue & City (Weight: 20)
      if (incoming.venue && existing.venue) {
        totalWeight += 15;
        const venueScore = stringSimilarityRatio(incoming.venue, existing.venue);
        weightedScore += venueScore * 15;
        if (venueScore > 0.7) reasons.push(`Similar venue: ${existing.venue}`);
      }
      if (incoming.city && existing.city) {
        totalWeight += 5;
        if (incoming.city.toLowerCase() === existing.city.toLowerCase()) {
          weightedScore += 5;
          reasons.push(`Same city: ${existing.city}`);
        }
      }

      // 4. Organizer (Weight: 10)
      if (incoming.organizer && existing.organizer) {
        totalWeight += 10;
        const orgScore = stringSimilarityRatio(incoming.organizer, existing.organizer);
        weightedScore += orgScore * 10;
        if (orgScore > 0.7) reasons.push(`Similar organizer: ${existing.organizer}`);
      }

      const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
      if (finalScore > highestScore) {
        highestScore = finalScore;
        bestMatchId = existing.event_id;
        bestReasons = reasons;
      }
    }

    if (highestScore >= autoThreshold && bestMatchId) {
      return {
        action: 'AUTO_MERGE',
        matchedEventId: bestMatchId,
        similarityScore: highestScore,
        reasons: bestReasons
      };
    } else if (highestScore >= reviewThreshold && bestMatchId) {
      return {
        action: 'REVIEW',
        matchedEventId: bestMatchId,
        similarityScore: highestScore,
        reasons: bestReasons
      };
    }

    return {
      action: 'NEW',
      similarityScore: highestScore,
      reasons: bestReasons
    };
  }

  /**
   * Ingests a new event candidate with strict deduplication check.
   */
  createOrMergeEvent(eventData: Partial<EventRecord>): { event: EventRecord; status: 'created' | 'merged' | 'candidate_queued' } {
    const evaluation = this.evaluateEventMatch(eventData);

    if (evaluation.action === 'AUTO_MERGE' && evaluation.matchedEventId) {
      const canonical = db.core.events[evaluation.matchedEventId];
      // Merge properties without overwriting existing verified data
      if (!canonical.registration_url && eventData.registration_url) canonical.registration_url = eventData.registration_url;
      if (!canonical.official_url && eventData.official_url) canonical.official_url = eventData.official_url;
      if (!canonical.price_text && eventData.price_text) canonical.price_text = eventData.price_text;
      if (!canonical.subtitle && eventData.subtitle) canonical.subtitle = eventData.subtitle;

      if (eventData.source_article_id) {
        if (!db.core.eventArticles[canonical.event_id]) db.core.eventArticles[canonical.event_id] = [];
        if (!db.core.eventArticles[canonical.event_id].includes(eventData.source_article_id)) {
          db.core.eventArticles[canonical.event_id].push(eventData.source_article_id);
        }
      }

      db.save();
      return { event: canonical, status: 'merged' };
    }

    const eventId = `EVT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const newEvent: EventRecord = {
      event_id: eventId,
      canonical_name: eventData.canonical_name || 'Untitled Event',
      original_name: eventData.original_name || eventData.canonical_name || 'Untitled Event',
      subtitle: eventData.subtitle,
      description: eventData.description || eventData.subtitle,
      start_date: eventData.start_date || new Date().toISOString().slice(0, 10),
      start_time: eventData.start_time,
      end_date: eventData.end_date || eventData.start_date || new Date().toISOString().slice(0, 10),
      end_time: eventData.end_time,
      timezone: eventData.timezone || db.core.settings.defaultTimezone || 'Africa/Kigali',
      all_day: eventData.all_day ?? !eventData.start_time,
      venue: eventData.venue,
      city: eventData.city || 'Kigali',
      country: eventData.country || 'Rwanda',
      organizer: eventData.organizer,
      category: eventData.category || 'Other',
      official_url: eventData.official_url,
      registration_url: eventData.registration_url,
      price_text: eventData.price_text,
      status: eventData.status || 'confirmed',
      confidence: eventData.confidence ?? 0.9,
      created_manually: eventData.created_manually ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    db.core.events[eventId] = newEvent;

    if (eventData.source_article_id) {
      db.core.eventArticles[eventId] = [eventData.source_article_id];
    }

    // Populate localized copies
    for (const lang of ['en', 'ko', 'rw'] as const) {
      const schema = db.getLocalizedSchema(lang);
      if (schema) {
        schema.eventText[eventId] = {
          event_id: eventId,
          canonical_name: lang === 'ko' ? `[행사] ${newEvent.canonical_name}` : newEvent.canonical_name,
          subtitle: newEvent.subtitle,
          description: newEvent.description,
          venue: newEvent.venue,
          city: newEvent.city
        };
      }
    }

    if (evaluation.action === 'REVIEW' && evaluation.matchedEventId) {
      // Create duplicate review candidate
      const candId = `CAND-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      db.core.eventMatchCandidates[candId] = {
        id: candId,
        source_event_id: eventId,
        target_event_id: evaluation.matchedEventId,
        similarity_score: evaluation.similarityScore,
        status: 'PENDING',
        match_reasons: evaluation.reasons,
        created_at: new Date().toISOString()
      };
      db.save();
      return { event: newEvent, status: 'candidate_queued' };
    }

    db.save();
    return { event: newEvent, status: 'created' };
  }

  /**
   * Merges two events manually from the Duplicate Review UI.
   */
  mergeEvents(sourceEventId: string, targetCanonicalId: string, candidateId?: string): boolean {
    const sourceEvt = db.core.events[sourceEventId];
    const targetEvt = db.core.events[targetCanonicalId];
    if (!sourceEvt || !targetEvt) return false;

    // Record merge history for undo
    const historyId = `HIST-${Date.now().toString(36)}`;
    db.core.eventMergeHistory[historyId] = {
      id: historyId,
      canonicalEventId: targetCanonicalId,
      mergedEvent: { ...sourceEvt },
      timestamp: new Date().toISOString()
    };

    // Merge articles
    const sourceArticles = db.core.eventArticles[sourceEventId] || [];
    if (!db.core.eventArticles[targetCanonicalId]) db.core.eventArticles[targetCanonicalId] = [];
    for (const artId of sourceArticles) {
      if (!db.core.eventArticles[targetCanonicalId].includes(artId)) {
        db.core.eventArticles[targetCanonicalId].push(artId);
      }
    }

    // Merge URLs
    if (!targetEvt.official_url && sourceEvt.official_url) targetEvt.official_url = sourceEvt.official_url;
    if (!targetEvt.registration_url && sourceEvt.registration_url) targetEvt.registration_url = sourceEvt.registration_url;
    if (!targetEvt.price_text && sourceEvt.price_text) targetEvt.price_text = sourceEvt.price_text;

    // Delete source event from active events
    delete db.core.events[sourceEventId];
    delete db.core.eventArticles[sourceEventId];

    if (candidateId && db.core.eventMatchCandidates[candidateId]) {
      db.core.eventMatchCandidates[candidateId].status = 'MERGED';
    }

    db.save();
    return true;
  }

  rejectCandidate(candidateId: string): boolean {
    if (db.core.eventMatchCandidates[candidateId]) {
      db.core.eventMatchCandidates[candidateId].status = 'REJECTED';
      db.save();
      return true;
    }
    return false;
  }

  /**
   * Delete an event record completely
   */
  deleteEvent(eventId: string): boolean {
    if (!db.core.events[eventId]) return false;
    delete db.core.events[eventId];
    delete db.core.eventArticles[eventId];
    if (db.ko.eventText) delete db.ko.eventText[eventId];
    if (db.en.eventText) delete db.en.eventText[eventId];
    if (db.rw.eventText) delete db.rw.eventText[eventId];
    if (db.ko.eventTags) delete db.ko.eventTags[eventId];
    if (db.en.eventTags) delete db.en.eventTags[eventId];
    if (db.rw.eventTags) delete db.rw.eventTags[eventId];

    for (const [candId, cand] of Object.entries(db.core.eventMatchCandidates)) {
      if (cand.source_event_id === eventId || cand.target_event_id === eventId) {
        delete db.core.eventMatchCandidates[candId];
      }
    }
    db.save();
    return true;
  }

  /**
   * AI-driven event deduplication and comprehensive article linking.
   * Merges duplicate events reporting on the same real-world event,
   * and links all related articles across the database.
   */
  deduplicateAndLinkEvents(): { mergedCount: number; linkedArticlesCount: number } {
    let mergedCount = 0;
    let linkedArticlesCount = 0;

    const allEvents = Object.values(db.core.events);

    // 1. Cross-compare all pairs of events to find and merge duplicates
    for (let i = 0; i < allEvents.length; i++) {
      const e1 = allEvents[i];
      if (!db.core.events[e1.event_id]) continue; // already merged

      for (let j = i + 1; j < allEvents.length; j++) {
        const e2 = allEvents[j];
        if (!db.core.events[e2.event_id]) continue; // already merged

        // Compute title similarity and date proximity
        const nameRatio = stringSimilarityRatio(e1.canonical_name.toLowerCase(), e2.canonical_name.toLowerCase());
        const tokenSim = calculateSimilarity(e1.canonical_name.toLowerCase(), e2.canonical_name.toLowerCase());
        const maxSim = Math.max(nameRatio, tokenSim);

        let dateMatches = false;
        if (e1.start_date && e2.start_date) {
          const diffDays = Math.abs(
            (new Date(e1.start_date).getTime() - new Date(e2.start_date).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDays <= 2) dateMatches = true;
        }

        // Check if one name is substring of another or tokens overlap heavily
        const words1 = e1.canonical_name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const words2 = e2.canonical_name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const commonWords = words1.filter(w => words2.includes(w));
        const hasSubstantialKeywordOverlap = commonWords.length >= 2;

        if ((maxSim >= 0.65 && dateMatches) || (hasSubstantialKeywordOverlap && dateMatches) || maxSim >= 0.85) {
          // Merge e2 into e1
          this.mergeEvents(e2.event_id, e1.event_id);
          mergedCount++;
        }
      }
    }

    // 2. Scan all articles to connect articles that mention the events
    const remainingEvents = Object.values(db.core.events);
    const allArticles = Object.values(db.core.articles);

    for (const evt of remainingEvents) {
      if (!db.core.eventArticles[evt.event_id]) {
        db.core.eventArticles[evt.event_id] = [];
      }

      const canonicalLower = evt.canonical_name.toLowerCase().trim();
      const keywords = canonicalLower.split(/\s+/).filter(w => w.length >= 4 && !['annual', 'summit', 'conference', 'meeting', 'forum', 'rwanda', 'kigali', '2026', 'expo'].includes(w));

      for (const art of allArticles) {
        if (db.core.eventArticles[evt.event_id].includes(art.article_id)) continue;

        const titleLower = art.original_title.toLowerCase();
        const bodyLower = (art.original_body || '').slice(0, 2000).toLowerCase();

        let shouldLink = false;
        if (titleLower.includes(canonicalLower) || bodyLower.includes(canonicalLower)) {
          shouldLink = true;
        } else if (keywords.length >= 2) {
          const matched = keywords.filter(k => titleLower.includes(k) || bodyLower.includes(k));
          if (matched.length >= 2) {
            // Check date proximity
            const artDate = new Date(art.published_at).getTime();
            const evtDate = new Date(evt.start_date).getTime();
            const diffDays = Math.abs(artDate - evtDate) / (1000 * 60 * 60 * 24);
            if (diffDays <= 45) {
              shouldLink = true;
            }
          }
        }

        if (shouldLink) {
          db.core.eventArticles[evt.event_id].push(art.article_id);
          linkedArticlesCount++;
        }
      }
    }

    db.save();
    return { mergedCount, linkedArticlesCount };
  }
}

export const eventService = new EventService();
