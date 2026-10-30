ALTER TABLE public.campaign_assets
  ADD COLUMN IF NOT EXISTS discovery_source text,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS official_confidence numeric,
  ADD COLUMN IF NOT EXISTS logo_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rights_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid;

ALTER TABLE public.campaign_assets DROP CONSTRAINT IF EXISTS campaign_assets_discovery_chk;
ALTER TABLE public.campaign_assets ADD CONSTRAINT campaign_assets_discovery_chk
  CHECK (discovery_source IS NULL OR discovery_source IN ('official_website','official_social','official_brand_page'));

-- A discovered logo may only become reuse_ok through the owner's own confirmation (never server/agent code).
CREATE OR REPLACE FUNCTION public.campaign_assets_logo_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.discovery_source IS NOT NULL THEN
    IF TG_OP = 'INSERT' AND (NEW.reuse_status <> 'reference_only' OR NEW.confirmed_by IS NOT NULL
        OR NEW.logo_confirmed_at IS NOT NULL OR NEW.rights_confirmed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'discovered logos are stored reference_only and unconfirmed';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by AND (auth.uid() IS NULL OR NEW.confirmed_by <> auth.uid() OR NEW.user_id <> auth.uid()) THEN
        RAISE EXCEPTION 'only the campaign owner can confirm a discovered logo';
      END IF;
      IF NEW.reuse_status = 'reuse_ok' AND (NEW.confirmed_by IS NULL OR NEW.logo_confirmed_at IS NULL OR NEW.rights_confirmed_at IS NULL) THEN
        RAISE EXCEPTION 'discovered logo needs owner confirmation of identity and usage rights';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS campaign_assets_logo_guard ON public.campaign_assets;
CREATE TRIGGER campaign_assets_logo_guard BEFORE INSERT OR UPDATE ON public.campaign_assets
  FOR EACH ROW EXECUTE FUNCTION public.campaign_assets_logo_guard();

CREATE OR REPLACE FUNCTION public.confirm_campaign_logo(p_asset uuid, p_is_official boolean, p_has_rights boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.campaign_assets;
BEGIN
  SELECT * INTO v FROM public.campaign_assets WHERE id = p_asset FOR UPDATE;
  IF v.id IS NULL OR v.user_id <> auth.uid() THEN RAISE EXCEPTION 'not found'; END IF;
  IF v.kind <> 'logo' THEN RAISE EXCEPTION 'not a logo asset'; END IF;
  IF NOT (p_is_official AND p_has_rights) THEN
    RETURN jsonb_build_object('id', v.id, 'reuse_status', v.reuse_status, 'confirmed', false);
  END IF;
  UPDATE public.campaign_assets SET reuse_status = 'reuse_ok', confirmed_by = auth.uid(),
    logo_confirmed_at = now(), rights_confirmed_at = now(),
    owner_note = coalesce(owner_note, '') || ' | Owner confirmed official logo and usage rights.'
  WHERE id = v.id;
  RETURN jsonb_build_object('id', v.id, 'reuse_status', 'reuse_ok', 'confirmed', true);
END $$;

REVOKE ALL ON FUNCTION public.confirm_campaign_logo(uuid, boolean, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_campaign_logo(uuid, boolean, boolean) TO authenticated;