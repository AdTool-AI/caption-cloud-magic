-- Daily Cron: Auto-Refresh Meta Long-Lived Page Token
-- Läuft 03:00 UTC, ruft auto-refresh-meta-tokens edge function

-- Drop any previous version (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-refresh-meta-tokens-daily') THEN
    PERFORM cron.unschedule('auto-refresh-meta-tokens-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'auto-refresh-meta-tokens-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/auto-refresh-meta-tokens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'REDACTED_TOKEN_CONFIGURE_ON_TARGET'
    ),
    body := jsonb_build_object('mode', 'refresh', 'source', 'cron')
  ) AS request_id;
  $$
);