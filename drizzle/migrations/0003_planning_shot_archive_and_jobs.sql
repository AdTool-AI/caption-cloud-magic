ALTER TABLE public.campaign_shots
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS cut_duration_s numeric,
  ADD COLUMN IF NOT EXISTS generation_duration_s numeric,
  ADD COLUMN IF NOT EXISTS required_resolution text,
  ADD COLUMN IF NOT EXISTS audio_source text;
COMMENT ON COLUMN public.campaign_shots.audio_source IS 'studio (separate voiceover, default when null) | provider | ambient | model_speech — non-studio audio is part of the routing fingerprint';

CREATE TABLE public.agent_planning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  campaign_id uuid,
  mode text NOT NULL DEFAULT 'planning' CHECK (mode = 'planning'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','interrupted')),
  language text,
  steps_done integer NOT NULL DEFAULT 0,
  continuations integer NOT NULL DEFAULT 0,
  max_continuations integer NOT NULL DEFAULT 2,
  cost_usd numeric NOT NULL DEFAULT 0,
  max_cost_usd numeric NOT NULL DEFAULT 1.00,
  lease_id uuid,
  lease_until timestamptz,
  interruption_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.agent_planning_jobs TO authenticated;
GRANT ALL ON public.agent_planning_jobs TO service_role;
ALTER TABLE public.agent_planning_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own planning jobs" ON public.agent_planning_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE UNIQUE INDEX agent_planning_jobs_one_active ON public.agent_planning_jobs (conversation_id) WHERE status IN ('queued','running');

-- Atomic claim: one worker per job step; expired leases can be re-claimed.
CREATE OR REPLACE FUNCTION public.claim_planning_job(_job_id uuid, _lease_seconds integer DEFAULT 600)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _lease uuid := gen_random_uuid();
BEGIN
  UPDATE public.agent_planning_jobs
     SET status = 'running', lease_id = _lease, lease_until = now() + make_interval(secs => _lease_seconds), updated_at = now()
   WHERE id = _job_id
     AND (status = 'queued' OR (status = 'running' AND lease_until < now()))
     AND continuations < max_continuations
     AND cost_usd < max_cost_usd;
  IF FOUND THEN RETURN _lease; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.claim_planning_job(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_planning_job(uuid, integer) TO service_role;