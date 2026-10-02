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

type NewTimesGroup = 'news' | 'opinions' | 'sports' | 'diaspora';

type NewTimesDiscoveryRoot = {
  id: string;
  name: string;
  group: NewTimesGroup;
  path: string;
  categorySlug?: string;
  portalCategoryId?: string;
};

/**
 * The New Times discovery roots.
 *
 * IMPORTANT:
 * - Crawl the parent archive AND every current child archive.
 * - The same article can appear in several archives, so URLs are globally
 *   deduplicated across ALL roots.
 * - The live site also renders "Latest" and "Most Read" components on archive
 *   pages. We do NOT blindly accept every /article/ link: the article URL's
 *   built-in taxonomy must match the root currently being scanned.
 */
const DISCOVERY_ROOTS: NewTimesDiscoveryRoot[] = [
  // ---------------------------------------------------------------------------
  // NEWS - parent + all current child categories
  // ---------------------------------------------------------------------------
  {
    id: 'news',
    name: 'News',
    group: 'news',
    path: '/morearticles/news',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'rwanda',
    name: 'Rwanda',
    group: 'news',
    categorySlug: 'rwanda',
    path: '/morearticles/news/rwanda',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'business',
    name: 'Business',
    group: 'news',
    categorySlug: 'business',
    path: '/morearticles/news/business',
    portalCategoryId: 'economy'
  },
  {
    id: 'africa',
    name: 'Africa',
    group: 'news',
    categorySlug: 'africa',
    path: '/morearticles/news/africa',
    portalCategoryId: 'africa'
  },
  {
    id: 'international',
    name: 'International',
    group: 'news',
    categorySlug: 'international',
    path: '/morearticles/news/international',
    portalCategoryId: 'world'
  },
  {
    id: 'technology',
    name: 'Technology',
    group: 'news',
    categorySlug: 'technology',
    path: '/morearticles/news/technology',
    portalCategoryId: 'tech'
  },
  {
    id: 'agriculture',
    name: 'Agriculture',
    group: 'news',
    categorySlug: 'agriculture',
    path: '/morearticles/news/agriculture',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'coronavirus',
    name: 'Coronavirus',
    group: 'news',
    categorySlug: 'coronavirus',
    path: '/morearticles/news/coronavirus',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'politics',
    name: 'Politics',
    group: 'news',
    categorySlug: 'politics',
    path: '/morearticles/news/politics',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'environment',
    name: 'Environment',
    group: 'news',
    categorySlug: 'environment',
    path: '/morearticles/news/environment',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'energy',
    name: 'Energy',
    group: 'news',
    categorySlug: 'energy',
    path: '/morearticles/news/energy',
    portalCategoryId: 'economy'
  },
  {
    id: 'infrastructure',
    name: 'Infrastructure',
    group: 'news',
    categorySlug: 'infrastructure',
    path: '/morearticles/news/infrastructure',
    portalCategoryId: 'economy'
  },
  {
    id: 'health',
    name: 'Health',
    group: 'news',
    categorySlug: 'health',
    path: '/morearticles/news/health',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'crime',
    name: 'Crime',
    group: 'news',
    categorySlug: 'crime',
    path: '/morearticles/news/crime',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'finance',
    name: 'Finance',
    group: 'news',
    categorySlug: 'finance',
    path: '/morearticles/news/finance',
    portalCategoryId: 'economy'
  },
  {
    id: 'law',
    name: 'Law',
    group: 'news',
    categorySlug: 'law',
    path: '/morearticles/news/law',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'housing',
    name: 'Housing',
    group: 'news',
    categorySlug: 'housing',
    path: '/morearticles/news/housing',
    portalCategoryId: 'economy'
  },
  {
    id: 'aviation',
    name: 'Aviation',
    group: 'news',
    categorySlug: 'aviation',
    path: '/morearticles/news/aviation',
    portalCategoryId: 'economy'
  },
  {
    id: 'tourism',
    name: 'Tourism',
    group: 'news',
    categorySlug: 'tourism',
    path: '/morearticles/news/tourism',
    portalCategoryId: 'economy'
  },
  {
    id: 'featured',
    name: 'Featured',
    group: 'news',
    categorySlug: 'featured',
    path: '/morearticles/news/featured',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'culture',
    name: 'Culture',
    group: 'news',
    categorySlug: 'culture',
    path: '/morearticles/news/culture',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'economy',
    name: 'Economy',
    group: 'news',
    categorySlug: 'economy',
    path: '/morearticles/news/economy',
    portalCategoryId: 'economy'
  },
  {
    id: 'education',
    name: 'Education',
    group: 'news',
    categorySlug: 'education',
    path: '/morearticles/news/education',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'security',
    name: 'Security',
    group: 'news',
    categorySlug: 'security',
    path: '/morearticles/news/security',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'women',
    name: 'Women',
    group: 'news',
    categorySlug: 'women',
    path: '/morearticles/news/women',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'science',
    name: 'Science',
    group: 'news',
    categorySlug: 'science',
    path: '/morearticles/news/science',
    portalCategoryId: 'tech'
  },
  {
    id: 'religion',
    name: 'Religion',
    group: 'news',
    categorySlug: 'religion',
    path: '/morearticles/news/religion',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'kwibuka',
    name: 'Kwibuka',
    group: 'news',
    categorySlug: 'kwibuka',
    path: '/morearticles/news/kwibuka',
    portalCategoryId: 'rwanda'
  },

  /**
   * These two currently appear as additional News sections on the live News
   * page. If one becomes inactive and returns no matching articles, failure is
   * isolated to that root and the remaining roots continue normally.
   */
  {
    id: 'elections',
    name: 'Elections',
    group: 'news',
    categorySlug: 'elections',
    path: '/morearticles/news/elections',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'marburg-virus',
    name: 'Marburg Virus',
    group: 'news',
    categorySlug: 'marburg-virus',
    path: '/morearticles/news/marburg-virus',
    portalCategoryId: 'rwanda'
  },

  // ---------------------------------------------------------------------------
  // OPINIONS - parent + all current child categories
  // ---------------------------------------------------------------------------
  {
    id: 'opinions',
    name: 'Opinions',
    group: 'opinions',
    path: '/morearticles/opinions',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'feedback-from-readers',
    name: 'Feedback from Readers',
    group: 'opinions',
    categorySlug: 'feedback-from-readers',
    path: '/morearticles/opinions/feedback-from-readers',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'editorial',
    name: 'Editorial',
    group: 'opinions',
    categorySlug: 'editorial',
    path: '/morearticles/opinions/editorial',
    portalCategoryId: 'rwanda'
  },

  // ---------------------------------------------------------------------------
  // SPORTS - parent + all current child categories
  // ---------------------------------------------------------------------------
  {
    id: 'sports',
    name: 'Sports',
    group: 'sports',
    path: '/morearticles/sports',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'volleyball',
    name: 'Volleyball',
    group: 'sports',
    categorySlug: 'volleyball',
    path: '/morearticles/sports/volleyball',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'cycling',
    name: 'Cycling',
    group: 'sports',
    categorySlug: 'cycling',
    path: '/morearticles/sports/cycling',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'football',
    name: 'Football',
    group: 'sports',
    categorySlug: 'football',
    path: '/morearticles/sports/football',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'basketball',
    name: 'Basketball',
    group: 'sports',
    categorySlug: 'basketball',
    path: '/morearticles/sports/basketball',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'other-sports',
    name: 'Other Sports',
    group: 'sports',
    categorySlug: 'other-sports',
    path: '/morearticles/sports/other-sports',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'karate',
    name: 'Karate',
    group: 'sports',
    categorySlug: 'karate',
    path: '/morearticles/sports/karate',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'handball',
    name: 'Handball',
    group: 'sports',
    categorySlug: 'handball',
    path: '/morearticles/sports/handball',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'cricket',
    name: 'Cricket',
    group: 'sports',
    categorySlug: 'cricket',
    path: '/morearticles/sports/cricket',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'swimming',
    name: 'Swimming',
    group: 'sports',
    categorySlug: 'swimming',
    path: '/morearticles/sports/swimming',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'tennis',
    name: 'Tennis',
    group: 'sports',
    categorySlug: 'tennis',
    path: '/morearticles/sports/tennis',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'afcon-2023',
    name: 'AFCON 2023',
    group: 'sports',
    categorySlug: 'afcon-2023',
    path: '/morearticles/sports/afcon-2023',
    portalCategoryId: 'africa'
  },

  // ---------------------------------------------------------------------------
  // DIASPORA
  // ---------------------------------------------------------------------------
  {
    id: 'diaspora',
    name: 'Diaspora',
    group: 'diaspora',
    path: '/morearticles/diaspora',
    portalCategoryId: 'rwanda'
  }
];

