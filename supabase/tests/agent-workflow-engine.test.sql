-- Rolled-back test of workflow_claim_step / workflow_transition / one-open index.
DO $$
DECLARE
  usr uuid := gen_random_uuid(); conv uuid := gen_random_uuid(); vid uuid := gen_random_uuid();
  wf uuid; st uuid; c1 boolean; c2 boolean; v2 integer; v_stale integer; dup text := 'no'; dupstep text := 'no';
BEGIN
  INSERT INTO public.agent_workflows (user_id, conversation_id, video_id, state) VALUES (usr, conv, vid, 'NEEDS_CUT') RETURNING id INTO wf;
  BEGIN INSERT INTO public.agent_workflows (user_id, conversation_id, video_id, state) VALUES (usr, conv, vid, 'NEEDS_CUT'); EXCEPTION WHEN unique_violation THEN dup := 'yes'; END;
  INSERT INTO public.agent_workflow_steps (user_id, workflow_id, step_kind, idempotency_key, input_fingerprint) VALUES (usr, wf, 'k', 'key-1', 'fp') RETURNING id INTO st;
  BEGIN INSERT INTO public.agent_workflow_steps (user_id, workflow_id, step_kind, idempotency_key, input_fingerprint) VALUES (usr, wf, 'k', 'key-1', 'fp'); EXCEPTION WHEN unique_violation THEN dupstep := 'yes'; END;
  c1 := public.workflow_claim_step(st, 'w1', 60);
  c2 := public.workflow_claim_step(st, 'w2', 60);
  v2 := public.workflow_transition(wf, 1, 'NEEDS_CUT', 'READY_FOR_ASSEMBLY', '{}', '{}', 'f');
  v_stale := public.workflow_transition(wf, 1, 'NEEDS_CUT', 'CUT_BLOCKED', '{}', '{}', 'f');
  RAISE EXCEPTION 'RESULT dup_open=% dup_step=% claim1=% claim2=% v2=% stale=%', dup, dupstep, c1, c2, v2, coalesce(v_stale::text, 'null');
END $$;
