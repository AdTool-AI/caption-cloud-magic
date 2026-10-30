CREATE OR REPLACE FUNCTION public.trg_enforce_user_video_library_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  -- admin archive account (REDACTED_ACCOUNT_EMAIL) is exempt from the library cap
  v_exempt_user uuid := '8948d3d9-2c5e-4405-9e9c-1624448e7189';
BEGIN
  IF TG_TABLE_NAME = 'video_creations' THEN
    IF NEW.status IS DISTINCT FROM 'completed' THEN
      RETURN NEW;
    END IF;
    v_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'content_items' THEN
    IF NEW.type IS DISTINCT FROM 'video' THEN
      RETURN NEW;
    END IF;
    SELECT user_id INTO v_user_id
    FROM public.workspace_members
    WHERE workspace_id = NEW.workspace_id
    LIMIT 1;
  ELSIF TG_TABLE_NAME = 'media_assets' THEN
    v_user_id := NEW.user_id;
  END IF;

  IF v_user_id IS NOT NULL AND v_user_id IS DISTINCT FROM v_exempt_user THEN
    PERFORM public.enforce_user_video_library_limits(v_user_id, 500, 10240);
  END IF;
  RETURN NEW;
END;
$$;

-- defence in depth: the cleanup routine itself refuses to prune the admin archive account
CREATE OR REPLACE FUNCTION public.enforce_user_video_library_limits(
  _user_id uuid,
  _max_videos integer DEFAULT 500,
  _max_storage_mb integer DEFAULT 10240
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_ids uuid[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN;
  END IF;

  -- admin archive account (REDACTED_ACCOUNT_EMAIL): never auto-prune
  IF _user_id = '8948d3d9-2c5e-4405-9e9c-1624448e7189'::uuid THEN
    RETURN;
  END IF;

  SELECT array_agg(workspace_id) INTO v_workspace_ids
  FROM public.workspace_members
  WHERE user_id = _user_id;

  CREATE TEMP TABLE IF NOT EXISTS _media_all (
    src text, id uuid, created_at timestamptz, size_mb numeric
  ) ON COMMIT DROP;
  TRUNCATE _media_all;

  INSERT INTO _media_all
  SELECT 'video_creations', id, created_at, 20::numeric
  FROM public.video_creations
  WHERE user_id = _user_id AND status = 'completed';

  IF v_workspace_ids IS NOT NULL THEN
    INSERT INTO _media_all
    SELECT 'content_items', id, created_at, COALESCE(file_size_mb, 20)::numeric
    FROM public.content_items
    WHERE workspace_id = ANY(v_workspace_ids) AND type = 'video';
  END IF;

  INSERT INTO _media_all
  SELECT 'media_assets', id, created_at,
         COALESCE(size_bytes, 0)::numeric / (1024.0 * 1024.0)
  FROM public.media_assets
  WHERE user_id = _user_id;

  CREATE TEMP TABLE IF NOT EXISTS _media_to_keep (
    src text, id uuid
  ) ON COMMIT DROP;
  TRUNCATE _media_to_keep;

  INSERT INTO _media_to_keep (src, id)
  SELECT src, id
  FROM (
    SELECT
      src,
      id,
      created_at,
      size_mb,
      CASE
        WHEN src IN ('video_creations', 'content_items')
          THEN ROW_NUMBER() OVER (
            PARTITION BY (src IN ('video_creations','content_items'))
            ORDER BY created_at DESC, id DESC
          )
        ELSE NULL
      END AS video_rank,
      SUM(size_mb) OVER (
        ORDER BY created_at DESC, id DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS storage_running_mb,
      ROW_NUMBER() OVER (ORDER BY created_at DESC, id DESC) AS overall_rank
    FROM _media_all
  ) ranked
  WHERE
    overall_rank = 1
    OR (
      (video_rank IS NULL OR video_rank <= _max_videos)
      AND
      storage_running_mb <= _max_storage_mb
    );

  DELETE FROM public.video_creations vc
  WHERE vc.user_id = _user_id
    AND vc.status = 'completed'
    AND vc.id NOT IN (SELECT id FROM _media_to_keep WHERE src = 'video_creations');

  IF v_workspace_ids IS NOT NULL THEN
    DELETE FROM public.content_items ci
    WHERE ci.workspace_id = ANY(v_workspace_ids)
      AND ci.type = 'video'
      AND ci.id NOT IN (SELECT id FROM _media_to_keep WHERE src = 'content_items');
  END IF;

  DELETE FROM public.media_assets ma
  WHERE ma.user_id = _user_id
    AND ma.id NOT IN (SELECT id FROM _media_to_keep WHERE src = 'media_assets');
END;
$$;