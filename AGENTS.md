# Project rules

- The AdTool Agent (Meta Muse Spark 1.3) lives in `supabase/functions/_shared/muse/` and must stay free of Lovable-specific APIs — so the same service can later run on an external host. See `docs/adtool-agent-muse.md`.
- Agent conversation/operation state lives in `agent_conversations` / `agent_messages` / `agent_operations`, never in UI state — the backend owns continuity and cost accounting.
- Paid agent tools price from the canonical `_shared/videoPricingCatalog.ts` and dispatch through the existing `generate-*-video` Edge Functions with the caller's JWT — never re-implement pricing, wallet deduction or provider calls.
