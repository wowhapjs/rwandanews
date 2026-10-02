import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Browser, BrowserContext } from 'playwright';

export type FacebookLoginState =
  | 'connected'
  | 'unconfigured'
  | 'expired'
  | 'auth_required'
  | 'checkpoint'
  | 'captcha';

export interface FacebookSessionStatus {
  connected: boolean;
  status: FacebookLoginState;
  message: string;
  expiresAt?: string;
  cookiesCount?: number;
  lastCheckedAt?: string;
}

export interface FacebookCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export function getFacebookManagedStorageStatePath(): string {
  const configured = process.env.FACEBOOK_MANAGED_STORAGE_STATE_PATH?.trim();
  if (configured) return path.resolve(configured);

  const dataDirectory = path.resolve(process.env.DATA_DIR?.trim() || './data');
  return path.join(dataDirectory, 'facebook-auth-state.json');
}

/**
 * Parses Netscape HTTP Cookie File format into Playwright-compatible cookie records.
 * STRICTLY filters for Facebook domain cookies (.facebook.com, facebook.com).
 * NEVER logs or prints cookie names or values.
 */
export function parseNetscapeCookies(fileContent: string): FacebookCookie[] {
  if (!fileContent || typeof fileContent !== 'string') {
    return [];
  }

  const lines = fileContent.split(/\r?\n/);
  const cookies: FacebookCookie[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    let isHttpOnly = false;
    let lineToParse = trimmed;

    if (lineToParse.startsWith('#HttpOnly_')) {
      isHttpOnly = true;
      lineToParse = lineToParse.slice(10).trim();
    } else if (lineToParse.startsWith('#')) {
      // Standard comment line
      continue;
    }

    // Split by tab, or whitespace fallback
    let parts = lineToParse.split('\t');
    if (parts.length < 7) {
      parts = lineToParse.split(/\s+/);
    }
    if (parts.length < 7) continue;

    const domain = parts[0].trim();
    const pathValue = parts[2].trim() || '/';
    const secure = parts[3].trim().toUpperCase() === 'TRUE';
    const expiresRaw = Number.parseInt(parts[4].trim(), 10);
    const name = parts[5].trim();
    const value = parts.slice(6).join('\t').trim();

    if (!name) continue;

    // Filter strictly for Facebook domain
    const lowerDomain = domain.toLowerCase();
    const isFacebook =
      lowerDomain === 'facebook.com' ||
      lowerDomain === '.facebook.com' ||
      lowerDomain.endsWith('.facebook.com');

    if (!isFacebook) continue;

    const expires = Number.isFinite(expiresRaw) && expiresRaw > 0 ? expiresRaw : -1;

    cookies.push({
      name,
      value,
      domain,
      path: pathValue,
      expires,
      httpOnly: isHttpOnly,
      secure,
      sameSite: 'None'
    });
  }

  return cookies;
}

/**
 * Checks if the parsed cookies contain the critical Facebook auth cookies (c_user and xs).
 */
