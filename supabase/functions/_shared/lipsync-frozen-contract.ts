/**
 * lipsync-frozen-contract.ts — FROZEN as of v400.
 *
 * Single source of truth for every tuning value in the lip-sync chain.
 *
 * Why this file exists: between v190 and v399 the same numbers lived inline in
 * a dozen modules. Every attempt to fix one symptom silently moved a threshold
 * somewhere else, and nobody could tell afterwards which combination had
 * actually worked. On 2026-08-03 the chain hit all four speakers correctly for
 * the first time since 27.07. — these are the exact values of that run.
 *
 * RULES
 *  - Do not change a value here without an explicit "unfreeze lipsync".
 *  - Changing a value breaks `lipsync-frozen-contract.test.ts` on purpose.
 *    That test failing is the signal, not an obstacle.
 *  - Modules must import from here instead of re-declaring literals.
 *
 * See `docs/lipsync-pipeline-v400.md`; the supporting freeze document is archived outside the repository.
 */

export const LIPSYNC_CONTRACT_VERSION = "v400";

/** Preclip geometry — `pass-face-preclip.ts` + `compute-mouth-centered-crop.ts`. */
export const PRECLIP = {
  /** Target share of the crop area covered by the face bbox. */
  targetFaceShare: 0.42,
  /**
   * PREFERRED floor for the crop side in source-plate pixels (preclip path).
   *
   * V461 D — no longer inviolable. It yields PER PASS, never globally, when
   * honouring it would make the downstream `V461_FACE_SHARE_FLOOR` contract
   * arithmetically unsatisfiable: a face of 46x61 planned at 128 reaches only
   * share 0.171, and no crop >= 128 can ever reach 0.24. The value itself is
   * unchanged and still wins whenever the two are compatible.
   */
  minCropSizePx: 128,
  /** Default floor inside the crop util when no caller override is given. */
  minCropSizeDefaultPx: 96,
  /** Nominal square output edge handed to Remotion Lambda. */
  outputSizePx: 720,
  /** Native output is clamped into this range so tiny faces stay legible. */
  nativeOutputMinPx: 720,
  nativeOutputMaxPx: 1280,
  /** Legacy face-crop fallback output edge (`computeFaceCrop`). */
  legacyFallbackOutputPx: 512,
} as const;

/** Reprojection mask — `DialogStitchVideo.tsx`. */
export const REPROJECTION_MASK = {
  /** Fully opaque core of the radial mask, in percent of the overlay radius. */
  opaqueCorePct: 30,
  /** Fully transparent outer edge, in percent of the overlay radius. */
  transparentEdgePct: 78,
  /** Face-proportional overlay: outer radius multiplier. */
  faceOverlayOuterFactor: 2.2,
  /** Face-proportional overlay: opaque core multiplier. */
  faceOverlayCoreFactor: 0.6,
} as const;

/** Watchdog timings — `lipsync-watchdog/index.ts` (milliseconds). */
export const WATCHDOG_MS = {
  /** Provider job in flight without an update. */
  staleProvider: 10 * 60_000,
  /** Running but never produced a provider job. */
  stalePreflight: 4 * 60_000,
  /** Absolute ceiling before a scene is force-failed and refunded. */
  staleHard: 25 * 60_000,
  /** Dispatch lock recovery. */
  staleDispatchRecovery: 30_000,
  /** Audio ready but mux never started. */
  staleAudioMux: 6 * 60_000,
  /** Cooldown between two recovery attempts on the same scene. */
  recoveryCooldown: 90_000,
} as const;

/** Provider contract — Sync.so. */
export const PROVIDER = {
  apiBase: "https://api.sync.so/v2",
  model: "sync-3",
  syncMode: "cut_off",
  /** Active-speaker detection must never be left to the provider. */
  asdAutoDetect: false,
  /** Max parallel passes per scene. */
  concurrencyCap: 4,
} as const;

/**
 * The four invariants that make the chain deterministic. These are asserted
 * structurally by the guard test — they are not tunable.
 */
export const INVARIANTS = {
  /** Geometry is measured on `reference_image_url`, never on a stale anchor. */
  geometryAnchorField: "reference_image_url",
  /**
   * Every run starts through `beginSceneRun()` (legacy in-function path) or,
   * canonically since v427, through `startSceneRun()` in `scene-run.ts`, which
   * wraps the atomic `composer_start_scene_run` RPC. Both stamp
   * `active_run_id` + `plate_generation`; the RPC path is the one new callers
   * must use.
   */
  runEntrypoint: "beginSceneRun",
  /** V447 — kanonischer, atomarer Startpfad (RPC `composer_start_scene_run`). */
  canonicalRunEntrypoint: "startSceneRun",
  /** Webhook results are only accepted for the current run. */
  runGuardDiscardCode: "run_guard_discarded",
  /** Speaker → face slot ordering. */
  slotOrdering: "row-major",
} as const;

export type LipsyncFrozenContract = {
  version: typeof LIPSYNC_CONTRACT_VERSION;
  preclip: typeof PRECLIP;
  mask: typeof REPROJECTION_MASK;
  watchdog: typeof WATCHDOG_MS;
  provider: typeof PROVIDER;
  invariants: typeof INVARIANTS;
};

export const LIPSYNC_FROZEN_CONTRACT: LipsyncFrozenContract = {
  version: LIPSYNC_CONTRACT_VERSION,
  preclip: PRECLIP,
  mask: REPROJECTION_MASK,
  watchdog: WATCHDOG_MS,
  provider: PROVIDER,
  invariants: INVARIANTS,
};