function parseDateCandidate(value?: string | null): string | undefined {
  if (!value) return undefined;

  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return undefined;

  const parsed = parseDateSafely(cleaned);
  if (parsed) return parsed;

  const ms = Date.parse(cleaned);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

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

  for (const child of Object.values(object)) {
    if (!child || typeof child !== 'object') continue;
    const found = findJsonLdString(child, keys);
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

  for (const child of Object.values(object)) {
    if (!child || typeof child !== 'object') continue;

    const found = findJsonLdAuthor(child);
    if (found) return found;
  }

  return undefined;
}

function parseArticleTaxonomy(url: string): {
  group?: string;
  category?: string;
} {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);

    /**
     * Current article URL structure:
     * /article/{id}/{group}/{category}/{slug}
     *
     * Example:
     * /article/39074/news/law/agreements-between-...
     */
    if (parts[0] !== 'article') return {};

    return {
      group: parts[2]?.toLowerCase(),
      category: parts[3]?.toLowerCase()
    };
  } catch {
    return {};
  }
}

function isNewTimesArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.hostname !== 'www.newtimes.co.rw') return false;

    const parts = parsed.pathname.split('/').filter(Boolean);

    return (
      parts.length >= 4
      && parts[0] === 'article'
      && /^\d+$/.test(parts[1])
      && ['news', 'opinions', 'sports', 'diaspora'].includes(
        (parts[2] || '').toLowerCase()
      )
    );
  } catch {
    return false;
  }
}

