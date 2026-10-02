<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f9102a85-e712-4e02-bf28-011f26182996

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Facebook browser session

Facebook collection reuses an authenticated Playwright browser state instead
of signing in for every crawl.

1. Set a long random `FACEBOOK_ADMIN_TOKEN` in the server environment.
2. Open **Settings → Facebook Browser Session** in the portal.
3. Enter the administrator token and Facebook credentials.
4. Complete a two-factor code or approve the login on a trusted device.
5. After the status becomes **Connected**, run the Facebook source crawler.

The generated state is stored at `data/facebook-auth-state.json` by default,
is ignored by Git, and must be treated like a password. CAPTCHA is deliberately
not automated. On hosts with ephemeral filesystems, use **Copy session for AI
Studio Secret** and save the copied value as `FACEBOOK_STORAGE_STATE_BASE64`.
