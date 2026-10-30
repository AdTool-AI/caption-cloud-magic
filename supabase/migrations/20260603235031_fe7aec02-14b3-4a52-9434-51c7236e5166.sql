
-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.



-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.


UPDATE public.provider_circuit_state
SET
  state = 'closed',
  fail_count = 0,
  opened_at = NULL,
  half_open_at = NULL,
  last_error_class = NULL,
  updated_at = now()
WHERE provider = 'sync.so';