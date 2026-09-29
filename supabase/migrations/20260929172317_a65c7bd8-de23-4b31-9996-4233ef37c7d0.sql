CREATE TABLE public.agent_generation_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  model text NOT NULL,
  duration_seconds numeric NOT NULL,
  resolution text NOT NULL,
  pricing_id text NOT NULL,
  cost numeric(12,2) NOT NULL,
  currency text NOT NULL CHECK (currency IN ('EUR','USD')),
  retry_budget integer NOT NULL DEFAULT 0 CHECK (retry_budget >= 0 AND retry_budget <= 5),
  retries_used integer NOT NULL DEFAULT 0,
  max_total_cost numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','consumed','expired','rejected')),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  consumed_at timestamptz,
  generation_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_generation_approvals TO authenticated;
GRANT ALL ON public.agent_generation_approvals TO service_role;
ALTER TABLE public.agent_generation_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own agent approvals" ON public.agent_generation_approvals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX agent_generation_approvals_convo_idx ON public.agent_generation_approvals (conversation_id, created_at DESC);
CREATE TRIGGER agent_generation_approvals_updated_at BEFORE UPDATE ON public.agent_generation_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();