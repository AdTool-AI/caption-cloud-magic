-- Phase B campaign spend accounting regression checks.
-- Run inside a transaction and ROLLBACK: no wallet, approval or ledger change persists.

BEGIN;

DO $$
DECLARE
  v_approval uuid := '6641d1cb-d0a0-45bb-a2cf-0d2025f7fbe7';
  v_shot uuid;
  v_baseline numeric;
  v_available numeric;
  v_key text := 'accounting-test:' || gen_random_uuid()::text;
  v_ok boolean;
BEGIN
  SELECT (scope->0->>'shot_id')::uuid, max_total - public.campaign_ledger_actual_spent(id)
  INTO v_shot, v_available
  FROM public.campaign_budget_approvals
  WHERE id = v_approval;

  IF v_shot IS NULL THEN RAISE EXCEPTION 'accounting test fixture unavailable'; END IF;
  v_baseline := public.campaign_ledger_actual_spent(v_approval);

  -- reserve is available budget, not actual spend; the same key is idempotent.
  SELECT public.reserve_campaign_spend(v_approval, v_shot, 0.01, v_key || ':reserve') INTO v_ok;
  IF NOT v_ok OR public.campaign_ledger_actual_spent(v_approval) <> v_baseline THEN
    RAISE EXCEPTION 'reserve changed actual spend';
  END IF;
  PERFORM public.reserve_campaign_spend(v_approval, v_shot, 0.01, v_key || ':reserve');
  IF (SELECT count(*) FROM public.campaign_spend_ledger WHERE idempotency_key = v_key || ':reserve') <> 1 THEN
    RAISE EXCEPTION 'reserve idempotency failed';
  END IF;

  -- charge settles the matching hold once: actual spend increases only by charge.
  PERFORM public.campaign_ledger_entry(v_approval, v_shot, NULL, 'charge', 0.01, v_key || ':charge');
  IF public.campaign_ledger_actual_spent(v_approval) <> v_baseline + 0.01
     OR public.campaign_ledger_outstanding_reserved(v_approval) <> 0 THEN
    RAISE EXCEPTION 'reserve to charge accounting failed';
  END IF;

  -- refund reverses actual spend; release reverses a hold without changing spend.
  PERFORM public.campaign_ledger_entry(v_approval, v_shot, NULL, 'refund', 0.01, v_key || ':refund');
  PERFORM public.reserve_campaign_spend(v_approval, v_shot, 0.02, v_key || ':reserve-release');
  PERFORM public.campaign_ledger_entry(v_approval, v_shot, NULL, 'release', 0.02, v_key || ':release');
  IF public.campaign_ledger_actual_spent(v_approval) <> v_baseline
     OR public.campaign_ledger_outstanding_reserved(v_approval) <> 0 THEN
    RAISE EXCEPTION 'refund or release accounting failed';
  END IF;

  -- The remaining retry budget can be held once, but cannot be exceeded.
  SELECT public.reserve_campaign_spend(v_approval, v_shot, v_available, v_key || ':remaining') INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'valid retry budget was rejected'; END IF;
  SELECT public.reserve_campaign_spend(v_approval, v_shot, 0.01, v_key || ':over') INTO v_ok;
  IF v_ok THEN RAISE EXCEPTION 'budget cap was exceeded'; END IF;
END $$;

ROLLBACK;