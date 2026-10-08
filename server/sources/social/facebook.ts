

import type { Browser, BrowserContext, Page } from 'playwright';
import { existsSync } from 'fs';
import { BaseSourceAdapter } from '../base.js';
import { getFacebookManagedStorageStatePath } from '../../services/facebookSession.js';
import type {
  ContentBlock,
  DiscoveredArticleHint,
  DiscoveryOptions,
  DiscoveryResult,
  ParsedArticle,
  SourceMetadata
} from '../types.js';

type JsonRecord = Record<string, unknown>;

interface ScrapedFacebookPost {
  sourcePageUrl: string;
  canonicalUrl: string;
  postId?: string;
  authorName?: string;
  message: string;
  publishedAt?: string;
  imageUrls: string[];
}

interface PageScanResult {
  posts: ScrapedFacebookPost[];
  exhausted: boolean;
}

type FacebookStorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
};

const FACEBOOK_BOILERPLATE_PATTERNS = [
  /^see posts, photos and more on facebook\.?$/i,
  /^log in to facebook\.?$/i,
  /^log into facebook to start sharing/i,
  /^connect with friends, family and other people/i,
  /^facebook helps you connect and share/i
];

/**
 * Facebook-only Rwanda scraper.
 *
 * Required:
 *   FACEBOOK_PAGE_URLS=https://www.facebook.com/PageOne,https://www.facebook.com/PageTwo
 *
 * Optional:
 *   FACEBOOK_STORAGE_STATE_PATH=/secure/facebook-storage-state.json
 *   FACEBOOK_STORAGE_STATE_BASE64=<base64 encoded Playwright storage state>
 *   FACEBOOK_STORAGE_STATE_JSON=<raw Playwright storage state JSON>
 *   FACEBOOK_HEADLESS=true
 *   FACEBOOK_MAX_POSTS=100
 *   FACEBOOK_MAX_SCROLLS=12
 *   FACEBOOK_SCROLL_DELAY_MS=2500
 *   FACEBOOK_MIN_POST_LENGTH=20
 */

export class FacebookRwandaAdapter extends BaseSourceAdapter {
  private static readonly DEFAULT_PAGES = [
    'https://www.facebook.com/RDBRwanda',
    'https://www.facebook.com/TheNewTimesRwanda',
    'https://www.facebook.com/kigalitoday'
  ];

