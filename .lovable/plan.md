# AdTool Agent: background resume after video generation, and chats that survive leaving the page

## What you will get
- After you approve a video, the agent starts it, shows "Video is being generated — you can leave this page", and finishes the job on its own: it checks the result, runs the full-video quality check and gives its recommendation in the same chat. You don't have to type "continue".
- `/agent?conversation=<id>` reopens the same chat after a refresh or when you come back. It restores the messages, tool steps, cost approvals, the current task status and any finished videos.
- A "New chat" button and a short list of recent chats.
- The open page updates live when a video finishes.

## Existing parts reused (none of them changed)
- **Generation status**: `ai_video_generations` is already the source of truth. It gets updated by `replicate-webhook` (Replicate models) and `modelark-poll` (Seedance 2.5, safe to call repeatedly). The resume job only reads this table. It never calls a provider or a `generate-*-video` function.
- **Agent loop**: `_shared/muse/agentLoop.ts` stays as it is: Responses API, `previous_response_id`, pending-output recovery. Resuming just runs it again with a system-authored message on the same conversation.
- **Full-video QA**: unchanged `analyze_asset` → `agent-video-qa`.
- **Approvals, wallet, pricing, retry budget, dedup**: untouched. Resuming never goes through `generate_video`, so it can't cause a charge or a duplicate.
- **Scheduling**: the existing `pg_cron` + `pg_net` pattern already used by other pollers.

## Backend changes
1. Migration: new table `agent_tasks` (one row per generation the agent is waiting on):
   - `conversation_id`, `user_id`, `generation_id` (UNIQUE, so the same video is never tracked twice), `approval_id`
   - `status`: `planning | awaiting_approval | generating | waiting_for_generation | analyzing | completed | failed`
   - `result` jsonb, `error`, `resume_attempts`, `lease_until`, timestamps
   - Owner read-only RLS; `service_role` writes. Realtime enabled on `agent_tasks` and `agent_messages`.
   - `agent_conversations.status` column (mirrors the latest task status) for the chat list.
2. `toolRuntime.ts`: when `generate_video` or `regenerate_video` returns `processing`, insert an `agent_tasks` row (`waiting_for_generation`, upsert on generation_id). This adds one insert after the existing return value; the dispatch logic itself stays the same.
3. New function `agent-task-resume`, run by the scheduled job and admin-callable:
   - Takes a bounded batch (max 10) of `waiting_for_generation` tasks and uses a lease column so a task is only handled by one run at a time.
   - For in-flight Seedance 2.5 rows, it first calls the existing `modelark-poll` so their status moves forward.
   - Reads `ai_video_generations`. If still processing, it does nothing. If `failed`, it marks the task failed and adds an assistant message with the error.
   - If `completed`: sets `analyzing`, runs `runAgentTurn` on the same conversation with the user's identity (service-side, scoped to that user). The message is: "Generation <id> completed: <url>. Run full-video QA and continue the plan." Then it sets `completed` with the result.
   - Tasks older than 30 min are marked failed. Resume attempts are capped at 3. Meta 5xx relies on the existing pending-output recovery.
4. Cron job every 1 min, which is 1,440 runs per day. It only calls the function while waiting tasks exist: a SQL `WHERE EXISTS` guard, so idle ticks don't make HTTP calls. Every minute is the slowest interval that still gives a "finishes by itself" experience. Maximum delay is about 1 minute.
5. `muse-agent`: `generate_video` needs the user's JWT for the wallet path. Resuming never generates, so resume turns run with paid tools disabled. If the agent wants a retry, it creates a new quote/approval as it does today, and the user has to press Confirm.

## Frontend changes (`AdToolAgent.tsx`, `src/services/muse/`)
- Read `conversation` from the URL. Load the chat, messages, operations, approvals and tasks from the database. The database is the source of truth; no localStorage copy.
- Update the URL when the server announces a new conversation.
- Sidebar with the 20 most recent chats plus a "New chat" button.
- Task banner: "Video is being generated — you can leave this page", then analyzing, then completed or failed, with the video player once it's done.
- Live updates on `agent_messages` and `agent_tasks` for the open conversation, plus a 20 s fallback refresh while a task is waiting.
- New text in EN, DE and ES.

## Tests (no new paid generation)
- Café Buur generation `f60693a9-…`: read its current status and link it to its conversation as a task. If it's already completed, the next scheduled run resumes the chat and runs QA. Check: QA operation logged, assistant message added, generation count unchanged.
- Playwright while signed in: open the chat, go to another page, come back, refresh. History, operations and approval cards are still there.
- Simulated processing state on an existing generation: check the running banner, flip it to completed with the admin test path, check automatic resume and QA, and check that the generation and wallet counts are unchanged.

## Not changing
Meta integration, approval/single-use gate, wallet, pricing, retry budget, QA logic, pending-output recovery, generation functions, other studios.
