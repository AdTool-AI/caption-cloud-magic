-- Phase A: AdTool Agent campaigns (research + planning only, no spending)
CREATE TABLE public.agent_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.agent_conversations(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  website text,
  location text,
  goal text NOT NULL,
  language text NOT NULL DEFAULT 'de',
  requested_video_count int NOT NULL DEFAULT 1,
  video_duration_s int NOT NULL DEFAULT 30,
  stage text NOT NULL DEFAULT 'research',
  audience text,
  commercial_angle text,
  angle_rationale text,
  research_summary text,
  coverage_score numeric,
  coverage_breakdown jsonb,
  coverage_explanation text,
  plan_revision_round int NOT NULL DEFAULT 0,
  needs_user_review boolean NOT NULL DEFAULT false,
  review_reason text,
  lease_until timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_campaigns_stage_chk CHECK (stage IN ('research','strategy','asset_collection','script','shot_planning','plan_ready','awaiting_budget_approval','generating','qa','editing','audio','upscale','final_qa','ready_for_delivery','outreach_ready','completed','failed')),
  CONSTRAINT agent_campaigns_count_chk CHECK (requested_video_count BETWEEN 1 AND 12)
);
CREATE INDEX agent_campaigns_user_idx ON public.agent_campaigns(user_id, updated_at DESC);
CREATE INDEX agent_campaigns_convo_idx ON public.agent_campaigns(conversation_id);

CREATE TABLE public.campaign_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  url text NOT NULL,
  title text,
  excerpt text,
  via text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, url)
);

CREATE TABLE public.campaign_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  category text NOT NULL,
  fact text NOT NULL,
  source_id uuid REFERENCES public.campaign_sources(id) ON DELETE SET NULL,
  source_url text,
  is_hypothesis boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_facts_campaign_idx ON public.campaign_facts(campaign_id);

CREATE TABLE public.campaign_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  url text NOT NULL,
  kind text NOT NULL,
  source_url text,
  media_library_id uuid,
  reuse_status text NOT NULL DEFAULT 'reference_only',
  owner_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, url),
  CONSTRAINT campaign_assets_reuse_chk CHECK (reuse_status IN ('reuse_ok','reference_only','unknown')),
  CONSTRAINT campaign_assets_kind_chk CHECK (kind IN ('logo','website_image','menu','upload','adtool_media','social','brand_kit'))
);

CREATE TABLE public.campaign_pillars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  rank int NOT NULL,
  relevance text,
  evidence_urls text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, rank)
);

CREATE TABLE public.campaign_business_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  area text NOT NULL,
  relevance numeric NOT NULL,
  rationale text,
  evidence_urls text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, area),
  CONSTRAINT campaign_business_areas_area_chk CHECK (area IN ('products_menu','drinks','atmosphere','people_team','location','service','reviews_social_proof','offers_seasonal','conversion_reservations')),
  CONSTRAINT campaign_business_areas_rel_chk CHECK (relevance >= 0 AND relevance <= 1)
);

CREATE TABLE public.campaign_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  video_index int NOT NULL,
  title text NOT NULL,
  concept text NOT NULL,
  pillar text NOT NULL,
  business_area text NOT NULL,
  funnel_stage text NOT NULL,
  target_audience text NOT NULL,
  emotional_angle text NOT NULL,
  commercial_objective text NOT NULL,
  primary_goal text NOT NULL,
  hook_type text NOT NULL,
  hook_text text NOT NULL,
  cta text NOT NULL,
  visual_style text NOT NULL,
  hero_subject text NOT NULL,
  main_message text NOT NULL,
  shot_structure text[] NOT NULL DEFAULT '{}',
  rationale text NOT NULL,
  series_key text,
  script jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, video_index),
  CONSTRAINT campaign_videos_funnel_chk CHECK (funnel_stage IN ('awareness','consideration','conversion','retention')),
  CONSTRAINT campaign_videos_area_chk CHECK (business_area IN ('products_menu','drinks','atmosphere','people_team','location','service','reviews_social_proof','offers_seasonal','conversion_reservations'))
);

CREATE TABLE public.campaign_shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.campaign_videos(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  shot_index int NOT NULL,
  start_s numeric NOT NULL,
  end_s numeric NOT NULL,
  purpose text NOT NULL,
  shot_type text NOT NULL,
  subject_emphasis text NOT NULL,
  description text NOT NULL,
  on_screen_text text,
  voiceover text,
  asset_id uuid REFERENCES public.campaign_assets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, shot_index)
);

CREATE TABLE public.campaign_similarity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  revision_round int NOT NULL,
  video_a int NOT NULL,
  video_b int NOT NULL,
  scores jsonb NOT NULL,
  judge jsonb,
  verdict text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_similarity_verdict_chk CHECK (verdict IN ('distinct','too_similar'))
);
CREATE INDEX campaign_similarity_campaign_idx ON public.campaign_similarity_checks(campaign_id, revision_round);

-- Grants: owners read only; all writes happen server-side (service_role).
GRANT SELECT ON public.agent_campaigns, public.campaign_sources, public.campaign_facts, public.campaign_assets,
  public.campaign_pillars, public.campaign_business_areas, public.campaign_videos, public.campaign_shots,
  public.campaign_similarity_checks TO authenticated;
GRANT ALL ON public.agent_campaigns, public.campaign_sources, public.campaign_facts, public.campaign_assets,
  public.campaign_pillars, public.campaign_business_areas, public.campaign_videos, public.campaign_shots,
  public.campaign_similarity_checks TO service_role;

ALTER TABLE public.agent_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_business_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_similarity_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read campaigns" ON public.agent_campaigns FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners read campaign sources" ON public.campaign_sources FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners read campaign facts" ON public.campaign_facts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners read campaign assets" ON public.campaign_assets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners read campaign pillars" ON public.campaign_pillars FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners read campaign areas" ON public.campaign_business_areas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners read campaign videos" ON public.campaign_videos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners read campaign shots" ON public.campaign_shots FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners read similarity checks" ON public.campaign_similarity_checks FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.agent_campaigns_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER agent_campaigns_touch BEFORE UPDATE ON public.agent_campaigns FOR EACH ROW EXECUTE FUNCTION public.agent_campaigns_touch();
CREATE TRIGGER campaign_videos_touch BEFORE UPDATE ON public.campaign_videos FOR EACH ROW EXECUTE FUNCTION public.agent_campaigns_touch();

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_campaigns;