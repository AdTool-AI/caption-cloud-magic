# AdTool Agent Campaigns — Phase B (routing, budget, generation, per-shot QA)

Phase A is completed. This plan covers Phase B only. Nothing is built until approved. Phase C (voice/music/composition) stays blocked.

## 1. Existing infrastructure reused (no duplicates)

| Need | Reused |
|---|---|
| Agent loop, recovery, replay | `_shared/muse/agentLoop.ts`, `pending_tool_outputs` |
| Model capabilities | `_shared/videoModelSpecs.ts` + `videoModelCatalog.ts`, `capabilityGate()` |
| Prices | `_shared/videoPricingCatalog.ts` (only price source) |
| Approval gate | `agent_generation_approvals` (single-use, exact scope, retry budget) |
| Generation | existing `generate-*-video` functions, called with the user's JWT |
| Wallet / refunds | existing deduction + idempotent refund paths, untouched |
| Async completion | `agent_tasks`, `claim_agent_tasks`, `agent-task-resume` cron, `replicate-webhook`, `modelark-poll` |
| Output measurement | `recordGenerationOutput()` (measured pixels, verdict) |
| QA | `agent-video-qa` (full MP4 via URL, base64 fallback) |
| Campaign data | `agent_campaigns`, `campaign_videos`, `campaign_shots`, `campaign_assets` (reuse_status) |
| UI | `/agent` + `CampaignPanel.tsx`, approval cards |

Not touched: Lip-Sync, Composer scene state machine, pricing values, wallet logic, billing.

## 2. New schema / fields

**`campaign_shots` (new columns)**
- `content_category` (food, drink, people, interior, product, text_brand, motion, exterior)
- `generation_mode` (t2v | i2v | reference) and `input_asset_id` (must be `reuse_ok` if the pixels end up in output; `reference_only` assets may only guide prompts, never be sent as a first frame)
- `english_prompt`, `negative_constraints`
- `selected_model`, `resolution`, `duration_s`, `aspect_ratio`
- `routing_rationale` jsonb (candidates, scores, why chosen)
- `estimated_cost`, `status` (planned | quoted | approved | generating | qa | client_ready | needs_retry | failed | accepted_by_user | skipped)
- `current_generation_id`, `attempt_count`, `client_ready` boolean, `qa_summary` jsonb

**`campaign_shot_attempts`** (append-only ledger, one row per generation)
- shot_id, attempt_no, generation_id UNIQUE, model, prompt, cost_charged, qa_verdict, qa_scores jsonb, qa_issues jsonb, client_ready, failure_class, created_at
- UNIQUE(shot_id, attempt_no) — no duplicate attempts

**`campaign_budget_approvals`**
- campaign_id, user_id, scope (list of shot ids + model/duration/resolution/price per shot), estimated_total, max_total (incl. retry allowance), retry_budget_per_shot, spent_total, status (pending | approved | rejected | expired | exhausted | closed), expires_at, pricing_version
- Spend is recorded atomically via a DB function `reserve_campaign_spend(approval_id, shot_id, amount)` that refuses when `spent_total + amount > max_total`

**`model_qa_stats`** (materialised learning view, refreshed on each QA)
- model, content_category, generation_mode, n_runs, n_client_ready, avg_score, top_issue_classes, last_updated
- Built from `campaign_shot_attempts` plus historic `agent_operations` QA results that carry a category

All tables: GRANT, owner RLS read, service_role writes, updated_at triggers.

## 3. New Muse tools

Free (also allowed in background resume):
- `route_campaign_shots(campaign_id, video_ids?)` — fills category, mode, model, prompt, rationale per shot
- `estimate_campaign_budget(campaign_id)` — per-shot cost + retry allowance + total; creates a pending budget approval
- `get_campaign_production_status(campaign_id)`
- `review_shot(shot_id)` — runs full-video QA on the current attempt, writes verdict + `client_ready`
- `prepare_shot_retry(shot_id)` — rewrites prompt / switches model from QA issues, checks remaining budget, no spend

Paid (foreground only, never in background turns):
- `start_campaign_production(approval_id)` — dispatches approved shots
- `retry_shot(shot_id)` — only within the approved budget and retry allowance

## 4. Model-routing logic

For each shot, deterministic server-side scoring (Muse gets the ranked list and may pick from the top candidates only):

1. **Hard filter** via specs: mode supported, duration, aspect ratio, resolution tier available, capability gate passes. Unavailable/removed models excluded.
2. **Mode decision:**
   - `reuse_ok` asset matching the hero subject (logo, product photo, upload) → i2v/reference
   - only `reference_only` assets → t2v with description derived from the asset
   - people-heavy or text/brand shots → prefer i2v when a usable asset exists; brand text itself is left for composition (Phase C), never asked of the model
