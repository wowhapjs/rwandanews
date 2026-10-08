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

function parseDateCandidate(value?: string | null): string | undefined {
  if (!value) return undefined;

  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return undefined;

  const parsed = parseDateSafely(cleaned);
  if (parsed) return parsed;

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

function isRdbArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    if (hostname !== 'rdb.rw') return false;

    const parts = parsed.pathname.split('/').filter(Boolean);

    // Current RDB press-release articles use a single root-level WordPress slug.
    if (parts.length !== 1) return false;

    const blocked = new Set([
      'media',
      'category',
      'author',
      'tag',
      'feed',
      'contact-us',
      'about-rdb',
      'careers',
      'publications',
      'investment',
      'tourism',
      'export',
      'e-services'
    ]);

    return !blocked.has(parts[0].toLowerCase());
  } catch {
    return false;
  }
}

export class RdbAdapter extends BaseSourceAdapter {
  private static readonly hintByUrl = new Map<string, DiscoveredArticleHint>();

  getMetadata(): SourceMetadata {
    return {
      id: 'rdb',
      domain: 'rdb.rw',
      name: 'Rwanda Development Board (RDB)',
      region: 'rwanda',
      type: 'government',
      defaultLanguage: 'en',
      homeUrl: 'https://rdb.rw',
      enabled: true,
      sections: [
        {
          id: 'news-press-release',
          name: 'News & Press Release',
          path: '/category/news-press-release/'
        }
      ]
    };
  }

