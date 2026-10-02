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

type FuturesDiscoveryRoot = {
  id: string;
  name: string;
  group: 'sector' | 'reports' | 'portals';
  path: string;
};

const PRIMARY_SECTIONS = [
  {
    id: 'ai-semiconductor',
    name: 'AI·반도체',
    path: '/ko/sectors/AI%EB%B0%98%EB%8F%84%EC%B2%B4/'
  },
  {
    id: 'technology-science',
    name: '기술·과학',
    path: '/ko/sectors/%EA%B8%B0%EC%88%A0%EA%B3%BC%ED%95%99/'
  },
  {
    id: 'industry-economy',
    name: '산업·경제',
    path: '/ko/sectors/%EC%82%B0%EC%97%85%EA%B2%BD%EC%A0%9C/'
  },
  {
    id: 'society-culture',
    name: '사회·문화',
    path: '/ko/sectors/%EC%82%AC%ED%9A%8C%EB%AC%B8%ED%99%94/'
  },
  {
    id: 'politics-governance',
    name: '정치·거버넌스',
    path: '/ko/sectors/%EC%A0%95%EC%B9%98%EA%B1%B0%EB%B2%84%EB%84%8C%EC%8A%A4/'
  },
  {
    id: 'international-security',
    name: '국제·안보',
    path: '/ko/sectors/%EA%B5%AD%EC%A0%9C%EC%95%88%EB%B3%B4/'
  },
  {
    id: 'climate-environment',
    name: '기후·환경',
    path: '/ko/sectors/%EA%B8%B0%ED%9B%84%ED%99%98%EA%B2%BD/'
  },
  {
    id: 'reports',
    name: '오피니언·리포트',
    path: '/ko/reports/'
  },
  {
    id: 'portals',
    name: '미래연구 포털',
    path: '/ko/portals/'
  }
] as const;

/**
 * IMPORTANT:
 * /ko/reports/ and /ko/portals/ are umbrella/preview pages.
 * They do NOT represent complete archives by themselves.
 *
 * To collect EVERYTHING under those two top-level areas, crawl each actual
 * child archive below. Articles duplicated across several roots are globally
 * deduplicated by normalized article URL.
 */
