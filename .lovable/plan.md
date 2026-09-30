# AdTool Agent Campaigns: Phase A (research, strategy, campaign plan, shot plan)

This phase builds research and planning only. No paid generation, no video-wallet spend. Phase B starts only after you review and approve Phase A.

## What Phase A delivers
From one request like "Café Buur, 30-second German demo ad" (or "6 videos for Café Buur"), the agent:
1. Creates a durable campaign that survives refresh, closing the browser and Meta outages.
2. Researches the business from public sources, with a source link on every fact.
3. Finds the target audience and the strongest commercial angle.
4. Collects useful assets with their source recorded. Anything from the public web is "reference only" unless reuse rights are explicitly known.
5. Identifies the business's content pillars, ranks them, and spreads the requested videos across them, then checks diversity and coverage.
6. Writes a German 30-second script and a 5–7 shot plan for each video.
7. Shows everything in `/agent` in a campaign panel. Cost: $0 in video credits.

## Reused infrastructure (nothing duplicated)
- Agent: `_shared/muse/*` loop, recovery, `agent_tasks` + `agent-task-resume` lease pattern, `/agent?conversation=` restore.
- Research: existing Firecrawl / Perplexity keys (as used in `fetch-news-hub`, `fetch-trends`), `safe-fetch.ts` (SSRF-safe), `extract-brand-dna` / `generate-brand-kit` website logic. Muse orchestrates and summarizes; there is no dependency on Meta web search.
- Brand / media: `brand_kits`, `media_library` (existing asset references only; nothing is copied or re-hosted in Phase A).
- Existing wallet, pricing, approval and generation code stays untouched and is not called.

## Content pillars and diversity (applies to 1..N videos)
- `identify_content_pillars`: finds pillars from the research (e.g. signature brunch, coffee/drinks, atmosphere/interior, friends/social, team/behind the scenes, reservation/conversion), each ranked by relevance to the goal, with its sources.
- `plan_campaign_videos`: spreads the N videos across different pillars. Each video stores content_pillar, target_audience, funnel_stage (awareness/consideration/conversion), primary_goal, hook_type, CTA, visual_style, key_asset/product, and a "why this video exists" rationale.
- Diversity rules, checked on the server: no repeated hook_type, no identical shot sequence (compared by shot-type signature), no identical CTA, no repeated key product unless the video is marked as part of a series, a varied mix of people, product and atmosphere, and awareness and conversion goals both covered when N ≥ 3. If a rule fails, the plan is rejected with the reason and Muse has to revise it.
- `coverage_score` (0–100): combines pillar coverage weighted by rank, funnel-stage spread, emphasis variety, and duplicate penalties. It's stored with a short explanation of how the videos work together as one campaign.

## New agent tools (all free)
`create_campaign`, `research_business`, `collect_campaign_assets`, `identify_content_pillars`, `plan_campaign_videos`, `write_video_script`, `plan_shots`, `get_campaign`.
All of these are also allowed in the background resume step. No paid tool is involved.

## Safeguards
- Research: only public pages, respects robots.txt, no logins, no private profiles, no CAPTCHA bypass. Social platforms only through public pages or connected official accounts.
- Every fact is saved with its source URL. A claim without a source is marked as a hypothesis.
- Assets: `reuse_status` is one of `reuse_ok` (the user's own uploads or AdTool media) / `reference_only` (default for the web) / `unknown`. Phase B may use only `reuse_ok` assets in final output.
- Cost: Firecrawl/Perplexity usage and Muse tokens are logged in `agent_operations`. The video wallet is never touched.

## Acceptance test (Café Buur)
- Research with at least 5 cited source URLs.
- Target audience plus the strongest commercial angle, with rationale.
- Relevant public assets with provenance, all web assets marked reference_only.
- German 30-second script (hook, message, CTA, voiceover text, on-screen text, timing, music and sound direction).
- 5–7 shots for the single video.
- Additional check: a "6 videos" request yields 6 distinct pillar/hook/CTA combinations, diversity checks pass, coverage_score and rationale shown.
- Video wallet balance and `ai_video_generations` count unchanged; no generate function called.
- The campaign survives a refresh and reopens from `/agent?conversation=`.

## Technical details
- Migration (GRANT + RLS owner-only + service_role, updated_at triggers):
  - `agent_campaigns` (user_id, conversation_id, company_name, website, location, goal, language, requested_video_count, stage enum research|strategy|asset_collection|script|shot_planning|awaiting_budget_approval|…|completed|failed, audience, commercial_angle, coverage_score, coverage_explanation, lease_until, error)
  - `campaign_sources` (campaign_id, url, title, fact, category, fetched_at, via: firecrawl|perplexity|safe_fetch)
  - `campaign_assets` (campaign_id, url, media_library_id, kind: logo|website_image|menu|upload|adtool_media|social, source_url, reuse_status, owner_note)
  - `campaign_pillars` (campaign_id, name, rank, relevance, evidence_source_ids)
  - `campaign_videos` (campaign_id, index, pillar_id, target_audience, funnel_stage, primary_goal, hook_type, cta, visual_style, key_asset, rationale, script jsonb, series_key)
  - `campaign_shots` (video_id, index, start_s, end_s, purpose, shot_type, subject_emphasis, description, on_screen_text, asset_id) — Phase B columns come later.
- `_shared/muse/campaign/` holds the research adapter (Firecrawl/Perplexity/safe-fetch behind one interface, portable), the diversity validator and the coverage scorer (pure functions with unit tests), and tool runtime handlers. `_shared/muse` stays free of Lovable-specific code.
- The Muse system prompt gets a campaign workflow section. Stages move forward only through tool calls, so recovery and replay stay idempotent (upsert keyed by campaign_id plus index).
- UI: a campaign panel inside `AdToolAgent.tsx` (stage, sources, pillars, per-video card with its fields and rationale, script, shot list, coverage score). EN/DE/ES.
- Docs: `docs/adtool-agent-muse.md` + `AGENTS.md` get one rule each.
- Roadmap: `roadmap.md` gets Phase A (active) plus Phases B–F listed as blocked until review, including the rule that Phase B's router must learn from past QA results per content category.
