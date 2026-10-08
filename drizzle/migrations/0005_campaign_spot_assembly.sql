ALTER TABLE public.campaign_shots ADD COLUMN IF NOT EXISTS selected_attempt_id uuid;
ALTER TABLE public.campaign_videos
  ADD COLUMN IF NOT EXISTS edit jsonb,
  ADD COLUMN IF NOT EXISTS edit_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS export_render_id uuid,
  ADD COLUMN IF NOT EXISTS export_revision integer,
  ADD COLUMN IF NOT EXISTS export_status text,
  ADD COLUMN IF NOT EXISTS export_url text,
  ADD COLUMN IF NOT EXISTS export_meta jsonb,
  ADD COLUMN IF NOT EXISTS technical_check jsonb,
  ADD COLUMN IF NOT EXISTS content_check jsonb;

CREATE TABLE public.campaign_post_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.campaign_videos(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('voiceover','music','sfx','subtitles','export')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_doc jsonb NOT NULL DEFAULT '{}'::jsonb,
  edit_revision integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','running','done','failed','rejected','superseded')),
  requested_by text NOT NULL DEFAULT 'user' CHECK (requested_by IN ('user','agent')),
  approved_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.campaign_post_actions TO authenticated;
GRANT ALL ON public.campaign_post_actions TO service_role;
ALTER TABLE public.campaign_post_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read post actions" ON public.campaign_post_actions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE UNIQUE INDEX campaign_post_actions_one_open ON public.campaign_post_actions (video_id, kind) WHERE status IN ('pending','approved','running');
CREATE INDEX campaign_post_actions_video ON public.campaign_post_actions (video_id, created_at DESC);

-- Atomic claim: approved -> running exactly once.
CREATE OR REPLACE FUNCTION public.claim_post_action(p_id uuid, p_user uuid)
RETURNS public.campaign_post_actions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.campaign_post_actions;
BEGIN
  UPDATE public.campaign_post_actions SET status = 'running', updated_at = now()
   WHERE id = p_id AND user_id = p_user AND status = 'approved'
  RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.claim_post_action(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_post_action(uuid, uuid) TO service_role;

-- Optimistic-locked edit save: bumps revision, so any earlier export becomes stale.
CREATE OR REPLACE FUNCTION public.save_campaign_edit(p_video uuid, p_user uuid, p_edit jsonb, p_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev integer;
BEGIN
  UPDATE public.campaign_videos
     SET edit = p_edit, edit_revision = edit_revision + 1, final_client_ready = false, updated_at = now()
   WHERE id = p_video AND user_id = p_user AND (p_expected IS NULL OR edit_revision = p_expected)
  RETURNING edit_revision INTO v_rev;
  IF v_rev IS NULL THEN RAISE EXCEPTION 'EDIT_REVISION_CONFLICT'; END IF;
  RETURN v_rev;
END $$;
REVOKE ALL ON FUNCTION public.save_campaign_edit(uuid, uuid, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_campaign_edit(uuid, uuid, jsonb, integer) TO service_role;