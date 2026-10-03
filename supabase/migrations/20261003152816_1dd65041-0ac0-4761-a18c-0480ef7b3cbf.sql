ALTER TABLE public.campaign_shots
  ADD COLUMN IF NOT EXISTS retry_plan jsonb,
  ADD COLUMN IF NOT EXISTS post_production jsonb,
  ADD COLUMN IF NOT EXISTS visual_client_ready boolean GENERATED ALWAYS AS (coalesce(client_ready, false)) STORED;
ALTER TABLE public.campaign_videos
  ADD COLUMN IF NOT EXISTS post_production jsonb,
  ADD COLUMN IF NOT EXISTS final_client_ready boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.campaign_shots.visual_client_ready IS 'Phase B: generated visual passed QA. Never means the finished ad is ready.';
COMMENT ON COLUMN public.campaign_videos.final_client_ready IS 'Set only after composition (voiceover, music/SFX, overlays, CTA) and final QA. Phase B never writes it.';