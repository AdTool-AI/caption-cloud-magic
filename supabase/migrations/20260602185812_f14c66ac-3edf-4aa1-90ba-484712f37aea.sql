-- ─────────────────────────────────────────────────────────────────────
-- Dialog-Pipeline Scene Lock
-- Verhindert, dass mehrere Webhook-/Cron-/Client-Trigger gleichzeitig
-- denselben dialog_shots-State mutieren und denselben Sync.so-Turn doppelt
-- dispatchen.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dialog_dispatch_locks (
  scene_id UUID PRIMARY KEY,
  holder TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

GRANT ALL ON public.dialog_dispatch_locks TO service_role;

ALTER TABLE public.dialog_dispatch_locks ENABLE ROW LEVEL SECURITY;

-- No client access; only service_role uses this table.
CREATE POLICY "service role full access"
ON public.dialog_dispatch_locks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dialog_dispatch_locks_expires_at
  ON public.dialog_dispatch_locks (expires_at);

-- Try to acquire a lock for a scene. Returns TRUE if acquired,
-- FALSE if another live (non-expired) lock holder exists.
CREATE OR REPLACE FUNCTION public.try_acquire_dialog_lock(
  _scene_id UUID,
  _holder TEXT,
  _ttl_seconds INTEGER DEFAULT 60
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now TIMESTAMPTZ := now();
  _exp TIMESTAMPTZ := now() + make_interval(secs => _ttl_seconds);
BEGIN
  -- Best-effort cleanup of stale rows so they don't permanently block.
  DELETE FROM public.dialog_dispatch_locks WHERE expires_at < _now;

  INSERT INTO public.dialog_dispatch_locks (scene_id, holder, acquired_at, expires_at)
  VALUES (_scene_id, _holder, _now, _exp)
  ON CONFLICT (scene_id) DO UPDATE
    SET holder = EXCLUDED.holder,
        acquired_at = EXCLUDED.acquired_at,
        expires_at = EXCLUDED.expires_at
    WHERE public.dialog_dispatch_locks.expires_at < _now;

  RETURN EXISTS (
    SELECT 1
    FROM public.dialog_dispatch_locks
    WHERE scene_id = _scene_id
      AND holder = _holder
      AND expires_at = _exp
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_dialog_lock(
  _scene_id UUID,
  _holder TEXT
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.dialog_dispatch_locks
  WHERE scene_id = _scene_id AND holder = _holder;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_dialog_lock(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_dialog_lock(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_acquire_dialog_lock(UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_dialog_lock(UUID, TEXT) TO service_role;

-- Reset the stuck 3-speaker scene so it can re-run cleanly with the new
-- orchestrator. Master plate (clip_url) and audio plan stay intact.

-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.

