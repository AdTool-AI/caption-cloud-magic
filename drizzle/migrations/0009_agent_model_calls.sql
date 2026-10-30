CREATE TABLE public.agent_model_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  turn_mode text NOT NULL,
  internal boolean NOT NULL DEFAULT false,
  step integer NOT NULL,
  chained boolean NOT NULL DEFAULT false,
  input_tokens integer NOT NULL DEFAULT 0,
  cached_tokens integer,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_model_calls TO authenticated;
GRANT ALL ON public.agent_model_calls TO service_role;
ALTER TABLE public.agent_model_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own model calls" ON public.agent_model_calls FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX agent_model_calls_conv_idx ON public.agent_model_calls (conversation_id, created_at);