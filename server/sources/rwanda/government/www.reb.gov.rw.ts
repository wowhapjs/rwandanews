import * as cheerio from 'cheerio';
import { BaseSourceAdapter } from '../../base.js';
import {
  DiscoveredArticleHint,
  DiscoveryOptions,
  DiscoveryResult,
  ParsedArticle,
  SourceMetadata
} from '../../types.js';
import { normalizeUrl, extractCanonicalUrl } from '../../utils/url.js';
import { parseDateSafely, normalizeWhitespace } from '../../utils/html.js';
import { extractBestImageUrl } from '../../utils/images.js';

/**
 * REB-specific notes
 * ------------------
 * REB's /updates/news archive exposes the publication date for each article,
 * but many /news-detail/... pages do not render a publication date at all.
 *
 * Therefore publication date is treated as ARCHIVE METADATA.
 * The adapter maintains a URL -> publication-date cache built from the REB
 * archive and can rebuild that cache from inside parseArticle().
 *
 * This deliberately avoids relying on an in-memory discovery hint being passed
 * by the crawler runner, because discovery and parsing may run in different
 * workers / adapter instances.
 */

function parseDateCandidate(value?: string | null): string | undefined {
  if (!value) return undefined;

  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return undefined;

  const parsed = parseDateSafely(cleaned);
  if (parsed) return parsed;

  // REB archive examples:
  // "Tuesday, 15 September, 2026"
  // "Thursday, 30 July, 2026"
  const withoutWeekday = cleaned.replace(
    /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/i,
    ''
  );

  const normalizedComma = withoutWeekday.replace(
    /^(\d{1,2}\s+[A-Za-z]+),\s+(\d{4})$/,
    '$1 $2'
  );

  const ms = Date.parse(normalizedComma);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

function extractDateText(text: string): string | undefined {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned) return undefined;

  const patterns = [
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+\d{1,2}\s+[A-Za-z]+\s*,?\s+\d{4}\b/i,
    /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*,?\s+\d{4}\b/i,
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return match[0];
  }

  return undefined;
}

