import * as cheerio from 'cheerio';
import {
  ContentBlock,
  DiscoveryOptions,
  DiscoveryResult,
  ParsedArticle,
  SourceAdapter,
  SourceMetadata
} from './types.js';
import { normalizeUrl } from './utils/url.js';
import { decodeHtmlEntities, normalizeWhitespace } from './utils/html.js';
import { extractBestImageUrl } from './utils/images.js';

/**
 * Converts a Cheerio element into rich Markdown preserving line breaks (<br>),
 * links ([text](url)), bold (**text**), italics (*text*), and structure.
 */
function convertCheerioElementToMarkdown(
  $: cheerio.CheerioAPI,
  el: cheerio.Cheerio<any>,
  baseUrl: string
): string {
  // Clone element so modifications don't break the original DOM
  const clone = el.clone();

  // If root element itself is an anchor link
  if (clone.is('a')) {
    const href = clone.attr('href')?.trim();
    const text = clone.text().trim();
    if (href && text) {
      const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
      return decodeHtmlEntities(`[${text}](${fullUrl})`);
    }
  }

  // Replace <br> and <br/> with newline placeholder
  clone.find('br').replaceWith('\n');

  // Convert links to Markdown [text](href)
  clone.find('a').each((_, aElem) => {
    const a = $(aElem);
    const href = a.attr('href')?.trim();
    const text = a.text().trim();
    if (href && text) {
      const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
      a.replaceWith(` [${text}](${fullUrl}) `);
    } else if (text) {
      a.replaceWith(` ${text} `);
    }
  });

  // Convert bold tags to Markdown **bold**
  clone.find('strong, b').each((_, bElem) => {
    const b = $(bElem);
    const bText = b.text().trim();
    if (bText) {
      b.replaceWith(` **${bText}** `);
    }
  });

  // Convert italics tags to Markdown *italic*
  clone.find('em, i').each((_, iElem) => {
    const i = $(iElem);
    const iText = i.text().trim();
    if (iText) {
      i.replaceWith(` *${iText}* `);
    }
  });

  // Extract text and clean up whitespace while preserving newlines
  const rawText = clone.text();
  const cleaned = rawText
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

  return decodeHtmlEntities(cleaned);
}

export abstract class BaseSourceAdapter implements SourceAdapter {
  abstract getMetadata(): SourceMetadata;
  abstract discoverArticles(options: DiscoveryOptions): Promise<DiscoveryResult>;
  abstract parseArticle(html: string, url: string): Promise<ParsedArticle | null>;

  async fetchArticle(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (Personal News Intelligence Bot)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,rw;q=0.8,ko;q=0.7',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} for ${url}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  normalizeArticle(article: ParsedArticle): ParsedArticle {
    return {
      ...article,
      originalTitle: decodeHtmlEntities(normalizeWhitespace(article.originalTitle)),
      originalSubtitle: article.originalSubtitle
        ? decodeHtmlEntities(normalizeWhitespace(article.originalSubtitle))
        : undefined,
      originalBody: decodeHtmlEntities(article.originalBody).trim(),
      author: article.author ? decodeHtmlEntities(normalizeWhitespace(article.author)) : undefined,
      canonicalUrl: normalizeUrl(article.canonicalUrl || article.sourceUrl)
    };
  }

