CREATE TABLE public.campaign_social_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('instagram','tiktok','facebook','youtube')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','found_not_analyzed','analyzed','not_found','not_accessible')),
  found boolean NOT NULL DEFAULT false,
  profile_url text,
  discovery_source text,
  discovery_via text,
  discovery_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  access_note text,
  recent_posts jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_themes text[] NOT NULL DEFAULT '{}',
  visual_style text,
  strongest_formats text,
  performance_signals text,
  content_gaps text[] NOT NULL DEFAULT '{}',
  analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, platform)
);
GRANT SELECT ON public.campaign_social_profiles TO authenticated;
GRANT ALL ON public.campaign_social_profiles TO service_role;
ALTER TABLE public.campaign_social_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their campaign social profiles" ON public.campaign_social_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_campaign_social_profiles_updated_at BEFORE UPDATE ON public.campaign_social_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.agent_campaigns ADD COLUMN IF NOT EXISTS social_research_complete boolean NOT NULL DEFAULT false;