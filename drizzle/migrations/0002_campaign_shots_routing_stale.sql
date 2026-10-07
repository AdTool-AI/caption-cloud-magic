ALTER TABLE public.campaign_shots
  ADD COLUMN IF NOT EXISTS routing_fingerprint text,
  ADD COLUMN IF NOT EXISTS routing_stale boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.campaign_shots.routing_fingerprint IS 'Hash of routing-relevant plan fields at the time the shot was routed.';
COMMENT ON COLUMN public.campaign_shots.routing_stale IS 'True when routing-relevant plan fields changed after routing; route_campaign_shots must re-run for this shot only.';