-- Shot QA invalidation / derived analysis copy. Rollback-only: changes nothing.
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/shot-qa-invalidation.test.sql
BEGIN;
DO $$
DECLARE
  _camp uuid; _vid uuid; _user uuid; _shot uuid := gen_random_uuid(); _gen uuid := gen_random_uuid();
  _other uuid := gen_random_uuid(); _claim uuid; _gens_before int; _n int; _ok boolean; _url text;
BEGIN
  SELECT campaign_id, video_id, user_id INTO _camp, _vid, _user FROM public.campaign_shots LIMIT 1;
  SELECT count(*) INTO _gens_before FROM public.ai_video_generations;

  -- Unrelated stats row must survive untouched.
  INSERT INTO public.model_qa_stats(model, content_category, generation_mode, n_runs, score_sum) VALUES ('test-model','other','t2v', 7, 42);

  INSERT INTO public.campaign_shots(id, video_id, campaign_id, user_id, shot_index, start_s, end_s, purpose, shot_type, subject_emphasis, description,
    selected_model, content_category, generation_mode, status, current_generation_id, qa_claim_id)
  VALUES (_shot, _vid, _camp, _user, 900, 0, 5, 'p', 't', 's', 'd', 'test-model', 'cat', 't2v', 'qa', _gen, gen_random_uuid());
  INSERT INTO public.campaign_shot_attempts(shot_id, campaign_id, user_id, attempt_no, generation_id, model)
  VALUES (_shot, _camp, _user, 1, _gen, 'test-model');
  SELECT qa_claim_id INTO _claim FROM public.campaign_shots WHERE id = _shot;

  -- Buggy verdict counted once.
  PERFORM public.finalize_shot_qa(_shot, _claim, 'needs_work', 0, NULL, '{"hands":1}', false);
  SELECT n_runs INTO _n FROM public.model_qa_stats WHERE model='test-model' AND content_category='cat';
  ASSERT _n = 1, 'buggy QA counted once';

  -- Invalidate exactly that generation; unrelated stats untouched.
  ASSERT public.invalidate_shot_qa(_shot, _other, 'wrong gen') = false, 'wrong generation rejected';
  ASSERT public.invalidate_shot_qa(_shot, _gen, 'parser bug') = true, 'invalidated';
  ASSERT public.invalidate_shot_qa(_shot, _gen, 'parser bug') = false, 'invalidate idempotent';
  SELECT n_runs INTO _n FROM public.model_qa_stats WHERE model='test-model' AND content_category='cat';
  ASSERT _n = 0, 'buggy contribution removed';
  SELECT n_runs INTO _n FROM public.model_qa_stats WHERE model='test-model' AND content_category='other';
  ASSERT _n = 7, 'unrelated stats untouched';
  ASSERT (SELECT count(*) FROM public.qa_stats_contributions WHERE generation_id=_gen AND NOT valid) = 1, 'kept as invalid history';
  ASSERT (SELECT jsonb_array_length(qa_superseded) FROM public.campaign_shot_attempts WHERE generation_id=_gen) = 1, 'superseded verdict archived';
  ASSERT (SELECT status FROM public.campaign_shots WHERE id=_shot) = 'qa_pending', 'shot reviewable again';

  -- Fresh QA: one valid contribution; duplicate finalize is a no-op.
  SELECT claim_id INTO _claim FROM public.claim_shot_qa(_shot, 1);
  ASSERT public.finalize_shot_qa(_shot, _claim, 'acceptable', 8, NULL, '{}', true) = true, 'fresh QA persisted';
  ASSERT public.finalize_shot_qa(_shot, _claim, 'acceptable', 8, NULL, '{}', true) = false, 'duplicate finalize no-op';
  ASSERT (SELECT count(*) FROM public.qa_stats_contributions WHERE generation_id=_gen AND valid) = 1, 'exactly one valid contribution';
  SELECT n_runs INTO _n FROM public.model_qa_stats WHERE model='test-model' AND content_category='cat';
  ASSERT _n = 1, 'stats = one valid run';

  -- Derived copy: only qa_failed shots, only the owner qa-derived folder, no new generation, no generation change.
  UPDATE public.campaign_shots SET status='qa_failed' WHERE id=_shot;
  ASSERT public.set_shot_analysis_copy(_shot, _gen, 'https://evil.example/x.mp4') = false, 'foreign url rejected';
  _url := 'https://x/storage/v1/object/public/ai-videos/' || _user || '/qa-derived/t.mp4';
  ASSERT public.set_shot_analysis_copy(_shot, _gen, _url) = true, 'copy attached';
  ASSERT (SELECT current_generation_id FROM public.campaign_shots WHERE id=_shot) = _gen, 'generation unchanged';
  ASSERT (SELECT count(*) FROM public.ai_video_generations) = _gens_before, 'no new ai_video_generation';
  RAISE NOTICE 'shot-qa-invalidation: all assertions passed';
END $$;
ROLLBACK;
