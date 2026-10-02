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

type KigaliTodayRoot = {
  id: string;
  name: string;
  path: string;
  portalCategoryId?: string;
};

type ListingDateState = {
  year: number;
  lastMonth?: number;
  initialized: boolean;
};

/**
 * Kigali Today general-article discovery roots.
 *
 * IMPORTANT:
 * - Kigali Today TV (/amashusho) is intentionally EXCLUDED.
 * - All roots below are ordinary article archives using /article/ detail URLs.
 * - A post can appear in multiple archive/listing contexts, so discovery is
 *   globally deduplicated by normalized article URL.
 */
const DISCOVERY_ROOTS: KigaliTodayRoot[] = [
  { id: 'amakuru', name: 'Amakuru', path: '/amakuru', portalCategoryId: 'rwanda' },
  { id: 'agaseke-ka-weekend', name: 'Agaseke ka Weekend', path: '/agaseke-ka-weekend', portalCategoryId: 'rwanda' },
  { id: 'imyidagaduro', name: 'Imyidagaduro', path: '/imyidagaduro', portalCategoryId: 'rwanda' },

  { id: 'amatangazo', name: 'Amatangazo', path: '/amatangazo', portalCategoryId: 'rwanda' },
  { id: 'ntibisanzwe', name: 'Ntibisanzwe', path: '/ntibisanzwe', portalCategoryId: 'rwanda' },

  { id: 'ubukungu', name: 'Ubukungu', path: '/ubukungu', portalCategoryId: 'economy' },
  { id: 'ubuzima', name: 'Ubuzima', path: '/ubuzima', portalCategoryId: 'rwanda' },
  { id: 'uburezi', name: 'Uburezi', path: '/uburezi', portalCategoryId: 'rwanda' },
  { id: 'ubuhinzi', name: 'Ubuhinzi', path: '/ubuhinzi', portalCategoryId: 'rwanda' },
  { id: 'ikoranabuhanga', name: 'Ikoranabuhanga', path: '/ikoranabuhanga', portalCategoryId: 'tech' },
  { id: 'ubutabera', name: 'Ubutabera', path: '/ubutabera', portalCategoryId: 'rwanda' },
  { id: 'kwibuka', name: 'Kwibuka', path: '/kwibuka', portalCategoryId: 'rwanda' },
  { id: 'inkuru-zicukumbuye', name: 'Inkuru Zicukumbuye', path: '/Inkuru-Zicukumbuye', portalCategoryId: 'rwanda' },
  { id: 'umuco', name: 'Umuco', path: '/umuco', portalCategoryId: 'rwanda' },
  { id: 'ubukerarugendo', name: 'Ubukerarugendo', path: '/ubukerarugendo', portalCategoryId: 'rwanda' },

  { id: 'umutekano', name: 'Umutekano', path: '/umutekano', portalCategoryId: 'rwanda' },
  { id: 'imikino', name: 'Imikino', path: '/imikino', portalCategoryId: 'rwanda' }
];

function findJsonLdString(
  value: unknown,
  keys: string[]
): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonLdString(item, keys);
      if (found) return found;
    }
    return undefined;
  }

  if (!value || typeof value !== 'object') return undefined;

  const object = value as Record<string, unknown>;

  for (const key of keys) {
    const candidate = object[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const nested of Object.values(object)) {
    if (!nested || typeof nested !== 'object') continue;

    const found = findJsonLdString(nested, keys);
    if (found) return found;
  }

  return undefined;
}

