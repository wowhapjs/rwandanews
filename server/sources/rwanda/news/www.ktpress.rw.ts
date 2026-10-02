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

type KtPressDiscoveryRoot = {
  id: string;
  name: string;
  group: 'news' | 'business' | 'special-reports' | 'voices' | 'sports' | 'society' | 'showbiz';
  path: string;
  portalCategoryId?: string;
};

/**
 * KT Press current taxonomy:
 *
 * News
 *   - National
 *   - Regional
 *   - International
 *
 * Business & Tech
 *   - Companies
 *   - Economy
 *   - Markets
 *   - Technology
 *
 * Standalone
 *   - Special Reports
 *   - Voices
 *   - Sports
 *   - Society
 *   - ShowBiz
 *
 * We intentionally crawl BOTH the parent archives and their child archives.
 * Some posts can be assigned directly to a parent category, while other posts
 * are only exposed through a child archive.
 *
 * Duplicate article URLs are globally deduplicated across all roots.
 */
const DISCOVERY_ROOTS: KtPressDiscoveryRoot[] = [
  // News parent + all children
  {
    id: 'news',
    name: 'News',
    group: 'news',
    path: '/category/news/',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'national',
    name: 'National',
    group: 'news',
    path: '/category/news/national/',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'regional',
    name: 'Regional',
    group: 'news',
    path: '/category/news/regional/',
    portalCategoryId: 'africa'
  },
  {
    id: 'international',
    name: 'International',
    group: 'news',
    path: '/category/news/international/',
    portalCategoryId: 'world'
  },

  // Business & Tech parent + all children
  {
    id: 'business',
    name: 'Business & Tech',
    group: 'business',
    path: '/category/business/',
    portalCategoryId: 'economy'
  },
  {
    id: 'companies',
    name: 'Companies',
    group: 'business',
    path: '/category/business/companies/',
    portalCategoryId: 'economy'
  },
  {
    id: 'economy',
    name: 'Economy',
    group: 'business',
    path: '/category/business/economy/',
    portalCategoryId: 'economy'
  },
  {
    id: 'markets',
    name: 'Markets',
    group: 'business',
    path: '/category/business/markets/',
    portalCategoryId: 'economy'
  },
  {
    id: 'technology',
    name: 'Technology',
    group: 'business',
    path: '/category/business/tech/',
    portalCategoryId: 'tech'
  },

  // Standalone top-level categories
  {
    id: 'special-reports',
    name: 'Special Reports',
    group: 'special-reports',
    path: '/category/special-reports/',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'voices',
    name: 'Voices',
    group: 'voices',
    path: '/category/voices/',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'sports',
    name: 'Sports',
    group: 'sports',
    path: '/category/sports/',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'society',
    name: 'Society',
    group: 'society',
    path: '/category/society/',
    portalCategoryId: 'rwanda'
  },
  {
    id: 'showbiz',
    name: 'ShowBiz',
    group: 'showbiz',
    path: '/category/showbiz/',
    portalCategoryId: 'rwanda'
  }
];

function parseDateCandidate(value?: string | null): string | undefined {
  if (!value) return undefined;

  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return undefined;

  const parsed = parseDateSafely(cleaned);
  if (parsed) return parsed;

  // KT Press uses strings like "September 17, 2026".
  const ms = Date.parse(cleaned);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
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

function extractVisibleDate(text: string): string | undefined {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned) return undefined;

  const patterns = [
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i,
    /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return match[0];
  }

  return undefined;
}

function isKtPressArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host !== 'ktpress.rw') return false;

    // Current KT Press article URLs are date-based WordPress permalinks:
    // /2026/09/article-slug/
    return /^\/\d{4}\/\d{2}\/[^/]+\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export class KtPressAdapter extends BaseSourceAdapter {
  /**
   * Used only as a convenience within a worker. parseArticle() must NOT depend
   * exclusively on it because discovery and parsing may use different workers.
   */
  private static readonly hintByUrl = new Map<string, DiscoveredArticleHint>();

  getMetadata(): SourceMetadata {
    return {
      id: 'ktpress',
      domain: 'www.ktpress.rw',
      name: 'KT Press',
      region: 'rwanda',
      type: 'news',
      defaultLanguage: 'en',
      homeUrl: 'https://www.ktpress.rw',
      enabled: true,

      /**
       * Expose all real collection roots in source metadata so the Sources UI
       * accurately represents what is being crawled.
       */
      sections: DISCOVERY_ROOTS.map(root => ({
        id: root.id,
        name: root.name,
        path: root.path
      }))
    };
  }

  /**
   * Find the date/title belonging to the specific archive card for an article.
   * The site exposes date text in each category listing.
   */
  private getListingMetadata(
    $: cheerio.CheerioAPI,
    link: cheerio.Cheerio<any>,
    articleUrl: string
  ): {
    titleHint?: string;
    publishedAtHint?: string;
  } {
    let node = link;
    let titleHint = normalizeWhitespace(link.text()) || undefined;

    for (let depth = 0; depth < 8 && node.length > 0; depth++) {
      const localArticleUrls = new Set<string>();

      node.find('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        try {
          const candidate = normalizeUrl(href, this.getMetadata().homeUrl);
          if (isKtPressArticleUrl(candidate)) {
            localArticleUrls.add(candidate);
          }
        } catch {
          // Ignore malformed archive links.
        }
      });

      if (node.is('a[href]')) {
        const href = node.attr('href');
        if (href) {
          try {
            const candidate = normalizeUrl(href, this.getMetadata().homeUrl);
            if (isKtPressArticleUrl(candidate)) {
              localArticleUrls.add(candidate);
            }
          } catch {
            // Ignore.
          }
        }
      }

      const containsAnotherArticle =
        [...localArticleUrls].some(candidate => candidate !== articleUrl);

      if (!containsAnotherArticle) {
        if (!titleHint || titleHint.length < 4) {
          titleHint =
            normalizeWhitespace(
              node.find('h1, h2, h3, h4, .entry-title, .post-title')
                .first()
                .text()
            ) || titleHint;
        }

        const dateRaw =
          node.find(
            'time, .entry-date, .post-date, .posted-on, .date, [class*="date"]'
          ).first().attr('datetime')
          || node.find(
            'time, .entry-date, .post-date, .posted-on, .date, [class*="date"]'
          ).first().text()
          || extractVisibleDate(node.text());

        const publishedAtHint = parseDateCandidate(dateRaw);

        if (publishedAtHint) {
          return {
            titleHint,
            publishedAtHint
          };
        }
      }

      node = node.parent();
    }

    return { titleHint };
  }

  private findNextPageUrl(
    $: cheerio.CheerioAPI,
    currentPageUrl: string,
    root: KtPressDiscoveryRoot
  ): string | undefined {
    const meta = this.getMetadata();
    const candidates: string[] = [];

    const push = (href?: string) => {
      if (!href) return;

      try {
        candidates.push(normalizeUrl(href, meta.homeUrl));
      } catch {
        // ignore
      }
    };

    push($('a[rel="next"]').first().attr('href'));
    push(
      $('a.next, a.next.page-numbers, .nav-links a.next, .pagination a.next')
        .first()
        .attr('href')
    );

    // KT Press labels pagination "Older Posts".
    $('a[href]').each((_, el) => {
      const text = normalizeWhitespace($(el).text()).toLowerCase();

      if (
        text === 'older posts'
        || text === 'next'
        || text === 'next →'
      ) {
        push($(el).attr('href'));
      }
    });

    const rootPath = new URL(root.path, meta.homeUrl).pathname.replace(/\/+$/, '/');

    for (const candidate of candidates) {
      if (candidate === currentPageUrl) continue;
      if (isKtPressArticleUrl(candidate)) continue;

      const parsed = new URL(candidate);
      if (parsed.hostname !== meta.domain) continue;

      const candidatePath = parsed.pathname.replace(/\/+$/, '/');

      if (
        candidatePath === rootPath
        || candidatePath.startsWith(`${rootPath}page/`)
      ) {
        return candidate;
      }
    }

    return undefined;
  }

  async discoverArticles(options: DiscoveryOptions): Promise<DiscoveryResult> {
    const meta = this.getMetadata();
    const discovered: DiscoveredArticleHint[] = [];

    /**
     * Global across ALL 14 roots.
     * The same KT Press article is frequently assigned to more than one category.
     */
    const seenUrls = new Set<string>();

    const maxPagesPerRoot =
      options.maxPagesPerSection
      || (options.mode === 'backfill' ? 50 : 2);

    let oldestDateReached: Date | undefined;
    let lastSuccessfulPage = 1;
    let completed = true;

    for (const root of DISCOVERY_ROOTS) {
      let pageNumber = 1;
      let pageUrl = `${meta.homeUrl}${root.path}`;
      let consecutiveOldPages = 0;

      const seenRootPages = new Set<string>();
      const seenPageSignatures = new Set<string>();

      for (let visited = 0; visited < maxPagesPerRoot; visited++) {
        if (seenRootPages.has(pageUrl)) break;
        seenRootPages.add(pageUrl);

        try {
          const html = await this.fetchArticle(pageUrl);
          const $ = cheerio.load(html);

          lastSuccessfulPage = Math.max(lastSuccessfulPage, pageNumber);

          const pageArticleUrls = new Set<string>();
          const pageHints: DiscoveredArticleHint[] = [];
          let pageHasCurrentOrNewer = false;

          /**
           * Use broad heading/image/read-more candidates, but only accept URLs
           * matching the verified date-based article permalink format.
           */
          $(
            [
              'article a[href]',
              '.post a[href]',
              '.entry-title a[href]',
              '.post-title a[href]',
              'h2 a[href]',
              'h3 a[href]',
              '.jeg_post_title a[href]',
              '.read-more a[href]'
            ].join(',')
          ).each((_, el) => {
            const link = $(el);
            const href = link.attr('href');
            if (!href) return;

            let articleUrl: string;

            try {
              articleUrl = normalizeUrl(href, meta.homeUrl);
            } catch {
              return;
            }

            if (!isKtPressArticleUrl(articleUrl)) return;
            if (pageArticleUrls.has(articleUrl)) return;

            pageArticleUrls.add(articleUrl);

            const {
              titleHint,
              publishedAtHint
            } = this.getListingMetadata($, link, articleUrl);

            if (publishedAtHint) {
              const articleDate = new Date(publishedAtHint);

              if (!oldestDateReached || articleDate < oldestDateReached) {
                oldestDateReached = articleDate;
              }

              if (!options.cutoffDate || articleDate >= options.cutoffDate) {
                pageHasCurrentOrNewer = true;
              }
            } else {
              // Unknown list date => detail page must be inspected.
              pageHasCurrentOrNewer = true;
            }

            const hint: DiscoveredArticleHint = {
              url: articleUrl,

              // Preserve both levels of source taxonomy.
              section: root.group,
              subcategory: root.id,

              publishedAtHint,
              titleHint
            };

            KtPressAdapter.hintByUrl.set(articleUrl, hint);

            if (!seenUrls.has(articleUrl)) {
              seenUrls.add(articleUrl);
              pageHints.push(hint);
            }
          });

          /**
           * Page signature must use every article URL on this page, not just
           * globally new URLs, so a broken pagination link returning page 1 is
           * detected correctly.
           */
          const signature = [...pageArticleUrls].sort().join('|');

          if (signature && seenPageSignatures.has(signature)) {
            console.warn(
              `[KTPress] Repeated archive page root=${root.id} url=${pageUrl}`
            );
            break;
          }

          if (signature) {
            seenPageSignatures.add(signature);
          }

          discovered.push(...pageHints);

          if (pageArticleUrls.size === 0) {
            console.warn(
              `[KTPress] No valid article URLs root=${root.id} url=${pageUrl}`
            );
            break;
          }

          if (options.cutoffDate) {
            if (!pageHasCurrentOrNewer) {
              consecutiveOldPages += 1;

              // Safety against featured/pinned/out-of-order content.
              if (consecutiveOldPages >= 2) break;
            } else {
              consecutiveOldPages = 0;
            }
          }

          /**
           * Incremental mode checks up to the first two pages of EVERY root.
           * Do NOT use global discovered.length here; doing so caused later
           * categories to be skipped.
           */
          if (options.mode === 'incremental' && visited >= 1) {
            break;
          }

          const nextPageUrl =
            this.findNextPageUrl($, pageUrl, root);

          if (!nextPageUrl) {
            break;
          }

          pageUrl = nextPageUrl;
          pageNumber += 1;
        } catch (error) {
          completed = false;

          console.error(
            `[KTPress] Discovery failed `
            + `root=${root.id} page=${pageNumber} url=${pageUrl}`,
            error
          );

          // One category failure must not stop other categories.
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

  private detectDetailTaxonomy(
    $: cheerio.CheerioAPI,
    hint?: DiscoveredArticleHint
  ): {
    sourceSection: string;
    sourceSubcategory?: string;
    portalCategoryId: string;
  } {
    const categoryNames: string[] = [];
    const categoryPaths: string[] = [];

    $('a[href*="/category/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      let normalized: string;

      try {
        normalized = normalizeUrl(href, this.getMetadata().homeUrl);
      } catch {
        return;
      }

      const parsed = new URL(normalized);
      if (parsed.hostname !== this.getMetadata().domain) return;

      const text = normalizeWhitespace($(el).text());
      if (text) categoryNames.push(text);
      categoryPaths.push(parsed.pathname);
    });

    const rootFromHint =
      hint?.subcategory
        ? DISCOVERY_ROOTS.find(root => root.id === hint.subcategory)
        : undefined;

    let sourceSection =
      hint?.section
      || rootFromHint?.group
      || 'news';

    let sourceSubcategory =
      hint?.subcategory
      || rootFromHint?.id;

    /**
     * If no usable discovery hint reached this worker, infer taxonomy from
     * detail-page category links.
     */
    if (!hint) {
      const matchedRoot = DISCOVERY_ROOTS.find(root =>
        categoryPaths.some(path => {
          const rootPath = new URL(
            root.path,
            this.getMetadata().homeUrl
          ).pathname.replace(/\/+$/, '/');

          return path.replace(/\/+$/, '/') === rootPath;
        })
      );

      if (matchedRoot) {
        sourceSection = matchedRoot.group;
        sourceSubcategory = matchedRoot.id;
      }
    }

    let portalCategoryId =
      rootFromHint?.portalCategoryId
      || 'rwanda';

    const taxonomyText =
      `${sourceSection} ${sourceSubcategory || ''} ${categoryNames.join(' ')}`
        .toLowerCase();

    if (
      taxonomyText.includes('technology')
      || taxonomyText.includes('tech')
    ) {
      portalCategoryId = 'tech';
    } else if (
      taxonomyText.includes('business')
      || taxonomyText.includes('economy')
      || taxonomyText.includes('market')
      || taxonomyText.includes('companies')
    ) {
      portalCategoryId = 'economy';
    } else if (
      taxonomyText.includes('international')
    ) {
      portalCategoryId = 'world';
    } else if (
      taxonomyText.includes('regional')
    ) {
      portalCategoryId = 'africa';
    }

    return {
      sourceSection,
      sourceSubcategory,
      portalCategoryId
    };
  }

  private extractKtPressContent(
    $: cheerio.CheerioAPI,
    url: string
  ) {
    const candidates = [
      '.entry-content',
      '.post-content',
      '.single-post-content',
      '.article-content',
      '.content-inner',
      '.jeg_inner_content',
      'article .content',
      'main article',
      'article'
    ];

    for (const selector of candidates) {
      const container = $(selector).first();
      if (container.length === 0) continue;

      const clone = container.clone();

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
          '.breadcrumb',
          '.post-meta',
          '.entry-meta',
          '.share',
          '.social-share',
          '.related',
          '.related-posts',
          '.post-navigation',
          '.navigation',
          '.sidebar',
          '.comments',
          '#comments',
          '.author-box',
          '.author-info',
          '.post-tags'
        ].join(',')
      ).remove();

      try {
        const result = this.extractContentBlocks($, clone, url);

        if (result.bodyText && result.bodyText.length >= 50) {
          return result;
        }
      } catch (error) {
        console.warn(
          `[KTPress] Content extraction failed selector=${selector} url=${url}`,
          error
        );
      }
    }

    /**
     * Final fallback:
     * Rebuild meaningful document-order blocks so inline photos remain in their
     * approximate original positions.
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
      $('<div id="ktpress-adapter-content-fallback"></div>');

    source.find('p, h2, h3, h4, blockquote, figure, img').each((_, el) => {
      const node = $(el);

      if (
        node.closest(
          [
            'nav',
            'footer',
            'header',
            'aside',
            '.breadcrumb',
            '.entry-meta',
            '.post-meta',
            '.share',
            '.social-share',
            '.related',
            '.post-navigation',
            '.sidebar',
            '.author-box'
          ].join(',')
        ).length > 0
      ) {
        return;
      }

      // figure already contains its own image.
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

      const normalizedUrl =
        normalizeUrl(url, meta.homeUrl);

      const hint =
        hints
        || KtPressAdapter.hintByUrl.get(normalizedUrl);

      const title =
        normalizeWhitespace(
          $('h1.entry-title, h1.post-title, main h1, article h1, h1')
            .first()
            .text()
        )
        || $('meta[property="og:title"]').attr('content')?.trim()
        || hint?.titleHint
        || '';

      if (!title) {
        console.warn(`[KTPress] Reject: missing title url=${url}`);
        return null;
      }

      const subtitle =
        normalizeWhitespace(
          $('.entry-sub-title, .subtitle, .post-subtitle, .lead, .entry-summary')
            .first()
            .text()
        )
        || undefined;

      let publishedAt =
        parseDateCandidate(
          $('time[datetime]').first().attr('datetime')
          || $('meta[property="article:published_time"]').attr('content')
          || $('meta[name="publication_date"]').attr('content')
          || $('meta[name="date"]').attr('content')
          || $('[itemprop="datePublished"]').first().attr('content')
          || $('[itemprop="datePublished"]').first().attr('datetime')
          || $('.posted-on time, .entry-date, .post-date')
            .first()
            .text()
        );

      if (!publishedAt) {
        $('script[type="application/ld+json"]').each((_, el) => {
          if (publishedAt) return;

          try {
            const json = JSON.parse($(el).html() || '{}');
            publishedAt =
              parseDateCandidate(findDatePublished(json));
          } catch {
            // Ignore malformed JSON-LD.
          }
        });
      }

      if (!publishedAt) {
        const topText =
          normalizeWhitespace(
            $('main article, article, main')
              .first()
              .text()
              .slice(0, 2500)
          );

        publishedAt =
          parseDateCandidate(extractVisibleDate(topText));
      }

      if (!publishedAt && hint?.publishedAtHint) {
        publishedAt =
          parseDateCandidate(hint.publishedAtHint);
      }

      // Never fabricate publication dates.
      if (!publishedAt) {
        console.warn(
          `[KTPress] Reject: missing publication date url=${url}`
        );
        return null;
      }

      const author =
        normalizeWhitespace(
          $(
            '.author-name, .byline, .author .vcard, .author.vcard, [rel="author"], .post-author'
          )
            .first()
            .text()
        )
        || $('meta[name="author"]').attr('content')?.trim()
        || undefined;

      const canonicalUrl =
        extractCanonicalUrl(html, normalizedUrl);

      const taxonomy =
        this.detectDetailTaxonomy($, hint);

      const {
        contentBlocks,
        imageUrls,
        leadImageUrl,
        bodyText
      } = this.extractKtPressContent($, normalizedUrl);

      if (!bodyText || bodyText.length < 50) {
        console.warn(
          `[KTPress] Reject: body too short `
          + `(${bodyText?.length || 0} chars) url=${url}`
        );
        return null;
      }

      const ogImage =
        extractBestImageUrl(
          {
            src:
              $('meta[property="og:image"]').attr('content')
              || $('meta[name="twitter:image"]').attr('content')
              || undefined
          },
          normalizedUrl
        );

      const finalLeadImage =
        leadImageUrl || ogImage || undefined;

      const uniqueImageUrls =
        [...new Set(imageUrls)];

      if (
        finalLeadImage
        && !uniqueImageUrls.includes(finalLeadImage)
      ) {
        uniqueImageUrls.unshift(finalLeadImage);
      }

      return this.normalizeArticle({
        sourceId: meta.id,
        sourceUrl: normalizedUrl,
        canonicalUrl,
        originalLanguage: 'en',
        originalTitle: title,
        originalSubtitle: subtitle,
        originalBody: bodyText,
        author,
        publishedAt,

        sourceSection: taxonomy.sourceSection,
        sourceSubcategory: taxonomy.sourceSubcategory,

        portalCategoryId: taxonomy.portalCategoryId,

        leadImageUrl: finalLeadImage,
        imageUrls: uniqueImageUrls,
        contentBlocks
      });
    } catch (error) {
      console.error(
        `[KTPress] parseArticle exception url=${url}`,
        error
      );

      return null;
    }
  }
}

export default new KtPressAdapter();
