SELECT cron.alter_job(
  job_id := j.jobid,
  command := replace(j.command,
    'WHERE EXISTS (SELECT 1 FROM public.agent_tasks',
    'WHERE EXISTS (SELECT 1 FROM public.agent_planning_jobs WHERE status = ''queued'' OR (status = ''running'' AND lease_until < now()))
     OR EXISTS (SELECT 1 FROM public.agent_tasks')
)
FROM cron.job j
WHERE j.jobname = 'agent-task-resume-1min'
  AND j.command NOT ILIKE '%agent_planning_jobs%';