function findJsonLdAuthor(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonLdAuthor(item);
      if (found) return found;
    }
    return undefined;
  }

  if (!value || typeof value !== 'object') return undefined;

  const object = value as Record<string, unknown>;
  const author = object.author;

  if (typeof author === 'string' && author.trim()) {
    return normalizeWhitespace(author);
  }

  if (Array.isArray(author)) {
    for (const item of author) {
      if (typeof item === 'string' && item.trim()) {
        return normalizeWhitespace(item);
      }

      if (item && typeof item === 'object') {
        const name = (item as Record<string, unknown>).name;
        if (typeof name === 'string' && name.trim()) {
          return normalizeWhitespace(name);
        }
      }
    }
  }

  if (author && typeof author === 'object') {
    const name = (author as Record<string, unknown>).name;
    if (typeof name === 'string' && name.trim()) {
      return normalizeWhitespace(name);
    }
  }

  for (const nested of Object.values(object)) {
    if (!nested || typeof nested !== 'object') continue;

    const found = findJsonLdAuthor(nested);
    if (found) return found;
  }

  return undefined;
}

export class KigaliTodayAdapter extends BaseSourceAdapter {
  /**
   * Convenience only. The detail parser does not require this cache because
   * current Kigali Today detail pages expose full publication timestamps.
   */
  private static readonly hintByUrl = new Map<string, DiscoveredArticleHint>();

  getMetadata(): SourceMetadata {
    return {
      id: 'kigalitoday',
      domain: 'www.kigalitoday.com',
      name: 'Kigali Today',
      region: 'rwanda',
      type: 'news',
      defaultLanguage: 'rw',
      homeUrl: 'https://www.kigalitoday.com',
      enabled: true,

      // TV (/amashusho) deliberately omitted.
      sections: DISCOVERY_ROOTS.map(root => ({
        id: root.id,
        name: root.name,
        path: root.path
      }))
    };
  }

