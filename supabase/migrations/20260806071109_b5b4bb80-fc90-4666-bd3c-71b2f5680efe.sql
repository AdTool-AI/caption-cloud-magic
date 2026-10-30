ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_profile_privileged_updates;


-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.


ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_privileged_updates;