const DISCOVERY_ROOTS: FuturesDiscoveryRoot[] = [
  // 전망 예측 - 7 sectors
  {
    id: 'ai-semiconductor',
    name: 'AI·반도체',
    group: 'sector',
    path: '/ko/sectors/AI%EB%B0%98%EB%8F%84%EC%B2%B4/'
  },
  {
    id: 'technology-science',
    name: '기술·과학',
    group: 'sector',
    path: '/ko/sectors/%EA%B8%B0%EC%88%A0%EA%B3%BC%ED%95%99/'
  },
  {
    id: 'industry-economy',
    name: '산업·경제',
    group: 'sector',
    path: '/ko/sectors/%EC%82%B0%EC%97%85%EA%B2%BD%EC%A0%9C/'
  },
  {
    id: 'society-culture',
    name: '사회·문화',
    group: 'sector',
    path: '/ko/sectors/%EC%82%AC%ED%9A%8C%EB%AC%B8%ED%99%94/'
  },
  {
    id: 'politics-governance',
    name: '정치·거버넌스',
    group: 'sector',
    path: '/ko/sectors/%EC%A0%95%EC%B9%98%EA%B1%B0%EB%B2%84%EB%84%8C%EC%8A%A4/'
  },
  {
    id: 'international-security',
    name: '국제·안보',
    group: 'sector',
    path: '/ko/sectors/%EA%B5%AD%EC%A0%9C%EC%95%88%EB%B3%B4/'
  },
  {
    id: 'climate-environment',
    name: '기후·환경',
    group: 'sector',
    path: '/ko/sectors/%EA%B8%B0%ED%9B%84%ED%99%98%EA%B2%BD/'
  },

  // 오피니언·리포트 - crawl ALL child archives
  {
    id: 'column',
    name: '칼럼',
    group: 'reports',
    path: '/ko/reports/%EC%B9%BC%EB%9F%BC/'
  },
  {
    id: 'interview',
    name: '인터뷰',
    group: 'reports',
    path: '/ko/reports/%EC%9D%B8%ED%84%B0%EB%B7%B0/'
  },
  {
    id: 'strategy-insight',
    name: '전략 인사이트',
    group: 'reports',
    path: '/ko/reports/%EC%A0%84%EB%9E%B5-%EC%9D%B8%EC%82%AC%EC%9D%B4%ED%8A%B8/'
  },
  {
    id: 'investment-signal',
    name: '투자 시그널',
    group: 'reports',
    path: '/ko/reports/%ED%88%AC%EC%9E%90-%EC%8B%9C%EA%B7%B8%EB%84%90/'
  },
  {
    id: 'issue-report',
    name: '이슈 리포트',
    group: 'reports',
    path: '/ko/reports/%EC%9D%B4%EC%8A%88-%EB%A6%AC%ED%8F%AC%ED%8A%B8/'
  },
  {
    id: 'notice',
    name: '알림',
    group: 'reports',
    path: '/ko/reports/%EC%95%8C%EB%A6%BC/'
  },

  // 미래연구 포털 - crawl ALL child archives
  {
    id: 'conference-seminar',
    name: '컨퍼런스·세미나',
    group: 'portals',
    path: '/ko/portals/%EC%BB%A8%ED%8D%BC%EB%9F%B0%EC%8A%A4%EC%84%B8%EB%AF%B8%EB%82%98/'
  },
  {
    id: 'futures-research-materials',
    name: '미래연구 자료',
    group: 'portals',
    path: '/ko/portals/%EB%AF%B8%EB%9E%98%EC%97%B0%EA%B5%AC-%EC%9E%90%EB%A3%8C/'
  },
  {
    id: 'futures-glossary',
    name: '미래연구 용어',
    group: 'portals',
    path: '/ko/portals/%EB%AF%B8%EB%9E%98%EC%97%B0%EA%B5%AC-%EC%9A%A9%EC%96%B4/'
  },
  {
    id: 'futures-methodology',
    name: '미래연구 방법론',
    group: 'portals',
    path: '/ko/portals/%EB%AF%B8%EB%9E%98%EC%97%B0%EA%B5%AC-%EB%B0%A9%EB%B2%95%EB%A1%A0/'
  },
  {
    id: 'futurists',
    name: '미래학 연구자',
    group: 'portals',
    path: '/ko/portals/%EB%AF%B8%EB%9E%98%ED%95%99-%EC%97%B0%EA%B5%AC%EC%9E%90/'
  },
  {
    id: 'futures-institutes',
    name: '미래연구 기관',
    group: 'portals',
    path: '/ko/portals/%EB%AF%B8%EB%9E%98%EC%97%B0%EA%B5%AC-%EA%B8%B0%EA%B4%80/'
  }
];

