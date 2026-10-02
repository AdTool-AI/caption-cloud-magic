CREATE TABLE public.qa_stats_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL,
  shot_id uuid NOT NULL REFERENCES public.campaign_shots(id) ON DELETE CASCADE,
  model text NOT NULL, content_category text NOT NULL, generation_mode text NOT NULL,
  client_ready boolean NOT NULL, overall numeric NOT NULL DEFAULT 0, issues jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis_source text NOT NULL DEFAULT 'original',
  valid boolean NOT NULL DEFAULT true, invalidated_at timestamptz, invalidated_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.qa_stats_contributions TO service_role;
ALTER TABLE public.qa_stats_contributions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX qa_stats_contributions_one_valid ON public.qa_stats_contributions(generation_id) WHERE valid;

ALTER TABLE public.campaign_shot_attempts
  ADD COLUMN IF NOT EXISTS analysis_copy_url text,
  ADD COLUMN IF NOT EXISTS qa_analysis_source text,
  ADD COLUMN IF NOT EXISTS qa_superseded jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.decrement_model_qa_stats(_model text, _category text, _mode text, _client_ready boolean, _score numeric, _issues jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.model_qa_stats SET
    n_runs = GREATEST(n_runs - 1, 0),
    n_client_ready = GREATEST(n_client_ready - CASE WHEN _client_ready THEN 1 ELSE 0 END, 0),
    score_sum = GREATEST(score_sum - COALESCE(_score, 0), 0),
    issue_class_counts = (
      SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) FROM (
        SELECT key, SUM(value)::int AS value FROM (
          SELECT key, value::int FROM jsonb_each_text(issue_class_counts)
          UNION ALL SELECT key, -(value::int) FROM jsonb_each_text(COALESCE(_issues, '{}'::jsonb))
        ) s GROUP BY key HAVING SUM(value) > 0) g),
    last_updated = now()
  WHERE model = _model AND content_category = _category AND generation_mode = _mode;
$$;

-- Backfill: every already-counted review becomes one valid contribution (no stats change).
INSERT INTO public.qa_stats_contributions (generation_id, shot_id, model, content_category, generation_mode, client_ready, overall, issues)
SELECT s.qa_stats_generation_id, s.id, s.selected_model, COALESCE(s.content_category,'product'), COALESCE(s.generation_mode,'t2v'),
       COALESCE(a.client_ready, false), COALESCE((s.qa_summary->>'overall')::numeric, 0), COALESCE(a.qa_issues, '{}'::jsonb)
FROM public.campaign_shots s
JOIN public.campaign_shot_attempts a ON a.shot_id = s.id AND a.generation_id = s.qa_stats_generation_id
WHERE s.qa_stats_generation_id IS NOT NULL
ON CONFLICT DO NOTHING;
UPDATE public.campaign_shot_attempts a SET qa_analysis_source = 'original'
FROM public.campaign_shots s WHERE a.shot_id = s.id AND a.generation_id = s.qa_stats_generation_id;

DROP FUNCTION IF EXISTS public.finalize_shot_qa(uuid, uuid, text, numeric, jsonb, jsonb, boolean);
CREATE FUNCTION public.finalize_shot_qa(_shot_id uuid, _claim_id uuid, _verdict text, _overall numeric, _scores jsonb, _issues jsonb, _client_ready boolean, _analysis_source text DEFAULT 'original')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.campaign_shots%ROWTYPE; _src text := CASE WHEN _analysis_source = 'derived_copy' THEN 'derived_copy' ELSE 'original' END; _ins int;
BEGIN
  UPDATE public.campaign_shots
     SET status = CASE WHEN _client_ready THEN 'client_ready' ELSE 'needs_retry' END,
         client_ready = _client_ready,
         qa_summary = jsonb_build_object('verdict', _verdict, 'overall', _overall, 'scores', _scores, 'issues', COALESCE(_issues,'{}'::jsonb), 'analysis_source', _src, 'checked_at', now()),
         qa_claim_id = NULL, qa_claimed_at = NULL, qa_error = NULL
   WHERE id = _shot_id AND status = 'qa' AND qa_claim_id = _claim_id
  RETURNING * INTO s;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.campaign_shot_attempts
     SET qa_verdict = _verdict, qa_scores = _scores, qa_issues = _issues, client_ready = _client_ready, qa_analysis_source = _src,
         failure_class = CASE WHEN _client_ready THEN NULL ELSE COALESCE((SELECT k FROM jsonb_object_keys(COALESCE(_issues,'{}'::jsonb)) k LIMIT 1), 'quality') END
   WHERE shot_id = _shot_id AND generation_id = s.current_generation_id;

  -- Exactly one valid stats contribution per generation (partial unique index).
  INSERT INTO public.qa_stats_contributions (generation_id, shot_id, model, content_category, generation_mode, client_ready, overall, issues, analysis_source)
  VALUES (s.current_generation_id, _shot_id, s.selected_model, COALESCE(s.content_category,'product'), COALESCE(s.generation_mode,'t2v'), _client_ready, COALESCE(_overall,0), COALESCE(_issues,'{}'::jsonb), _src)
  ON CONFLICT (generation_id) WHERE valid DO NOTHING;
  GET DIAGNOSTICS _ins = ROW_COUNT;
  IF _ins = 1 THEN
    PERFORM public.increment_model_qa_stats(s.selected_model, COALESCE(s.content_category,'product'), COALESCE(s.generation_mode,'t2v'), _client_ready, _overall, _issues);
    UPDATE public.campaign_shots SET qa_stats_generation_id = s.current_generation_id WHERE id = _shot_id;
  END IF;
  RETURN true;