function articleMatchesRoot(
  url: string,
  root: NewTimesDiscoveryRoot
): boolean {
  if (!isNewTimesArticleUrl(url)) return false;

  const taxonomy = parseArticleTaxonomy(url);

  if (taxonomy.group !== root.group) return false;

  /**
   * Parent archive accepts every category within its group.
   */
  if (!root.categorySlug) return true;

  return taxonomy.category === root.categorySlug;
}

function extractVisibleDate(text: string): string | undefined {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned) return undefined;

  const patterns = [
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i,
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i,
    /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return match[0];
  }

  return undefined;
}

export class NewTimesAdapter extends BaseSourceAdapter {
  private static readonly hintByUrl = new Map<string, DiscoveredArticleHint>();

  getMetadata(): SourceMetadata {
    return {
      id: 'newtimes',
      domain: 'www.newtimes.co.rw',
      name: 'The New Times',
      region: 'rwanda',
      type: 'news',
      defaultLanguage: 'en',
      homeUrl: 'https://www.newtimes.co.rw',
      enabled: true,

      /**
       * Expose every real archive root to the Sources UI.
       */
      sections: DISCOVERY_ROOTS.map(root => ({
        id: root.id,
        name: root.name,
        path: root.path
      }))
    };
  }

  private findListingContext(
    $: cheerio.CheerioAPI,
    link: cheerio.Cheerio<any>,
    articleUrl: string
  ): cheerio.Cheerio<any> {
    let node = link;

    for (let depth = 0; depth < 9 && node.length > 0; depth++) {
      const localArticleUrls = new Set<string>();

      node.find('a[href*="/article/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        try {
          const normalized = normalizeUrl(
            href,
            this.getMetadata().homeUrl
          );

          if (isNewTimesArticleUrl(normalized)) {
            localArticleUrls.add(normalized);
          }
        } catch {
          // Ignore malformed URLs.
        }
      });

      if (node.is('a[href*="/article/"]')) {
        const href = node.attr('href');

        if (href) {
          try {
            const normalized = normalizeUrl(
              href,
              this.getMetadata().homeUrl
            );

            if (isNewTimesArticleUrl(normalized)) {
              localArticleUrls.add(normalized);
            }
          } catch {
            // Ignore.
          }
        }
      }

      const containsDifferentArticle =
        [...localArticleUrls].some(
          candidate => candidate !== articleUrl
        );

      if (!containsDifferentArticle) {
        return node;
      }

