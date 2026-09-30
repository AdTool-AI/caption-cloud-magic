# Café Buur QA failure — diagnosis and proposed fix

## 1. Root cause (confirmed)

Two things together made the review fail:

1. **The first method (`input_video`, where the model gets a link to the video) is rejected by the AI gateway.** The gateway returned HTTP 400 `provider_invalid_request`: "The request body cannot be served for this model: content part type". It failed after 49 ms and the provider was never called.
2. **The backup method (sending the whole file) was skipped because the file is over the 18 MB limit.** The MP4 is 19,201,620 bytes (18.31 MiB) and the limit is 18,874,368 bytes (exactly 18 MiB). `toBase64DataUrl` returns `null` when the file is too big, so no second request was sent and the function returned `QA_UNAVAILABLE`.

It was **not** caused by: the video link, the file type, a timeout, a rate limit (no 429), JSON parsing, or the Kling 2.5 Turbo model itself.

**Why the Kling 2.6 clip worked yesterday:** every successful review so far used the backup method (`method: base64_video` in all 7 successful `analyze_asset` results), not `input_video`. So `input_video` has never actually worked in this function. The Kling 2.6 file (10s, 1080p) was 17,429,649 bytes, just under the limit. This Kling 2.5 Turbo file (10s, 1080p) is about 1.7 MB larger and just over it.

## 2. Evidence

- `agent_operations`, 06:38:39 UTC: `analyze_asset` failed with `QA_UNAVAILABLE`.
- AI gateway log `01a0f109-85ba-778c-98f0-527e06b50a59` (06:38:48 UTC): `google/gemini-2.5-flash`, HTTP 400, error `provider_invalid_request` "content part type". The saved request body has the `input_video` part with the public MP4 link.
- No second video request appears in the gateway logs for that minute, which matches the backup being skipped. The other request at the same moment (`01a0f109-7178-…`, 200) is the scene analysis step, which worked. Its scenes appear in the rejected prompt.
- Checking the MP4 link directly: HTTP 200, `content-type: video/mp4`, `content-length: 19201620`.
- The generation shows `completed`, `kling-2.5-turbo`, 1080p, 10s.
- There are no logs from `agent-video-qa`, because the function doesn't record why a review failed.

## 3. Smallest robust fix (only in `supabase/functions/agent-video-qa/index.ts`)

1. **Stop sending the rejected `input_video` part.** Try this order instead:
   - a) send the file inline (base64) as now, if it's within the size limit;
   - b) if the file is too big, send the video **link** in the same `image_url` format the gateway accepts for inline video. If that is also rejected, go to step c.
   - c) if the file is too big or the link is rejected, get the video to fit instead of giving up: download only the first part of the file up to the limit? No — a cut-off MP4 breaks. Instead, **raise the size limit to what the gateway allows** (checked with one free test call before picking a number), and still give up clearly above that limit.
   - Which of b and c we use is decided by one no-cost test call during the build. No guessing.
2. **Record why a review fails.** Log one line with the method, gateway status, error type, file size and whether the backup was skipped for size. Put a non-secret `reason` in the error (for example `input_too_large`, `gateway_rejected_content`, `rate_limited`, `parse_failed`) so the agent and support can see the cause.
3. Nothing else changes: same model, prompt, JSON result format, and approval, wallet, pricing and retry logic.

## 4. Can QA be re-run safely on this video?

Yes. `agent-video-qa` only reads the finished generation and calls the AI gateway, which uses a tiny amount of Lovable AI credit (about 0.005 credits per call). It never calls a video provider, never touches the video wallet, and never starts a generation. After the fix, re-running `analyze_asset` for generation `6f7b976c-…` in conversation `f3cde637-…` costs $0 from the video wallet. Before and after the re-run we'll check that the wallet balance, generation count and transaction count haven't changed.

## Technical details

- File limit check: `toBase64DataUrl(url, 18 * 1024 * 1024)` → `ab.byteLength (19,201,620) > 18,874,368` → `null`. The fallback block is then skipped and `result` still holds the 400 from `input_video` → 502 `QA_UNAVAILABLE`.
- Note: the project memory "MP4 payload shapes" says `input_video` returns 200. The gateway's current behaviour contradicts that note, so the note will be updated as part of the fix.
- Verification after the build: one free call to a gateway test with a >18 MB file to confirm which format works, then re-run QA on this video and confirm `analysis_available: true` and the video wallet unchanged.
