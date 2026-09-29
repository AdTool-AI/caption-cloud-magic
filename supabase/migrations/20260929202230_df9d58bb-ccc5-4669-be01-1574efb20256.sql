CREATE TABLE public.agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  generation_id uuid NOT NULL UNIQUE,
  approval_id uuid,
  status text NOT NULL DEFAULT 'waiting_for_generation'
    CHECK (status IN ('planning','awaiting_approval','generating','waiting_for_generation','analyzing','completed','failed')),
  language text,
  intent text,
  result jsonb,
  error text,
  lease_until timestamptz,
  slow_since timestamptz,
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_tasks TO authenticated;
GRANT ALL ON public.agent_tasks TO service_role;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own agent tasks" ON public.agent_tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX agent_tasks_conv_idx ON public.agent_tasks(conversation_id);
CREATE INDEX agent_tasks_waiting_idx ON public.agent_tasks(status) WHERE status IN ('waiting_for_generation','analyzing');

-- Terminal states can never move back.
CREATE OR REPLACE FUNCTION public.agent_tasks_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('completed','failed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'agent_task % is terminal (%)', OLD.id, OLD.status;
  END IF;
  IF OLD.status = 'analyzing' AND NEW.status IN ('waiting_for_generation','planning','awaiting_approval','generating') THEN
    RAISE EXCEPTION 'agent_task % cannot return to waiting', OLD.id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER agent_tasks_guard BEFORE UPDATE ON public.agent_tasks FOR EACH ROW EXECUTE FUNCTION public.agent_tasks_guard();

-- Atomic claim: waiting -> analyzing for tasks whose generation is terminal. At most once per task.
CREATE OR REPLACE FUNCTION public.claim_agent_tasks(_limit int DEFAULT 5)
RETURNS SETOF public.agent_tasks LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.agent_tasks t
     SET status = 'analyzing', claimed_at = now(), lease_until = now() + interval '15 minutes'
   WHERE t.id IN (
     SELECT a.id FROM public.agent_tasks a
       JOIN public.ai_video_generations g ON g.id = a.generation_id
      WHERE a.status = 'waiting_for_generation' AND g.status = 'completed'
      ORDER BY a.created_at
      LIMIT greatest(1, least(_limit, 10))
      FOR UPDATE OF a SKIP LOCKED)
     AND t.status = 'waiting_for_generation'
  RETURNING t.*;
$$;
REVOKE ALL ON FUNCTION public.claim_agent_tasks(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_tasks(int) TO service_role;

-- Hidden internal messages + one completion message per task.
ALTER TABLE public.agent_messages ADD COLUMN IF NOT EXISTS internal boolean NOT NULL DEFAULT false;
ALTER TABLE public.agent_messages ADD COLUMN IF NOT EXISTS resume_task_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS agent_messages_resume_task_uniq ON public.agent_messages(resume_task_id, role) WHERE resume_task_id IS NOT NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;