  private readonly pageUrls = (() => {
    const envPages = (process.env.FACEBOOK_PAGE_URLS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const candidatePages = envPages.length > 0 ? envPages : FacebookRwandaAdapter.DEFAULT_PAGES;
    return candidatePages
      .map((value) => {
        try {
          return this.validateFacebookPageUrl(value);
        } catch {
          return null;
        }
      })
      .filter((url): url is string => Boolean(url));
  })();

  private readonly headless =
    (process.env.FACEBOOK_HEADLESS || 'true').toLowerCase() !== 'false';

  private readonly scrapedPostsByUrl = new Map<string, ScrapedFacebookPost>();

  getMetadata(): SourceMetadata {
    return {
      id: 'facebook_rwanda',
      domain: 'facebook.com',
      name: 'Facebook - Configured Rwanda Pages',
      region: 'rwanda',
      type: 'social',
      defaultLanguage: 'en',
      homeUrl: this.pageUrls[0] || 'https://www.facebook.com/',
      sections: this.pageUrls.map((url, index) => ({
        id: `facebook_page_${index + 1}`,
        name: `Configured Facebook Page ${index + 1}`,
        path: new URL(url).pathname
      })),
      enabled: this.pageUrls.length > 0
    };
  }

  async discoverArticles(options: DiscoveryOptions): Promise<DiscoveryResult> {
    this.assertConfigured();
    this.scrapedPostsByUrl.clear();

    const maximum = this.readPositiveInteger(
      options,
      'maxArticles',
      this.readEnvInteger('FACEBOOK_MAX_POSTS', 100)
    );
    const maxScrolls = this.readEnvInteger('FACEBOOK_MAX_SCROLLS', 12);
    const scrollDelayMs = this.readEnvInteger(
      'FACEBOOK_SCROLL_DELAY_MS',
      2_500
    );

    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let completed = true;
    let successfulPages = 0;

    try {
      process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
      const { chromium } = await import('playwright');

      browser = await chromium.launch({
        headless: this.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });
      const inlineStorageState = this.resolveStorageState();
      const storageStatePath = this.resolveStorageStatePath();
      context = await browser.newContext({
        locale: 'en-US',
        storageState: inlineStorageState || storageStatePath
      });

      await this.ensureAuthenticatedContext(context);

      for (const sourcePageUrl of this.pageUrls) {
        if (this.scrapedPostsByUrl.size >= maximum) {
          completed = false;
          break;
        }

        const page = await context.newPage();
        try {
          const result = await this.scanPage(
            page,
            sourcePageUrl,
            maximum - this.scrapedPostsByUrl.size,
            maxScrolls,
            scrollDelayMs
          );
          successfulPages += 1;
          completed = completed && result.exhausted;

          for (const post of result.posts) {
            if (!this.scrapedPostsByUrl.has(post.canonicalUrl)) {
              this.scrapedPostsByUrl.set(post.canonicalUrl, post);
            }
          }
        } finally {
          await page.close().catch(() => {});
        }
      }
    } catch (launchErr: unknown) {
      const message =
        launchErr instanceof Error
          ? launchErr.message
          : String(launchErr);

      throw new Error(
        `[FacebookRwandaAdapter] Browser collection failed: ${message}`
      );
    } finally {
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
    }

    return {
      articles: [...this.scrapedPostsByUrl.values()].map((post) =>
        this.toDiscoveryHint(post)
      ),
      lastSuccessfulPage: successfulPages,
      completed
    };
  }

  async fetchArticle(url: string): Promise<string> {
    const post = this.scrapedPostsByUrl.get(this.normalizeFacebookUrl(url));
    if (!post) {
      throw new Error(
        `Facebook post payload is missing for ${url}. `
        + 'Discovery and parsing must use the same adapter instance.'
      );
    }

    return JSON.stringify(post);
  }

  private resolveStorageState(): FacebookStorageState | undefined {
    const encoded =
      process.env.FACEBOOK_STORAGE_STATE_BASE64?.trim();
    const rawJson =
      process.env.FACEBOOK_STORAGE_STATE_JSON?.trim();

    if (!encoded && !rawJson) return undefined;

    try {
      const json = encoded
        ? Buffer.from(encoded, 'base64').toString('utf8')
        : rawJson as string;
      const parsed =
        JSON.parse(json) as Partial<FacebookStorageState>;

      if (!Array.isArray(parsed.cookies)) {
        throw new Error('cookies array is missing');
      }

      const cookieNames =
        new Set(parsed.cookies.map(cookie => cookie.name));

      if (
        !cookieNames.has('c_user')
        || !cookieNames.has('xs')
      ) {
        throw new Error(
          'Facebook login cookies c_user/xs are missing'
        );
      }

      return {
        cookies: parsed.cookies,
        origins: Array.isArray(parsed.origins)
          ? parsed.origins
          : []
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      throw new Error(
        `Invalid Facebook storage state secret: ${message}`
      );
    }
  }

  private async ensureAuthenticatedContext(
    context: BrowserContext
  ): Promise<void> {
    if (await this.hasFacebookLoginCookies(context)) return;
    throw new Error(
      'Facebook 재로그인/인증 필요: 활성화된 Facebook 세션이 없습니다. 소스 관리 또는 설정에서 cookies.txt 파일을 업로드해주세요.'
    );
  }

  private async hasFacebookLoginCookies(
    context: BrowserContext
  ): Promise<boolean> {
    const cookies =
      await context.cookies('https://www.facebook.com/');
    const cookieNames =
      new Set(cookies.map(cookie => cookie.name));

    return cookieNames.has('c_user') && cookieNames.has('xs');
  }

  private resolveStorageStatePath(): string | undefined {
    const configured = process.env.FACEBOOK_STORAGE_STATE_PATH?.trim();
    if (configured) return configured;

    const managed = getFacebookManagedStorageStatePath();
    return existsSync(managed) ? managed : undefined;
  }

  async parseArticle(payload: string, url: string): Promise<ParsedArticle | null> {
    let post: ScrapedFacebookPost;
    try {
      post = JSON.parse(payload) as ScrapedFacebookPost;
    } catch {
      throw new Error(`Invalid Facebook scraper payload for ${url}`);
    }

    if (!this.isUsablePost(post)) return null;
    return this.toParsedArticle(post);
  }

  private async scanPage(
    page: Page,
    sourcePageUrl: string,
    remainingLimit: number,
    maxScrolls: number,
    scrollDelayMs: number
  ): Promise<PageScanResult> {
    const response = await page.goto(sourcePageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000
    });

    if (response && response.status() >= 400) {
      throw new Error(
        `Facebook page returned HTTP ${response.status()}: ${sourcePageUrl}`
      );
    }

    await page.waitForTimeout(1_500);

    await this.assertNotGuestShell(
      page,
      sourcePageUrl
    );

    const found = new Map<string, ScrapedFacebookPost>();
    let unchangedPasses = 0;
    let exhausted = false;

    for (let scroll = 0; scroll <= maxScrolls; scroll += 1) {
      await this.expandVisiblePosts(page);

      const posts = await this.extractVisiblePosts(page, sourcePageUrl);
      const previousSize = found.size;

      for (const post of posts) {
        if (this.isUsablePost(post) && !found.has(post.canonicalUrl)) {
          found.set(post.canonicalUrl, post);
        }
        if (found.size >= remainingLimit) break;
      }

      if (found.size >= remainingLimit) {
        exhausted = false;
        break;
      }

      unchangedPasses = found.size === previousSize ? unchangedPasses + 1 : 0;
      if (unchangedPasses >= 2) {
        exhausted = true;
        break;
      }

      if (scroll === maxScrolls) {
        exhausted = false;
        break;
      }

      await page.evaluate(() => {
        window.scrollBy(0, Math.max(window.innerHeight * 1.5, 1_000));
      });
      await page.waitForTimeout(scrollDelayMs);
    }

    if (found.size === 0) {
      await this.throwIfBlockedOrLoggedOut(page, sourcePageUrl);
    }

    return {
      posts: [...found.values()].slice(0, remainingLimit),
      exhausted
    };
  }

  private async expandVisiblePosts(page: Page): Promise<void> {
    const expanders = page.getByRole('button', {
      name: /see more|more|voir plus|reba byinshi|더 보기/i
    });
    const count = Math.min(await expanders.count(), 30);

    for (let index = 0; index < count; index += 1) {
      try {
        await expanders.nth(index).click({ timeout: 1_000 });
      } catch {
        // Facebook can detach virtualized posts while scrolling.
      }
    }
  }

  private async extractVisiblePosts(
    page: Page,
    sourcePageUrl: string
  ): Promise<ScrapedFacebookPost[]> {
    const raw = await page.locator('div[role="article"]').evaluateAll(
      (nodes: any[], suppliedPageUrl: any) => {
        const postLinkPattern =
          /\/posts\/|\/videos\/|\/reel\/|story_fbid=|permalink\.php|fbid=/i;

        return nodes.map((node: any) => {
          const root = node as HTMLElement;
          const anchors = [...root.querySelectorAll<HTMLAnchorElement>('a[href]')];
          const permalink = anchors.find((anchor) =>
            postLinkPattern.test(anchor.href)
          )?.href;

          const primaryMessage = root.querySelector<HTMLElement>(
            '[data-ad-preview="message"]'
          )?.innerText;

          const textCandidates = [...root.querySelectorAll<HTMLElement>('[dir="auto"]')]
            .map((element) => element.innerText?.trim() || '')
            .filter((text) => text.length >= 20)
            .sort((left, right) => right.length - left.length);

          const timeElement = root.querySelector<HTMLElement>(
            'time[datetime], abbr[data-utime], abbr[title]'
          );
          const unixTime = timeElement?.getAttribute('data-utime');
          const publishedAt =
            timeElement?.getAttribute('datetime') ||
            (unixTime
              ? new Date(Number(unixTime) * 1_000).toISOString()
              : timeElement?.getAttribute('title') || undefined);

          const authorName =
            root.querySelector<HTMLElement>('h2 a, h3 a, strong a')?.innerText?.trim() ||
            undefined;

          const imageUrls = [...root.querySelectorAll<HTMLImageElement>('img[src]')]
            .filter((image) => image.naturalWidth >= 200 && image.naturalHeight >= 120)
            .map((image) => image.src)
            .filter((src) => /^https?:/i.test(src));

          return {
            sourcePageUrl: String(suppliedPageUrl),
            canonicalUrl: permalink || '',
            authorName,
            message: (primaryMessage || textCandidates[0] || '').trim(),
            publishedAt,
            imageUrls: [...new Set(imageUrls)]
          };
        });
      },
      sourcePageUrl
    );

    return (raw as any[])
      .filter((post: any) =>
        post.canonicalUrl
        && (
          post.message
          || post.imageUrls?.length > 0
        )
      )
      .map((post: any) => {
        const canonicalUrl = this.normalizeFacebookUrl(post.canonicalUrl);
        return {
          ...post,
          canonicalUrl,
          postId: this.extractPostId(canonicalUrl)
        };
      });
  }

  private async assertNotGuestShell(
    page: Page,
    sourcePageUrl: string
  ): Promise<void> {
    const bodyText =
      (await page.locator('body').innerText().catch(() => ''))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 4_000);
    const currentUrl = page.url();

    if (
      /\/login(?:\/|\?|$)/i.test(currentUrl)
      || /log in to continue|you must log in|로그인하여 계속/i.test(bodyText)
    ) {
      throw new Error(
        `Facebook session is expired or logged out for ${sourcePageUrl}`
      );
    }

    if (
      /see posts, photos and more on facebook/i.test(bodyText)
      && !/\/posts\/|\/videos\/|\/reel\/|story_fbid=|fbid=/i.test(
        await page.content()
      )
    ) {
      throw new Error(
        `Facebook returned a guest shell instead of posts for ${sourcePageUrl}`
      );
    }
  }

