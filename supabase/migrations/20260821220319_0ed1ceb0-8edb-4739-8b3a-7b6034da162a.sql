select cron.schedule(
  'dispatch-scheduled-publications',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/check-scheduled-publications',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer REDACTED_TOKEN_CONFIGURE_ON_TARGET"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);