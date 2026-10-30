CREATE OR REPLACE FUNCTION public.sync_email_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.server_side_write', 'on', true);
  UPDATE public.profiles
  SET email_verified = (
    SELECT email_confirmed_at IS NOT NULL
    FROM auth.users
    WHERE id = NEW.id
  )
  WHERE id = NEW.id;
  PERFORM set_config('app.server_side_write', 'off', true);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_service_role boolean := (pg_catalog.current_setting('request.jwt.claim.role', true) = 'service_role')
                             OR (auth.role() = 'service_role')
                             OR (pg_catalog.current_setting('app.server_side_write', true) = 'on');
  allowed_cols constant text[] := ARRAY[
    'name','phone_number','avatar_url','language','timezone','api_key','twitch_username',
    'security_alerts_enabled','login_notification_enabled','analytics_enabled',
    'personalized_recommendations','drip_emails_enabled','brand_name','brand_color',
    'onboarding_completed','strategy_mode_enabled','strategy_mode_activated_at',
    'level_auto_pause_until','tour_completed_at','welcome_bonus_seen_at','updated_at'
  ];
  old_j jsonb := pg_catalog.to_jsonb(OLD);
  new_j jsonb := pg_catalog.to_jsonb(NEW);
  k text;
BEGIN
  IF is_service_role THEN
    RETURN NEW;
  END IF;

  FOR k IN SELECT pg_catalog.jsonb_object_keys(new_j)
  LOOP
    IF (new_j -> k) IS DISTINCT FROM (old_j -> k) AND NOT (k = ANY (allowed_cols)) THEN
      RAISE EXCEPTION 'Profile field "%" can only be modified server-side', k;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.
