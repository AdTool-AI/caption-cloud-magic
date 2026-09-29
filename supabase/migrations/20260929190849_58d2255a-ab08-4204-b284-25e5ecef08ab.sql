ALTER TABLE public.agent_conversations
  ADD COLUMN IF NOT EXISTS pending_tool_outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_response_id text;