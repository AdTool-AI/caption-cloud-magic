/**
 * Lip-Sync Freeze Guard (v400) — runs in CI via vitest.
 *
 * The Deno contract test next to `supabase/functions/_shared/` is not part of
 * the vitest run, so this guard re-checks the same frozen values by reading the
 * source files from disk. It also asserts the four structural invariants that
 * make the chain deterministic.
 *
 * If this test fails, the lip-sync pipeline has drifted away from the state
 * that verifiably worked on 2026-08-03. The supporting freeze document is archived outside the repository.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const CONTRACT = 'supabase/functions/_shared/lipsync-frozen-contract.ts';
const PRECLIP = 'supabase/functions/_shared/pass-face-preclip.ts';
const CROP = 'supabase/functions/_shared/compute-mouth-centered-crop.ts';
const STITCH = 'src/remotion/templates/DialogStitchVideo.tsx';
const RUN_BEGIN = 'supabase/functions/_shared/scene-run-begin.ts';
const WEBHOOK = 'supabase/functions/sync-so-webhook/index.ts';
const COMPOSE = 'supabase/functions/compose-video-clips/index.ts';

describe('lip-sync frozen contract v400', () => {
  it('contract file exists and declares v400', () => {
    const src = read(CONTRACT);
    expect(src).toContain('LIPSYNC_CONTRACT_VERSION = "v400"');
  });

  it('preclip reads its geometry from the frozen contract', () => {
    const src = read(PRECLIP);
    expect(src).toContain('from "./lipsync-frozen-contract.ts"');
    expect(src).toContain('targetFaceShare: PRECLIP.targetFaceShare');
    expect(src).toContain('minSize: PRECLIP.minCropSizePx');
    expect(src).toContain('outputSize: PRECLIP.outputSizePx');
    expect(src).not.toMatch(/targetFaceShare:\s*0\.\d+/);
  });

  it('contract values themselves are unchanged', () => {
    const src = read(CONTRACT);
    expect(src).toContain('targetFaceShare: 0.42');
    expect(src).toContain('minCropSizePx: 128');
    expect(src).toContain('outputSizePx: 720');
    expect(src).toContain('nativeOutputMaxPx: 1280');
    expect(src).toContain('legacyFallbackOutputPx: 512');
  });

  it('watchdog timings match the frozen contract', () => {
    const src = read('supabase/functions/lipsync-watchdog/index.ts');
    expect(src).toContain('STALE_PROVIDER_MS = 10 * 60_000');
    expect(src).toContain('STALE_PREFLIGHT_MS = 4 * 60_000');
    expect(src).toContain('STALE_HARD_MS = 25 * 60_000');
    expect(src).toContain('STALE_AUDIO_MUX_MS = 6 * 60_000');
  });

  it('crop util defaults are unchanged', () => {
    const src = read(CROP);
    expect(src).toContain('targetFaceShare = 0.42');
    expect(src).toContain('minSize = 96');
    expect(src).toContain('outputSize = 720');
  });

  it('reprojection mask gradient is unchanged', () => {
    const src = read(STITCH);
    // Soft 30% -> 78% gradient. Hard discs put the seam on skin (v196-v198).
    expect(src).toContain('#000 30%, rgba(0,0,0,0) 78%');
  });
});

describe('lip-sync structural invariants', () => {
  it('I1: every run starts through beginSceneRun()', () => {
    expect(existsSync(resolve(root, RUN_BEGIN))).toBe(true);
    const src = read(RUN_BEGIN);
    expect(src).toContain('export async function beginSceneRun');
    expect(read(COMPOSE)).toContain('beginSceneRun');
  });

  it('I2: beginSceneRun clears the previous run and stamps a new identity', () => {
    const src = read(RUN_BEGIN);
    expect(src).toContain('active_run_id');
    expect(src).toContain('plate_generation');
    expect(src).toContain('clip_url');
    expect(src).toContain('dialog_shots');
  });

  it('I3: the webhook discards results from superseded runs', () => {
    const src = read(WEBHOOK);
    expect(src).toContain('run_guard_discarded');
  });

  it('I4: Replicate is not used anywhere in the lip-sync verification path', () => {
    for (const f of [PRECLIP, WEBHOOK]) {
      expect(read(f).toLowerCase()).not.toContain('replicate.com/v1/predictions');
    }
  });
});
