export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

export function normalizeWhitespace(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Parses date string or Unix timestamp into ISO string safely.
 * Returns null if invalid - NEVER falls back to current date.
 */
export function parseDateSafely(raw: string | number | undefined | null): string | null {
  if (!raw) return null;
  
  if (typeof raw === 'number') {
    const d = new Date(raw > 1e11 ? raw : raw * 1000);
    if (!isNaN(d.getTime())) return d.toISOString();
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try standard Date parsing
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    // Sanity check: year must be reasonable (e.g. between 1990 and 2040)
    const year = d.getFullYear();
    if (year >= 1990 && year <= 2040) {
      return d.toISOString();
    }
  }

  // Handle common Kinyarwanda / French / Korean month names if needed
  // e.g. "19 Nzeri 2026", "2026년 9월 19일"
  const koreanMatch = trimmed.match(/(\d{4})[년.-]\s*(\d{1,2})[월.-]\s*(\d{1,2})[일]?/);
  if (koreanMatch) {
    const [, y, m, day] = koreanMatch;
    const kd = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(day, 10));
    if (!isNaN(kd.getTime())) return kd.toISOString();
  }

  // French/Kinyarwanda formats: "19 Septembre 2026" or "19 Nzeri 2026"
  const kinyarwandaMonths: Record<string, number> = {
    'mutarama': 0, 'gashyantare': 1, 'werurwe': 2, 'mata': 3,
    'gicurasi': 4, 'kamena': 5, 'nyakanga': 6, 'kanama': 7,
    'nzeri': 8, 'ukwakira': 9, 'ugushyingo': 10, 'ukuboza': 11
  };
  const lower = trimmed.toLowerCase();
  for (const [mName, mIdx] of Object.entries(kinyarwandaMonths)) {
    if (lower.includes(mName)) {
      const match = lower.match(/(\d{1,2})\s+[a-z]+\s+(\d{4})/);
      if (match) {
        const day = parseInt(match[1], 10);
        const year = parseInt(match[2], 10);
        const kd = new Date(year, mIdx, day);
        if (!isNaN(kd.getTime())) return kd.toISOString();
      }
    }
  }

  return null;
}