  async discoverArticles(options: DiscoveryOptions): Promise<DiscoveryResult> {
    const meta = this.getMetadata();
    const section = meta.sections[0];

    const discovered: DiscoveredArticleHint[] = [];
    const seenUrls = new Set<string>();
    const seenPageSignatures = new Set<string>();

    const maxPages =
      options.maxPagesPerSection
      || (options.mode === 'backfill' ? 30 : 2);

    const startPage = Math.max(1, options.checkpointPage || 1);

    let oldestDateReached: Date | undefined;
    let lastSuccessfulPage = startPage;
    let completed = true;
    let consecutiveOldPages = 0;

    for (let page = startPage; page <= maxPages; page++) {
      const pageUrl =
        page === 1
          ? `${meta.homeUrl}${section.path}`
          : `${meta.homeUrl}${section.path}page/${page}/`;

      try {
        const html = await this.fetchArticle(pageUrl);
        const $ = cheerio.load(html);
        lastSuccessfulPage = page;

        const pageRefs: DiscoveredArticleHint[] = [];
        const pageArticleUrls = new Set<string>();
        let pageHasCurrentOrNewer = false;

        /**
         * The archive is WordPress-based. Instead of depending on one Elementor
         * class, inspect heading/read-article links and keep only valid root-level
         * RDB article slugs.
         */
        const links = $(
          [
            'main h2 a[href]',
            'main h3 a[href]',
            'article h2 a[href]',
            'article h3 a[href]',
            '.entry-title a[href]',
            '.post-title a[href]',
            '.elementor-post__title a[href]',
            'a.elementor-post__read-more[href]'
          ].join(',')
        );

        links.each((_, el) => {
          const link = $(el);
          const href = link.attr('href');
          if (!href) return;

          const fullUrl = normalizeUrl(href, meta.homeUrl);
          if (!isRdbArticleUrl(fullUrl)) return;
          if (pageArticleUrls.has(fullUrl)) return;

          pageArticleUrls.add(fullUrl);

          // Walk upward until the archive item's visible date is found.
          let node = link;
          let publishedAtHint: string | undefined;
          let titleHint = normalizeWhitespace(link.text()) || undefined;

          for (let depth = 0; depth < 7 && node.length > 0; depth++) {
            if (!titleHint) {
              titleHint =
                normalizeWhitespace(
                  node.find('h1, h2, h3, .entry-title, .post-title')
                    .first()
                    .text()
                ) || undefined;
            }

            const dateRaw =
              node.find(
                'time, .entry-date, .post-date, .elementor-post-date, .posted-on, [class*="date"]'
              ).first().attr('datetime')
              || node.find(
                'time, .entry-date, .post-date, .elementor-post-date, .posted-on, [class*="date"]'
              ).first().text()
              || extractVisibleDate(node.text());

            publishedAtHint = parseDateCandidate(dateRaw);
            if (publishedAtHint) break;

            node = node.parent();
          }

          if (publishedAtHint) {
            const articleDate = new Date(publishedAtHint);

            if (!oldestDateReached || articleDate < oldestDateReached) {
              oldestDateReached = articleDate;
            }

            if (!options.cutoffDate || articleDate >= options.cutoffDate) {
              pageHasCurrentOrNewer = true;
            }
          } else {
            pageHasCurrentOrNewer = true;
          }

          const hint: DiscoveredArticleHint = {
            url: fullUrl,
            section: section.id,
            publishedAtHint,
            titleHint
          };

          RdbAdapter.hintByUrl.set(fullUrl, hint);

          if (!seenUrls.has(fullUrl)) {
            seenUrls.add(fullUrl);
            pageRefs.push(hint);
          }
        });

        const signature = [...pageArticleUrls].sort().join('|');
        if (signature && seenPageSignatures.has(signature)) {
          console.warn(`[RDB] Repeated archive page: ${pageUrl}`);
          break;
        }
        if (signature) seenPageSignatures.add(signature);

        discovered.push(...pageRefs);

        if (pageRefs.length === 0) {
          console.warn(`[RDB] No article URLs found: ${pageUrl}`);
          break;
        }

        if (options.cutoffDate) {
          if (!pageHasCurrentOrNewer) {
            consecutiveOldPages += 1;
            if (consecutiveOldPages >= 2) break;
          } else {
            consecutiveOldPages = 0;
          }
        }

        if (options.mode === 'incremental' && page - startPage >= 1) {
          break;
        }
      } catch (error) {
        completed = false;
        console.error(
          `[RDB] discoverArticles failed page=${page} url=${pageUrl}`,
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

  private extractContentSafely(
    $: cheerio.CheerioAPI,
    url: string
  ): ReturnType<BaseSourceAdapter['extractContentBlocks']> {
    const candidates = [
      '.elementor-widget-theme-post-content',
      '.entry-content',
      '.post-content',
      '.single-post-content',
      '.article-content',
      'article .content',
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
          '.breadcrumb', '.navigation', '.post-navigation',
          '.related', '.recent-posts',
          '.share', '.social-share',
          '.sidebar', '.comments', '#comments'
        ].join(',')
      ).remove();

      try {
        const result = this.extractContentBlocks($, clone, url);
        if (result.bodyText && result.bodyText.length >= 50) {
          return result;
        }
      } catch (error) {
        console.warn(`[RDB] content extraction candidate failed (${selector})`, error);
      }
    }

    /**
     * Elementor layouts can wrap every paragraph/image several levels deep.
     * Build a clean synthetic container from meaningful nodes in document order,
     * then let the common BaseSourceAdapter generate the standard contentBlocks.
     */
    const source =
      $('main').first().length > 0
        ? $('main').first()
        : $('article').first().length > 0
          ? $('article').first()
          : $('body');

    const wrapper = $('<div id="rdb-adapter-fallback-content"></div>');

    source.find('p, h2, h3, blockquote, figure, img').each((_, el) => {
      const node = $(el);

      if (
        node.closest(
          'nav, footer, header, aside, .breadcrumb, .navigation, .related, .share, .social-share, .sidebar'
        ).length > 0
      ) return;

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
      const hint = hints || RdbAdapter.hintByUrl.get(normalizedUrl);

      const title =
        normalizeWhitespace(
          $('h1.entry-title, h1.elementor-heading-title, main h1, article h1, h1')
            .first()
            .text()
        )
        || $('meta[property="og:title"]').attr('content')?.trim()
        || hint?.titleHint
        || '';

      if (!title) {
        console.warn(`[RDB] Reject: missing title: ${url}`);
        return null;
      }

      const subtitle =
        normalizeWhitespace(
          $('.entry-sub-title, .subtitle, .lead, .elementor-text-editor.lead')
            .first()
            .text()
        ) || undefined;

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
            // continue
          }
        });
      }

      if (!publishedAt) {
        const nearTopText = normalizeWhitespace(
          $('main, article, .site-main').first().text().slice(0, 2500)
        );
        publishedAt = parseDateCandidate(extractVisibleDate(nearTopText));
      }

      if (!publishedAt && hint?.publishedAtHint) {
        publishedAt = parseDateCandidate(hint.publishedAtHint);
      }

      if (!publishedAt) {
        console.warn(`[RDB] Reject: missing publication date: ${url}`);
        return null;
      }

      const canonicalUrl = extractCanonicalUrl(html, url);

      const author =
        normalizeWhitespace(
          $('.elementor-post-author, .author, [rel="author"], .byline')
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
      } = this.extractContentSafely($, url);

      if (!bodyText || bodyText.length < 50) {
        console.warn(`[RDB] Reject: body too short (${bodyText?.length || 0} chars): ${url}`);
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
      const uniqueImages = [...new Set(imageUrls)];

      if (finalLeadImage && !uniqueImages.includes(finalLeadImage)) {
        uniqueImages.unshift(finalLeadImage);
      }

      const htmlLang =
        $('html').attr('lang')?.toLowerCase().split('-')[0]
        || meta.defaultLanguage;

      const originalLanguage =
        htmlLang === 'rw' || htmlLang === 'en'
          ? htmlLang
          : meta.defaultLanguage;

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
        sourceSection: 'news-press-release',
        // RDB content spans tourism, conservation, investment, events, etc.;
        // keep the broad portal category and reclassify later.
        leadImageUrl: finalLeadImage,
        imageUrls: uniqueImages,
        contentBlocks
      });
    } catch (error) {
      console.error(`[RDB] parseArticle exception: ${url}`, error);
      return null;
    }
  }
}
