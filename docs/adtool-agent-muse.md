# AdTool Agent (Meta Muse Spark 1.3)

Agentic layer that plans and executes video production on top of the existing
AdTool pipeline. Designed to be portable: nothing in the service depends on
Lovable-specific APIs, so it can be lifted to Railway or any Node/Deno host that
can reach the same Postgres schema and the existing generation endpoints.

## Components

| Path | Purpose |
| --- | --- |
| `supabase/functions/_shared/muse/config.ts` | Env-driven configuration + token cost estimate |
| `supabase/functions/_shared/muse/museClient.ts` | Meta **Responses API** client (`POST /v1/responses`) |
| `supabase/functions/_shared/muse/systemPrompt.ts` | Agent persona and hard behavioural limits |
| `supabase/functions/_shared/muse/tools.ts` | Tool JSON schemas (no execution logic) |
| `supabase/functions/_shared/muse/toolRuntime.ts` | Ownership-scoped tool execution |
| `supabase/functions/_shared/muse/videoModelCatalog.ts` | Generated snapshot of `src/config/videoModelSpecs.ts` |
| `supabase/functions/_shared/muse/agentLoop.ts` | Bounded reason → tool → observe loop + persistence |
| `supabase/functions/muse-agent/index.ts` | Authenticated HTTP endpoint, SSE stream |
| `src/services/muse/*` | Transport-agnostic browser client |
| `src/pages/AdToolAgent.tsx` | Operator console at `/agent` |

Regenerate the model catalog after changing `videoModelSpecs.ts`:

```
bun scripts/generate-muse-model-catalog.mjs
```

## Configuration (server-side only)

| Variable | Default | Notes |
| --- | --- | --- |
| `META_MODEL_API_KEY` | – | Required. Never exposed to the browser. |
| `META_MUSE_MODEL` | `muse-spark-1.3` | Switch models without touching the architecture. |
| `META_MODEL_BASE_URL` | `https://api.meta.ai/v1` | |
| `META_MUSE_MAX_TOOL_ITERATIONS` | `8` | Hard stop for the reasoning loop. |
| `META_MUSE_MAX_REGENERATIONS` | `2` | Automated retries per conversation. |
| `META_MUSE_MAX_TURN_SPEND` | `25` | Max committed generation spend per turn (wallet currency). |

## State

Backend-owned tables, no UI coupling:

- `agent_conversations` — user, model, `last_response_id` / `previous_response_id`,
  token totals, estimated AI cost, generation ids.
- `agent_messages` — user/assistant turns, tool calls, Meta response id.
- `agent_operations` — one row per tool call: arguments, result, status,
  generation id, attempt, estimated cost + currency.

Continuity across turns uses the Responses API `previous_response_id`.

## Budget safeguards

Before any paid tool runs:

1. Exact charge is computed from the canonical catalog
   (`_shared/videoPricingCatalog.ts` + account discount factor). Unknown price or
   unknown wallet currency → fail closed, nothing dispatched.
2. Wallet balance must cover the charge.
3. Per-turn spend cap (`META_MUSE_MAX_TURN_SPEND`).
4. `regenerate_video` is capped at `META_MUSE_MAX_REGENERATIONS` per conversation.
5. Generation always goes through the existing `generate-*-video` Edge Functions
   with the caller's JWT, so wallet RPCs, entitlements and capability gating are
   never bypassed.

The agent may not publish to social networks, send email, purchase anything,
change billing/subscriptions/permissions or delete assets.

## Endpoint

```
POST /functions/v1/muse-agent
Authorization: Bearer <user access token>
{ "message": "...", "conversationId": "<uuid|null>", "language": "en|de|es" }
```

Responds with `text/event-stream`; each frame is
`data: {"type": "conversation"|"tool_started"|"tool_result"|"message"|"usage"|"error"|"done", ...}`.

## Portability

To run the agent elsewhere, reuse `_shared/muse/*` unchanged and replace only
`muse-agent/index.ts` (HTTP + auth) and `src/services/muse/agentClient.ts`
(endpoint + token resolution).

## Approval gate (server-side)

