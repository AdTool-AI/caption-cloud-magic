ALTER TABLE public.campaign_budget_approvals
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS retry_binding jsonb,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS consumed_attempt_no integer;

ALTER TABLE public.campaign_budget_approvals
  ADD CONSTRAINT campaign_budget_approvals_kind_chk CHECK (kind IN ('production','retry'));
ALTER TABLE public.campaign_budget_approvals
  ADD CONSTRAINT campaign_budget_approvals_retry_bound_chk CHECK (kind <> 'retry' OR retry_binding IS NOT NULL);

-- The authorised scope and cost limit of an approval are immutable after creation.
CREATE OR REPLACE FUNCTION public.campaign_budget_approvals_freeze()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.max_total IS DISTINCT FROM OLD.max_total
     OR NEW.estimated_total IS DISTINCT FROM OLD.estimated_total
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.retry_binding IS DISTINCT FROM OLD.retry_binding
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.retry_budget_per_shot IS DISTINCT FROM OLD.retry_budget_per_shot
     OR NEW.retry_mode IS DISTINCT FROM OLD.retry_mode
     OR NEW.pricing_version IS DISTINCT FROM OLD.pricing_version
     OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'APPROVAL_IMMUTABLE: scope and cost limit of an approval cannot change; create a new approval'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_campaign_budget_approvals_freeze ON public.campaign_budget_approvals;
CREATE TRIGGER trg_campaign_budget_approvals_freeze
  BEFORE UPDATE ON public.campaign_budget_approvals
  FOR EACH ROW EXECUTE FUNCTION public.campaign_budget_approvals_freeze();

-- Atomic single-use consumption of a retry approval bound to one shot attempt and plan version.
CREATE OR REPLACE FUNCTION public.consume_retry_approval(
  _approval_id uuid, _user_id uuid, _shot_id uuid, _attempt_no integer, _plan_fingerprint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.campaign_budget_approvals
     SET status = 'started', started_at = now(), consumed_at = now(), consumed_attempt_no = _attempt_no
   WHERE id = _approval_id
     AND user_id = _user_id
     AND kind = 'retry'
     AND status = 'approved'
     AND consumed_at IS NULL
     AND start_expires_at > now()
     AND retry_binding->>'shot_id' = _shot_id::text
     AND (retry_binding->>'attempt_no')::int = _attempt_no
     AND retry_binding->>'plan_fingerprint' = _plan_fingerprint;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$;
REVOKE ALL ON FUNCTION public.consume_retry_approval(uuid, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_retry_approval(uuid, uuid, uuid, integer, text) TO service_role;

-- Durable per-user request idempotency for agent turns.
CREATE TABLE public.agent_request_ids (
  user_id uuid NOT NULL,
  request_id text NOT NULL,
  fingerprint text NOT NULL,
  conversation_id uuid,
  status text NOT NULL DEFAULT 'processing',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
GRANT ALL ON public.agent_request_ids TO service_role;
ALTER TABLE public.agent_request_ids ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.agent_request_ids IS 'Service-role only: durable idempotency keys for muse-agent turns.';