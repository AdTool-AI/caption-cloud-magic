-- Recovery: reset two stuck dialog-lipsync scenes after the 3-speaker
-- face-gate + stitch-loop hardening.

-- 1) afbfd804…/88fcd40d… were the actively failing 3-speaker scenes whose
--    Sync.so calls returned the opaque "unknown error" because the plate
--    cropped the male heads out of frame. Reset to pristine pending so the
--    user can re-render the clip and retry lipsync with the new target-face
--    gate active.

-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.


-- 2) 95f7e7a2… is a legacy v4 scene that was stuck in the
--    render-dialog-stitch 409 loop because its 3rd turn was degraded=true
--    without an output_url. Mark it terminally failed so the new
--    poll-dialog-shots multi-speaker gate doesn't keep dispatching it.

-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.
