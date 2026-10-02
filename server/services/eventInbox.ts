import * as cheerio from 'cheerio';
import { db } from '../db/database.js';
import { normalizeUrl } from '../sources/utils/url.js';
import { decodeHtmlEntities, normalizeWhitespace } from '../sources/utils/html.js';

export class EventInboxService {
  /**
   * Adds URLs to the Inbox (single or multi-line paste)
   */
  addUrls(rawInput: string): { added: number; existing: number; invalid: number } {
    const lines = rawInput.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
    let added = 0;
    let existing = 0;
    let invalid = 0;

    for (const line of lines) {
      if (!line.startsWith('http://') && !line.startsWith('https://')) {
        invalid++;
        continue;
      }

      const normalized = normalizeUrl(line);
      if (!normalized) {
        invalid++;
        continue;
      }

      const alreadyExists = Object.values(db.core.eventUrls).some(u => u.url === normalized);
      if (alreadyExists) {
        existing++;
        continue;
      }

      const urlId = `EURL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      db.core.eventUrls[urlId] = {
        id: urlId,
        url: normalized,
        status: 'QUEUED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      added++;
    }

    if (added > 0) {
      db.save();
    }

    return { added, existing, invalid };
  }

  /**
   * Fetches HTML and extracts readable text for a queued URL
   */
  async fetchUrlText(urlId: string): Promise<boolean> {
    const item = db.core.eventUrls[urlId];
    if (!item) return false;

    item.status = 'FETCHING';
    item.updated_at = new Date().toISOString();
    db.save();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(item.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (Event Intelligence Bot)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      $('script, style, nav, footer, header, noscript, svg, iframe').remove();

      const title = $('h1, title, meta[property="og:title"]').first().text().trim() || 'Event Page';
      const text = normalizeWhitespace($('body').text());

      item.fetched_title = decodeHtmlEntities(title);
      item.fetched_text = decodeHtmlEntities(text).slice(0, 30000);
      item.status = 'READY';
      item.updated_at = new Date().toISOString();
      db.save();
      return true;
    } catch (err: any) {
      item.status = 'ERROR';
      item.error_message = err.message || 'Failed to fetch URL';
      item.updated_at = new Date().toISOString();
      db.save();
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async fetchAllQueued(): Promise<{ processed: number; successCount: number }> {
    const queued = Object.values(db.core.eventUrls).filter(u => u.status === 'QUEUED');
    let successCount = 0;
    for (const q of queued) {
      const ok = await this.fetchUrlText(q.id);
      if (ok) successCount++;
      await new Promise(r => setTimeout(r, 400));
    }
    return { processed: queued.length, successCount };
  }
}

export const eventInboxService = new EventInboxService();