  private async throwIfBlockedOrLoggedOut(
    page: Page,
    sourcePageUrl: string
  ): Promise<void> {
    const bodyText = (await page.locator('body').innerText().catch(() => ''))
      .replace(/\s+/g, ' ')
      .slice(0, 2_000);
    const currentUrl = page.url();

    if (
      /temporarily blocked|you’re temporarily blocked|misusing this feature/i.test(
        bodyText
      )
    ) {
      throw new Error(
        `Facebook temporarily blocked the browser session while reading ${sourcePageUrl}`
      );
    }

    if (
      /\/login(?:\/|\?|$)/i.test(currentUrl) ||
      /log in to continue|you must log in|로그인하여 계속/i.test(bodyText)
    ) {
      throw new Error(
        'Facebook 재로그인/인증 필요: Facebook 세션이 만료되었거나 로그아웃되었습니다. cookies.txt를 다시 업로드해주세요.'
      );
    }

    if (
      /\/checkpoint(?:\/|\?|$)/i.test(currentUrl) ||
      /checkpoint|security check|보안 확인|다른 기기/i.test(bodyText)
    ) {
      throw new Error(
        'Facebook 재로그인/인증 필요: 추가 보안 인증(checkpoint / 다른 기기 승인)이 필요합니다. 브라우저에서 해결 후 cookies.txt를 다시 export해주세요.'
      );
    }

    throw new Error(
      `No Facebook posts could be extracted from ${sourcePageUrl}. ` +
        'The page layout, visibility, or selectors may have changed.'
    );
  }

