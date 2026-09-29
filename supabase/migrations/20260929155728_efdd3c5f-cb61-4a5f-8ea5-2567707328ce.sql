-- AdTool Agent (Meta Muse) — backend-owned conversation/task state.
-- Deliberately free of Lovable/UI-specific structures so the same agent can
-- run from any Node/Deno backend against this schema.

CREATE TABLE public.agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text,
  status text NOT NULL DEFAULT 'active',
  model text NOT NULL,
  last_response_id text,
  previous_response_id text,
  total_input_tokens bigint NOT NULL DEFAULT 0,
  total_output_tokens bigint NOT NULL DEFAULT 0,
  estimated_ai_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  generation_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_conversations TO authenticated;
GRANT ALL ON public.agent_conversations TO service_role;
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own agent conversations select" ON public.agent_conversations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own agent conversations insert" ON public.agent_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own agent conversations update" ON public.agent_conversations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own agent conversations delete" ON public.agent_conversations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_agent_conversations_user ON public.agent_conversations (user_id, updated_at DESC);

CREATE TABLE public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  response_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.agent_messages TO authenticated;
GRANT ALL ON public.agent_messages TO service_role;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own agent messages select" ON public.agent_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own agent messages insert" ON public.agent_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_agent_messages_conversation ON public.agent_messages (conversation_id, created_at);

CREATE TABLE public.agent_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tool_name text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  generation_id uuid,
  parent_generation_id uuid,
  attempt integer NOT NULL DEFAULT 1,
  estimated_cost numeric(12,4),
  estimated_cost_currency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agent_operations TO authenticated;
GRANT ALL ON public.agent_operations TO service_role;
ALTER TABLE public.agent_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own agent operations select" ON public.agent_operations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_agent_operations_conversation ON public.agent_operations (conversation_id, created_at);
CREATE INDEX idx_agent_operations_user ON public.agent_operations (user_id, created_at DESC);

CREATE TRIGGER trg_agent_conversations_updated_at
  BEFORE UPDATE ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_agent_operations_updated_at
  BEFORE UPDATE ON public.agent_operations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
