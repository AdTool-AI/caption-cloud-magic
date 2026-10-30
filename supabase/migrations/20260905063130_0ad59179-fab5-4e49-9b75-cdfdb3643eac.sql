-- 1. nullable column
ALTER TABLE public.studio_images ADD COLUMN IF NOT EXISTS workflow_type text;
ALTER TABLE public.studio_images ADD COLUMN IF NOT EXISTS source_run_id uuid;

-- 2. backfill (explicit mapping, no blanket default)

-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.


-- 3. verify: fail loudly if anything is unmapped or invalid
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.studio_images
  WHERE workflow_type IS NULL
     OR workflow_type NOT IN ('generated','edited','enhanced','background','restored','colorized','uploaded');
  IF bad > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % rows without a valid workflow_type', bad;
  END IF;
END $$;

-- 4. check constraint
ALTER TABLE public.studio_images
  ADD CONSTRAINT studio_images_workflow_type_check
  CHECK (workflow_type IN ('generated','edited','enhanced','background','restored','colorized','uploaded'));

-- 5. NOT NULL, deliberately without a database default
ALTER TABLE public.studio_images ALTER COLUMN workflow_type SET NOT NULL;

-- 6. index for per-user filtering and grouped counts
CREATE INDEX IF NOT EXISTS studio_images_user_workflow_created_idx
  ON public.studio_images (user_id, workflow_type, created_at DESC);