  private isUsablePost(post: ScrapedFacebookPost): boolean {
    const minimum = this.readEnvInteger('FACEBOOK_MIN_POST_LENGTH', 20);
    const message =
      typeof post.message === 'string'
        ? post.message.replace(/\s+/g, ' ').trim()
        : '';
    const hasUsableMessage =
      message.length >= minimum
      && !this.isFacebookBoilerplate(message);
    const hasImages =
      Array.isArray(post.imageUrls)
      && post.imageUrls.length > 0;

    return (
      typeof post.canonicalUrl === 'string' &&
      post.canonicalUrl.startsWith('https://www.facebook.com/') &&
      Boolean(post.postId) &&
      this.isRealPostUrl(post.canonicalUrl) &&
      (hasUsableMessage || hasImages)
    );
  }

  private isFacebookBoilerplate(value: string): boolean {
    const text =
      value.replace(/\s+/g, ' ').trim();

    return FACEBOOK_BOILERPLATE_PATTERNS.some(
      pattern => pattern.test(text)
    );
  }

  private isRealPostUrl(value: string): boolean {
    try {
      const url = new URL(value);

      return (
        /(^|\.)facebook\.com$/i.test(url.hostname)
        && (
          /\/(?:posts|videos|reel)\/[^/?]+/i.test(url.pathname)
          || url.searchParams.has('story_fbid')
          || url.searchParams.has('fbid')
        )
      );
    } catch {
      return false;
    }
  }

