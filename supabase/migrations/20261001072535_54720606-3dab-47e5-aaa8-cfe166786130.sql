-- Phase B: campaign shot production (routing, budget, ledger, QA learning)

ALTER TABLE public.campaign_shots
  ADD COLUMN IF NOT EXISTS content_category text,
  ADD COLUMN IF NOT EXISTS generation_mode text,
  ADD COLUMN IF NOT EXISTS input_asset_id uuid,
  ADD COLUMN IF NOT EXISTS english_prompt text,
  ADD COLUMN IF NOT EXISTS negative_constraints text,
  ADD COLUMN IF NOT EXISTS selected_model text,
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS duration_s numeric,
  ADD COLUMN IF NOT EXISTS aspect_ratio text,
  ADD COLUMN IF NOT EXISTS routing_rationale jsonb,
  ADD COLUMN IF NOT EXISTS estimated_cost numeric,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS current_generation_id uuid,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_ready boolean,
  ADD COLUMN IF NOT EXISTS qa_summary jsonb,
  ADD COLUMN IF NOT EXISTS motion_complexity smallint,
  ADD COLUMN IF NOT EXISTS human_anatomy_risk smallint,
  ADD COLUMN IF NOT EXISTS physics_risk smallint,
  ADD COLUMN IF NOT EXISTS identity_consistency_requirement smallint,
  ADD COLUMN IF NOT EXISTS text_requirement smallint,
  ADD COLUMN IF NOT EXISTS reference_strength smallint,
  ADD COLUMN IF NOT EXISTS retry_prompt text,
  ADD COLUMN IF NOT EXISTS retry_model text,
  ADD COLUMN IF NOT EXISTS retry_reason text,
  ADD COLUMN IF NOT EXISTS retry_prepared_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER update_campaign_shots_updated_at BEFORE UPDATE ON public.campaign_shots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_timestamp();

CREATE TABLE public.campaign_shot_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_id uuid NOT NULL REFERENCES public.campaign_shots(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  attempt_no integer NOT NULL,
  generation_id uuid UNIQUE,
  model text,
  prompt text,
  cost_charged numeric,
  qa_verdict text,
  qa_scores jsonb,
  qa_issues jsonb,
  client_ready boolean,
  failure_class text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shot_id, attempt_no)
);
GRANT SELECT ON public.campaign_shot_attempts TO authenticated;
GRANT ALL ON public.campaign_shot_attempts TO service_role;
ALTER TABLE public.campaign_shot_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON public.campaign_shot_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.campaign_budget_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  conversation_id uuid,
  scope jsonb NOT NULL,
  estimated_total numeric NOT NULL,
  max_total numeric NOT NULL,
  retry_budget_per_shot integer NOT NULL DEFAULT 1,
  retry_mode text NOT NULL DEFAULT 'manual_retry',
  status text NOT NULL DEFAULT 'pending',
  pricing_version text NOT NULL,
  start_expires_at timestamptz NOT NULL,
  execution_expires_at timestamptz NOT NULL,
  started_at timestamptz,
  spent_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.campaign_budget_approvals TO authenticated;
GRANT ALL ON public.campaign_budget_approvals TO service_role;
ALTER TABLE public.campaign_budget_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON public.campaign_budget_approvals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_campaign_budget_approvals_updated_at BEFORE UPDATE ON public.campaign_budget_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_timestamp();

CREATE TABLE public.campaign_spend_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL REFERENCES public.campaign_budget_approvals(id) ON DELETE CASCADE,
  shot_id uuid REFERENCES public.campaign_shots(id) ON DELETE SET NULL,
  generation_id uuid,
  entry_type text NOT NULL,
  amount numeric NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.campaign_spend_ledger TO authenticated;
GRANT ALL ON public.campaign_spend_ledger TO service_role;
ALTER TABLE public.campaign_spend_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON public.campaign_spend_ledger FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaign_budget_approvals a WHERE a.id = approval_id AND a.user_id = auth.uid()));