  /**
   * Helper that traverses article content container DOM preserving sequence of
   * paragraphs, headings, blockquotes, and images with stable BLK-xxx and IMG-xxx identifiers.
   * Utilizes rich markdown syntax (subheadings with #, links with [text](url), linebreaks).
   */
  protected extractContentBlocks(
    $: cheerio.CheerioAPI,
    container: cheerio.Cheerio<any>,
    baseUrl: string
  ): { contentBlocks: ContentBlock[]; imageUrls: string[]; leadImageUrl?: string; bodyText: string } {
    const contentBlocks: ContentBlock[] = [];
    const imageUrls: string[] = [];
    let blockCounter = 1;
    let imageCounter = 1;
    const bodyParagraphs: string[] = [];

    // Find all direct or nested content elements in visual order
    container.find('p, h1, h2, h3, h4, h5, h6, blockquote, img, figure, ul, ol').each((_, elem) => {
      const el = $(elem);
      const tagName = elem.type === 'tag' ? elem.name.toLowerCase() : '';

      if (tagName === 'figure' || tagName === 'img') {
        const imgEl = tagName === 'img' ? el : el.find('img').first();
        if (imgEl.length > 0) {
          const src = extractBestImageUrl({
            src: imgEl.attr('src'),
            'data-src': imgEl.attr('data-src'),
            'data-original': imgEl.attr('data-original'),
            'data-lazy-src': imgEl.attr('data-lazy-src'),
            srcset: imgEl.attr('srcset'),
            'data-srcset': imgEl.attr('data-srcset'),
            alt: imgEl.attr('alt')
          }, baseUrl);

          if (src && !imageUrls.includes(src)) {
            imageUrls.push(src);
            const imageId = `IMG-${String(imageCounter++).padStart(3, '0')}`;
            const caption = el.find('figcaption').text().trim() || imgEl.attr('title')?.trim();
            const alt = imgEl.attr('alt')?.trim();

            contentBlocks.push({
              blockId: `BLK-${String(blockCounter++).padStart(3, '0')}`,
              type: 'image',
              imageId,
              url: src,
              alt: alt || undefined,
              caption: caption || undefined
            });
          }
        }
      } else if (tagName.startsWith('h')) {
        const text = convertCheerioElementToMarkdown($, el, baseUrl);
        if (text) {
          const level = parseInt(tagName.replace('h', ''), 10) || 2;
          const mdPrefix = '#'.repeat(Math.min(Math.max(level, 1), 6));
          const mdText = `${mdPrefix} ${text}`;
          contentBlocks.push({
            blockId: `BLK-${String(blockCounter++).padStart(3, '0')}`,
            type: 'heading',
            text: mdText,
            headingLevel: level
          });
          bodyParagraphs.push(mdText);
        }
      } else if (tagName === 'blockquote') {
        const mdText = convertCheerioElementToMarkdown($, el, baseUrl);
        if (mdText) {
          contentBlocks.push({
            blockId: `BLK-${String(blockCounter++).padStart(3, '0')}`,
            type: 'blockquote',
            text: mdText
          });
          bodyParagraphs.push(`> ${mdText}`);
        }
      } else if (tagName === 'ul' || tagName === 'ol') {
        const items: string[] = [];
        el.find('li').each((liIdx, liElem) => {
          const liText = convertCheerioElementToMarkdown($, $(liElem), baseUrl);
          if (liText) {
            items.push(tagName === 'ol' ? `${liIdx + 1}. ${liText}` : `- ${liText}`);
          }
        });
        if (items.length > 0) {
          const listMd = items.join('\n');
          contentBlocks.push({
            blockId: `BLK-${String(blockCounter++).padStart(3, '0')}`,
            type: 'paragraph',
            text: listMd
          });
          bodyParagraphs.push(listMd);
        }
      } else if (tagName === 'p') {
        // Skip if this paragraph only contains an image that figure already handled
        if (el.find('img').length > 0 && normalizeWhitespace(el.text()).length === 0) {
          return;
        }

        const mdText = convertCheerioElementToMarkdown($, el, baseUrl);
        if (mdText) {
          // Check if paragraph acts as a standalone section subheading (e.g. bold subtitle or subtitle class)
          const isPureBoldSubtitle = mdText.startsWith('**') && mdText.endsWith('**') && mdText.length < 120;
          const hasSubtitleClass = el.hasClass('subheading') || el.hasClass('subtitle') || el.hasClass('section-title');

          if (isPureBoldSubtitle || hasSubtitleClass) {
            const cleanSub = mdText.replace(/^\*\*|\*\*$/g, '').trim();
            const mdHeading = `### ${cleanSub}`;
            contentBlocks.push({
              blockId: `BLK-${String(blockCounter++).padStart(3, '0')}`,
              type: 'heading',
              text: mdHeading,
              headingLevel: 3
            });
            bodyParagraphs.push(mdHeading);
          } else {
            contentBlocks.push({
              blockId: `BLK-${String(blockCounter++).padStart(3, '0')}`,
              type: 'paragraph',
              text: mdText
            });
            bodyParagraphs.push(mdText);
          }
        }
      }
    });

    const leadImageUrl = imageUrls[0] || undefined;
    const bodyText = bodyParagraphs.join('\n\n');

    return { contentBlocks, imageUrls, leadImageUrl, bodyText };
  }
}
