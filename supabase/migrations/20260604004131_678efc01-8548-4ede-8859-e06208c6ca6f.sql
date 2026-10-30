CREATE OR REPLACE FUNCTION public.syncso_recent_failure_count(_window_min integer DEFAULT 5)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int
  FROM public.syncso_dispatch_log
  WHERE created_at > now() - make_interval(mins => _window_min)
    AND error_class IN ('timeout', 'rate_limited', 'http_5xx', 'auth')
    AND sync_status IN ('FAILED', 'REJECTED', 'CANCELED', 'DISPATCH_FAILED');
$function$;

UPDATE public.provider_circuit_state
SET state = 'closed',
    fail_count = 0,
    opened_at = NULL,
    half_open_at = NULL,
    last_error_class = NULL,
    updated_at = now()
WHERE provider = 'sync.so';


-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.



-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.



-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.
