CREATE TABLE public.campaign_assembly_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.agent_campaigns(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.campaign_videos(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed','rejected','superseded')),
  scope jsonb NOT NULL,
  scope_fingerprint text NOT NULL,
  edit_revision integer NOT NULL,
  expected_revision integer NOT NULL,
  max_cost jsonb NOT NULL,
  steps jsonb NOT NULL,
  current_step integer NOT NULL DEFAULT 0,
  lease_id uuid,
  lease_until timestamptz,
  error text,
  requested_by text NOT NULL DEFAULT 'user' CHECK (requested_by IN ('user','agent')),
  approved_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.campaign_assembly_jobs TO authenticated;
GRANT ALL ON public.campaign_assembly_jobs TO service_role;
ALTER TABLE public.campaign_assembly_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read assembly jobs" ON public.campaign_assembly_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE UNIQUE INDEX campaign_assembly_jobs_one_open ON public.campaign_assembly_jobs (video_id) WHERE status IN ('pending','running');

-- Approved scope is immutable once created.
CREATE OR REPLACE FUNCTION public.campaign_assembly_jobs_freeze() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.scope IS DISTINCT FROM OLD.scope OR NEW.scope_fingerprint IS DISTINCT FROM OLD.scope_fingerprint
     OR NEW.max_cost IS DISTINCT FROM OLD.max_cost OR NEW.edit_revision IS DISTINCT FROM OLD.edit_revision
     OR NEW.video_id IS DISTINCT FROM OLD.video_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'ASSEMBLY_SCOPE_IMMUTABLE';
  END IF;
  IF OLD.status IN ('done','failed','rejected','superseded') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'ASSEMBLY_TERMINAL';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER campaign_assembly_jobs_freeze BEFORE UPDATE ON public.campaign_assembly_jobs FOR EACH ROW EXECUTE FUNCTION public.campaign_assembly_jobs_freeze();

-- Approve+start exactly once (pending -> running) by the owner.
CREATE OR REPLACE FUNCTION public.start_assembly_job(p_id uuid, p_user uuid) RETURNS public.campaign_assembly_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.campaign_assembly_jobs;
BEGIN
  UPDATE public.campaign_assembly_jobs SET status = 'running', approved_at = now(), updated_at = now()
   WHERE id = p_id AND user_id = p_user AND status = 'pending' RETURNING * INTO r;
  RETURN r;
END $$;

-- Worker lease: only one worker advances a job at a time.
CREATE OR REPLACE FUNCTION public.claim_assembly_job(p_id uuid, p_lease_seconds integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l uuid := gen_random_uuid();
BEGIN
  UPDATE public.campaign_assembly_jobs SET lease_id = l, lease_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
   WHERE id = p_id AND status = 'running' AND (lease_until IS NULL OR lease_until < now());
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN l;
END $$;
REVOKE ALL ON FUNCTION public.start_assembly_job(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_assembly_job(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_assembly_job(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_assembly_job(uuid, integer) TO service_role;

ALTER TABLE public.campaign_post_actions DROP CONSTRAINT campaign_post_actions_requested_by_check;
ALTER TABLE public.campaign_post_actions ADD CONSTRAINT campaign_post_actions_requested_by_check CHECK (requested_by IN ('user','agent','assembly'));
ALTER TABLE public.campaign_post_actions ADD COLUMN assembly_job_id uuid REFERENCES public.campaign_assembly_jobs(id);