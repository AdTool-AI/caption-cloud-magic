# AdTool Agent: Campaign Production and Outreach System (architecture plan)

This is the architecture plan only. Nothing gets built until you approve it, and after that we build one phase at a time. Each phase gets its own approval and tests.

## 1. What exists today and will be reused

| Area | Existing piece (reused, not duplicated) |
|---|---|
| Agent | `_shared/muse/*` (loop, tools, recovery), `muse-agent`, `agent_tasks` + `agent-task-resume` cron, approvals table |
| Agent tools today | get_user_context, get_available_video_models, estimate_video_cost, generate_video, regenerate_video, get_video_status, analyze_asset |
| Brand | `brand_kits`, `extract-brand-dna`, `generate-brand-kit` (SSRF-safe website fetch), `analyze-brand-voice` |
| Web research | `safe-fetch.ts`, `browserlessClient.ts`, Firecrawl/Perplexity keys already used by `fetch-news-hub` / `fetch-trends`, `search-trend-articles` |
| Media | `media_library`, `video_creations`, `content_items`, `media-import`, `search-stock-images/videos/music/sfx` |
| Video models + price | `videoModelSpecs.ts` → muse catalog, `_shared/videoPricingCatalog.ts`, `accountVideoPricing.ts`, all `generate-*-video` functions, `replicate-webhook`, `modelark-poll` |
| QA | `agent-video-qa` (full MP4 plus `analyze-video-scenes`) |
| Voice / music / SFX | `generate-voiceover` + `tts-language.ts` (German pinned), `list-voices`, `generate-music-track`, `generate-scene-sfx`, `search-stock-sfx`, `director-cut-audio-mixing` |
| Editing | Director's Cut `render-directors-cut` (snake_case payload, overlays v407, subtitles), Remotion Lambda (`invoke-remotion-render`, `render-queue-*`) |
| Enhance | `video-enhance` + poll/webhook/persist/cost-closure (Topaz, ByteDance), with the price cap and idempotent refunds |
| Email | `email-send.ts`, Resend (transactional), `resend-webhook`, suppression list |
| OAuth pattern | calendar-google-oauth, cloud-storage-oauth (template for Gmail/Outlook later) |
| Leads / CRM | none today. New table needed. |

Deliberately left out: Lip-Sync (frozen) and the Composer scene state machine (too heavy for simple ad shots). Assembly goes through Director's Cut / Remotion instead.

## 2. Core concept

```text
agent_campaigns (one commercial project)
  ├─ campaign_sources   (research facts + citation URLs)
  ├─ campaign_assets    (media_library refs + provenance/licence)
  ├─ campaign_shots     (plan, model, prompt, generation_id, QA, client_ready)
  ├─ campaign_budget_approval (one approval, max cap, retry allowance)
  ├─ campaign_deliverables (master, demo preview, watermark)
  └─ agent_leads        (CRM + outreach drafts)
```
The campaign moves through stages: research → strategy → asset_collection → script → shot_planning → awaiting_budget_approval → generating → qa → audio → editing → upscale → final_qa → ready_for_delivery → outreach_ready → completed / failed. `agent-task-resume` gets a campaign step: each cron tick moves a campaign at most one step, holds a lease, skips anything already done, and pauses on 402/403. That's the same pattern already proven with `agent_tasks`.

## 3. Phases

### Phase A: research, campaign object, strategy, shot planner (no spending)
- New tables: `agent_campaigns`, `campaign_sources`, `campaign_assets`, `campaign_shots`, all with owner RLS and grants.
- New tools: `create_campaign`, `research_business` (website via safe-fetch/Firecrawl, public search via the existing search key, stores a citation for every fact, never logs in, never scrapes private profiles, social media only through official or public pages), `collect_campaign_assets` (logo, website images, uploads, earlier AdTool media; each asset is marked `reuse_ok` / `reference_only` / `unknown`, and web images default to `reference_only`), `write_campaign_script` (objective, hook, German voiceover text, on-screen text, timing, music and sound direction), `plan_shots` (3–8 s shots, 30 s default layout).
- UI: a campaign panel in `/agent` showing the stage, research with sources, the script and the shot list.
- Risk: the scraping rules differ by site. Mitigation: the SSRF-safe fetch, robots.txt, and never treating an asset as reusable without a source.
- Tests: running "Café Buur" produces cited research, at least 1 logo or reference asset with provenance, a 30 s script split into 5–7 shots, and $0 spent.

