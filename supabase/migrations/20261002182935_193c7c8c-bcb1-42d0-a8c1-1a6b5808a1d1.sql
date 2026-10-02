CREATE OR REPLACE FUNCTION public.campaign_ledger_actual_spent(_approval_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(COALESCE(SUM(
    CASE
      WHEN entry_type = 'charge' THEN amount
      WHEN entry_type = 'refund' THEN -amount
      ELSE 0
    END
  ), 0), 0)
  FROM public.campaign_spend_ledger
  WHERE approval_id = _approval_id
$$;

CREATE OR REPLACE FUNCTION public.campaign_ledger_outstanding_reserved(_approval_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    COALESCE(SUM(CASE WHEN entry_type = 'reserve' THEN amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN entry_type = 'charge' THEN amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN entry_type = 'release' THEN amount ELSE 0 END), 0),
    0
  )
  FROM public.campaign_spend_ledger
  WHERE approval_id = _approval_id
$$;

REVOKE EXECUTE ON FUNCTION public.campaign_ledger_actual_spent(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_ledger_actual_spent(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.campaign_ledger_outstanding_reserved(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_ledger_outstanding_reserved(uuid) TO service_role;

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
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  INSERT INTO public.campaign_spend_ledger (approval_id, shot_id, generation_id, entry_type, amount, idempotency_key)
  VALUES (_approval_id, _shot_id, _generation_id, _entry_type, _amount, _key)
  ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.campaign_budget_approvals
  SET spent_total = public.campaign_ledger_actual_spent(_approval_id)
  WHERE id = _approval_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_campaign_spend(
  _approval_id uuid, _shot_id uuid, _amount numeric, _key text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.campaign_budget_approvals%ROWTYPE;
  actual_spent numeric;
  outstanding_reserved numeric;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  SELECT * INTO a FROM public.campaign_budget_approvals WHERE id = _approval_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'approval not found'; END IF;
  IF a.status NOT IN ('approved','started') THEN RAISE EXCEPTION 'approval not active (%)', a.status; END IF;
  IF now() > a.execution_expires_at THEN RAISE EXCEPTION 'execution window expired'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.campaign_spend_ledger
    WHERE idempotency_key = _key
      AND approval_id = _approval_id
      AND shot_id IS NOT DISTINCT FROM _shot_id
      AND entry_type = 'reserve'
      AND amount = _amount
  ) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.campaign_spend_ledger WHERE idempotency_key = _key) THEN
    RAISE EXCEPTION 'idempotency key reused with different reservation data';
  END IF;

  actual_spent := public.campaign_ledger_actual_spent(_approval_id);
  outstanding_reserved := public.campaign_ledger_outstanding_reserved(_approval_id);
  IF actual_spent + outstanding_reserved + _amount > a.max_total THEN RETURN false; END IF;

  INSERT INTO public.campaign_spend_ledger (approval_id, shot_id, entry_type, amount, idempotency_key)
  VALUES (_approval_id, _shot_id, 'reserve', _amount, _key);

  UPDATE public.campaign_budget_approvals
  SET spent_total = actual_spent
  WHERE id = _approval_id;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.campaign_ledger_entry(uuid, uuid, uuid, text, numeric, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_ledger_entry(uuid, uuid, uuid, text, numeric, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reserve_campaign_spend(uuid, uuid, numeric, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_campaign_spend(uuid, uuid, numeric, text) TO service_role;

UPDATE public.campaign_budget_approvals a
SET spent_total = public.campaign_ledger_actual_spent(a.id)
WHERE spent_total IS DISTINCT FROM public.campaign_ledger_actual_spent(a.id);