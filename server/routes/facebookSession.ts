import { Router } from 'express';
import multer from 'multer';
import {
  applyAndVerifyFacebookCookies,
  clearFacebookSession,
  getFacebookSessionStatus,
  parseNetscapeCookies
} from '../services/facebookSession.js';

const router = Router();

// Memory storage so the uploaded cookies.txt is never persisted as raw file
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB limit
  }
});

// GET /api/facebook-session/status
router.get('/status', async (_req, res) => {
  try {
    const status = await getFacebookSessionStatus();
    return res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get status';
    return res.status(500).json({
      connected: false,
      status: 'auth_required',
      message: `Facebook 재로그인/인증 필요: ${message}`
    });
  }
});

// POST /api/facebook-session/upload-cookies
// Accepts either multipart form file ('cookiesFile') or JSON body ({ cookieContent: string })
router.post(
  '/upload-cookies',
  upload.single('cookiesFile'),
  async (req, res) => {
    try {
      let rawText = '';

      if (req.file && req.file.buffer) {
        rawText = req.file.buffer.toString('utf8');
      } else if (req.body && typeof req.body.cookieContent === 'string') {
        rawText = req.body.cookieContent;
      }

      if (!rawText || !rawText.trim()) {
        return res.status(400).json({
          connected: false,
          status: 'auth_required',
          message: '업로드된 파일이 비어있거나 올바른 cookies.txt 텍스트가 아닙니다.'
        });
      }

      // Parse Netscape cookies format (strictly Facebook domain cookies)
      const facebookCookies = parseNetscapeCookies(rawText);

      if (facebookCookies.length === 0) {
        return res.status(400).json({
          connected: false,
          status: 'auth_required',
          message: 'Facebook 재로그인/인증 필요: Netscape cookies.txt 형식에서 Facebook 도메인(.facebook.com) 쿠키를 찾을 수 없습니다.'
        });
      }

      // Apply cookies to Playwright, verify against Facebook, and persist if authenticated
      const result = await applyAndVerifyFacebookCookies(facebookCookies);

      // Return clean response without exposing any raw cookie secrets
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      console.error('[FacebookSessionRoute] Error during cookies processing:', message);
      return res.status(500).json({
        connected: false,
        status: 'auth_required',
        message: `Facebook 재로그인/인증 필요: 처리 중 오류가 발생했습니다 (${message})`
      });
    }
  }
);

// POST /api/facebook-session/test
// Re-verifies existing session against Facebook
router.post('/test', async (_req, res) => {
  try {
    const status = await getFacebookSessionStatus();
    if (!status.connected) {
      return res.json({
        connected: false,
        status: status.status,
        message: 'Facebook 재로그인/인증 필요: 저장된 세션이 없거나 이미 만료되었습니다. 새 cookies.txt를 업로드해주세요.'
      });
    }

    // Try reading storageState and validating
    const { getFacebookManagedStorageStatePath } = await import('../services/facebookSession.js');
    const { promises: fs } = await import('fs');
    const raw = await fs.readFile(getFacebookManagedStorageStatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const cookies = parsed.cookies || [];

    const result = await applyAndVerifyFacebookCookies(cookies);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Test failed';
    return res.status(500).json({
      connected: false,
      status: 'auth_required',
      message: `Facebook 재로그인/인증 필요: 세션 테스트 실패 (${message})`
    });
  }
});

// DELETE /api/facebook-session
router.delete('/', async (_req, res) => {
  try {
    await clearFacebookSession();
    return res.json({
      connected: false,
      status: 'unconfigured',
      message: 'Facebook 세션이 삭제되었습니다.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Clear failed';
    return res.status(500).json({ error: message });
  }
});

export default router;