`estimate_video_cost` creates a `pending` row in `agent_generation_approvals`
(exact model, duration, resolution, pricing id, cost, currency, optional
`retry_budget` 0–2). Only the signed-in user can confirm it via
`POST muse-agent {action:"approve"|"reject", approvalId}` (Confirm button in
`/agent`); approval is valid 15 min. `generate_video` requires the approved
`approval_id`, exact parameter + price match, and consumes it atomically
(single use). `regenerate_video` either uses a fresh approval or claims one
retry from the original approval's pre-approved `retry_budget` (2 h window).

## Video QA

`analyze_asset` with `generation_id` calls `agent-video-qa`, which reuses
`analyze-video-scenes` for segmentation and reviews the actual MP4 with the
verified gateway payloads (`input_video`, base64 fallback). Returns verdict,
per-category scores, timestamped issues and regeneration hints.

## Recovery from interrupted tool loops

After every tool batch the loop stores the outputs in
`agent_conversations.pending_tool_outputs` (+ `pending_response_id`) before
calling Meta again. If Meta fails, the outputs stay stored; the next user
message replays them as `function_call_output` against `pending_response_id`
first — tools are never re-executed. Pending state is cleared only after Meta
returns a successful response. Storage is full replacement keyed by `call_id`,
so repeated 5xx cannot apply a result twice. Logs: `[muse-recovery]
tools_executed | output_pending_delivery | output_delivered |
meta_failed_will_resume | resuming_pending_outputs`. Admins can pass
`"faultInject":"after_tools"` to simulate a Meta failure for no-cost tests.

## Async generation resume (agent_tasks)

When `generate_video`/`regenerate_video` returns a generation, the loop upserts
an `agent_tasks` row (`waiting_for_generation`, UNIQUE `generation_id`).
`agent-task-resume` (pg_cron every minute, only while waiting/analyzing tasks
exist) reads `ai_video_generations` (kept current by `replicate-webhook` /
`modelark-poll`) and:

- `failed` → task `failed` + one assistant message (`resume_task_id` unique).
- `completed` → `claim_agent_tasks()` atomically moves waiting → analyzing
  (SKIP LOCKED, at most once) and runs one Muse turn in the same conversation
  with an **internal** (hidden) instruction and a restricted tool set:
  `get_user_context, get_available_video_models, get_video_status, analyze_asset,
  estimate_video_cost`. Paid tools are refused server-side; a retry needs a new
  foreground approval. QA calls `agent-video-qa` with service key +
  `x-agent-user-id`.
- A trigger forbids terminal → non-terminal and analyzing → waiting. Analyzing
  tasks whose lease expired are failed, never re-run (QA at most once).
- `MUSE_AGENT_TASK_TIMEOUT_MINUTES` (default 60) only flags a slow task
  (`slow_since`); a still-processing generation is not failed before 24 h.

`/agent?conversation=<id>` restores messages (non-internal), operations,
approvals and tasks from the database; realtime on `agent_tasks` /
`agent_messages` plus a 20 s fallback poll while a task runs.

## Campaigns — Phase A (research + planning, no spending)
Tools: create_campaign, research_business (Perplexity + Firecrawl connector + safe-fetch website, robots.txt respected), record_research_findings (facts without a stored source = hypothesis), collect_campaign_assets (web = reference_only, own brand kit/Media Library = reuse_ok), identify_content_pillars, identify_business_areas, plan_campaign_videos (exact diversity rules + embeddings per dimension + Muse judgment for borderline pairs; max 3 revision rounds then flagged; fails closed), write_video_scripts (5–7 contiguous 2–8 s shots), get_campaign. Pure rules in `campaign/diversity.ts` (tested). Embeddings configurable via EMBEDDINGS_BASE_URL/EMBEDDINGS_API_KEY/EMBEDDINGS_MODEL. UI: campaign panel under the chat in /agent.

## Social profile research
`discover_social_profiles` finds Instagram, TikTok, Facebook and YouTube via website links, Firecrawl `site:` search and cited Perplexity research (handles must match the company name), then reads each profile publicly. Blocked/login-walled profiles become `not_accessible`. `record_social_analysis` stores posts, themes, visual style, formats/signals and gaps; `social_research_complete` gates any claim of full social analysis.
