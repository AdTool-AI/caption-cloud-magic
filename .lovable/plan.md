# Social connections and posting: how it works today (read-only report)

No code was changed. This is how the code works right now, based on reading it. It has not been tested live.

## Big picture
There are two Meta systems running side by side, plus three ways to schedule posts.
- **Per-user system (the main path):** each user connects their own accounts. This uses the `social_connections` table, one shared `oauth-callback` function and the `publish` function, which handles all platforms.
- **Old single-account Meta system:** one app-wide Instagram/Facebook token stored in `app_secrets.IG_PAGE_ACCESS_TOKEN`. It is used by `instagram-publish`, `instagram-token-renew/-debug/-test/-backups` and `connect-instagram-performance`. It belongs to the owner's account, not to individual users.

## 1) How connecting starts
`src/components/performance/ConnectionsTab.tsx` calls `instagram-oauth-start`, `facebook-oauth-start`, `tiktok-oauth-start`, `linkedin-oauth-start`, `x-oauth-start` and `youtube-oauth-start`. Each one checks the user is signed in (plus a premium check, e.g. YouTube), saves a security check value in `oauth_states`, and returns the platform's sign-in link.

## 2) Where the sign-in comes back (token exchange)
- `oauth-callback` handles all 6 platforms (`switch(provider)`). Meta short tokens are swapped for 60-day tokens; X uses PKCE.
- TikTok and LinkedIn also have their own callbacks (`tiktok-oauth-callback`, `linkedin-oauth-callback`). TikTok's domain-verified route `/api/oauth/tiktok/callback` (`TikTokOAuthCallback.tsx`) passes the sign-in on to `tiktok-oauth-callback`. Unconfirmed: whether LinkedIn's live redirect points to the shared callback or its own.
- `oauth-callback` also contains Meta review/diagnostic branches (`facebook_scope_probe`, `facebook_review_reset`) that never save a connection.

## 3) Where connections and tokens are stored
- `social_connections`: one row per user, platform and account. Tokens are encrypted (AES-GCM, `_shared/crypto.ts`, key `ENCRYPTION_SECRET`). The table also stores `token_expires_at` and `account_metadata` (holds the encrypted Facebook Page token used for Instagram/Facebook).
- `app_secrets.IG_PAGE_ACCESS_TOKEN`: the old app-wide Meta token. Backups are kept in `kv_secrets_backup`.
- The frontend reads `social_connections` through `usePlatformCredentials`. The `social-health` function gives the connection and expiry status.

## 4) How a user creates or schedules a post
- **Publish now:** `useSocialPublishing` (used in the composer's `PublishToSocialTab`) calls the old functions `publish-to-instagram`, `publish-to-tiktok` and `publish-to-linkedin` directly. Only YouTube goes through `publish`.
- **Schedule:** `useScheduledPublishing` adds a row to `scheduled_publications` with status `pending`.
- **Calendar:** creates `calendar_events` rows (`src/data/calendar.ts` plus the calendar autoschedule/bulk functions).
- `useQuickPublish` only hands the post over to the composer or calendar; it doesn't post anything itself.

## 5) What actually posts, per platform (`publish/index.ts`)
- Instagram: Meta Graph `/{ig}/media` then `/media_publish`, using that user's own Page token.
- Facebook: Graph resumable video upload to `/{page}/videos` (feed post for other content).
- LinkedIn: `v2/assets registerUpload` + `v2/ugcPosts`. **A 403 counts as success** (`LI_403`).
- X: `POST api.twitter.com/2/tweets`. **Text only; image/video upload is switched off.**
- YouTube: Data API upload, with a token refresh first.
- TikTok: `publishToTikTok` exists. It was not read line by line, so whether it works fully is unconfirmed.
- Duplicates still in the code: `instagram-publish` (app-wide token), the `publish-to-*` functions, `linkedin-post` and `publish-post` (callers not found).

## 6) How scheduled posts go out automatically
- Cron `dispatch-scheduled-publications` runs every 5 minutes and calls `check-scheduled-publications`. It picks `pending` rows that are due and calls `publish`. On success it records the post in `social_media_publications`. On failure it retries up to 3 times, then marks the row `failed`.
- Cron `auto-refresh-meta-tokens-daily` runs at 03:00 UTC.
- **No cron trigger was found** in the database setup files for `calendar-publish-dispatcher`, `poster-dispatcher`, `autopilot-publish-due` or `tick-strategy-posts`. So calendar events may never go out automatically, unless something outside the repo triggers them. This needs checking against the live cron jobs.

## 7) What works fully vs. partly
- **Works fully (in the code):** `scheduled_publications` → cron → `publish` for Instagram, Facebook and YouTube. Meta token refresh.
- **Partly working:** LinkedIn (a 403 is hidden as success); X (text only); TikTok (posting unconfirmed).
- **Inconsistent:** "Publish now" uses the old functions for IG/TikTok/LinkedIn, while scheduled posts use the per-user `publish`. `check-scheduled-publications` itself notes the old functions only work with one global token. So "Publish now" may post from the wrong account, or fail, for other users.
- **Old or possibly unused:** the app-wide Meta token setup, `instagram-publish`, the three LinkedIn posting functions, the second TikTok/LinkedIn callbacks and the calendar sender with no cron.

## 8) Token refresh and expiry
- Meta: daily cron. If a token expires within 14 days, it is renewed via `fb_exchange_token`. This covers both the app-wide token and every user's Facebook/Instagram connection. If a token is no longer valid, someone has to paste a new one through `InstagramTokenDialog`.
- YouTube: refreshed when posting (Google `refresh_token`).
- X: refreshed when a post gets a 401, plus manual `x-refresh`/`x-refresh-token` from the interface.
- TikTok: the refresh token is saved but **never used**, so the connection breaks when the token expires.
- LinkedIn: no refresh token (`refresh_token_hash: null`), so the user must reconnect about every 60 days.

## Optional next step (still read-only)
If you want, I can confirm the open points: the live cron job list, which redirect LinkedIn and TikTok really use, the full TikTok/YouTube posting code, and what calls `linkedin-post` and `publish-post`.
