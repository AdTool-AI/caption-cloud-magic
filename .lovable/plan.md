# Café Buur Video 1 — Retry plan preparation (no spend)

## Why a code change comes first
Today `prepare_shot_retry` only appends "Avoid: <issues>" to the old prompt and switches model only to the next stored candidate if it is not lower tier. For these five shots that means Kling 3 again with a slightly reworded prompt — exactly what you ruled out. It also ignores `model_qa_stats`, risk scores, text/branding and food logic, and returns no retry cost.

## What gets built
1. **Failure classes** — map each shot's QA issues into fixed classes: `anatomy_hands`, `face_identity`, `morphing`, `physics`, `food_logic`, `text_branding`, `flicker_motion`, `prompt_adherence`.
2. **Model re-ranking** — re-run the existing Phase B router for the shot with:
   - the persisted risk features (human_anatomy_risk, physics_risk, motion_complexity, …), raised to match what QA actually saw;
   - the current confidence-weighted `model_qa_stats` (Kling 3 now has real scores for drink/motion/people/text_brand);
   - the failed model penalized for the failure classes it showed.
   High hand/anatomy/physics risk makes other certified models eligible. Model switches only when another model ranks higher; the reason is recorded.
3. **Prompt rewrite by class** (rules, not "avoid X"):
   - `text_branding` → remove every on-screen text, logo, sign or label from the prompt; add a negative "no text, no letters, no logos"; mark the shot `composite_text_later` with the planned overlay text, for the Director's Cut overlays.
   - `food_logic` → explicit single physical action with start/end state (e.g. "pour stops before the rim, liquid level rises only while pouring"), object count fixed, no spontaneous appearing/vanishing items.
   - `anatomy_hands` → hands out of frame or holding one object in a simple fixed grip; fewer people; no finger close-ups.
   - `morphing / face_identity` → one subject, locked camera or one slow move, no cuts.
   - `physics / flicker_motion` → slower, single camera move, shorter action.
4. **Exact retry cost** — priced from the canonical catalog for the proposed model/duration/resolution, plus a check against the approval's retry allowance and remaining `max_total` (€6.80 cap). If a switch would exceed the approved budget, the plan says so instead of quietly choosing a cheaper model.
5. **Output** — `prepare_shot_retry` returns and stores per shot: original model, original prompt, failure classes, revised prompt, negative constraints, stay/switch, proposed model, exact cost, budget fit, and the reasoning. It stays free and never dispatches; `retry_shot` is unchanged.
6. **Tests** — text shot drops text and sets composite flag; food-logic shot gets action constraints; high anatomy risk + bad Kling stats makes an alternative model rank first; cost comes from the catalog; budget-exceeded case is reported; no paid tool called.

## Visual readiness vs. final ad readiness
7. **Two readiness levels** — a shot passing visual QA becomes `visual_client_ready`. A video (and the whole ad) is only `final_client_ready` once its planned voiceover, music/SFX, brand text, CTA and subtitles (if planned) are added and final QA has passed. Phase B can never set final readiness. The panel labels change to "Visual ready" vs. "Ad ready" (EN/DE/ES).
8. **Post-production requirements, persisted per shot and per video** so Phase C can use them without guessing:
   - `audio_required`, `audio_decision` (`native_useful` / `separate_sound_design` / `silent_until_composition`), `native_audio_preferred`
   - `voiceover_required`, `voiceover_language`, `voiceover_script`, `voiceover_source` (`native_model_verified` / `deferred_tts_phase_c`)
   - `music_direction`, `sfx_direction`
   - `composite_text_later`, `overlay_text`, `cta_text`, `brand_name_overlay`, `subtitles_required`
   Filled from the existing German scripts and content matrix of the campaign. Kling audio support is not treated as suitable by default; German speech is marked `deferred_tts_phase_c` unless verified for the chosen model.
9. **Text/branding** — on text QA failures the retry prompt carries no text, logos or signs; the exact wording (e.g. "Café Buur", "Brunch in Köln", "Jetzt Tisch reservieren") is stored for Director's Cut / Remotion overlays. Retry prompts always ask for the shot silent or with ambience only, per the audio decision.
10. **Visual-only fallback** — if native audio is unsuitable, the shot is kept visual-only and voice, music and SFX move to Phase C. Every prepared retry both stores and returns all of the fields above, plus `visual_client_ready`.

## Final planner rules
11. **Mode switch** — re-ranking can change both the model and the generation mode. A failed text-to-video shot can switch to image-to-video or reference mode when the campaign has a `reuse_ok` asset and that clearly lowers identity, anatomy or consistency risk. `reference_only` assets are never used as a frame.
12. **No trivial retries** — a prepared retry must clearly change at least one of: model, generation mode, prompt structure, motion plan, subject complexity, reference asset or duration. A change to the wording alone is rejected with `TRIVIAL_RETRY` and nothing is stored.
13. **Predicted improvement** — every proposal returns `predicted_improvement`: for each QA risk (anatomy, physics, food logic, text, morphing, flicker, identity), the expected direction of change and the concrete reason (for example "hands out of frame → anatomy risk ↓").

## Then (no spend)
Deploy only the changed functions, run `prepare_shot_retry` for S1–S5, and verify wallet €92.32, generation count 501, ledger 10 rows, no retries started. Phase C is not started.

Report per shot: original model and prompt, QA failure classes, revised visual prompt, negative constraints, stay/switch and proposed model, exact retry cost and budget fit, why it fixes the QA failures, text to composite later, audio decision, German voiceover requirement, music/SFX direction. Then stop.

## Technical details
- Files: `_shared/muse/campaign/production.ts` (prepareShotRetry, review readiness), new pure `_shared/muse/campaign/retryPlan.ts` and `postProduction.ts` + Deno tests, reuse existing router/risk/catalog modules; CampaignPanel shows the retry plan and both readiness levels (EN/DE/ES).
- Storage (additive migration): `campaign_shots.retry_plan` jsonb, `campaign_shots.visual_client_ready` boolean, `campaign_shots.post_production` jsonb, `campaign_videos.post_production` jsonb, `campaign_videos.final_client_ready` boolean (default false). Existing `client_ready` is kept and read as visual readiness.
- Extra tests: Phase B never sets final readiness; requirements are written once from the campaign scripts and survive retry preparation; German voiceover defaults to Phase C TTS.
- Untouched: pricing catalog, wallet, ledger, retry policy (manual_retry), routing weights, Lip-Sync, Director's Cut.
- roadmap.md gets the post-production/readiness task when build starts.
