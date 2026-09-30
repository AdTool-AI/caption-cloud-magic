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
| Wallet / refunds | existing deduction + idempotent refund paths — remains the financial source of truth, untouched |
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
- Risk features (persisted, set at routing, used in scoring): `motion_complexity` (0–3), `human_anatomy_risk` (0–3), `physics_risk` (0–3), `identity_consistency_requirement` (0–3), `text_requirement` (0–3), `reference_strength` (0–3)

**`campaign_shot_attempts`** (append-only ledger, one row per generation)
- shot_id, attempt_no, generation_id UNIQUE, model, prompt, cost_charged, qa_verdict, qa_scores jsonb, qa_issues jsonb, client_ready, failure_class, created_at
- UNIQUE(shot_id, attempt_no) — no duplicate attempts

**`campaign_budget_approvals`**
- campaign_id, user_id, scope (list of shot ids + model/duration/resolution/price per shot), estimated_total, max_total (incl. retry allowance), retry_budget_per_shot, `retry_mode` (`manual_retry` | `auto_retry_within_budget`), status (pending | approved | rejected | expired | exhausted | closed), pricing_version
- Two separate expiries: `start_expires_at` (default 30 min — the user must start production within this window) and `execution_expires_at` (default 7 days — once started, the approved budget and retry allowance stay usable for the whole execution window, including automatic retries)
- `spent_total` kept only as a cached display value, derived from the ledger

**`campaign_spend_ledger`** (idempotent, append-only)
- approval_id, shot_id, generation_id (nullable for reserves), `entry_type` (reserve | charge | release | refund), amount, `idempotency_key` UNIQUE, created_at
- Every state change is a ledger row; `reserve_campaign_spend` inserts a reserve row atomically and refuses when reserved+charged would exceed `max_total`; charge/release/refund rows reconcile against the existing video-wallet accounting (which stays the financial source of truth)

**`model_qa_stats`** (incremental stats table, updated per QA event — no full materialized-view refresh)
- model, content_category, generation_mode, n_runs, n_client_ready, score_sum, issue_class_counts jsonb, last_updated
- Updated atomically per `review_shot` via a SQL function (`increment_model_qa_stats`) using `INSERT ... ON CONFLICT DO UPDATE SET n_runs = model_qa_stats.n_runs + 1, ...` — increments happen directly in PostgreSQL, never a read-modify-write sequence, so concurrent QA completions cannot lose updates
- Historic QA results backfilled once where a category can be inferred; uncategorised results ignored rather than guessed

All tables: GRANT, owner RLS read, service_role writes, updated_at triggers.

## 3. New Muse tools

Free (also allowed in background resume):
- `route_campaign_shots(campaign_id, video_ids?)` — fills category, risk features, mode, model, prompt, rationale per shot
- `estimate_campaign_budget(campaign_id)` — per-shot cost + retry allowance + total; creates a pending budget approval
- `get_campaign_production_status(campaign_id)`
- `review_shot(shot_id)` — runs full-video QA on the current attempt, writes verdict + `client_ready`, updates `model_qa_stats`
- `prepare_shot_retry(shot_id)` — rewrites prompt / switches model from QA issues, checks remaining budget, no spend

Paid:
- `start_campaign_production(approval_id)` — foreground only; dispatches approved shots
- `retry_shot(shot_id)` — foreground in `manual_retry` mode; **also callable by the durable campaign worker** (never by Muse background turns) when the approval is `auto_retry_within_budget`

## 4. Model-routing logic

For each shot, deterministic server-side scoring (Muse gets the ranked list and may pick from the top candidates only):

1. **Hard filter** via specs: mode supported, duration, aspect ratio, resolution tier available, capability gate passes. Unavailable/removed models excluded.
2. **Mode decision:**
   - `reuse_ok` asset matching the hero subject (logo, product photo, upload) → i2v/reference
   - only `reference_only` assets → t2v with description derived from the asset
   - brand text itself is left for composition (Phase C), never asked of the model
3. **Risk uplift:** the six persisted risk features qualify the shot for a stronger model. Example: a static plated-food hero (low motion/anatomy/physics) and a hand pouring latte art (high anatomy, motion, physics) are both "food/drink" — the latte-art shot routes to a model with proven people/motion strength. Rule: any risk feature ≥ 2 raises the minimum quality tier; `identity_consistency_requirement ≥ 2` prefers i2v/reference and models with strong face retention; `text_requirement ≥ 2` flags the shot for composited text instead of generative text.
4. **Score** = confidence-weighted quality prior (category × mode, from `model_qa_stats`) × 0.5 + capability/risk fit × 0.25 + price efficiency × 0.15 + consistency with neighbour shots × 0.1.
5. **Budget awareness:** never optimise only for price; a cheaper model is picked only if its quality prior is within 10% of the best.

## 5. QA learning logic (confidence-weighted)

- Every `review_shot` upserts `model_qa_stats` for that model × category × mode (incremental, one row update).
- **Confidence weighting:** effective quality = Bayesian blend `prior × w + observed × (1 − w)` where `w = k / (k + n_runs)`, k = 5. With few runs the static spec prior dominates; as `n_runs` grows, observed results take over. Tiny samples never strongly penalise a model.
- `routing_rationale.confidence` = low | medium | high from `n_runs`, shown in the UI.
- Issue classes (anatomy, faces, hands, food_logic, physics, text, flicker, morphing, prompt_miss) are counted per model × category, so a model that repeatedly fails "people" shots drops for people shots only.

