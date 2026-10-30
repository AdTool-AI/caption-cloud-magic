UPDATE public.composer_scenes
SET audio_plan = jsonb_set(
      jsonb_set(
        audio_plan,
        '{twoshot,useExternalAudio}',
        'false'::jsonb,
        true
      ),
      '{twoshot,embeddedAudio}',
      'true'::jsonb,
      true
    ),
    updated_at = now()
WHERE engine_override = 'cinematic-sync'
  AND audio_plan -> 'twoshot' -> 'speakers' IS NOT NULL
  AND jsonb_array_length(audio_plan -> 'twoshot' -> 'speakers') = 1
  AND (audio_plan -> 'twoshot' ->> 'useExternalAudio')::boolean IS DISTINCT FROM false;


-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.



-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.



-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.