3. **Score** = quality prior (from `model_qa_stats` for category × mode) × 0.55 + capability fit × 0.2 + price efficiency × 0.15 + consistency with neighbour shots in the same video × 0.1.
4. **Cold start:** fewer than 5 runs in a category → blend with a static prior from the specs group (flagship/professional) and mark `routing_rationale.confidence = low`.
5. **Budget awareness:** never optimise only for price; a cheaper model is picked only if its quality prior is within 10% of the best.

## 5. QA learning logic

- Every `review_shot` writes the attempt row with category, mode, model, scores, issue classes (anatomy, faces, hands, food_logic, physics, text, flicker, morphing, prompt_miss).
- `model_qa_stats` is recalculated for that model × category × mode.
- Historic QA results (Café Buur clips, earlier agent runs) are backfilled once where a category can be inferred; uncategorised results are ignored rather than guessed.
- The router reads these stats on the next routing call, so a model that repeatedly fails "people" shots drops for people shots only.

## 6. Approval and budget mechanics

1. Muse calls `estimate_campaign_budget` → card in `/agent`: per-shot table (model, seconds, resolution, price), estimated total, maximum total incl. retries, wallet sufficiency. EN/DE/ES.
2. User clicks Confirm → one campaign approval, short-lived (default 30 min to start), scoped to user, campaign, exact shot list and pricing version.
3. Each shot dispatch creates a derived per-shot entry in the existing `agent_generation_approvals` (same exact-scope checks), so `generate-*-video` and the existing gate are unchanged.
4. `reserve_campaign_spend` enforces the cap atomically before each dispatch. If price changed since the quote → refuse, ask for a new approval.
5. Refunds from failed provider runs flow through existing refund paths and reduce `spent_total`.

## 7. Retry rules

- Only shots with `client_ready = false` may retry. Physically absurd content (e.g. coffee poured onto a croissant) is a hard fail.
- Max retries per shot = `retry_budget_per_shot` (default 1), and total never exceeds `max_total`.
- Retry = new prompt and/or next-ranked model from `prepare_shot_retry`; identical re-run of the same prompt+model is refused.
- Provider failures (refunded) do not consume the QA retry allowance but do count against a hard cap of 2 dispatch attempts.
- Background resume can prepare a retry but never run it; if budget remains and the user enabled "auto-retry within approval", the retry runs only from the foreground-issued approval — otherwise the user is asked.
- After the allowance is exhausted, the shot is `failed`; the user can accept it (`accepted_by_user`) or approve extra budget.

## 8. Durable async execution

- One `agent_tasks` row per shot attempt (generation_id UNIQUE, existing atomic claim).
- On completion the background turn runs `review_shot`, updates the shot, and posts at most one progress message per video (unique per task).
- When all shots of a video are terminal, the campaign stage moves to `qa` → `editing_ready` (Phase C entry point). Stages move only via tool calls.
- Timeout flag via `MUSE_AGENT_TASK_TIMEOUT_MINUTES`; slow is not failed.

## 9. Acceptance tests (existing Café Buur campaign 008c498d)

No-cost first:
1. Routing on all 6 videos × 5 shots: every shot gets category, mode, model, prompt, rationale; no `reference_only` asset used as a first frame.
2. QA-learning: seeded attempt rows make a model drop for one category only.
3. Budget estimate matches the pricing catalog per shot to the cent; one pending approval created.
4. Cap test: `reserve_campaign_spend` refuses when exceeding `max_total` (concurrent calls, true race).
5. Background turn attempting `start_campaign_production` / `retry_shot` is rejected server-side.
6. Expired/altered approval (price or shot list change) is refused.

Paid (only after your explicit approval, smallest scope — one video, cheapest valid settings, exact price shown first):
7. Generate all shots of one video; each gets full-video QA and a `client_ready` decision.
8. One failed shot retries once within budget with a changed prompt/model; no duplicate generation, QA or message.
9. Wallet spend equals sum of `cost_charged`; `spent_total` ≤ `max_total`.
10. Refresh / leave `/agent` mid-production: state restores, completion resumes automatically.

## Technical notes

- New code in `_shared/muse/campaign/{routing.ts, budget.ts, production.ts}`, pure scoring functions with unit tests; stays free of Lovable-specific APIs.
- `AGENTS.md` gets one rule: campaign spend only through `reserve_campaign_spend` + existing approval gate.
- Risks: price drift between quote and dispatch (handled by pricing_version check); sparse QA history (cold-start prior); QA false negatives (user can accept a shot).