## 6. Approval and budget mechanics

1. Muse calls `estimate_campaign_budget` → card in `/agent`: per-shot table (model, seconds, resolution, price), estimated total, maximum total incl. retries, retry mode choice (manual / automatic within budget), wallet sufficiency. EN/DE/ES.
2. User clicks Confirm → one campaign approval with `start_expires_at` (30 min) and `execution_expires_at` (7 days), scoped to user, campaign, exact shot list and pricing version.
3. Production must start before `start_expires_at`; once started, budget and retry allowance remain authorized until `execution_expires_at`.
4. Each shot dispatch creates a derived per-shot entry in the existing `agent_generation_approvals` (same exact-scope checks), so `generate-*-video` and the existing gate are unchanged.
5. All money movement goes through `campaign_spend_ledger` rows (reserve → charge on dispatch, release/refund on failure) with deterministic idempotency keys; the cap is enforced atomically on reserve. If price changed since the quote → refuse, ask for a new approval.
6. Refunds from failed provider runs flow through existing refund paths and add a `refund` ledger row.

## 7. Retry rules (two modes)

- Only shots with `client_ready = false` may retry. Physically absurd content (e.g. coffee poured onto a croissant) is a hard fail.
- Max retries per shot = `retry_budget_per_shot` (default 1), and total spend never exceeds `max_total`.
- Retry = new prompt and/or next-ranked model from `prepare_shot_retry`; identical re-run of the same prompt+model is refused.
- Provider failures (refunded) do not consume the QA retry allowance but count against a hard cap of 2 dispatch attempts.
- **`manual_retry` (default):** background resume prepares the retry and asks the user; execution only from the foreground.
- **`auto_retry_within_budget`:** the durable campaign worker (server-side, not a Muse turn) may execute the narrowly scoped retry prepared by `prepare_shot_retry` after failed QA, without another UI interaction — same ledger reserve, same per-shot allowance, same model/prompt diff recorded. Muse background turns still never receive unrestricted paid tools.
- After the allowance is exhausted, the shot is `failed`; the user can accept it (`accepted_by_user`) or approve extra budget.

## 8. Durable async execution

- One `agent_tasks` row per shot attempt (generation_id UNIQUE, existing atomic claim).
- On completion the background turn runs `review_shot`, updates the shot and stats, and posts at most one progress message per video (unique per task).
- In `auto_retry_within_budget` mode the worker then executes an eligible prepared retry directly (ledger reserve + dispatch, no Muse paid tool).
- When all shots of a video are terminal, the campaign stage moves to `qa` → `editing_ready` (Phase C entry point). Stages move only via tool calls.
- Timeout flag via `MUSE_AGENT_TASK_TIMEOUT_MINUTES`; slow is not failed.

## 9. Acceptance tests (existing Café Buur campaign 008c498d)

No-cost first:
1. Routing on all 6 videos × 5 shots: every shot gets category, all six risk features, mode, model, prompt, rationale; no `reference_only` asset used as a first frame.
2. Risk routing: a seeded static plated-food shot and a hand-pouring-latte-art shot (both "food/drink") route to different strength tiers.
3. QA-learning: seeded attempt rows make a model drop for one category only; with n < 5 runs the penalty stays small (confidence-weighted blend verified against the formula).
4. Budget estimate matches the pricing catalog per shot to the cent; one pending approval with both expiry fields created.
5. Ledger: reserve/charge/release/refund rows with idempotency keys; duplicate reserve with the same key is a no-op; concurrent reserves exceeding `max_total` are refused (true race test).
6. Expiry split: approval refused after `start_expires_at` when not started; still usable after `start_expires_at` when started, until `execution_expires_at`.
7. Background Muse turn attempting `start_campaign_production` / `retry_shot` is rejected server-side in both retry modes.
8. `auto_retry_within_budget`: worker executes one prepared retry after failed QA with no UI interaction; `manual_retry`: worker only asks.

Paid (only after your explicit approval, smallest scope — one video, exact price shown first). The router is NOT overridden to force a cheap model: all six Café Buur videos are routed normally, then the lowest-cost of the six routed videos is picked for the first paid test, with routed model, risk logic and quality thresholds intact:
9. Generate all shots of one video; each gets full-video QA and a `client_ready` decision.
10. One failed shot retries once within budget with a changed prompt/model; no duplicate generation, QA or message; ledger shows exactly one reserve + one charge per attempt.
11. Wallet spend equals sum of ledger `charge` rows minus `refund` rows; total ≤ `max_total`.
12. Refresh / leave `/agent` mid-production: state restores, completion resumes automatically.

## Technical notes

- New code in `_shared/muse/campaign/{routing.ts, budget.ts, production.ts}`, pure scoring/blend functions with unit tests; stays free of Lovable-specific APIs.
- `AGENTS.md` gets one rule: campaign spend only through the spend ledger + existing approval gate.
- Risks: price drift between quote and dispatch (pricing_version check); sparse QA history (confidence-weighted prior); QA false negatives (user can accept a shot).
