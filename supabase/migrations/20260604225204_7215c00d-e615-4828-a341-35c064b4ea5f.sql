-- v48 cleanup: reset broken partial-mux scene + remove cron for deleted legacy functions
-- (Keep clip_url + clip_status — those are the master plate, not the lipsync result.)


-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.



-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.


DO $$
DECLARE
  job_name text;
BEGIN
  FOR job_name IN
    SELECT jobname FROM cron.job
    WHERE command ILIKE '%compose-twoshot-lipsync%'
       OR command ILIKE '%poll-twoshot-lipsync%'
       OR command ILIKE '%twoshot-lipsync-watchdog%'
       OR command ILIKE '%compose-lipsync-scene%'
  LOOP
    PERFORM cron.unschedule(job_name);
    RAISE NOTICE 'Unscheduled cron job pointing at deleted edge function: %', job_name;
  END LOOP;
END $$;