function findDatePublished(value: unknown): string | undefined {
  if (!value) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDatePublished(item);
      if (found) return found;
    }
    return undefined;
  }

  if (typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;

  for (const key of ['datePublished', 'dateCreated', 'uploadDate']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  for (const child of Object.values(record)) {
    const found = findDatePublished(child);
    if (found) return found;
  }

  return undefined;
}

function detectLanguage(text: string): string {
  const sample = ` ${text.toLowerCase()} `;

  const rwTokens = [
    ' kuwa ', ' mu rwanda ', ' umuyobozi ', ' abanyeshuri ',
    ' urubyiruko ', ' ishuri ', ' uburezi ', ' abarimu ',
    ' gahunda ', ' igihugu ', ' uyu ', ' y’u rwanda ', " y'u rwanda "
  ];

  const enTokens = [
    ' the ', ' and ', ' education ', ' students ', ' teachers ',
    ' school ', ' learning ', ' programme ', ' program ',
    ' rwanda basic education board '
  ];

  const rwScore = rwTokens.reduce(
    (score, token) => score + (sample.includes(token) ? 1 : 0),
    0
  );

  const enScore = enTokens.reduce(
    (score, token) => score + (sample.includes(token) ? 1 : 0),
    0
  );

  return rwScore >= 3 && rwScore > enScore ? 'rw' : 'en';
}

export class RebAdapter extends BaseSourceAdapter {
  /**
   * Static on purpose:
   * discovery and detail parsing can create different adapter instances inside
   * the same worker. A normal instance map would be lost.
   */
  private static readonly archiveDateByUrl = new Map<string, string>();
  private static readonly archiveTitleByUrl = new Map<string, string>();

  /**
   * Prevent several concurrent detail parsers from each scanning the archive.
   */
  private static archiveCacheBuildPromise: Promise<void> | null = null;
  private static archiveCacheComplete = false;

  getMetadata(): SourceMetadata {
    return {
      id: 'reb',
      domain: 'www.reb.gov.rw',
      name: 'Rwanda Basic Education Board (REB)',
      region: 'rwanda',
      type: 'government',
      defaultLanguage: 'en',
      homeUrl: 'https://www.reb.gov.rw',
      enabled: true,
      sections: [
        { id: 'news', name: 'News & Updates', path: '/updates/news' }
      ]
    };
  }

  /**
   * Finds the date belonging specifically to one article link.
   *
   * We walk upwards from the link and accept the first ancestor that:
   *   1. contains a recognizable date, and
   *   2. contains no different /news-detail/ article URL.
   *
   * This prevents accidentally assigning the first date from a larger archive
   * container that contains several article cards.
   */
  private findDateForArchiveLink(
    $: cheerio.CheerioAPI,
    link: cheerio.Cheerio<any>,
    articleUrl: string
  ): string | undefined {
    let node = link;

    for (let depth = 0; depth < 10 && node.length > 0; depth++) {
      const localUrls = new Set<string>();

      node.find('a[href*="/news-detail/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        try {
          localUrls.add(normalizeUrl(href, this.getMetadata().homeUrl));
        } catch {
          // Ignore malformed href in archive markup.
        }
      });

      // The current link itself is not included by .find() if node === link.
      if (node.is('a[href*="/news-detail/"]')) {
        const href = node.attr('href');
        if (href) {
          try {
            localUrls.add(normalizeUrl(href, this.getMetadata().homeUrl));
          } catch {
            // Ignore.
          }
        }
      }

      const hasDifferentArticle =
        [...localUrls].some(candidate => candidate !== articleUrl);

      if (!hasDifferentArticle) {
        const explicit =
          node.find(
            'time, .date, .news-date, .news-list-date, .article-date, [class*="date"]'
          ).first().attr('datetime')
          || node.find(
            'time, .date, .news-date, .news-list-date, .article-date, [class*="date"]'
          ).first().text();

        const explicitParsed = parseDateCandidate(explicit);
        if (explicitParsed) return explicitParsed;

        const textDate = extractDateText(node.text());
        const textParsed = parseDateCandidate(textDate);
        if (textParsed) return textParsed;
      }

      node = node.parent();
    }

    return undefined;
  }

  private findTitleForArchiveLink(
    $: cheerio.CheerioAPI,
    link: cheerio.Cheerio<any>
  ): string | undefined {
    const direct = normalizeWhitespace(link.text());
    if (direct && direct.toLowerCase() !== 'read more →' && direct.toLowerCase() !== 'read more') {
      return direct;
    }

    let node = link;
    for (let depth = 0; depth < 7 && node.length > 0; depth++) {
      const heading = normalizeWhitespace(
        node.find('h1, h2, h3, h4').first().text()
      );
      if (heading) return heading;
      node = node.parent();
    }

    return undefined;
  }

  /**
   * Parses one REB archive page and updates the shared metadata cache.
   * Returns all article hints found on the page.
   */
  private parseArchivePage(
    $: cheerio.CheerioAPI,
    sectionId: string
  ): DiscoveredArticleHint[] {
    const meta = this.getMetadata();
    const pageHints: DiscoveredArticleHint[] = [];
    const pageSeen = new Set<string>();

    $('a[href*="/news-detail/"]').each((_, el) => {
      const link = $(el);
      const href = link.attr('href');
      if (!href) return;

      let fullUrl: string;
      try {
        fullUrl = normalizeUrl(href, meta.homeUrl);
      } catch {
        return;
      }

      const parsedUrl = new URL(fullUrl);

      if (parsedUrl.hostname !== meta.domain) return;
      if (!parsedUrl.pathname.startsWith('/news-detail/')) return;
      if (pageSeen.has(fullUrl)) return;

      pageSeen.add(fullUrl);

      const publishedAtHint = this.findDateForArchiveLink($, link, fullUrl);
      const titleHint = this.findTitleForArchiveLink($, link);

      if (publishedAtHint) {
        RebAdapter.archiveDateByUrl.set(fullUrl, publishedAtHint);
      }

      if (titleHint) {
        RebAdapter.archiveTitleByUrl.set(fullUrl, titleHint);
      }

      pageHints.push({
        url: fullUrl,
        section: sectionId,
        publishedAtHint,
        titleHint
      });
    });

    return pageHints;
  }

  /**
   * Finds the exact "next" archive URL.
   *
   * REB is TYPO3/tx_news and pagination links can include cHash values.
   * Following the site's own URL is safer than synthesizing it.
   */
  private findNextArchivePageUrl(
    $: cheerio.CheerioAPI,
    currentPage: number
  ): { url: string; page: number } | undefined {
    const meta = this.getMetadata();
    let result: { url: string; page: number } | undefined;

    $('a[href*="tx_news_pi1"]').each((_, el) => {
      if (result) return;

      const href = $(el).attr('href');
      if (!href) return;

      let absolute: string;
      try {
        absolute = normalizeUrl(href, meta.homeUrl);
      } catch {
        return;
      }

      let decoded: string;
      try {
        decoded = decodeURIComponent(absolute);
      } catch {
        decoded = absolute;
      }

      const match = decoded.match(/tx_news_pi1\[currentPage\]=(\d+)/);
      if (!match) return;

      const candidatePage = Number(match[1]);
      if (candidatePage !== currentPage + 1) return;

      result = {
        url: absolute,
        page: candidatePage
      };
    });

    return result;
  }

  /**
   * Builds a complete REB archive metadata cache.
   *
   * This is the critical REB-specific fallback used by parseArticle().
   * It makes detailed parsing independent from the crawler runner passing
   * discovery hints between workers/instances.
   */
  private async buildArchiveMetadataCache(maxPages = 30): Promise<void> {
    const meta = this.getMetadata();
    const section = meta.sections[0];

    let page = 1;
    let pageUrl = `${meta.homeUrl}${section.path}`;

    const seenPages = new Set<string>();
    const seenSignatures = new Set<string>();

    for (let visited = 0; visited < maxPages; visited++) {
      if (seenPages.has(pageUrl)) break;
      seenPages.add(pageUrl);

      try {
        const html = await this.fetchArticle(pageUrl);
        const $ = cheerio.load(html);

        const hints = this.parseArchivePage($, section.id);
        const signature = hints.map(item => item.url).sort().join('|');

        if (signature && seenSignatures.has(signature)) {
          break;
        }
        if (signature) {
          seenSignatures.add(signature);
        }

        if (hints.length === 0) {
          break;
        }

        const next = this.findNextArchivePageUrl($, page);
        if (!next) {
          break;
        }

        pageUrl = next.url;
        page = next.page;
      } catch (error) {
        console.error(
          `[REB] Failed while building archive metadata cache page=${page} url=${pageUrl}`,
          error
        );
        break;
      }
    }
  }

  private async ensureArchiveMetadataCache(): Promise<void> {
    if (RebAdapter.archiveCacheComplete) return;

    if (!RebAdapter.archiveCacheBuildPromise) {
      RebAdapter.archiveCacheBuildPromise = this.buildArchiveMetadataCache()
        .then(() => {
          RebAdapter.archiveCacheComplete = true;

          console.log(
            `[REB] Archive metadata cache ready: `
            + `${RebAdapter.archiveDateByUrl.size} dated article URLs`
          );
        })
        .finally(() => {
          RebAdapter.archiveCacheBuildPromise = null;
        });
    }

    await RebAdapter.archiveCacheBuildPromise;
  }

  async discoverArticles(options: DiscoveryOptions): Promise<DiscoveryResult> {
    const meta = this.getMetadata();
    const section = meta.sections[0];

    const discovered: DiscoveredArticleHint[] = [];
    const seenUrls = new Set<string>();
    const seenPages = new Set<string>();
    const seenSignatures = new Set<string>();

    const maxPages =
      options.maxPagesPerSection
      || (options.mode === 'backfill' ? 30 : 2);

    let page = Math.max(1, options.checkpointPage || 1);

    /**
     * For page > 1 we cannot safely synthesize the full TYPO3 URL because cHash
     * may be required. Start from page 1 and follow the site's own pagination
     * links until checkpointPage is reached.
     */
    let pageUrl = `${meta.homeUrl}${section.path}`;

    let oldestDateReached: Date | undefined;
    let lastSuccessfulPage = 1;
    let completed = true;
    let consecutiveOldPages = 0;

    // If resuming at a later page, walk pagination links without adding earlier
    // results to the output. Archive parsing still refreshes their metadata cache.
    let currentPage = 1;

    for (let visited = 0; visited < Math.max(maxPages + page, maxPages); visited++) {
      if (seenPages.has(pageUrl)) break;
      seenPages.add(pageUrl);

      try {
        const html = await this.fetchArticle(pageUrl);
        const $ = cheerio.load(html);
        lastSuccessfulPage = currentPage;

        const pageHints = this.parseArchivePage($, section.id);
        const signature = pageHints.map(item => item.url).sort().join('|');

        if (signature && seenSignatures.has(signature)) {
          console.warn(`[REB] Repeated archive page detected: ${pageUrl}`);
          break;
        }
        if (signature) seenSignatures.add(signature);

        if (currentPage >= page) {
          let pageHasCurrentOrNewer = false;

          for (const hint of pageHints) {
            if (seenUrls.has(hint.url)) continue;
            seenUrls.add(hint.url);

            if (hint.publishedAtHint) {
              const articleDate = new Date(hint.publishedAtHint);

              if (!oldestDateReached || articleDate < oldestDateReached) {
                oldestDateReached = articleDate;
              }

              if (!options.cutoffDate || articleDate >= options.cutoffDate) {
                pageHasCurrentOrNewer = true;
              }
            } else {
              // No date is a reason to inspect, not to silently discard.
              pageHasCurrentOrNewer = true;
            }

            discovered.push(hint);
          }

          if (options.cutoffDate) {
            if (!pageHasCurrentOrNewer && pageHints.length > 0) {
              consecutiveOldPages += 1;
              if (consecutiveOldPages >= 2) break;
            } else {
              consecutiveOldPages = 0;
            }
          }

          if (
            options.mode === 'incremental'
            && currentPage - page >= 1
          ) {
            break;
          }

          if (currentPage - page + 1 >= maxPages) {
            break;
          }
        }

        if (pageHints.length === 0) {
          console.warn(`[REB] No /news-detail/ article links found: ${pageUrl}`);
          break;
        }

        const next = this.findNextArchivePageUrl($, currentPage);
        if (!next) break;

        pageUrl = next.url;
        currentPage = next.page;
      } catch (error) {
        completed = false;
        console.error(
          `[REB] discoverArticles failed page=${currentPage} url=${pageUrl}`,
          error
        );
        break;
      }
    }

    return {
      articles: discovered,
      oldestDateReached,
      lastSuccessfulPage,
      completed
    };
  }

  /**
   * Attempts the common BaseSourceAdapter extraction against multiple REB
   * containers and finally creates a clean synthetic container if the site's
   * TYPO3 markup changed.
   */
  private extractRebContent(
    $: cheerio.CheerioAPI,
    url: string
  ) {
    const candidates = [
      '.news-single .news-text-wrap',
      '.news-detail .news-text-wrap',
      '.news-text-wrap',
      '.news-single .article',
      '.news-single',
      '.news-detail',
      'main article',
      'article',
      'main'
    ];

    for (const selector of candidates) {
      const container = $(selector).first();
      if (container.length === 0) continue;

      const clone = container.clone();

      clone.find(
        [
          'nav', 'footer', 'header', 'aside',
          'script', 'style', 'noscript', 'iframe',
          '.breadcrumb', '.pagination',
          '.related', '.related-news', '.news-related',
          '.share', '.social-share',
          '.news-backlink-wrap', '.backlink',
          '.comments', '#comments'
        ].join(',')
      ).remove();

      try {
        const result = this.extractContentBlocks($, clone, url);

        if (result.bodyText && result.bodyText.length >= 50) {
          return result;
        }
      } catch (error) {
        console.warn(
          `[REB] Content extraction failed for selector ${selector}: ${url}`,
          error
        );
      }
    }

    /**
     * The current REB detail pages clearly contain many paragraphs and images,
     * but their TYPO3 wrappers may not match stable class names.
     *
     * Reconstruct a clean document-order container from meaningful nodes.
     */
    const source =
      $('main').first().length > 0
        ? $('main').first()
        : $('body');

    const wrapper = $('<div id="reb-adapter-content-fallback"></div>');

    source.find('p, h2, h3, h4, blockquote, figure, img').each((_, el) => {
      const node = $(el);

      if (
        node.closest(
          [
            'nav', 'footer', 'header', 'aside',
            '.breadcrumb', '.pagination',
            '.related', '.related-news',
            '.share', '.social-share',
            '.news-backlink-wrap', '.backlink'
          ].join(',')
        ).length > 0
      ) {
        return;
      }

      // A figure already contains its image. Avoid adding the nested img twice.
      if (node.is('img') && node.closest('figure').length > 0) return;

      const text = normalizeWhitespace(node.text());

      if (!node.is('img, figure') && text.length < 2) return;

      wrapper.append(node.clone());
    });

    $('body').append(wrapper);

    return this.extractContentBlocks($, wrapper, url);
  }

  async parseArticle(
    html: string,
    url: string,
    hints?: DiscoveredArticleHint
  ): Promise<ParsedArticle | null> {
    try {
      const $ = cheerio.load(html);
      const meta = this.getMetadata();

      const normalizedUrl = normalizeUrl(url, meta.homeUrl);
      const canonicalUrl = extractCanonicalUrl(html, normalizedUrl);
      const normalizedCanonicalUrl = normalizeUrl(canonicalUrl, meta.homeUrl);

      const title =
        normalizeWhitespace(
          $('h1, .news-single h1, .news-detail h1')
            .first()
            .text()
        )
        || $('meta[property="og:title"]').attr('content')?.trim()
        || hints?.titleHint
        || RebAdapter.archiveTitleByUrl.get(normalizedUrl)
        || RebAdapter.archiveTitleByUrl.get(normalizedCanonicalUrl)
        || '';

      if (!title) {
        console.warn(`[REB] Reject: missing title: ${url}`);
        return null;
      }

      const subtitle =
        normalizeWhitespace(
          $('.lead, .teaser, .news-teaser, .news-single .lead')
            .first()
            .text()
        ) || undefined;

      /**
       * Detail-page date sources first.
       * They are used when present, but REB frequently omits them.
       */
      let publishedAt = parseDateCandidate(
        $('time[datetime]').first().attr('datetime')
        || $('meta[property="article:published_time"]').attr('content')
        || $('meta[name="publication_date"]').attr('content')
        || $('meta[name="date"]').attr('content')
        || $('[itemprop="datePublished"]').first().attr('content')
        || $('[itemprop="datePublished"]').first().attr('datetime')
      );

      if (!publishedAt) {
        $('script[type="application/ld+json"]').each((_, el) => {
          if (publishedAt) return;

          try {
            const json = JSON.parse($(el).html() || '{}');
            publishedAt = parseDateCandidate(findDatePublished(json));
          } catch {
            // Ignore malformed JSON-LD.
          }
        });
      }

      /**
       * Then use runner-provided discovery metadata if available.
       */
      if (!publishedAt && hints?.publishedAtHint) {
        publishedAt = parseDateCandidate(hints.publishedAtHint);
      }

      /**
       * Then use any archive metadata already collected in this worker.
       */
      if (!publishedAt) {
        publishedAt =
          RebAdapter.archiveDateByUrl.get(normalizedUrl)
          || RebAdapter.archiveDateByUrl.get(normalizedCanonicalUrl);
      }

      /**
       * Critical fallback:
       * discovery and parsing may run in different workers. Build the REB
       * archive cache from the source itself so parsing does not depend on
       * cross-worker memory.
       */
      if (!publishedAt) {
        await this.ensureArchiveMetadataCache();

        publishedAt =
          RebAdapter.archiveDateByUrl.get(normalizedUrl)
          || RebAdapter.archiveDateByUrl.get(normalizedCanonicalUrl);
      }

      if (!publishedAt) {
        console.warn(
          `[REB] Reject: no publication date in detail page or REB archive: ${url}`
        );
        return null;
      }

      const author =
        normalizeWhitespace(
          $('.author, .news-author, .news-single .author, [rel="author"]')
            .first()
            .text()
        )
        || $('meta[name="author"]').attr('content')?.trim()
        || undefined;

      const {
        contentBlocks,
        imageUrls,
        leadImageUrl,
        bodyText
      } = this.extractRebContent($, url);

      if (!bodyText || bodyText.length < 50) {
        console.warn(
          `[REB] Reject: article body too short (${bodyText?.length || 0} chars): ${url}`
        );
        return null;
      }

      const ogImage = extractBestImageUrl(
        {
          src:
            $('meta[property="og:image"]').attr('content')
            || $('meta[name="twitter:image"]').attr('content')
            || undefined
        },
        url
      );

      const finalLeadImage = leadImageUrl || ogImage || undefined;
      const uniqueImageUrls = [...new Set(imageUrls)];

      if (finalLeadImage && !uniqueImageUrls.includes(finalLeadImage)) {
        uniqueImageUrls.unshift(finalLeadImage);
      }

      const originalLanguage = detectLanguage(
        `${title}\n${bodyText.slice(0, 5000)}`
      );

      return this.normalizeArticle({
        sourceId: meta.id,
        sourceUrl: url,
        canonicalUrl,
        originalLanguage,
        originalTitle: title,
        originalSubtitle: subtitle,
        originalBody: bodyText,
        author,
        publishedAt,
        sourceSection: 'news',
        portalCategoryId: 'rwanda',
        leadImageUrl: finalLeadImage,
        imageUrls: uniqueImageUrls,
        contentBlocks
      });
    } catch (error) {
      console.error(`[REB] parseArticle exception: ${url}`, error);
      return null;
    }
  }
}