      node = node.parent();
    }

    return link.parent();
  }

  private getListingMetadata(
    $: cheerio.CheerioAPI,
    link: cheerio.Cheerio<any>,
    articleUrl: string
  ): {
    titleHint?: string;
    publishedAtHint?: string;
  } {
    const context = this.findListingContext(
      $,
      link,
      articleUrl
    );

    let titleHint =
      normalizeWhitespace(link.text())
      || undefined;

    if (!titleHint || titleHint.length < 4) {
      titleHint =
        normalizeWhitespace(
          context
            .find(
              'h1, h2, h3, h4, .article-title, .title, .story-title'
            )
            .first()
            .text()
        )
        || undefined;
    }

    const explicitDate =
      context
        .find(
          'time[datetime], time, .date, .published, .published-date, .article-date, [class*="date"]'
        )
        .first()
        .attr('datetime')
      || context
        .find(
          'time, .date, .published, .published-date, .article-date, [class*="date"]'
        )
        .first()
        .text();

    const visibleDate =
      extractVisibleDate(context.text());

    const publishedAtHint =
      parseDateCandidate(
        explicitDate || visibleDate
      );

    return {
      titleHint,
      publishedAtHint
    };
  }

  async discoverArticles(
    options: DiscoveryOptions
  ): Promise<DiscoveryResult> {
    const meta = this.getMetadata();

    const discovered: DiscoveredArticleHint[] = [];

    /**
     * GLOBAL across News, Opinions, Sports and Diaspora.
     */
    const seenUrls = new Set<string>();

    const maxPagesPerRoot =
      options.maxPagesPerSection
      ?? (options.mode === 'backfill' ? 100 : 2);

    let oldestDateReached: Date | undefined;
    let lastSuccessfulPage = 1;
    let completed = true;

    type ExtendedDiscoveryOptions = DiscoveryOptions & {
      checkpointSection?: string;
      checkpointPage?: number;
    };

    const extendedOptions =
      options as ExtendedDiscoveryOptions;

    for (const root of DISCOVERY_ROOTS) {
      let consecutiveOldPages = 0;

      /**
       * A single global checkpoint page must NOT be applied to every category.
       * Only use checkpointPage when checkpointSection matches this root.
       */
      const startPage =
        options.mode === 'backfill'
        && extendedOptions.checkpointSection === root.id
        && extendedOptions.checkpointPage
          ? Math.max(1, extendedOptions.checkpointPage)
          : 1;

      const seenPageSignatures =
        new Set<string>();

      for (
        let page = startPage;
        page < startPage + maxPagesPerRoot;
        page++
      ) {
        const pageUrl =
          page === 1
            ? `${meta.homeUrl}${root.path}`
            : `${meta.homeUrl}${root.path}?pgno=${page}`;

        try {
          const html =
            await this.fetchArticle(pageUrl);

          const $ =
            cheerio.load(html);

          lastSuccessfulPage =
            Math.max(lastSuccessfulPage, page);

          const pageArticleUrls =
            new Set<string>();

          const pageHints:
            DiscoveredArticleHint[] = [];

          let pageHasCurrentOrNewer = false;
          let pageHasUnknownDate = false;

          $('a[href*="/article/"]').each((_, el) => {
            const link = $(el);
            const href = link.attr('href');
            if (!href) return;

            let articleUrl: string;

            try {
              articleUrl =
                normalizeUrl(
                  href,
                  meta.homeUrl
                );
            } catch {
              return;
            }

            /**
             * This rejects Most Read / Latest links belonging to another group
             * or child category.
             */
            if (
              !articleMatchesRoot(
                articleUrl,
                root
              )
            ) {
              return;
            }

            if (
              pageArticleUrls.has(articleUrl)
            ) {
              return;
            }

            pageArticleUrls.add(articleUrl);

            const {
              titleHint,
              publishedAtHint
            } =
              this.getListingMetadata(
                $,
                link,
                articleUrl
              );

            if (publishedAtHint) {
              const articleDate =
                new Date(publishedAtHint);

              if (
                !Number.isNaN(
                  articleDate.getTime()
                )
              ) {
                if (
                  !oldestDateReached
                  || articleDate < oldestDateReached
                ) {
                  oldestDateReached =
                    articleDate;
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
               * Unknown date = inspect detail page.
               * Never treat unknown as automatically old.
               */
              pageHasUnknownDate = true;
            }

            const taxonomy =
              parseArticleTaxonomy(articleUrl);

            const hint:
              DiscoveredArticleHint = {
                url: articleUrl,
                section:
                  taxonomy.group
                  || root.group,
                subcategory:
                  taxonomy.category
                  || root.categorySlug
                  || root.id,
                publishedAtHint,
                titleHint
              };

            NewTimesAdapter.hintByUrl.set(
              articleUrl,
              hint
            );

            if (!seenUrls.has(articleUrl)) {
              seenUrls.add(articleUrl);
              pageHints.push(hint);
            }
          });

          /**
           * No root-matching articles means archive ended, root is currently
           * empty, or this optional root is no longer active.
           *
           * Stop ONLY this root and continue every other root.
           */
          if (pageArticleUrls.size === 0) {
            if (page === 1) {
              console.warn(
                `[NewTimes] No matching articles `
                + `root=${root.id} url=${pageUrl}`
              );
            }
            break;
          }

          /**
           * Detect bad pagination returning the same content repeatedly.
           */
          const pageSignature =
            [...pageArticleUrls]
              .sort()
              .join('|');

          if (
            pageSignature
            && seenPageSignatures.has(
              pageSignature
            )
          ) {
            console.warn(
              `[NewTimes] Repeated archive page `
              + `root=${root.id} page=${page} url=${pageUrl}`
            );
            break;
          }

          if (pageSignature) {
            seenPageSignatures.add(
              pageSignature
            );
          }

          discovered.push(...pageHints);

          /**
           * Two consecutive safely-old pages before stopping backfill.
           */
          if (options.cutoffDate) {
            if (
              !pageHasCurrentOrNewer
              && !pageHasUnknownDate
            ) {
              consecutiveOldPages += 1;

              if (
                consecutiveOldPages >= 2
              ) {
                break;
              }
            } else {
              consecutiveOldPages = 0;
            }
          }

          /**
           * Critical:
           * Incremental scans first TWO pages of EVERY root.
           *
           * Do NOT stop based on global discovered.length, because that causes
           * later News/Opinions/Sports/Diaspora roots to be skipped.
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
            `[NewTimes] Discovery failed `
            + `root=${root.id} page=${page} url=${pageUrl}`,
            error
          );

          /**
           * Failure of one category must never stop the remaining categories.
           */
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

  private extractJsonLdDate(
    $: cheerio.CheerioAPI
  ): string | undefined {
    let result: string | undefined;

    $('script[type="application/ld+json"]')
      .each((_, el) => {
        if (result) return;

        try {
          const json =
            JSON.parse(
              $(el).html() || '{}'
            ) as unknown;

          result =
            parseDateCandidate(
              findJsonLdString(
                json,
                [
                  'datePublished',
                  'dateCreated'
                ]
              )
            );
        } catch {
          // Ignore malformed JSON-LD.
        }
      });

    return result;
  }

  private extractJsonLdAuthor(
    $: cheerio.CheerioAPI
  ): string | undefined {
    let result: string | undefined;

    $('script[type="application/ld+json"]')
      .each((_, el) => {
        if (result) return;

        try {
          result =
            findJsonLdAuthor(
              JSON.parse(
                $(el).html() || '{}'
              )
            );
        } catch {
          // Ignore malformed JSON-LD.
        }
      });

    return result;
  }

  private extractJsonLdArticleBody(
    $: cheerio.CheerioAPI
  ): string | undefined {
    let body: string | undefined;

    $('script[type="application/ld+json"]')
      .each((_, el) => {
        if (body) return;

        try {
          const json =
            JSON.parse(
              $(el).html() || '{}'
            ) as unknown;

          const candidate =
            findJsonLdString(
              json,
              ['articleBody']
            );

          if (
            candidate
            && normalizeWhitespace(
              candidate
            ).length >= 50
          ) {
            body =
              normalizeWhitespace(
                candidate
              );
          }
        } catch {
          // Ignore malformed JSON-LD.
        }
      });

    return body;
  }

  private extractNewTimesContent(
    $: cheerio.CheerioAPI,
    url: string
  ) {
    const candidates = [
      '.article-body',
      '.story-body',
      '.article-content',
      '#article-content',
      '.article-details',
      '.article-detail',
      '.field-name-body',
      '.entry-content',
      '.post-content',
      '[class*="article-body"]',
      '[class*="article-content"]',
      'main article',
      'article'
    ];

    for (
      const selector of candidates
    ) {
      const container =
        $(selector).first();

      if (
        container.length === 0
      ) {
        continue;
      }

      const clone =
        container.clone();

      clone.find(
        [
          'nav',
          'footer',
          'header',
          'aside',
          'script',
          'style',
          'noscript',
          'iframe',
          'form',
          '.breadcrumb',
          '.share',
          '.social-share',
          '.most-read',
          '.latest',
          '.related',
          '.related-posts',
          '.post-navigation',
          '.navigation',
          '.sidebar',
          '.comments',
          '#comments',
          '.author-box',
          '.newsletter',
          '[class*="most-read"]',
          '[class*="related"]'
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
          `[NewTimes] Content extraction failed `
          + `selector=${selector} url=${url}`,
          error
        );
      }
    }

    /**
     * DOM-order fallback preserving inline image position.
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
      $('<div id="newtimes-adapter-content-fallback"></div>');

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
              '.share',
              '.social-share',
              '.most-read',
              '.latest',
              '.related',
              '.related-posts',
              '.post-navigation',
              '.navigation',
              '.sidebar',
              '.comments',
              '.author-box'
            ].join(',')
          ).length > 0
        ) {
          return;
        }

        if (
          node.is('img')
          && node.closest(
            'figure'
          ).length > 0
        ) {
          return;
        }

        const text =
          normalizeWhitespace(
            node.text()
          );

        if (
          !node.is('img, figure')
          && text.length < 2
        ) {
          return;
        }

        wrapper.append(
          node.clone()
        );
      });

    $('body').append(wrapper);

    const fallback =
      this.extractContentBlocks(
        $,
        wrapper,
        url
      );

    if (
      fallback.bodyText
      && fallback.bodyText.length >= 50
    ) {
      return fallback;
    }

    /**
     * Last deterministic text fallback:
     * Some New Times article templates expose articleBody in structured data
     * even when the visible body wrapper changes.
     *
     * We can preserve the text, but no fake image positions are created here.
     */
    const jsonLdBody =
      this.extractJsonLdArticleBody($);

    if (jsonLdBody) {
      const jsonWrapper =
        $('<div id="newtimes-jsonld-body-fallback"></div>');

      jsonLdBody
        .split(/\n{2,}/)
        .map(part =>
          normalizeWhitespace(part)
        )
        .filter(part =>
          part.length > 0
        )
        .forEach(part => {
          const paragraph =
            $('<p></p>').text(part);

          jsonWrapper.append(
            paragraph
          );
        });

      $('body').append(jsonWrapper);

      return this.extractContentBlocks(
        $,
        jsonWrapper,
        url
      );
    }

    return fallback;
  }

  private detectTaxonomy(
    url: string,
    hint?: DiscoveredArticleHint
  ): {
    sourceSection: string;
    sourceSubcategory?: string;
    portalCategoryId: string;
  } {
    const taxonomy =
      parseArticleTaxonomy(url);

    const sourceSection =
      taxonomy.group
      || hint?.section
      || 'news';

    const sourceSubcategory =
      taxonomy.category
      || hint?.subcategory;

    let portalCategoryId =
      'rwanda';

    if (
      sourceSection === 'news'
    ) {
      const category =
        (
          sourceSubcategory
          || ''
        ).toLowerCase();

      if (
        [
          'business',
          'economy',
          'finance',
          'housing',
          'aviation',
          'tourism',
          'energy',
          'infrastructure'
        ].includes(category)
      ) {
        portalCategoryId =
          'economy';
      } else if (
        [
          'technology',
          'science'
        ].includes(category)
      ) {
        portalCategoryId =
          'tech';
      } else if (
        category === 'africa'
      ) {
        portalCategoryId =
          'africa';
      } else if (
        category ===
        'international'
      ) {
        portalCategoryId =
          'world';
      }
    } else if (
      sourceSection === 'sports'
      && sourceSubcategory ===
        'afcon-2023'
    ) {
      portalCategoryId =
        'africa';
    }

    return {
      sourceSection,
      sourceSubcategory,
      portalCategoryId
    };
  }

  async parseArticle(
    html: string,
    url: string,
    hints?: DiscoveredArticleHint
  ): Promise<ParsedArticle | null> {
    try {
      const $ =
        cheerio.load(html);

      const meta =
        this.getMetadata();

      const normalizedUrl =
        normalizeUrl(
          url,
          meta.homeUrl
        );

      if (
        !isNewTimesArticleUrl(
          normalizedUrl
        )
      ) {
        console.warn(
          `[NewTimes] Reject: invalid article URL ${url}`
        );

        return null;
      }

      const hint =
        hints
        || NewTimesAdapter.hintByUrl.get(
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
            'h1.title, h1.article-title, h1.story-title, main h1, article h1, h1'
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
          `[NewTimes] Reject: missing title ${url}`
        );

        return null;
      }

      const subtitle =
        normalizeWhitespace(
          $(
            '.article-subtitle, .subtitle, .summary, .lead, .article-summary, .story-summary'
          )
            .first()
            .text()
        )
        || $('meta[name="description"]')
          .attr('content')
          ?.trim()
        || undefined;

      let publishedAt =
        parseDateCandidate(
          $('time[datetime]')
            .first()
            .attr('datetime')
          || $('meta[property="article:published_time"]')
            .attr('content')
          || $('meta[name="publication_date"]')
            .attr('content')
          || $('meta[name="date"]')
            .attr('content')
          || $('[itemprop="datePublished"]')
            .first()
            .attr('content')
          || $('[itemprop="datePublished"]')
            .first()
            .attr('datetime')
          || $('.article-date, .published-date, .published, time')
            .first()
            .text()
        );

      if (!publishedAt) {
        publishedAt =
          this.extractJsonLdDate($);
      }

      if (!publishedAt) {
        const topText =
          normalizeWhitespace(
            $('main, article, body')
              .first()
              .text()
              .slice(0, 5000)
          );

        publishedAt =
          parseDateCandidate(
            extractVisibleDate(
              topText
            )
          );
      }

      if (
        !publishedAt
        && hint?.publishedAtHint
      ) {
        publishedAt =
          parseDateCandidate(
            hint.publishedAtHint
          );
      }

      // Never fabricate publication date.
      if (!publishedAt) {
        console.warn(
          `[NewTimes] Reject: missing publication date ${url}`
        );

        return null;
      }

      let author =
        normalizeWhitespace(
          $(
            '.author-name, .byline, .author, [rel="author"], .article-author, .story-author'
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
          this.extractJsonLdAuthor($);
      }

      const taxonomy =
        this.detectTaxonomy(
          canonicalUrl
          || normalizedUrl,
          hint
        );

      const {
        contentBlocks,
        imageUrls,
        leadImageUrl,
        bodyText
      } =
        this.extractNewTimesContent(
          $,
          canonicalUrl
          || normalizedUrl
        );

      if (
        !bodyText
        || bodyText.length < 50
      ) {
        console.warn(
          `[NewTimes] Reject: body too short `
          + `(${bodyText?.length || 0} chars) ${url}`
        );

        return null;
      }

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
              canonicalUrl
              || normalizedUrl
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

      const htmlLanguage =
        $('html')
          .attr('lang')
          ?.toLowerCase()
          .split('-')[0];

      const originalLanguage =
        htmlLanguage
        && [
          'en',
          'rw',
          'fr',
          'sw'
        ].includes(htmlLanguage)
          ? htmlLanguage
          : meta.defaultLanguage;

      return this.normalizeArticle({
        sourceId: meta.id,
        sourceUrl: normalizedUrl,
        canonicalUrl,
        originalLanguage,
        originalTitle: title,
        originalSubtitle: subtitle,
        originalBody: bodyText,
        author,
        publishedAt,
        sourceSection:
          taxonomy.sourceSection,
        sourceSubcategory:
          taxonomy.sourceSubcategory,
        portalCategoryId:
          taxonomy.portalCategoryId,
        leadImageUrl:
          finalLeadImage,
        imageUrls:
          uniqueImageUrls,
        contentBlocks
      });
    } catch (error) {
      console.error(
        `[NewTimes] parseArticle exception: ${url}`,
        error
      );

      return null;
    }
  }
}

export default new NewTimesAdapter();
