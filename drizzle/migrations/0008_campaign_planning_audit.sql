CREATE TABLE public.campaign_planning_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  video_id uuid,
  shot_id uuid,
  kind text NOT NULL CHECK (kind IN ('video_metadata_patch','shot_routing_override')),
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  reason text,
  user_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_planning_audit_campaign_idx ON public.campaign_planning_audit (campaign_id, created_at);
GRANT SELECT ON public.campaign_planning_audit TO authenticated;
GRANT SELECT, INSERT ON public.campaign_planning_audit TO service_role;
ALTER TABLE public.campaign_planning_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their planning audit" ON public.campaign_planning_audit FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.campaign_planning_audit_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'campaign_planning_audit is append-only';
END $$;
CREATE TRIGGER campaign_planning_audit_no_mutation BEFORE UPDATE OR DELETE ON public.campaign_planning_audit
FOR EACH ROW EXECUTE FUNCTION public.campaign_planning_audit_append_only();

ALTER TABLE public.campaign_shots ADD COLUMN IF NOT EXISTS routing_override jsonb;
COMMENT ON COLUMN public.campaign_shots.routing_override IS 'Current manual routing override (model, mode, duration, resolution, aspect, price, reason, auto decision). History lives in campaign_planning_audit.';