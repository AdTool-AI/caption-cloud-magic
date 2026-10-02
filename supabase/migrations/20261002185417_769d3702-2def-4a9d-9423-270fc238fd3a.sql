ALTER TABLE public.campaign_shots
  ADD COLUMN IF NOT EXISTS qa_claim_id uuid,
  ADD COLUMN IF NOT EXISTS qa_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS qa_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qa_error text,
  ADD COLUMN IF NOT EXISTS qa_stats_generation_id uuid;

-- Atomically claim shots whose generation is finished but which have no terminal QA.
-- Eligible: generating/qa_pending with a completed generation, or a 'qa' claim whose lease expired.
CREATE OR REPLACE FUNCTION public.claim_shot_qa(_shot_id uuid DEFAULT NULL, _limit int DEFAULT 1, _lease_minutes int DEFAULT 10, _max_attempts int DEFAULT 5)
RETURNS TABLE(shot_id uuid, claim_id uuid, generation_id uuid, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT s.id FROM public.campaign_shots s
    JOIN public.ai_video_generations g ON g.id = s.current_generation_id
    WHERE g.status = 'completed' AND g.video_url IS NOT NULL
      AND (_shot_id IS NULL OR s.id = _shot_id)
      AND s.qa_attempts < _max_attempts
      AND (s.status IN ('generating','qa_pending')
           OR (s.status = 'qa' AND (s.qa_claimed_at IS NULL OR s.qa_claimed_at < now() - make_interval(mins => _lease_minutes))))
    ORDER BY s.updated_at
    LIMIT _limit
    FOR UPDATE OF s SKIP LOCKED
  )
  UPDATE public.campaign_shots s
     SET status = 'qa', qa_claim_id = gen_random_uuid(), qa_claimed_at = now(), qa_attempts = s.qa_attempts + 1, qa_error = NULL
    FROM c WHERE s.id = c.id
  RETURNING s.id, s.qa_claim_id, s.current_generation_id, s.user_id;
END $$;

-- Retryable failure: only the holder of the current claim can release it.
CREATE OR REPLACE FUNCTION public.fail_shot_qa(_shot_id uuid, _claim_id uuid, _error text, _max_attempts int DEFAULT 5)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _st text;
BEGIN
  UPDATE public.campaign_shots
     SET status = CASE WHEN qa_attempts >= _max_attempts THEN 'qa_failed' ELSE 'qa_pending' END,
         qa_error = left(_error, 500), qa_claim_id = NULL, qa_claimed_at = NULL
   WHERE id = _shot_id AND status = 'qa' AND qa_claim_id = _claim_id
  RETURNING status INTO _st;
  RETURN _st;
END $$;

-- Final verdict + stats in ONE transaction, exactly once per generation.
CREATE OR REPLACE FUNCTION public.finalize_shot_qa(_shot_id uuid, _claim_id uuid, _verdict text, _overall numeric, _scores jsonb, _issues jsonb, _client_ready boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.campaign_shots%ROWTYPE;
BEGIN
  UPDATE public.campaign_shots
     SET status = CASE WHEN _client_ready THEN 'client_ready' ELSE 'needs_retry' END,
         client_ready = _client_ready,
         qa_summary = jsonb_build_object('verdict', _verdict, 'overall', _overall, 'scores', _scores, 'issues', COALESCE(_issues,'{}'::jsonb), 'checked_at', now()),
         qa_claim_id = NULL, qa_claimed_at = NULL, qa_error = NULL
   WHERE id = _shot_id AND status = 'qa' AND qa_claim_id = _claim_id
  RETURNING * INTO s;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.campaign_shot_attempts
     SET qa_verdict = _verdict, qa_scores = _scores, qa_issues = _issues, client_ready = _client_ready,
         failure_class = CASE WHEN _client_ready THEN NULL ELSE COALESCE((SELECT k FROM jsonb_object_keys(COALESCE(_issues,'{}'::jsonb)) k LIMIT 1), 'quality') END
   WHERE shot_id = _shot_id AND generation_id = s.current_generation_id;

  IF s.qa_stats_generation_id IS DISTINCT FROM s.current_generation_id THEN
    PERFORM public.increment_model_qa_stats(s.selected_model, COALESCE(s.content_category,'product'), COALESCE(s.generation_mode,'t2v'), _client_ready, _overall, _issues);
    UPDATE public.campaign_shots SET qa_stats_generation_id = s.current_generation_id WHERE id = _shot_id;
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.claim_shot_qa(uuid,int,int,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_shot_qa(uuid,uuid,text,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_shot_qa(uuid,uuid,text,numeric,jsonb,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_shot_qa(uuid,int,int,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_shot_qa(uuid,uuid,text,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_shot_qa(uuid,uuid,text,numeric,jsonb,jsonb,boolean) TO service_role;

-- Shots 1 and 3 already recorded stats for their current generation.
UPDATE public.campaign_shots SET qa_stats_generation_id = current_generation_id
 WHERE status IN ('needs_retry','client_ready') AND qa_summary IS NOT NULL AND qa_stats_generation_id IS NULL;