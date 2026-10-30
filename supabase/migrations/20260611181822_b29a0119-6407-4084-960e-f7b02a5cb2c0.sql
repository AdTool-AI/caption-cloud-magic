-- v102 Step A: reset scene f67d51ba so it re-dispatches with the new
-- diagnostic build (preclip_duration_sec persisted, v102_probe written to
-- syncso_dispatch_log.meta on every DISPATCHED row).

-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.


-- Clear stale inflight slot if any so the per-user concurrency gate doesn't
-- block the fresh dispatch.

-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.
