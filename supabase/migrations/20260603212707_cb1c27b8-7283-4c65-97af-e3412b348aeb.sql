
-- Reset two stuck cinematic-sync scenes after v25 fan-out rollout.
-- Idempotent refund is handled by failLipSync() in subsequent provider runs;
-- here we just free inflight slots and reset state so the auto-trigger can
-- pick them up fresh.

-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.



-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.

