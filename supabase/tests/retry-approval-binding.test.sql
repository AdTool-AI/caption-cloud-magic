-- Rolled-back test of consume_retry_approval + the approval freeze trigger.
-- Runs inside one DO block that ALWAYS raises at the end, so nothing persists.
DO $$
DECLARE
  camp uuid := '008c498d-5950-499d-ade1-aa0e1ae9d637';
  usr uuid := '8948d3d9-2c5e-4405-9e9c-1624448e7189';
  shot uuid := '0e36ed63-87b1-4e8b-9e6a-63da9632614b';
  ap uuid;
  r1 boolean; r2 boolean; r_wrong_fp boolean; r_wrong_attempt boolean; r_wrong_shot boolean; r_wrong_user boolean; r_pending boolean; r_expired boolean;
  froze_limit text := 'no'; froze_binding text := 'no'; status_ok text := 'no';
BEGIN
  INSERT INTO public.campaign_budget_approvals (campaign_id, user_id, kind, retry_binding, scope, estimated_total, max_total, retry_budget_per_shot, retry_mode, status, pricing_version, start_expires_at, execution_expires_at)
  VALUES (camp, usr, 'retry', jsonb_build_object('shot_id', shot::text, 'attempt_no', 2, 'plan_fingerprint', 'fp-1'), '[]'::jsonb, 2.48, 2.48, 0, 'manual_retry', 'approved', 'test', now() + interval '10 minutes', now() + interval '1 day')
  RETURNING id INTO ap;

  r_wrong_fp      := public.consume_retry_approval(ap, usr, shot, 2, 'fp-OTHER');
  r_wrong_attempt := public.consume_retry_approval(ap, usr, shot, 3, 'fp-1');
  r_wrong_shot    := public.consume_retry_approval(ap, usr, gen_random_uuid(), 2, 'fp-1');
  r_wrong_user    := public.consume_retry_approval(ap, gen_random_uuid(), shot, 2, 'fp-1');
  r1 := public.consume_retry_approval(ap, usr, shot, 2, 'fp-1');
  r2 := public.consume_retry_approval(ap, usr, shot, 2, 'fp-1');

  BEGIN UPDATE public.campaign_budget_approvals SET max_total = 99 WHERE id = ap; EXCEPTION WHEN check_violation THEN froze_limit := 'yes'; END;
  BEGIN UPDATE public.campaign_budget_approvals SET retry_binding = '{}'::jsonb WHERE id = ap; EXCEPTION WHEN check_violation THEN froze_binding := 'yes'; END;
  BEGIN UPDATE public.campaign_budget_approvals SET status = 'expired' WHERE id = ap; status_ok := 'yes'; EXCEPTION WHEN others THEN status_ok := 'no'; END;

  -- pending and expired approvals cannot be consumed
  UPDATE public.campaign_budget_approvals SET status = 'pending', consumed_at = NULL WHERE id = ap;
  r_pending := public.consume_retry_approval(ap, usr, shot, 2, 'fp-1');
  INSERT INTO public.campaign_budget_approvals (campaign_id, user_id, kind, retry_binding, scope, estimated_total, max_total, status, pricing_version, start_expires_at, execution_expires_at)
  VALUES (camp, usr, 'retry', jsonb_build_object('shot_id', shot::text, 'attempt_no', 2, 'plan_fingerprint', 'fp-1'), '[]'::jsonb, 2.48, 2.48, 'approved', 'test', now() - interval '1 minute', now() + interval '1 day')
  RETURNING id INTO ap;
  r_expired := public.consume_retry_approval(ap, usr, shot, 2, 'fp-1');

  RAISE EXCEPTION 'TEST_RESULT first=% second=% wrong_fp=% wrong_attempt=% wrong_shot=% wrong_user=% pending=% expired=% limit_frozen=% binding_frozen=% status_change_allowed=%',
    r1, r2, r_wrong_fp, r_wrong_attempt, r_wrong_shot, r_wrong_user, r_pending, r_expired, froze_limit, froze_binding, status_ok;
END $$;
