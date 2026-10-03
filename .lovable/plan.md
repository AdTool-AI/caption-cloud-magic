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

## Then (no spend)
Deploy only the changed functions, run `prepare_shot_retry` for S1–S5, and verify wallet €92.32, generation count 501, ledger 10 rows, no retries started. Report the retry plan as a table per shot and stop.

## Technical details
- Files: `_shared/muse/campaign/production.ts` (prepareShotRetry), new pure `_shared/muse/campaign/retryPlan.ts` + tests, reuse existing router/risk/catalog modules; small UI addition in CampaignPanel to show the prepared retry (EN/DE/ES).
- Storage: existing `retry_prompt`, `retry_model`, `retry_reason` columns plus a `retry_plan` JSON column (migration, additive only).
- Untouched: pricing catalog, wallet, ledger, retry policy (manual_retry), routing weights, Lip-Sync.
