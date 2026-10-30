-- FA-3/P1 — VERIFICATION-ONLY MIGRATION
-- No schema/data mutation persisted.
-- Contract: no CREATE/ALTER/DROP FUNCTION, no GRANT/REVOKE, no finalizer body change.
-- Fixtures + RPC calls + assertions only; each case in its own subtransaction,
-- rolled back via sentinel SQLSTATE 'FA3P1'. Only the sentinel is caught.

-- Case 1: Happy path — output materialization + base_video_url immutability

-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.


-- Case 2: Duplicate / idempotency

-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.


-- Case 3: RS3 pre-reset fence — stale callback must not materialize output

-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.