function parseKoreanDate(value?: string | null): string | undefined {
  if (!value) return undefined;

  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return undefined;

  const parsed = parseDateSafely(cleaned);
  if (parsed) return parsed;

  // Examples:
  // 2026년 9월 15일
  // 2026. 9. 15
  // 2026-09-15
  const korean = cleaned.match(
    /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/
  );

  if (korean) {
    const [, year, month, day] = korean;
    const iso =
      `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00+09:00`;
    return iso;
  }

  const numeric = cleaned.match(
    /\b(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\b/
  );

  if (numeric) {
    const [, year, month, day] = numeric;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00+09:00`;
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

function isFuturesArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host !== 'futures.re.kr') return false;

    return /^\/ko\/articles\/[^/]+\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export class FuturesAdapter extends BaseSourceAdapter {
  private static readonly hintByUrl = new Map<string, DiscoveredArticleHint>();

  getMetadata(): SourceMetadata {
    return {
      id: 'futures',
      domain: 'futures.re.kr',
      name: 'Futures',
      region: 'korea',
      type: 'news',
      defaultLanguage: 'ko',
      homeUrl: 'https://futures.re.kr',
      enabled: true,

      // These are the NINE top-level viewer/source categories requested.
      // Discovery itself expands reports/portals to all child archives below.
      sections: PRIMARY_SECTIONS.map(section => ({
        id: section.id,
        name: section.name,
        path: section.path
      }))
    };
  }

  private findDateForArticleLink(
    $: cheerio.CheerioAPI,
    link: cheerio.Cheerio<any>,
    articleUrl: string
  ): string | undefined {
    let node = link;

    /**
     * Walk upward until the local card/container is found.
     * Stop using an ancestor as soon as it contains links to several different
     * articles, otherwise we might assign another card's date.
     */
    for (let depth = 0; depth < 8 && node.length > 0; depth++) {
      const localArticleUrls = new Set<string>();

      node.find('a[href*="/ko/articles/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        try {
          const candidate = normalizeUrl(href, this.getMetadata().homeUrl);
          if (isFuturesArticleUrl(candidate)) {
            localArticleUrls.add(candidate);
          }
        } catch {
          // ignore malformed link
        }
      });

      if (node.is('a[href*="/ko/articles/"]')) {
        const href = node.attr('href');
        if (href) {
          try {
            const candidate = normalizeUrl(href, this.getMetadata().homeUrl);
            if (isFuturesArticleUrl(candidate)) {
              localArticleUrls.add(candidate);
            }
          } catch {
            // ignore
          }
        }
      }

      const containsAnotherArticle =
        [...localArticleUrls].some(candidate => candidate !== articleUrl);

      if (!containsAnotherArticle) {
        const explicit =
          node.find(
            'time, .date, .post-date, .entry-date, .published, [class*="date"]'
          ).first().attr('datetime')
          || node.find(
            'time, .date, .post-date, .entry-date, .published, [class*="date"]'
          ).first().text();

        const explicitDate = parseKoreanDate(explicit);
        if (explicitDate) return explicitDate;

        const text = normalizeWhitespace(node.text());
        const match = text.match(/\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/);
        const textDate = parseKoreanDate(match?.[0]);

        if (textDate) return textDate;
      }

      node = node.parent();
    }

    return undefined;
  }

  private findNextPageUrl(
    $: cheerio.CheerioAPI,
    currentPageUrl: string,
    root: FuturesDiscoveryRoot
  ): string | undefined {
    const meta = this.getMetadata();
    const candidates: string[] = [];

    const pushHref = (href?: string) => {
      if (!href) return;
      try {
        candidates.push(normalizeUrl(href, meta.homeUrl));
      } catch {
        // ignore invalid URL
      }
    };

    pushHref($('a[rel="next"]').first().attr('href'));
    pushHref(
      $('a.next, a.next.page-numbers, .pagination a.next, .nav-links a.next')
        .first()
        .attr('href')
    );

    $('a[href]').each((_, el) => {
      const text = normalizeWhitespace($(el).text()).toLowerCase();
      if (
        text === '다음'
        || text === '다음 →'
        || text === 'next'
        || text === 'next →'
      ) {
        pushHref($(el).attr('href'));
      }
    });

    const current = new URL(currentPageUrl);
    const rootUrl = new URL(root.path, meta.homeUrl);
    const decodedRootPath = decodeURIComponent(rootUrl.pathname).replace(/\/+$/, '/');

    for (const candidate of candidates) {
      if (candidate === currentPageUrl) continue;
      if (isFuturesArticleUrl(candidate)) continue;

      const parsed = new URL(candidate);
      if (parsed.hostname.replace(/^www\./, '') !== meta.domain) continue;

      const decodedCandidatePath =
        decodeURIComponent(parsed.pathname).replace(/\/+$/, '/');

      // Pagination must remain inside the SAME discovery root.
      if (
        decodedCandidatePath === decodedRootPath
        || decodedCandidatePath.startsWith(`${decodedRootPath}page/`)
      ) {
        return candidate;
      }
    }

    return undefined;
  }

  private inferPortalCategory(
    root: FuturesDiscoveryRoot | undefined,
    $: cheerio.CheerioAPI
  ): string {
    if (
      root?.id === 'ai-semiconductor'
      || root?.id === 'technology-science'
    ) {
      return 'tech';
    }

    if (root?.id === 'industry-economy' || root?.id === 'investment-signal') {
      return 'economy';
    }

    const topText = normalizeWhitespace(
      $('main, article').first().text().slice(0, 1200)
    );

    if (/AI·반도체|기술·과학|인공지능|반도체/.test(topText)) {
      return 'tech';
    }

    if (/산업·경제|투자 시그널/.test(topText)) {
      return 'economy';
    }

    return 'korea';
  }

  async discoverArticles(options: DiscoveryOptions): Promise<DiscoveryResult> {
    const meta = this.getMetadata();

    const discovered: DiscoveredArticleHint[] = [];
    const seenUrls = new Set<string>();

    // GLOBAL dedupe is mandatory because one Futures article can belong to
    // several taxonomy pages.
    const seenPageSignatures = new Set<string>();

    const maxPagesPerRoot =
      options.maxPagesPerSection
      || (options.mode === 'backfill' ? 50 : 2);

    let oldestDateReached: Date | undefined;
    let lastSuccessfulPage = 1;
    let completed = true;

    for (const root of DISCOVERY_ROOTS) {
      let currentPageUrl = `${meta.homeUrl}${root.path}`;
      let currentPageNumber = 1;
      let consecutiveOldPages = 0;
      const rootSeenPages = new Set<string>();

      for (let visited = 0; visited < maxPagesPerRoot; visited++) {
        if (rootSeenPages.has(currentPageUrl)) break;
        rootSeenPages.add(currentPageUrl);

        try {
          const html = await this.fetchArticle(currentPageUrl);
          const $ = cheerio.load(html);

          lastSuccessfulPage = Math.max(
            lastSuccessfulPage,
            currentPageNumber
          );

          const pageHints: DiscoveredArticleHint[] = [];
          const pageUrls = new Set<string>();
          let pageHasCurrentOrNewer = false;

          $('a[href*="/ko/articles/"]').each((_, el) => {
            const link = $(el);
            const href = link.attr('href');
            if (!href) return;

            let articleUrl: string;

            try {
              articleUrl = normalizeUrl(href, meta.homeUrl);
            } catch {
              return;
            }

            if (!isFuturesArticleUrl(articleUrl)) return;
            if (pageUrls.has(articleUrl)) return;

            pageUrls.add(articleUrl);

            const publishedAtHint =
              this.findDateForArticleLink($, link, articleUrl);

            let titleHint = normalizeWhitespace(link.text()) || undefined;

            // Image/read-more links may have no meaningful text.
            if (!titleHint || titleHint.length < 4) {
              let node = link;
              for (let depth = 0; depth < 6 && node.length > 0; depth++) {
                const heading = normalizeWhitespace(
                  node.find('h1, h2, h3, h4').first().text()
                );

                if (heading) {
                  titleHint = heading;
                  break;
                }

                node = node.parent();
              }
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
              // Unknown date => keep for detail inspection.
              pageHasCurrentOrNewer = true;
            }

            const hint: DiscoveredArticleHint = {
              url: articleUrl,
              section: root.group,
              subcategory: root.id,
              publishedAtHint,
              titleHint
            };

            FuturesAdapter.hintByUrl.set(articleUrl, hint);

            if (!seenUrls.has(articleUrl)) {
              seenUrls.add(articleUrl);
              pageHints.push(hint);
            }
          });

          /**
           * Signature uses every article on the page, not only newly-discovered
           * URLs. This detects a broken pagination URL returning page 1 again.
           */
          const signature =
            `${root.id}:` + [...pageUrls].sort().join('|');

          if (pageUrls.size > 0 && seenPageSignatures.has(signature)) {
            console.warn(
              `[Futures] Repeated page detected root=${root.id} url=${currentPageUrl}`
            );
            break;
          }

          if (pageUrls.size > 0) {
            seenPageSignatures.add(signature);
          }

          discovered.push(...pageHints);

          if (pageUrls.size === 0) {
            console.warn(
              `[Futures] No /ko/articles/ links found root=${root.id} url=${currentPageUrl}`
            );
            break;
          }

          if (options.cutoffDate) {
            if (!pageHasCurrentOrNewer) {
              consecutiveOldPages += 1;

              // Same safety rule as other source adapters:
              // do not stop because of a single unusually ordered page.
              if (consecutiveOldPages >= 2) break;
            } else {
              consecutiveOldPages = 0;
            }
          }

          // Incremental = max first 2 pages PER discovery root.
          if (options.mode === 'incremental' && visited >= 1) {
            break;
          }

          const nextPageUrl =
            this.findNextPageUrl($, currentPageUrl, root);

          if (!nextPageUrl) {
            break;
          }

          currentPageUrl = nextPageUrl;
          currentPageNumber += 1;
        } catch (error) {
          completed = false;

          console.error(
            `[Futures] Discovery failed `
            + `root=${root.id} page=${currentPageNumber} url=${currentPageUrl}`,
            error
          );

          // Failure of one category must NOT stop the remaining categories.
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

  private extractFuturesContent(
    $: cheerio.CheerioAPI,
    url: string
  ) {
    const candidates = [
      '.entry-content',
      '.article-content',
      '.post-content',
      '.single-content',
      '.single-post-content',
      '.article-body',
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
          '#comments'
        ].join(',')
      ).remove();

      try {
        const result = this.extractContentBlocks($, clone, url);

        if (result.bodyText && result.bodyText.length >= 50) {
          return result;
        }
      } catch (error) {
        console.warn(
          `[Futures] Content extraction failed selector=${selector} url=${url}`,
          error
        );
      }
    }

    /**
     * Final fallback preserving paragraph/image order.
     */
    const source =
      $('main article').first().length > 0
        ? $('main article').first()
        : $('main').first().length > 0
          ? $('main').first()
          : $('body');

    const wrapper =
      $('<div id="futures-adapter-content-fallback"></div>');

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
            '.sidebar'
          ].join(',')
        ).length > 0
      ) {
        return;
      }

      // figure already contains its image
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
      const hint =
        hints
        || FuturesAdapter.hintByUrl.get(normalizedUrl);

      const title =
        normalizeWhitespace(
          $('h1.entry-title, article h1, main h1, h1')
            .first()
            .text()
        )
        || $('meta[property="og:title"]').attr('content')?.trim()
        || hint?.titleHint
        || '';

      if (!title) {
        console.warn(`[Futures] Reject: missing title url=${url}`);
        return null;
      }

      const subtitle =
        normalizeWhitespace(
          $('.subtitle, .sub-title, .lead, .article-summary, .entry-summary')
            .first()
            .text()
        )
        || undefined;

      let publishedAt =
        parseKoreanDate(
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
            publishedAt = parseKoreanDate(findDatePublished(json));
          } catch {
            // ignore malformed JSON-LD
          }
        });
      }

      if (!publishedAt) {
        const topText = normalizeWhitespace(
          $('main article, article, main')
            .first()
            .text()
            .slice(0, 2000)
        );

        const visibleDate =
          topText.match(/\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/)?.[0];

        publishedAt = parseKoreanDate(visibleDate);
      }

      if (!publishedAt && hint?.publishedAtHint) {
        publishedAt = parseKoreanDate(hint.publishedAtHint);
      }

      // Never fabricate dates.
      if (!publishedAt) {
        console.warn(`[Futures] Reject: missing publication date url=${url}`);
        return null;
      }

      const author =
        normalizeWhitespace(
          $('.author, .byline, [rel="author"], .post-author, .entry-author')
            .first()
            .text()
        )
        || $('meta[name="author"]').attr('content')?.trim()
        || undefined;

      const canonicalUrl =
        extractCanonicalUrl(html, normalizedUrl);

      const {
        contentBlocks,
        imageUrls,
        leadImageUrl,
        bodyText
      } = this.extractFuturesContent($, normalizedUrl);

      if (!bodyText || bodyText.length < 50) {
        console.warn(
          `[Futures] Reject: body too short `
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

      const root =
        hint?.subcategory
          ? DISCOVERY_ROOTS.find(
              candidate => candidate.id === hint.subcategory
            )
          : undefined;

      return this.normalizeArticle({
        sourceId: meta.id,
        sourceUrl: normalizedUrl,
        canonicalUrl,
        originalLanguage: 'ko',
        originalTitle: title,
        originalSubtitle: subtitle,
        originalBody: bodyText,
        author,
        publishedAt,
        sourceSection: hint?.section || root?.group || 'futures',
        sourceSubcategory: hint?.subcategory || root?.id,
        portalCategoryId: this.inferPortalCategory(root, $),
        leadImageUrl: finalLeadImage,
        imageUrls: uniqueImageUrls,
        contentBlocks
      });
    } catch (error) {
      console.error(
        `[Futures] parseArticle exception url=${url}`,
        error
      );
      return null;
    }
  }
}

export default new FuturesAdapter();
