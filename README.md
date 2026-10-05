# JSRD News / Newsroom v2

Rwanda-focused news collection and newsroom application with three presentation modes: Reader, Reporter, and Admin.

## Development

1. Install dependencies with `npm install`.
2. Configure server data/API values in `.env.local` as needed.
3. For browser login/signup, set `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY`. Never expose a Supabase service-role key to the browser.
4. Run `npm run lint`, `npm test`, and `npm run build` before deployment.
5. Run `npm run dev` for local development.

Reader mode remains available without authentication. Reporter/Admin modes are permission-gated when browser Supabase Auth is configured.

## Crawler Protocol v2

All registered legacy source adapters are exposed through the v2 compatibility layer. The target pipeline is `DISCOVER → FETCH → PARSE → NORMALIZE → VALIDATE → DEDUP → STORE → POST-PROCESS`. `/api/sources/protocol-health` exposes protocol and last-run diagnostics. New sources should implement the source adapter contract, add parser fixtures/tests, register once, and pass protocol validation before being enabled.

## Story clustering

Legacy title/date heuristic cluster writes are disabled. AI Workspace creates a batch of up to 150 unclustered articles, generates a copy/paste Agent command, and validates returned JSON before any database mutation. Cluster recovery is designed as preview-first and bounded to 150 associations; destructive application is intentionally not automatic.

## Reporter workflow

Reporter Desk supports drafts, review submission, Markdown edit/split/preview, toolbar helpers, and JPEG/PNG/WebP/AVIF image uploads up to 10 MB. Drafts are scoped by reporter ID in the application workflow.

## Production policy

GitHub `main` is source of truth. Production is never the development workspace. Verify in an isolated staging workspace, then deploy an exact full SHA with the platform `site-deploy` runner and verify local/public health plus Manager deployment state.

## Facebook browser session

Facebook collection reuses an authenticated Playwright browser state. The generated state under `data/facebook-auth-state.json` is ignored by Git and must be treated like a password. CAPTCHA is deliberately not automated.