END $$;

-- Retires one exact review for one exact generation and makes the shot reviewable again.
CREATE OR REPLACE FUNCTION public.invalidate_shot_qa(_shot_id uuid, _generation_id uuid, _reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.campaign_shots%ROWTYPE; c public.qa_stats_contributions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.campaign_shots WHERE id = _shot_id FOR UPDATE;
  IF NOT FOUND OR s.current_generation_id IS DISTINCT FROM _generation_id OR s.status NOT IN ('needs_retry','client_ready') THEN RETURN false; END IF;

  SELECT * INTO c FROM public.qa_stats_contributions WHERE generation_id = _generation_id AND shot_id = _shot_id AND valid FOR UPDATE;
  IF FOUND THEN
    PERFORM public.decrement_model_qa_stats(c.model, c.content_category, c.generation_mode, c.client_ready, c.overall, c.issues);
    UPDATE public.qa_stats_contributions SET valid = false, invalidated_at = now(), invalidated_reason = left(_reason, 300) WHERE id = c.id;
  END IF;

  UPDATE public.campaign_shot_attempts
     SET qa_superseded = qa_superseded || jsonb_build_array(jsonb_build_object(
           'verdict', qa_verdict, 'scores', qa_scores, 'issues', qa_issues, 'client_ready', client_ready,
           'summary', s.qa_summary, 'reason', left(_reason, 300), 'superseded_at', now())),
         qa_verdict = NULL, qa_scores = NULL, qa_issues = NULL, client_ready = NULL, failure_class = NULL, qa_analysis_source = NULL
   WHERE shot_id = _shot_id AND generation_id = _generation_id;

  UPDATE public.campaign_shots
     SET status = 'qa_pending', client_ready = NULL, qa_summary = NULL, qa_attempts = 0, qa_error = NULL,
         qa_claim_id = NULL, qa_claimed_at = NULL, qa_stats_generation_id = NULL
   WHERE id = _shot_id;
  RETURN true;
END $$;

-- Attaches a review-only copy (original file untouched) and re-opens a size-blocked review.
CREATE OR REPLACE FUNCTION public.set_shot_analysis_copy(_shot_id uuid, _generation_id uuid, _copy_url text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.campaign_shots%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.campaign_shots WHERE id = _shot_id FOR UPDATE;
  IF NOT FOUND OR s.current_generation_id IS DISTINCT FROM _generation_id OR s.status <> 'qa_failed' THEN RETURN false; END IF;
  IF _copy_url NOT LIKE '%/storage/v1/object/public/ai-videos/' || s.user_id::text || '/qa-derived/%' THEN RETURN false; END IF;
  UPDATE public.campaign_shot_attempts SET analysis_copy_url = _copy_url WHERE shot_id = _shot_id AND generation_id = _generation_id;
  UPDATE public.campaign_shots SET status = 'qa_pending', qa_attempts = 0, qa_error = NULL WHERE id = _shot_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.decrement_model_qa_stats(text,text,text,boolean,numeric,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_shot_qa(uuid,uuid,text,numeric,jsonb,jsonb,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_shot_qa(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_shot_analysis_copy(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_model_qa_stats(text,text,text,boolean,numeric,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_shot_qa(uuid,uuid,text,numeric,jsonb,jsonb,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.invalidate_shot_qa(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_shot_analysis_copy(uuid,uuid,text) TO service_role;