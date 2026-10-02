import { normalizeUrl } from './url.js';

const GARBAGE_IMAGE_PATTERNS = [
  /logo/i,
  /avatar/i,
  /icon/i,
  /favicon/i,
  /social/i,
  /facebook|twitter|instagram|linkedin|share/i,
  /advert|banner[-_]ad|ads[-_]/i,
  /1x1|pixel|tracking|tracker/i,
  /spacer|blank\.gif|spinner|loading/i
];

export function isGarbageImage(url: string, alt?: string): boolean {
  if (!url) return true;
  for (const pattern of GARBAGE_IMAGE_PATTERNS) {
    if (pattern.test(url)) return true;
    if (alt && pattern.test(alt)) return true;
  }
  return false;
}

export function extractSrcsetImage(srcset: string): string | null {
  if (!srcset) return null;
  const candidates = srcset.split(',').map(part => {
    const [url, descriptor] = part.trim().split(/\s+/);
    let score = 1;
    if (descriptor) {
      if (descriptor.endsWith('w')) {
        score = parseInt(descriptor.slice(0, -1), 10) || 1;
      } else if (descriptor.endsWith('x')) {
        score = (parseFloat(descriptor.slice(0, -1)) || 1) * 1000;
      }
    }
    return { url, score };
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url || null;
}

export function extractBestImageUrl(
  attrs: {
    src?: string;
    'data-src'?: string;
    'data-original'?: string;
    'data-lazy-src'?: string;
    srcset?: string;
    'data-srcset'?: string;
    alt?: string;
  },
  baseUrl: string
): string | null {
  let rawUrl: string | null = null;

  if (attrs.srcset || attrs['data-srcset']) {
    rawUrl = extractSrcsetImage(attrs.srcset || attrs['data-srcset'] || '');
  }

  if (!rawUrl) {
    rawUrl = attrs['data-original'] || attrs['data-src'] || attrs['data-lazy-src'] || attrs.src || null;
  }

  if (!rawUrl) return null;

  const normalized = normalizeUrl(rawUrl, baseUrl);
  if (!normalized || isGarbageImage(normalized, attrs.alt)) {
    return null;
  }

  return normalized;
}