### Phase B: model per shot, one campaign budget approval, generation, QA
- `select_model_for_shot` scores models from the catalog on shot type (people/food/product), i2v/reference support, duration, resolution, price and past QA results (from `agent_operations`). Quality comes first within the budget.
- `estimate_campaign_budget` adds up the per-shot prices from the canonical catalog, a retry allowance, and the voice, music and upscale estimates. The result is one approval row with `max_total_cost`, shown as a single Confirm card.
- Paid shots keep using the existing `generate_video` gate. Each shot draws on the campaign approval and the server refuses anything above the cap. The single-use, exact-match rules stay intact.
- QA adds `client_ready` plus a hard "physical logic" fail rule, so impossible actions (coffee poured onto a croissant) fail automatically. Failed shots are regenerated only while the budget has room left.
- Tests: the planned total matches the catalog to the cent; a shot over the cap is refused; the whole campaign runs on one approval; nothing is generated twice when the cron runs twice; an absurd-action shot fails.

### Phase C: German voice, music, assembly
- A decision rule picks native model audio or a separate German voiceover. The default is a separate voiceover, because native German speech isn't verified on any model yet.
- Uses the existing `generate-voiceover` (German pinned), `generate-music-track` or stock music, `generate-scene-sfx`, and the Director's Cut audio mixing with voice ducking.
- `assemble_campaign` builds a Director's Cut / Remotion render from the approved shots with transitions, voice, music, a brand title card and a CTA overlay. Brand text like "Café Buur" and "Jetzt Tisch reservieren" comes from overlays, never from the video model.
- Tests: the render contains every approved shot in order, the voice stays readable over the music (loudness check), and the overlay text is spelled exactly right.

### Phase D: upscale, final QA, demo and master versions
- `enhance_video` goes through the existing `video-enhance` (URL-based, no base64). It runs on QA-passed shots or the final master, whichever the enhancer handles better, and the original files are never changed.
- Final QA runs on the whole ad (German grammar, pronunciation, sync, CTA, music level) and returns `CLIENT_READY` or `NEEDS_WORK`. Only CLIENT_READY or your explicit OK marks the ad finished.
- Two outputs: a Demo Preview (720p, subtle "Sample · AdTool" watermark, share link) and a Master (full quality, private).
- Tests: the enhancer price stays within the existing cap, the original is unchanged, the watermark appears only on the demo, and the master link is private.

### Phase E: leads and outreach drafts (no sending)
- `agent_leads` (fields and statuses as in your spec, owner RLS), `prepare_outreach` (email, Instagram DM, WhatsApp, phone script, follow-up, all with the demo link), and a configurable package table (6 videos for €299, 12 for €499) editable in settings.
- The copy sells business results, not AI. The texts are only stored, never sent.
- Tests: the drafts contain the correct demo link and package; no send function is reachable from the agent.

### Phase F (optional, later): connected sending
- Gmail/Outlook OAuth built like calendar-google-oauth. `create_email_draft` → a human approval card → sent one at a time, as a separate permission, respecting suppression and rate limits. No bulk sending.

## 4. Safeguards (unchanged plus new)
- All existing wallet, pricing, approval and retry logic stays as it is, and the new tools only call it.
- A server-side campaign cap and per-turn cap. The agent never buys anything, never changes subscriptions, never sends messages without approval, and never uses an asset without a recorded source.
- Background campaign steps run with restricted tools, exactly like the current resume step.

## Technical notes
- New tables get GRANT + RLS + updated_at triggers. The campaign lease/claim uses a SECURITY DEFINER RPC with SKIP LOCKED.
- Everything under `_shared/muse` stays free of Lovable-specific code. Research uses the existing Firecrawl/Perplexity keys, and the agent's own reasoning stays on Muse.
- EN/DE/ES texts for all new interface elements.

## Open questions before Phase A
1. Which search source for research: the existing Firecrawl/Perplexity keys, or Muse's own web search (if the Meta API offers one)?
2. Watermark wording: "Sample · AdTool" or "Demo · useadtool.ai"?
3. Should Phase A be the only thing built after approval? (Recommended.)