export function validateFacebookAuthCookies(cookies: FacebookCookie[]): {
  valid: boolean;
  missing: string[];
} {
  const names = new Set(cookies.map(c => c.name));
  const missing: string[] = [];

  if (!names.has('c_user')) missing.push('c_user');
  if (!names.has('xs')) missing.push('xs');

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Applies the uploaded cookies to Playwright browser context, visits Facebook,
 * verifies authentication status, and saves storageState if successful.
 */
export async function applyAndVerifyFacebookCookies(
  cookies: FacebookCookie[]
): Promise<FacebookSessionStatus> {
  if (cookies.length === 0) {
    return {
      connected: false,
      status: 'auth_required',
      message: 'Facebook 재로그인/인증 필요: cookies.txt 파일에서 유효한 Facebook 쿠키를 찾을 수 없습니다.'
    };
  }

  const authCheck = validateFacebookAuthCookies(cookies);
  if (!authCheck.valid) {
    return {
      connected: false,
      status: 'auth_required',
      message: `Facebook 재로그인/인증 필요: 로그인 필수 쿠키(${authCheck.missing.join(', ')})가 누락되었습니다. 브라우저에서 Facebook에 정상 로그인한 상태에서 cookies.txt를 다시 export해주세요.`
    };
  }

  process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
  const { chromium } = await import('playwright');

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    context = await browser.newContext({
      locale: 'en-US',
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });

    // Add parsed Facebook cookies
    await context.addCookies(cookies);

    const page = await context.newPage();

    // Navigate to Facebook home
    await page.goto('https://www.facebook.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 35_000
    });

    await page.waitForTimeout(3_000);

    const currentUrl = page.url();
    const bodyText = (await page.locator('body').innerText().catch(() => ''))
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .slice(0, 6_000);

    // 1. CAPTCHA Check (Never auto-bypass CAPTCHA as per user instruction)
    if (
      /captcha/i.test(currentUrl) ||
      /captcha|prove you are human|보안 문자|로봇이 아님/i.test(bodyText)
    ) {
      return {
        connected: false,
        status: 'captcha',
        message: 'Facebook 재로그인/인증 필요: Facebook 보안 문자(CAPTCHA) 확인이 필요합니다. 브라우저에서 직접 보안 인증을 통과한 후 cookies.txt를 다시 export해주세요.'
      };
    }

    // 2. Checkpoint / 2FA / Device Approval Check
    if (
      /\/checkpoint(?:\/|\?|$)/i.test(currentUrl) ||
      /check your notifications|approve.*another device|confirm.*identity|security check|알림을 확인|다른 기기|본인 확인|보안 확인/i.test(bodyText)
    ) {
      return {
        connected: false,
        status: 'checkpoint',
        message: 'Facebook 재로그인/인증 필요: 추가 보안 인증(다른 기기 로그인 승인 또는 checkpoint)이 필요합니다. 브라우저에서 승인 완료 후 cookies.txt를 다시 export해주세요.'
      };
    }

    // 3. Login redirect / Logged out check
    if (
      /\/login(?:\.php|\/|\?|$)/i.test(currentUrl) ||
      /log in to continue|you must log in|로그인하여 계속|log into facebook/i.test(bodyText)
    ) {
      return {
        connected: false,
        status: 'auth_required',
        message: 'Facebook 재로그인/인증 필요: 세션이 유효하지 않거나 만료되었습니다. 브라우저에서 Facebook에 다시 로그인한 뒤 cookies.txt를 export해주세요.'
      };
    }

    // 4. Verify c_user in actual active context
    const currentContextCookies = await context.cookies('https://www.facebook.com/');
    const activeNames = new Set(currentContextCookies.map(c => c.name));
    if (!activeNames.has('c_user')) {
      return {
        connected: false,
        status: 'auth_required',
        message: 'Facebook 재로그인/인증 필요: 로그인 사용자 정보(c_user)를 확인할 수 없습니다.'
      };
    }

    // Calculate earliest expiration
    const cUser = currentContextCookies.find(c => c.name === 'c_user');
    const xs = currentContextCookies.find(c => c.name === 'xs');
    const expCandidates = [cUser?.expires, xs?.expires].filter(
      (v): v is number => typeof v === 'number' && v > 0
    );
    const earliestExp = expCandidates.length > 0 ? Math.min(...expCandidates) : undefined;
    const expiresAt = earliestExp ? new Date(earliestExp * 1000).toISOString() : undefined;

    // 5. Success! Persist storageState to data/facebook-auth-state.json
    const destination = getFacebookManagedStorageStatePath();
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await fs.mkdir(path.dirname(destination), { recursive: true });

    const storageState = await context.storageState();
    await fs.writeFile(temporary, JSON.stringify(storageState, null, 2), {
      encoding: 'utf8',
      mode: 0o600
    });
    await fs.rename(temporary, destination);
    await fs.chmod(destination, 0o600).catch(() => {});

    console.log(`[FacebookSession] Saved authenticated Facebook session (${storageState.cookies.length} cookies).`);

    return {
      connected: true,
      status: 'connected',
      message: 'Facebook 세션이 성공적으로 연동되었습니다! 이제 크롤러가 이 세션을 안전하게 재사용합니다.',
      expiresAt,
      cookiesCount: storageState.cookies.length,
      lastCheckedAt: new Date().toISOString()
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    return {
      connected: false,
      status: 'auth_required',
      message: `Facebook 세션 검증 중 오류 발생: ${errMessage}`
    };
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

/**
 * Checks the current saved Facebook session status from disk.
 */
export async function getFacebookSessionStatus(): Promise<FacebookSessionStatus> {
  const filePath = getFacebookManagedStorageStatePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as {
      cookies?: Array<{ name?: string; expires?: number; domain?: string }>;
    };

    const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : [];
    const cUser = cookies.find(cookie => cookie.name === 'c_user');
    const xs = cookies.find(cookie => cookie.name === 'xs');
    const nowSeconds = Date.now() / 1000;

    const isUsable = (cookie: typeof cUser) =>
      Boolean(cookie) &&
      (!cookie?.expires || cookie.expires < 0 || cookie.expires > nowSeconds);

    if (!cUser || !xs) {
      return {
        connected: false,
        status: 'unconfigured',
        message: 'Facebook 세션이 설정되지 않았습니다. cookies.txt를 업로드해주세요.'
      };
    }

    if (!isUsable(cUser) || !isUsable(xs)) {
      return {
        connected: false,
        status: 'expired',
        message: 'Facebook 재로그인/인증 필요 (쿠키 세션 만료)'
      };
    }

    const expirations = [cUser?.expires, xs?.expires].filter(
      (v): v is number => typeof v === 'number' && v > 0
    );
    const earliestExp = expirations.length > 0 ? Math.min(...expirations) : undefined;
    const expiresAt = earliestExp ? new Date(earliestExp * 1000).toISOString() : undefined;

    return {
      connected: true,
      status: 'connected',
      message: 'Facebook 세션 활성화됨 (크롤러 사용 가능)',
      expiresAt,
      cookiesCount: cookies.length,
      lastCheckedAt: new Date().toISOString()
    };
  } catch {
    return {
      connected: false,
      status: 'unconfigured',
      message: 'Facebook 세션이 설정되지 않았습니다. cookies.txt를 업로드해주세요.'
    };
  }
}

/**
 * Clears the stored Facebook session file.
 */
export async function clearFacebookSession(): Promise<void> {
  const filePath = getFacebookManagedStorageStatePath();
  try {
    await fs.unlink(filePath);
  } catch {}
}
