# Switch Phase A business research to the Perplexity Agent API

## Goal
Swap the current Perplexity "sonar" chat call in the agent's business research for the Perplexity Agent API (web search + page reading, with source links). Nothing else changes: no paid video tools, wallet, pricing or Phase B work.

## Why the Agent API fits
Research needs a written summary with sources, so the Agent API fits better than the Search API, which returns only a list of links. Firecrawl and the website reader stay in place as backups.

## Steps
1. Read the Agent API docs (quickstart, presets, tools, output control, the /v1/agent reference) and copy the request and response shape exactly.
2. In `perplexityResearch()`, call `POST https://api.perplexity.ai/v1/agent` with the same `PERPLEXITY_API_KEY`, `preset: "low"` (upgrade later if needed), `tools: [{type:"web_search"},{type:"fetch_url"}]`, and the same system instructions. Read the answer from `output_text`, and read sources from `search_results` and the answer's URL citations.
3. Use a plain `fetch` call, with no SDK. This keeps `_shared/muse` free of Lovable-specific code and avoids adding a Deno dependency.
4. Handle errors clearly: 401 insufficient_quota means "top up Perplexity credits", and 429 honors Retry-After. Firecrawl still takes over automatically.
5. Smoke test: one small real request, logging only the HTTP status and response shape. If the account still has no credits, report that and stop there.
6. Re-run the Phase A Café Buur research as a free check: sources come back cited and the video wallet stays unchanged.

## Not changed
Wallet, pricing, approvals, generation, Lip-Sync and Phase B.
