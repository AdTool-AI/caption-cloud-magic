-- v159 sync-3 mouth-box hard-fail rollout: clear stale plate identity + AWS face cache
update public.plate_face_cache
  set expires_at = now() - interval '1 second'
  where detector like 'aws_rekognition%'
    and expires_at > now();


-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.
