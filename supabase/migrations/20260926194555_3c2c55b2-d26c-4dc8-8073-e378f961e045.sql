CREATE OR REPLACE FUNCTION public.tmp_storage_migration_list(_bucket text, _after text, _limit int)
RETURNS TABLE(name text, size bigint, mimetype text, cache_control text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = storage, public AS $$
  SELECT o.name, COALESCE((o.metadata->>'size')::bigint, 0), o.metadata->>'mimetype', o.metadata->>'cacheControl'
  FROM storage.objects o
  WHERE o.bucket_id = _bucket AND o.name > COALESCE(_after, '')
  ORDER BY o.name COLLATE "C"
  LIMIT LEAST(GREATEST(_limit, 1), 1000)
$$;
CREATE OR REPLACE FUNCTION public.tmp_storage_migration_counts()
RETURNS TABLE(bucket_id text, objects bigint, bytes numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = storage, public AS $$
  SELECT o.bucket_id, count(*), COALESCE(sum((o.metadata->>'size')::bigint), 0)
  FROM storage.objects o GROUP BY o.bucket_id ORDER BY 1
$$;
REVOKE ALL ON FUNCTION public.tmp_storage_migration_list(text, text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tmp_storage_migration_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tmp_storage_migration_list(text, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.tmp_storage_migration_counts() TO service_role;