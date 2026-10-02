import { createHash } from 'crypto';

export function contentHash(text: string): string {
  const normalized = text.toLowerCase().replace(/[\s\W]+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex');
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\[[^\]]+\]|\([^)]+\)/g, '') // remove brackets
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates token-based Jaccard similarity (0 to 1)
 */
export function calculateSimilarity(strA: string, strB: string): number {
  if (!strA || !strB) return 0;
  if (strA === strB) return 1;

  const tokensA = new Set(normalizeTitle(strA).split(' ').filter(w => w.length > 1));
  const tokensB = new Set(normalizeTitle(strB).split(' ').filter(w => w.length > 1));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Levenshtein distance for fuzzy matching
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = new Array<number[]>(bn + 1);
  for (let i = 0; i <= bn; ++i) {
    const row = new Array<number>(an + 1);
    row[0] = i;
    matrix[i] = row;
  }
  for (let i = 1; i <= an; ++i) {
    matrix[0][i] = i;
  }
  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[bn][an];
}

export function stringSimilarityRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(a.toLowerCase().trim(), b.toLowerCase().trim());
  return 1 - dist / maxLen;
}
