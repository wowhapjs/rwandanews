export function normalizeUrl(rawUrl: string, baseUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let trimmed = rawUrl.trim();
  if (trimmed.startsWith('//')) {
    trimmed = 'https:' + trimmed;
  }
  try {
    const parsed = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    // Remove tracking query parameters
    const searchParams = new URLSearchParams(parsed.search);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', '_ga'];
    trackingParams.forEach(p => searchParams.delete(p));
    
    parsed.search = searchParams.toString();
    parsed.hash = ''; // remove fragments
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function deduplicateUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const normalized = normalizeUrl(url);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

export function extractCanonicalUrl(html: string, fallbackUrl: string): string {
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) 
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (canonicalMatch && canonicalMatch[1]) {
    return normalizeUrl(canonicalMatch[1], fallbackUrl);
  }
  
  const ogUrlMatch = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i);
  if (ogUrlMatch && ogUrlMatch[1]) {
    return normalizeUrl(ogUrlMatch[1], fallbackUrl);
  }

  return normalizeUrl(fallbackUrl);
}
