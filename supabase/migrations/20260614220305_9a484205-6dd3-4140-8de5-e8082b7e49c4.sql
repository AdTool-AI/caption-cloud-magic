-- v118: reset stuck dialog scene + install 15-min lipsync watchdog

-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.


-- Belt-and-braces watchdog: any dialog scene stuck in processing/dispatching
-- for >15 min is force-failed (refund happens via the in-function v118
-- circuit breaker on the next dispatch attempt, or via reset-lipsync-scene).
CREATE OR REPLACE FUNCTION public.lipsync_watchdog_15min()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.composer_scenes
  SET clip_status = 'failed',
      clip_error = COALESCE(clip_error, '') || ' watchdog_lipsync_stuck_15min',
      updated_at = NOW(),
      lip_sync_status = 'failed',
      twoshot_stage = 'failed'
  WHERE dialog_mode = true
    AND clip_status IN ('processing','dispatching','rendering')
    AND updated_at < NOW() - INTERVAL '15 minutes';
END;
$$;

-- Schedule every 2 minutes (idempotent — unschedule existing first).
DO $$
BEGIN
  PERFORM cron.unschedule('lipsync-watchdog-15min');
EXCEPTION WHEN OTHERS THEN
  -- not yet scheduled
  NULL;
END;
$$;

SELECT cron.schedule(
  'lipsync-watchdog-15min',
  '*/2 * * * *',
  $$ SELECT public.lipsync_watchdog_15min(); $$
);