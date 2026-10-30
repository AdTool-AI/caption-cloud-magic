CREATE TABLE public.agent_workflow_settings (
  user_id uuid PRIMARY KEY,
  engine_mode text NOT NULL DEFAULT 'off' CHECK (engine_mode IN ('off','shadow','internal_only')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_workflow_settings TO authenticated;
GRANT ALL ON public.agent_workflow_settings TO service_role;
ALTER TABLE public.agent_workflow_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own workflow settings read" ON public.agent_workflow_settings FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.agent_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  campaign_id uuid,
  video_id uuid NOT NULL,
  state text NOT NULL,
  boundary jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  state_fingerprint text,
  version integer NOT NULL DEFAULT 1,
  mode text NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow','internal_only')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_workflows_one_open ON public.agent_workflows (conversation_id, video_id) WHERE status = 'open';
CREATE INDEX agent_workflows_user ON public.agent_workflows (user_id, updated_at DESC);
GRANT SELECT ON public.agent_workflows TO authenticated;
GRANT ALL ON public.agent_workflows TO service_role;
ALTER TABLE public.agent_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own workflows read" ON public.agent_workflows FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.agent_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workflow_id uuid NOT NULL REFERENCES public.agent_workflows(id) ON DELETE CASCADE,
  step_kind text NOT NULL,
  idempotency_key text NOT NULL,
  input_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  lease_owner text,
  lease_until timestamptz,
  attempt integer NOT NULL DEFAULT 0,
  error text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workflow_id, idempotency_key)
);
GRANT SELECT ON public.agent_workflow_steps TO authenticated;
GRANT ALL ON public.agent_workflow_steps TO service_role;
ALTER TABLE public.agent_workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own workflow steps read" ON public.agent_workflow_steps FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.agent_workflow_shadow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  workflow_id uuid REFERENCES public.agent_workflows(id) ON DELETE SET NULL,
  video_id uuid,
  request_id text,
  turn_mode text,
  engine_state text,
  expected_next_action text,
  expected_tools text[] NOT NULL DEFAULT '{}',
  observed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  match boolean,
  mismatch_reason text,
  forbidden_transition text,
  loop_detected boolean NOT NULL DEFAULT false,
  intent_hash text,
  state_fingerprint text,
  turn_error text,
  tool_calls integer NOT NULL DEFAULT 0,
  read_calls integer NOT NULL DEFAULT 0,
  model_calls integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_workflow_shadow_events_conv ON public.agent_workflow_shadow_events (conversation_id, created_at DESC);
GRANT SELECT ON public.agent_workflow_shadow_events TO authenticated;
GRANT ALL ON public.agent_workflow_shadow_events TO service_role;
ALTER TABLE public.agent_workflow_shadow_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own shadow events read" ON public.agent_workflow_shadow_events FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Optimistic-lock transition: compare-and-set on (version, state) in one statement.
CREATE OR REPLACE FUNCTION public.workflow_transition(p_id uuid, p_expected_version integer, p_from text, p_to text, p_boundary jsonb, p_next jsonb, p_fp text)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.agent_workflows
     SET state = p_to, boundary = coalesce(p_boundary, boundary), next_action = coalesce(p_next, next_action),
         state_fingerprint = p_fp, version = version + 1, updated_at = now()
   WHERE id = p_id AND version = p_expected_version AND state = p_from AND status = 'open'
  RETURNING version;
$$;

-- Atomic step claim: exactly one worker wins a pending/failed/expired-lease step.
CREATE OR REPLACE FUNCTION public.workflow_claim_step(p_step uuid, p_owner text, p_lease_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.agent_workflow_steps
     SET status = 'running', lease_owner = p_owner, lease_until = now() + make_interval(secs => p_lease_seconds),
         attempt = attempt + 1, updated_at = now()
   WHERE id = p_step
     AND (status IN ('pending','failed') OR (status = 'running' AND lease_until < now()));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$;

REVOKE ALL ON FUNCTION public.workflow_transition(uuid,integer,text,text,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workflow_claim_step(uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workflow_transition(uuid,integer,text,text,jsonb,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.workflow_claim_step(uuid,text,integer) TO service_role;