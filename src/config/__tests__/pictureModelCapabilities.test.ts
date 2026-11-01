import { describe, it, expect } from 'vitest';
import {
  PICTURE_MODEL_CAPABILITIES,
  capabilityFor,
  acceptsReferences,
  closestAspectRatioFor,
  clampExact,
  resolveSize,
  supportsMode,
} from '@/config/pictureModelCapabilities';
import { PICTURE_MODELS, aspectRatiosForTier } from '@/config/pictureStudioModels';

describe('picture model capability matrix', () => {
  it('covers exactly the tiers offered in the UI', () => {
    expect(Object.keys(PICTURE_MODEL_CAPABILITIES).sort()).toEqual(Object.keys(PICTURE_MODELS).sort());
  });

  it('keeps aspect ratios in parity with the UI registry', () => {
    for (const [tier, cap] of Object.entries(PICTURE_MODEL_CAPABILITIES)) {
      const uiRatios = aspectRatiosForTier(tier as never);
      if (uiRatios) expect(new Set(uiRatios)).toEqual(new Set(cap.aspectRatios));
    }
  });

  it('never declares a reference field without a reference budget', () => {
    for (const cap of Object.values(PICTURE_MODEL_CAPABILITIES)) {
      const budget = cap.references.subject + cap.references.style;
      if (cap.references.field === null) expect(budget).toBe(0);
      else expect(budget).toBeGreaterThan(0);
    }
  });

  it('marks reference-free models as such', () => {
    expect(acceptsReferences('pro')).toBe(false);
    expect(acceptsReferences('recraft')).toBe(false);
    expect(acceptsReferences('gptimage')).toBe(true);
    expect(acceptsReferences('fast')).toBe(true);
    expect(acceptsReferences('ultra')).toBe(true);
  });

  it('exposes only workflows accepted by each endpoint', () => {
    expect(supportsMode('pro', 'transform')).toBe(false);
    expect(supportsMode('recraft', 'restyle')).toBe(false);
    expect(supportsMode('fast', 'mix')).toBe(true);
    expect(supportsMode('gptimage', 'mix')).toBe(true);
  });

  it('keeps combined reference limits within role budgets', () => {
    for (const cap of Object.values(PICTURE_MODEL_CAPABILITIES)) {
      expect(cap.references.total).toBeLessThanOrEqual(cap.references.subject + cap.references.style);
    }
    expect(PICTURE_MODEL_CAPABILITIES.fast.references.total).toBe(10);
    expect(PICTURE_MODEL_CAPABILITIES.flux.references.total).toBe(1);
  });

  it('resolves provider-native resolution controls', () => {
    expect(resolveSize('pro', '16:9', { resolution: '2K' })).toMatchObject({ aspectRatio: '16:9', resolution: '2K' });
    expect(resolveSize('qwen', '1:1', { resolution: 'optimize_for_speed' })).toMatchObject({ resolution: 'optimize_for_speed' });
  });

  it('exposes presets for every allowed ratio of preset models', () => {
    for (const cap of Object.values(PICTURE_MODEL_CAPABILITIES)) {
      if (cap.sizing.kind !== 'preset') continue;
      for (const ratio of cap.aspectRatios) {
        expect(cap.sizing.presets?.[ratio]).toMatch(/^\d+x\d+$/);
      }
    }
  });

  it('falls back to the closest supported aspect ratio', () => {
    expect(closestAspectRatioFor('pro', '21:9')).toBe('16:9');
    expect(closestAspectRatioFor('gptimage', '16:9')).toBe('3:2');
    expect(closestAspectRatioFor('ultra', '21:9')).toBe('21:9');
  });

  it('clamps exact sizes to range, step and megapixel budget', () => {
    expect(clampExact(1023, 1024, 4096, 8)).toBe(1024);
    expect(clampExact(2050, 1024, 4096, 8)).toBe(2048);
    const big = resolveSize('fast', '1:1', { width: 4096, height: 4096 });
    expect(big.width! * big.height!).toBeLessThanOrEqual(16.8 * 1_000_000);
    const custom = resolveSize('fast', '1:1', { width: 2048, height: 1536 });
    expect(custom).toMatchObject({ width: 2048, height: 1536 });
  });

  it('ignores exact sizes for ratio and preset models', () => {
    expect(resolveSize('ultra', '1:1', { width: 2048, height: 2048 })).toEqual({ aspectRatio: '1:1' });
    expect(resolveSize('gptimage', '16:9', { width: 2048, height: 2048 })).toEqual({ aspectRatio: '3:2' });
    expect(resolveSize('recraft', '9:16')).toEqual({ preset: '1024x1820' });
  });

  it('returns undefined for unknown tiers', () => {
    expect(capabilityFor('nope')).toBeUndefined();
  });
});
