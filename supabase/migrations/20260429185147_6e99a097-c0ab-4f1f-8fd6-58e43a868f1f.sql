-- Session H: Goal-Briefing, Budget-Modi & Wochen-Review

-- 1. Erweitere autopilot_briefs
ALTER TABLE public.autopilot_briefs
  ADD COLUMN IF NOT EXISTS channel_goal text NOT NULL DEFAULT 'engagement',
  ADD COLUMN IF NOT EXISTS content_mix jsonb NOT NULL DEFAULT '{"ai_video":33,"stock_reel":33,"static":34}'::jsonb,
  ADD COLUMN IF NOT EXISTS weekly_budget_eur integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS target_audience text,
  ADD COLUMN IF NOT EXISTS usp text,
  ADD COLUMN IF NOT EXISTS briefing_required_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_review_completed_at timestamptz;

-- Validation Trigger für channel_goal
CREATE OR REPLACE FUNCTION public.validate_autopilot_brief_goal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.channel_goal NOT IN ('awareness','engagement','traffic','leads','sales') THEN
    RAISE EXCEPTION 'Invalid channel_goal: %', NEW.channel_goal;
  END IF;
  IF NEW.weekly_budget_eur < 5 THEN
    RAISE EXCEPTION 'weekly_budget_eur must be >= 5';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_autopilot_brief_goal_trg ON public.autopilot_briefs;
CREATE TRIGGER validate_autopilot_brief_goal_trg
  BEFORE INSERT OR UPDATE ON public.autopilot_briefs
  FOR EACH ROW EXECUTE FUNCTION public.validate_autopilot_brief_goal();

-- 2. autopilot_weekly_reviews Tabelle
CREATE TABLE IF NOT EXISTS public.autopilot_weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id uuid NOT NULL REFERENCES public.autopilot_briefs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  posts_published integer NOT NULL DEFAULT 0,
  posts_generated integer NOT NULL DEFAULT 0,
  posts_rejected integer NOT NULL DEFAULT 0,
  total_engagement integer NOT NULL DEFAULT 0,
  credits_spent integer NOT NULL DEFAULT 0,
  credits_budgeted integer NOT NULL DEFAULT 0,
  top_pillar text,
  weakest_pillar text,
  platform_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_recommendation jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_decision text NOT NULL DEFAULT 'pending',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.autopilot_weekly_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own weekly reviews"
  ON public.autopilot_weekly_reviews FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own weekly reviews"
  ON public.autopilot_weekly_reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages reviews"
  ON public.autopilot_weekly_reviews FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE INDEX IF NOT EXISTS idx_autopilot_weekly_reviews_user ON public.autopilot_weekly_reviews(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autopilot_weekly_reviews_brief ON public.autopilot_weekly_reviews(brief_id, created_at DESC);

-- 3. Notification-Constraint erweitern (existing notifications table)
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.autopilot_notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%kind%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.autopilot_notifications DROP CONSTRAINT %I', con_name);
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- Tabelle existiert nicht, skip
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='autopilot_notifications') THEN
    ALTER TABLE public.autopilot_notifications
      ADD CONSTRAINT autopilot_notifications_kind_check
      CHECK (kind IN (
        'autopilot_qa_review_required',
        'autopilot_post_published',
        'autopilot_strike_added',
        'autopilot_locked',
        'autopilot_paused',
        'autopilot_insights_ready',
        'autopilot_weekly_review_ready',
        'autopilot_paused_briefing_missing',
        'autopilot_paused_low_credits',
        'autopilot_daily_digest'
      ));
  END IF;
END $$;

-- 4. Cron-Schedules
SELECT cron.unschedule('autopilot-weekly-review-sat') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'autopilot-weekly-review-sat');
SELECT cron.unschedule('autopilot-safety-check-hourly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'autopilot-safety-check-hourly');

SELECT cron.schedule(
  'autopilot-weekly-review-sat',
  '0 10 * * 6',
  $$
  SELECT net.http_post(
    url:='https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/autopilot-weekly-review',
    headers:='{"Content-Type":"application/json","apikey":"REDACTED_TOKEN_CONFIGURE_ON_TARGET"}'::jsonb,
    body:='{"trigger":"cron"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'autopilot-safety-check-hourly',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/autopilot-safety-check',
    headers:='{"Content-Type":"application/json","apikey":"REDACTED_TOKEN_CONFIGURE_ON_TARGET"}'::jsonb,
    body:='{"trigger":"cron"}'::jsonb
  );
  $$
);