  private isGeneralArticleUrl(
    candidate: string,
    root?: KigaliTodayRoot
  ): boolean {
    try {
      const meta = this.getMetadata();
      const parsed = new URL(candidate);

      if (parsed.hostname !== meta.domain) return false;

      const path = parsed.pathname;
      if (!path.includes('/article/')) return false;

      // Explicitly reject Kigali Today TV / video paths.
      if (path.toLowerCase().startsWith('/amashusho/')) return false;

      if (root) {
        const rootSegment =
          new URL(root.path, meta.homeUrl)
            .pathname
            .split('/')
            .filter(Boolean)[0]
            ?.toLowerCase();

        const articleSegment =
          path
            .split('/')
            .filter(Boolean)[0]
            ?.toLowerCase();

        /**
         * This is important because each archive page also contains popular /
         * related links from OTHER categories. Only collect article URLs whose
         * first path segment belongs to the root currently being scanned.
         */
        if (
          rootSegment
          && articleSegment
          && rootSegment !== articleSegment
        ) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Kigali Today archive cards often display dates without a year:
   *   "19 SEPT, 20:22"
   *
   * For backfill, assuming the current year for every page breaks year-boundary
   * cutoff logic. This method keeps a chronological year cursor per archive
   * root. When descending archive pages roll from Jan/Feb/Mar back to
   * Oct/Nov/Dec, the cursor moves to the previous year.
   */
  private parseListingDate(
    input: string | undefined | null,
    state: ListingDateState
  ): string | undefined {
    const text = normalizeWhitespace(input || '');
    if (!text) return undefined;

    const fullyParsed = parseDateSafely(text);

    /**
     * If the source/parser already supplied an explicit year, trust it and
     * synchronize the state from that date.
     */
    if (fullyParsed && /\b20\d{2}\b/.test(text)) {
      const explicitDate = new Date(fullyParsed);

      if (!Number.isNaN(explicitDate.getTime())) {
        state.year = explicitDate.getFullYear();
        state.lastMonth = explicitDate.getMonth();
        state.initialized = true;
      }

      return fullyParsed;
    }

    const compact = text.match(
      /\b(\d{1,2})\s+(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEPT?(?:EMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s*,\s*(\d{1,2}):(\d{2})\b/i
    );

    if (!compact) {
      // If generic parsing succeeds for a non-compact form, retain it.
      return fullyParsed || undefined;
    }

    const monthMap: Record<string, number> = {
      JAN: 0,
      JANUARY: 0,
      FEB: 1,
      FEBRUARY: 1,
      MAR: 2,
      MARCH: 2,
      APR: 3,
      APRIL: 3,
      MAY: 4,
      JUN: 5,
      JUNE: 5,
      JUL: 6,
      JULY: 6,
      AUG: 7,
      AUGUST: 7,
      SEP: 8,
      SEPT: 8,
      SEPTEMBER: 8,
      OCT: 9,
      OCTOBER: 9,
      NOV: 10,
      NOVEMBER: 10,
      DEC: 11,
      DECEMBER: 11
    };

    const day = Number(compact[1]);
    const month = monthMap[compact[2].toUpperCase()];
    const hour = Number(compact[3]);
    const minute = Number(compact[4]);

    if (
      month === undefined
      || day < 1
      || day > 31
      || hour < 0
      || hour > 23
      || minute < 0
      || minute > 59
    ) {
      return undefined;
    }

    const now = new Date();

    if (!state.initialized) {
      state.year = now.getFullYear();
      state.initialized = true;

      // Example: current month is September and first archive date is December.
      // That December belongs to the previous year.
      const firstCandidate =
        new Date(state.year, month, day, hour, minute, 0, 0);

      const futureToleranceMs = 14 * 24 * 60 * 60 * 1000;

      if (firstCandidate.getTime() > now.getTime() + futureToleranceMs) {
        state.year -= 1;
      }
    } else if (
      state.lastMonth !== undefined
      && state.lastMonth <= 2
      && month >= 9
    ) {
      // Reverse chronological boundary: Jan/Feb/Mar -> Oct/Nov/Dec.
      state.year -= 1;
    }

    state.lastMonth = month;

    return new Date(
      state.year,
      month,
      day,
      hour,
      minute,
      0,
      0
    ).toISOString();
  }

  private findListingContext(
    $: cheerio.CheerioAPI,
    link: cheerio.Cheerio<any>,
    articleUrl: string
  ): cheerio.Cheerio<any> {
    let node = link;

    /**
     * Walk upward until we find a local container that does not contain links
     * to several different article URLs. This prevents a whole listing wrapper
     * from being treated as one article card.
     */
    for (let depth = 0; depth < 8 && node.length > 0; depth++) {
      const localUrls = new Set<string>();

      node.find('a[href*="/article/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        try {
          const normalized =
            normalizeUrl(href, this.getMetadata().homeUrl);

          if (this.isGeneralArticleUrl(normalized)) {
            localUrls.add(normalized);
          }
        } catch {
          // Ignore malformed local links.
        }
      });

      if (node.is('a[href*="/article/"]')) {
        const href = node.attr('href');

        if (href) {
          try {
            localUrls.add(
              normalizeUrl(href, this.getMetadata().homeUrl)
            );
          } catch {
            // Ignore.
          }
        }
      }

      const containsAnotherArticle =
        [...localUrls].some(url => url !== articleUrl);

      if (!containsAnotherArticle) {
        return node;
      }

      node = node.parent();
    }

    return link.parent();
  }

  async discoverArticles(
    options: DiscoveryOptions
  ): Promise<DiscoveryResult> {
    const meta = this.getMetadata();

    const discovered: DiscoveredArticleHint[] = [];

    /**
     * Global across all roots. Kigali Today can surface the same story through
     * several listing contexts.
     */
    const seenUrls = new Set<string>();

    const maxPagesPerRoot =
      options.maxPagesPerSection
      ?? (options.mode === 'backfill' ? 300 : 2);

    let oldestDateReached: Date | undefined;
    let lastSuccessfulPage = 1;
    let completed = true;

    type ExtendedDiscoveryOptions = DiscoveryOptions & {
      checkpointSection?: string;
      checkpointPage?: number;
    };

    const extendedOptions = options as ExtendedDiscoveryOptions;

    for (const root of DISCOVERY_ROOTS) {
      let consecutiveOldPages = 0;

      const listingDateState: ListingDateState = {
        year: new Date().getFullYear(),
        initialized: false
      };

      const startPage =
        options.mode === 'backfill'
        && extendedOptions.checkpointSection === root.id
        && extendedOptions.checkpointPage
          ? Math.max(1, extendedOptions.checkpointPage)
          : 1;

      const seenPageSignatures = new Set<string>();

      for (
        let page = startPage;
        page < startPage + maxPagesPerRoot;
        page++
      ) {
        const pageUrl =
          page === 1
            ? `${meta.homeUrl}${root.path}`
            : `${meta.homeUrl}${root.path}?page=${page}`;

        try {
          const html = await this.fetchArticle(pageUrl);
          const $ = cheerio.load(html);

          lastSuccessfulPage =
            Math.max(lastSuccessfulPage, page);

          const pageArticleUrls = new Set<string>();
          const pageHints: DiscoveredArticleHint[] = [];

          let pageHasCurrentOrNewer = false;
          let pageHasUnknownDate = false;

          $('a[href*="/article/"]').each((_, el) => {
            const link = $(el);
            const href = link.attr('href');
            if (!href) return;

            let articleUrl: string;

            try {
              articleUrl =
                normalizeUrl(href, meta.homeUrl);
            } catch {
              return;
            }

            if (!this.isGeneralArticleUrl(articleUrl, root)) {
              return;
            }

            if (pageArticleUrls.has(articleUrl)) return;
            pageArticleUrls.add(articleUrl);

            const context =
              this.findListingContext($, link, articleUrl);

            const explicitDate =
              context
                .find(
                  'time[datetime], time, .date, .post-date, .article-date, .meta-date, [class*="date"]'
                )
                .first()
                .attr('datetime')
              || context
                .find(
                  'time, .date, .post-date, .article-date, .meta-date, [class*="date"]'
                )
                .first()
                .text()
              || '';

            const contextText =
              normalizeWhitespace(context.text());

            const publishedAtHint =
              this.parseListingDate(
                explicitDate || contextText,
                listingDateState
              );

            if (publishedAtHint) {
              const articleDate =
                new Date(publishedAtHint);

              if (!Number.isNaN(articleDate.getTime())) {
                if (
                  !oldestDateReached
                  || articleDate < oldestDateReached
                ) {
                  oldestDateReached = articleDate;
                }

                if (
                  !options.cutoffDate
                  || articleDate >= options.cutoffDate
                ) {
                  pageHasCurrentOrNewer = true;
                }
              }
            } else {
              /**
               * Unknown listing date means "inspect later", NOT "old".
               * It must prevent a false cutoff stop.
               */
              pageHasUnknownDate = true;
            }

            let titleHint =
              normalizeWhitespace(link.text())
              || undefined;

            if (!titleHint || titleHint.length < 4) {
              titleHint =
                normalizeWhitespace(
                  context
                    .find(
                      'h1, h2, h3, h4, .title, .article-title'
                    )
                    .first()
                    .text()
                )
                || undefined;
            }

            const pathParts =
              new URL(articleUrl)
                .pathname
                .split('/')
                .filter(Boolean);

            const articleMarkerIndex =
              pathParts.indexOf('article');

            const sourceSection =
              pathParts[0] || root.id;

            const sourceSubcategory =
              articleMarkerIndex >= 2
                ? pathParts[1]
                : undefined;

            const hint: DiscoveredArticleHint = {
              url: articleUrl,
              section: sourceSection,
              subcategory: sourceSubcategory,
              publishedAtHint,
              titleHint
            };

            KigaliTodayAdapter.hintByUrl.set(
              articleUrl,
              hint
            );

            if (!seenUrls.has(articleUrl)) {
              seenUrls.add(articleUrl);
              pageHints.push(hint);
            }
          });

          /**
           * No valid root-matching article URLs means either:
           * - no more archive pages, or
           * - the site returned an invalid/empty page.
           */
          if (pageArticleUrls.size === 0) {
            break;
          }

          /**
           * Detect a broken page URL that returns the same archive page again.
           */
          const pageSignature =
            [...pageArticleUrls].sort().join('|');

          if (
            pageSignature
            && seenPageSignatures.has(pageSignature)
          ) {
            console.warn(
              `[KigaliToday] Repeated archive page: `
              + `root=${root.id} page=${page} url=${pageUrl}`
            );
            break;
          }

          if (pageSignature) {
            seenPageSignatures.add(pageSignature);
          }

          discovered.push(...pageHints);

          /**
           * Backfill cutoff:
           * require TWO consecutive archive pages whose known listing dates are
           * all older than the cutoff, with no unknown date on either page.
           */
          if (options.cutoffDate) {
            if (
              !pageHasCurrentOrNewer
              && !pageHasUnknownDate
            ) {
              consecutiveOldPages += 1;

              if (consecutiveOldPages >= 2) {
                break;
              }
            } else {
              consecutiveOldPages = 0;
            }
          }

          /**
           * Incremental mode scans the first two pages of EVERY root.
           * Do NOT use global discovered.length as a stop condition, because
           * that would cause later categories to be skipped.
           */
          if (
            options.mode === 'incremental'
            && page - startPage >= 1
          ) {
            break;
          }
        } catch (error) {
          completed = false;

          console.error(
            `[KigaliToday] Discovery failed: `
            + `root=${root.id} page=${page} url=${pageUrl}`,
            error
          );

          // Failure of one root must not stop the remaining roots.
          break;
        }
      }
    }

    return {
      articles: discovered,
      oldestDateReached,
      lastSuccessfulPage,
      completed
    };
  }

  private extractDateFromJsonLd(
    $: cheerio.CheerioAPI
  ): string | undefined {
    let result: string | undefined;

    $('script[type="application/ld+json"]').each((_, el) => {
      if (result) return;

      try {
        const json =
          JSON.parse($(el).html() || '{}') as unknown;

        const candidate =
          findJsonLdString(
            json,
            ['datePublished', 'dateCreated']
          );

        const parsed =
          parseDateSafely(candidate);

        if (parsed) result = parsed;
      } catch {
        // Ignore malformed JSON-LD.
      }
    });

    return result;
  }

  private extractAuthorFromJsonLd(
    $: cheerio.CheerioAPI
  ): string | undefined {
    let result: string | undefined;

    $('script[type="application/ld+json"]').each((_, el) => {
      if (result) return;

      try {
        result =
          findJsonLdAuthor(
            JSON.parse($(el).html() || '{}')
          );
      } catch {
        // Ignore malformed JSON-LD.
      }
    });

    return result;
  }

  private extractVisibleArticleDate(
    $: cheerio.CheerioAPI
  ): string | undefined {
    const scopes = [
      $('h1').first().parent().text(),
      $('main').first().text().slice(0, 3000),
      $('article').first().text().slice(0, 3000),
      $('body').text().slice(0, 4500)
    ];

    const patterns = [
      /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\s+at\s+\d{1,2}:\d{2}\b/i,
      /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i
    ];

    for (const scope of scopes) {
      const text = normalizeWhitespace(scope || '');

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;

        const parsed =
          parseDateSafely(match[0]);

        if (parsed) return parsed;

        const nativeMs =
          Date.parse(
            match[0].replace(/\s+at\s+/i, ' ')
          );

        if (!Number.isNaN(nativeMs)) {
          return new Date(nativeMs).toISOString();
        }
      }
    }

    return undefined;
  }

  private extractAuthorNearWanditse(
    $: cheerio.CheerioAPI
  ): string | undefined {
    let author: string | undefined;

    $('body *').each((_, el) => {
      if (author) return;

      const node = $(el);

      const ownText =
        normalizeWhitespace(
          node
            .clone()
            .children()
            .remove()
            .end()
            .text()
        );

      if (
        ownText.toLowerCase() !== 'wanditse'
      ) {
        return;
      }

      const candidate =
        normalizeWhitespace(
          node.nextAll('a').first().text()
          || node.parent().find('a').first().text()
          || ''
        );

      if (candidate) {
        author = candidate;
      }
    });

    return author;
  }

  private extractKigaliTodayContent(
    $: cheerio.CheerioAPI,
    url: string
  ) {
    const selectors = [
      '.texte',
      '.article-body',
      '.entry-content',
      '.field-name-body',
      '.article-content',
      '#article-content',
      '.article-texte',
      '.texte-article',
      'main article',
      'article'
    ];

    for (const selector of selectors) {
      const container =
        $(selector).first();

      if (container.length === 0) continue;

      const clone =
        container.clone();

      clone.find(
        [
          'script',
          'style',
          'noscript',
          'nav',
          'footer',
          'header',
          'aside',
          'form',
          'iframe',
          '.comments',
          '.commentaires',
          '.related',
          '.related-posts',
          '.popular',
          '.popular-posts',
          '.share',
          '.social-share',
          '.article-author',
          '.author',
          '.byline',
          '.post-navigation',
          '.breadcrumb',
          '[class*="related"]',
          '[class*="popular"]',
          '[class*="comment"]'
        ].join(',')
      ).remove();

      try {
        const result =
          this.extractContentBlocks(
            $,
            clone,
            url
          );

        if (
          result.bodyText
          && result.bodyText.length >= 50
        ) {
          return result;
        }
      } catch (error) {
        console.warn(
          `[KigaliToday] Content extraction failed `
          + `selector=${selector} url=${url}`,
          error
        );
      }
    }

    /**
     * Final deterministic fallback.
     *
     * Rebuild a clean body in document order from meaningful nodes so inline
     * images remain anchored approximately where they appeared in the source.
     */
    const source =
      $('main article').first().length > 0
        ? $('main article').first()
        : $('article').first().length > 0
          ? $('article').first()
          : $('main').first().length > 0
            ? $('main').first()
            : $('body');

    const wrapper =
      $('<div id="kigalitoday-adapter-content-fallback"></div>');

    source
      .find(
        'p, h2, h3, h4, blockquote, figure, img'
      )
      .each((_, el) => {
        const node = $(el);

        if (
          node.closest(
            [
              'nav',
              'footer',
              'header',
              'aside',
              '.breadcrumb',
              '.related',
              '.related-posts',
              '.popular',
              '.popular-posts',
              '.share',
              '.social-share',
              '.comments',
              '.commentaires'
            ].join(',')
          ).length > 0
        ) {
          return;
        }

        // figure already includes its img.
        if (
          node.is('img')
          && node.closest('figure').length > 0
        ) {
          return;
        }

        const text =
          normalizeWhitespace(node.text());

        if (
          !node.is('img, figure')
          && text.length < 2
        ) {
          return;
        }

        wrapper.append(node.clone());
      });

    $('body').append(wrapper);

    return this.extractContentBlocks(
      $,
      wrapper,
      url
    );
  }

  async parseArticle(
    html: string,
    url: string,
    hints?: DiscoveredArticleHint
  ): Promise<ParsedArticle | null> {
    try {
      const $ = cheerio.load(html);
      const meta = this.getMetadata();

      const normalizedUrl =
        normalizeUrl(url, meta.homeUrl);

      if (
        !this.isGeneralArticleUrl(normalizedUrl)
      ) {
        console.warn(
          `[KigaliToday] Reject: non-article/TV URL ${url}`
        );
        return null;
      }

      const hint =
        hints
        || KigaliTodayAdapter.hintByUrl.get(
          normalizedUrl
        );

      const canonicalUrl =
        extractCanonicalUrl(
          html,
          normalizedUrl
        );

      const title =
        normalizeWhitespace(
          $(
            'h1.article-title, h1.entry-title, h1.post-title, main h1, article h1, h1'
          )
            .first()
            .text()
        )
        || $('meta[property="og:title"]')
          .attr('content')
          ?.trim()
        || hint?.titleHint
        || '';

      if (!title) {
        console.warn(
          `[KigaliToday] Reject: missing title ${url}`
        );
        return null;
      }

      const subtitle =
        normalizeWhitespace(
          $(
            '.article-chapo, .chapo, .entry-subtitle, .lead, .article-summary'
          )
            .first()
            .text()
        )
        || undefined;

      let publishedAt: string | null | undefined =
        parseDateSafely(
          $('time[datetime]')
            .first()
            .attr('datetime')
          || $('meta[property="article:published_time"]')
            .attr('content')
          || $('meta[name="publication_date"]')
            .attr('content')
          || $('meta[name="publish-date"]')
            .attr('content')
          || $('.article-date, .date-post, .post-date, .published, .meta-date, time')
            .first()
            .text()
            .trim()
        );

      if (!publishedAt) {
        publishedAt =
          this.extractDateFromJsonLd($);
      }

      if (!publishedAt) {
        publishedAt =
          this.extractVisibleArticleDate($);
      }

      if (
        !publishedAt
        && hint?.publishedAtHint
      ) {
        publishedAt =
          parseDateSafely(
            hint.publishedAtHint
          );
      }

      // Never fabricate a source publication date.
      if (!publishedAt) {
        console.warn(
          `[KigaliToday] Reject: missing publication date ${url}`
        );
        return null;
      }

      let author =
        normalizeWhitespace(
          $(
            '.article-author, .author, .byline, [rel="author"]'
          )
            .first()
            .text()
          || $('meta[name="author"]')
            .attr('content')
          || ''
        )
        || undefined;

      if (!author) {
        author =
          this.extractAuthorFromJsonLd($);
      }

      if (!author) {
        author =
          this.extractAuthorNearWanditse($);
      }

      let taxonomyUrl: URL;

      try {
        taxonomyUrl =
          new URL(canonicalUrl || normalizedUrl);
      } catch {
        taxonomyUrl =
          new URL(normalizedUrl);
      }

      const pathParts =
        taxonomyUrl.pathname
          .split('/')
          .filter(Boolean);

      const articleMarkerIndex =
        pathParts.indexOf('article');

      const sourceSection =
        pathParts[0]
        || hint?.section
        || 'amakuru';

      const sourceSubcategory =
        articleMarkerIndex >= 2
          ? pathParts[1]
          : hint?.subcategory;

      const root =
        DISCOVERY_ROOTS.find(
          candidate =>
            candidate.id.toLowerCase()
            === sourceSection.toLowerCase()
            || new URL(
              candidate.path,
              meta.homeUrl
            )
              .pathname
              .split('/')
              .filter(Boolean)[0]
              ?.toLowerCase()
            === sourceSection.toLowerCase()
        );

      let portalCategoryId =
        root?.portalCategoryId
        || 'rwanda';

      if (
        sourceSection
          .toLowerCase()
          .includes('ubukungu')
      ) {
        portalCategoryId = 'economy';
      } else if (
        sourceSection
          .toLowerCase()
          .includes('ikoranabuhanga')
      ) {
        portalCategoryId = 'tech';
      }

      const {
        contentBlocks,
        imageUrls,
        leadImageUrl,
        bodyText
      } =
        this.extractKigaliTodayContent(
          $,
          canonicalUrl || normalizedUrl
        );

      const metaImageSource =
        $('meta[property="og:image"]')
          .attr('content')
        || $('meta[name="twitter:image"]')
          .attr('content')
        || undefined;

      const metaImage =
        metaImageSource
          ? extractBestImageUrl(
              { src: metaImageSource },
              canonicalUrl || normalizedUrl
            )
          : undefined;

      const finalLeadImage =
        leadImageUrl
        || metaImage
        || undefined;

      const uniqueImageUrls =
        Array.from(
          new Set(
            [
              ...(finalLeadImage
                ? [finalLeadImage]
                : []),
              ...imageUrls
            ].filter(Boolean)
          )
        );

      /**
       * Kigali Today occasionally publishes image-led articles whose visible
       * body is empty or very short. Do not reject those before checking the
       * article image and source-provided caption/description metadata.
       *
       * This fallback never invents copy: it only reuses text already present
       * in the source HTML, and finally the source title when the post truly
       * contains images but no separate caption.
       */
      const metaDescription =
        normalizeWhitespace(
          $('meta[property="og:description"]')
            .attr('content')
          || $('meta[name="twitter:description"]')
            .attr('content')
          || $('meta[name="description"]')
            .attr('content')
          || ''
        );

      const captionTexts = new Set<string>();

      $(
        [
          'main article figcaption',
          'article figcaption',
          '.texte figcaption',
          '.article-body figcaption',
          '.entry-content figcaption',
          '.wp-caption-text',
          '.image-caption',
          '.photo-caption'
        ].join(',')
      ).each((_, el) => {
        const caption =
          normalizeWhitespace($(el).text());

        if (caption.length >= 3) {
          captionTexts.add(caption);
        }
      });

      const imageAltTexts = new Set<string>();

      $(
        [
          'main article img[alt]',
          'article img[alt]',
          '.texte img[alt]',
          '.article-body img[alt]',
          '.entry-content img[alt]'
        ].join(',')
      ).each((_, el) => {
        const alt =
          normalizeWhitespace(
            $(el).attr('alt') || ''
          );

        if (
          alt.length >= 5
          && !/^(?:image|photo|picture|logo|kigali today)$/i.test(alt)
        ) {
          imageAltTexts.add(alt);
        }
      });

      const fallbackParts =
        Array.from(
          new Set(
            [
              subtitle,
              metaDescription,
              ...captionTexts,
              ...imageAltTexts
            ]
              .map(value =>
                normalizeWhitespace(value || '')
              )
              .filter(value =>
                value
                && value.toLowerCase()
                  !== title.toLowerCase()
              )
          )
        );

      let resolvedBodyText =
        normalizeWhitespace(bodyText || '');

      if (resolvedBodyText.length < 50) {
        resolvedBodyText =
          normalizeWhitespace(
            [
              resolvedBodyText,
              ...fallbackParts
            ]
              .filter(Boolean)
              .join(' ')
          );
      }

      const isImageLedArticle =
        uniqueImageUrls.length > 0;

      if (
        isImageLedArticle
        && resolvedBodyText.length < 50
      ) {
        // The source title is preferable to fabricating body copy.
        resolvedBodyText =
          resolvedBodyText || title;

        console.info(
          `[KigaliToday] Accept image-led article: `
          + `body=${resolvedBodyText.length} chars `
          + `images=${uniqueImageUrls.length} ${url}`
        );
      }

      if (
        !resolvedBodyText
        || (
          resolvedBodyText.length < 50
          && !isImageLedArticle
        )
      ) {
        console.warn(
          `[KigaliToday] Reject: body too short `
          + `(${resolvedBodyText.length} chars, `
          + `${uniqueImageUrls.length} images) ${url}`
        );
        return null;
      }

      /**
       * Prefer explicit HTML language if Kigali Today provides it.
       * Otherwise use the source default (rw).
       */
      const htmlLanguage =
        $('html')
          .attr('lang')
          ?.toLowerCase()
          .split('-')[0];

      const originalLanguage =
        htmlLanguage
        && ['rw', 'en', 'fr', 'sw'].includes(htmlLanguage)
          ? htmlLanguage
          : meta.defaultLanguage;

      return this.normalizeArticle({
        sourceId: meta.id,
        sourceUrl: normalizedUrl,
        canonicalUrl,
        originalLanguage,
        originalTitle: title,
        originalSubtitle: subtitle,
        originalBody: resolvedBodyText,
        author,
        publishedAt,
        sourceSection,
        sourceSubcategory,
        portalCategoryId,
        leadImageUrl: finalLeadImage,
        imageUrls: uniqueImageUrls,
        contentBlocks
      });
    } catch (error) {
      console.error(
        `[KigaliToday] parseArticle exception: ${url}`,
        error
      );

      return null;
    }
  }
}

export default new KigaliTodayAdapter();