  private toDiscoveryHint(post: ScrapedFacebookPost): DiscoveredArticleHint {
    return {
      url: post.canonicalUrl,
      titleHint: this.derivePostTitle(post),
      publishedAtHint: post.publishedAt
    };
  }

  private toParsedArticle(post: ScrapedFacebookPost): ParsedArticle {
    const title = this.derivePostTitle(post);
    const body = post.message.trim() || title;
    const publishedAt = post.publishedAt || new Date().toISOString();

    const contentBlocks: ContentBlock[] = [];
    let bIdx = 1;

    // Content paragraphs
    const paragraphs = body.split(/\n\s*\n/).filter(Boolean);
    paragraphs.forEach((p) => {
      contentBlocks.push({
        blockId: `BLK-${String(bIdx++).padStart(3, '0')}`,
        type: 'paragraph',
        text: p.trim()
      });
    });

    // Content images
    (post.imageUrls || []).forEach((imgUrl, i) => {
      contentBlocks.push({
        blockId: `IMG-${String(bIdx++).padStart(3, '0')}`,
        type: 'image',
        url: imgUrl,
        alt: `${title} - image ${i + 1}`
      });
    });

    return {
      sourceId: 'facebook_rwanda',
      sourceUrl: post.canonicalUrl,
      canonicalUrl: post.canonicalUrl,
      originalLanguage: 'en',
      originalTitle: title,
      originalSubtitle: undefined,
      originalBody: body,
      author: post.authorName,
      publishedAt,
      region: 'rwanda',
      leadImageUrl: post.imageUrls[0] || undefined,
      imageUrls: post.imageUrls,
      contentBlocks
    };
  }

  private deriveTitle(message: string): string {
    const normalized = message.replace(/\s+/g, ' ').trim();
    const firstSentence = normalized.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
    const candidate = firstSentence || normalized;
    return candidate.length <= 140
      ? candidate
      : `${candidate.slice(0, 137).trimEnd()}...`;
  }

  private derivePostTitle(post: ScrapedFacebookPost): string {
    const messageTitle =
      this.deriveTitle(post.message || '');

    if (messageTitle) return messageTitle;

    let pageLabel =
      post.authorName?.trim();

    if (!pageLabel) {
      try {
        pageLabel =
          new URL(post.sourcePageUrl)
            .pathname
            .split('/')
            .filter(Boolean)
            .pop();
      } catch {
        pageLabel = undefined;
      }
    }

    return `${pageLabel || 'Facebook'} — photo post`;
  }

  private normalizeFacebookUrl(value: string): string {
    const url = new URL(value, 'https://www.facebook.com/');
    if (!/(^|\.)facebook\.com$/i.test(url.hostname)) {
      throw new Error(`Not a Facebook URL: ${value}`);
    }

    url.protocol = 'https:';
    url.hostname = 'www.facebook.com';
    url.hash = '';

    for (const key of [...url.searchParams.keys()]) {
      if (!['id', 'story_fbid', 'fbid'].includes(key)) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  }

  private extractPostId(value: string): string | undefined {
    const url = new URL(value);
    return (
      url.searchParams.get('story_fbid') ||
      url.searchParams.get('fbid') ||
      url.pathname.match(/\/(?:posts|videos|reel)\/([^/?]+)/i)?.[1] ||
      undefined
    );
  }

  private validateFacebookPageUrl(value: string): string {
    const normalized = this.normalizeFacebookUrl(value);
    const url = new URL(normalized);
    if (url.pathname === '/' || /\/login/i.test(url.pathname)) {
      throw new Error(`FACEBOOK_PAGE_URLS contains an invalid Page URL: ${value}`);
    }
    return normalized;
  }

  private assertConfigured(): void {
    if (this.pageUrls.length === 0) {
      throw new Error(
        'FACEBOOK_PAGE_URLS must contain at least one public Facebook Page URL'
      );
    }
  }

  private readEnvInteger(name: string, fallback: number): number {
    const parsed = Number.parseInt(process.env[name] || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private readPositiveInteger(
    options: DiscoveryOptions,
    key: string,
    fallback: number
  ): number {
    const candidate = (options as unknown as JsonRecord)[key];
    return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
      ? Math.floor(candidate)
      : fallback;
  }
}
