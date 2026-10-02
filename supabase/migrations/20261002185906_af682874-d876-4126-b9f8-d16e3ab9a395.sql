SELECT cron.alter_job(jobid, command := replace(command,
  $q$WHERE status IN ('waiting_for_generation','analyzing'));$q$,
  $q$WHERE status IN ('waiting_for_generation','analyzing'))
     OR EXISTS (SELECT 1 FROM public.campaign_shots s JOIN public.ai_video_generations g ON g.id = s.current_generation_id
                WHERE g.status = 'completed' AND s.qa_attempts < 5
                  AND (s.status IN ('generating','qa_pending') OR (s.status = 'qa' AND (s.qa_claimed_at IS NULL OR s.qa_claimed_at < now() - interval '10 minutes'))));$q$))
FROM cron.job WHERE jobname = 'agent-task-resume-1min' AND command NOT ILIKE '%campaign_shots%';