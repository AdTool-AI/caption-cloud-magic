CREATE TABLE IF NOT EXISTS public.v431_g2_3_smoke (
  id bigserial PRIMARY KEY,
  case_id text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.v431_g2_3_smoke TO service_role;
GRANT ALL ON SEQUENCE public.v431_g2_3_smoke_id_seq TO service_role;
ALTER TABLE public.v431_g2_3_smoke ENABLE ROW LEVEL SECURITY;

TRUNCATE public.v431_g2_3_smoke;


-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.