CREATE TABLE public.model_qa_stats (
  model text NOT NULL,
  content_category text NOT NULL,
  generation_mode text NOT NULL,
  n_runs integer NOT NULL DEFAULT 0,
  n_client_ready integer NOT NULL DEFAULT 0,
  score_sum numeric NOT NULL DEFAULT 0,
  issue_class_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_updated timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model, content_category, generation_mode)
);
GRANT SELECT ON public.model_qa_stats TO authenticated;
GRANT ALL ON public.model_qa_stats TO service_role;
ALTER TABLE public.model_qa_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read" ON public.model_qa_stats FOR SELECT TO authenticated USING (true);

-- Atomic stats increment: no read-modify-write, safe under concurrent QA completions.
CREATE OR REPLACE FUNCTION public.increment_model_qa_stats(
  _model text, _category text, _mode text, _client_ready boolean, _score numeric, _issues jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.model_qa_stats (model, content_category, generation_mode, n_runs, n_client_ready, score_sum, issue_class_counts, last_updated)
  VALUES (_model, _category, _mode, 1, CASE WHEN _client_ready THEN 1 ELSE 0 END, COALESCE(_score, 0), COALESCE(_issues, '{}'::jsonb), now())
  ON CONFLICT (model, content_category, generation_mode) DO UPDATE SET
    n_runs = public.model_qa_stats.n_runs + 1,
    n_client_ready = public.model_qa_stats.n_client_ready + CASE WHEN _client_ready THEN 1 ELSE 0 END,
    score_sum = public.model_qa_stats.score_sum + COALESCE(_score, 0),
    issue_class_counts = (
      SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
      FROM (
        SELECT key, SUM(value)::int AS value FROM (
          SELECT key, value::int FROM jsonb_each_text(public.model_qa_stats.issue_class_counts)
          UNION ALL
          SELECT key, value::int FROM jsonb_each_text(COALESCE(_issues, '{}'::jsonb))
        ) s GROUP BY key
      ) g
    ),
    last_updated = now();
$$;

-- Idempotent ledger entry (charge/release/refund). Duplicate idempotency keys are no-ops.
CREATE OR REPLACE FUNCTION public.campaign_ledger_entry(
  _approval_id uuid, _shot_id uuid, _generation_id uuid, _entry_type text, _amount numeric, _key text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _entry_type NOT IN ('reserve','charge','release','refund') THEN
    RAISE EXCEPTION 'invalid entry_type %', _entry_type;
  END IF;
  INSERT INTO public.campaign_spend_ledger (approval_id, shot_id, generation_id, entry_type, amount, idempotency_key)
  VALUES (_approval_id, _shot_id, _generation_id, _entry_type, _amount, _key)
  ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.campaign_budget_approvals a SET spent_total = COALESCE((
    SELECT SUM(CASE WHEN l.entry_type IN ('reserve','charge') THEN l.amount ELSE -l.amount END)
    FROM public.campaign_spend_ledger l WHERE l.approval_id = a.id
  ), 0) WHERE a.id = _approval_id;
  RETURN true;
END;
$$;

-- Atomic budget reservation with cap enforcement (locks the approval row).
CREATE OR REPLACE FUNCTION public.reserve_campaign_spend(
  _approval_id uuid, _shot_id uuid, _amount numeric, _key text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.campaign_budget_approvals%ROWTYPE;
  committed numeric;
BEGIN
  SELECT * INTO a FROM public.campaign_budget_approvals WHERE id = _approval_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'approval not found'; END IF;
  IF a.status NOT IN ('approved','started') THEN RAISE EXCEPTION 'approval not active (%)', a.status; END IF;
  IF now() > a.execution_expires_at THEN RAISE EXCEPTION 'execution window expired'; END IF;
  SELECT COALESCE(SUM(CASE WHEN l.entry_type IN ('reserve','charge') THEN l.amount ELSE -l.amount END), 0)
    INTO committed FROM public.campaign_spend_ledger l WHERE l.approval_id = a.id;
  IF committed + _amount > a.max_total THEN RETURN false; END IF;
  INSERT INTO public.campaign_spend_ledger (approval_id, shot_id, entry_type, amount, idempotency_key)
  VALUES (_approval_id, _shot_id, 'reserve', _amount, _key)
  ON CONFLICT (idempotency_key) DO NOTHING;
  UPDATE public.campaign_budget_approvals SET spent_total = committed + _amount WHERE id = _approval_id;
  RETURN true;
END;
$$;
