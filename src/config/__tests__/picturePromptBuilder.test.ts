import { describe, it, expect } from 'vitest';
import {
  buildPictureRequest,
  blockingNotice,
  providerStrength,
  extractNegativeTerms,
  strengthBucket,
  supportsTransparency,
  styleModifierFor,
  PICTURE_STYLE_NONE,
} from '@/config/picturePromptBuilder';

const base = {
  tier: 'ultra',
  mode: 'create' as const,
  prompt: 'A wooden bench under an oak tree',
  aspectRatio: '1:1',
};

describe('picture prompt builder — user intent wins', () => {
  it('sends the user text unchanged when no style preset is chosen', () => {
    const built = buildPictureRequest({ ...base, style: PICTURE_STYLE_NONE });
    expect(built.prompt).toBe('A wooden bench under an oak tree');
    expect(built.segments.map((s) => s.source)).toEqual(['user']);
    expect(built.notices.some((n) => n.code === 'STYLE_NONE')).toBe(true);
  });

  it('never silently injects a style modifier', () => {
    const withStyle = buildPictureRequest({ ...base, style: 'realistic' });
    expect(withStyle.prompt).toContain('photorealistic');
    // …and the injection is disclosed as its own labelled segment
    const styleSegment = withStyle.segments.find((s) => s.source === 'style');
    expect(styleSegment?.text).toBe(`Style: ${styleModifierFor('realistic')}.`);
    expect(withStyle.notices.some((n) => n.code === 'STYLE_PRESET_APPLIED')).toBe(true);
  });

  it('keeps the user description as the first segment', () => {
    const built = buildPictureRequest({
      ...base,
      mode: 'transform',
      tier: 'ultra',
      style: 'cinematic',
      subjectRefs: ['https://example.test/a.jpg'],
      brandKit: { name: 'Acme', primaryColor: '#fff' },
    });
    expect(built.segments[0].source).toBe('user');
    expect(built.prompt.startsWith('A wooden bench under an oak tree')).toBe(true);
  });
});

describe('strength polarity', () => {
  it('inverts FLUX image_prompt_strength (higher = reference dominates)', () => {
    expect(providerStrength('image_prompt_strength', 0)).toBe(1);
    expect(providerStrength('image_prompt_strength', 100)).toBe(0);
    expect(providerStrength('image_prompt_strength', 20)).toBe(0.8);
  });

  it('passes Qwen strength straight through (higher = more change)', () => {
    expect(providerStrength('strength', 0)).toBe(0);
    expect(providerStrength('strength', 100)).toBe(1);
    expect(providerStrength('strength', 20)).toBe(0.2);
  });

  it('emits the native field for models that have one, and no intent clause', () => {
    const built = buildPictureRequest({
      ...base,
      tier: 'flux',
      mode: 'transform',
      style: PICTURE_STYLE_NONE,
      subjectRefs: ['https://example.test/a.jpg'],
      strength: 20,
    });
    expect(built.strengthField).toBe('image_prompt_strength');
    expect(built.strengthValue).toBe(0.8);
    expect(built.segments.some((s) => s.source === 'intent')).toBe(false);
    expect(built.notices.some((n) => n.code === 'STRENGTH_NATIVE')).toBe(true);
  });

  it('falls back to a language clause for models without a strength field', () => {
    const close = buildPictureRequest({
      ...base,
      tier: 'ultra',
      mode: 'transform',
      style: PICTURE_STYLE_NONE,
      subjectRefs: ['https://example.test/a.jpg'],
      strength: 10,
    });
    expect(close.strengthValue).toBeUndefined();
    expect(close.segments.find((s) => s.source === 'intent')?.text).toContain('unaffected details');
    expect(close.segments.find((s) => s.source === 'intent')?.text).toContain('fully applying the changes described above');
    expect(close.notices.some((n) => n.code === 'STRENGTH_AS_LANGUAGE')).toBe(true);

    const free = buildPictureRequest({
      ...base,
      tier: 'ultra',
      mode: 'transform',
      style: PICTURE_STYLE_NONE,
      subjectRefs: ['https://example.test/a.jpg'],
      strength: 90,
    });
    expect(free.segments.find((s) => s.source === 'intent')?.text).toContain('allowing the broader changes described above');
  });

  it('buckets the slider consistently', () => {
    expect(strengthBucket(0)).toBe('close');
    expect(strengthBucket(33)).toBe('close');
    expect(strengthBucket(34)).toBe('balanced');
    expect(strengthBucket(66)).toBe('balanced');
    expect(strengthBucket(67)).toBe('free');
  });

  it('warns instead of pretending when transform has no reference', () => {
    const built = buildPictureRequest({ ...base, mode: 'transform', style: PICTURE_STYLE_NONE });
    expect(built.notices.some((n) => n.code === 'STRENGTH_IGNORED')).toBe(true);
    expect(built.segments.some((s) => s.source === 'intent')).toBe(false);
  });
});

describe('transparency', () => {
  it('is only claimed for models that really support it', () => {
    expect(supportsTransparency('gptimage')).toBe(true);
    expect(supportsTransparency('standard')).toBe(false);
    expect(supportsTransparency('ultra')).toBe(false);
    expect(supportsTransparency('recraft')).toBe(false);
  });

  it('blocks the run and points to the Background section otherwise', () => {
    const built = buildPictureRequest({ ...base, tier: 'standard', transparentBackground: true });
    const blocker = blockingNotice(built);
    expect(blocker?.code).toBe('TRANSPARENCY_UNSUPPORTED');
    expect(built.transparentBackground).toBe(false);
    expect(blocker?.message.de).toContain('Hintergrund');
  });

  it('resolves to a provider flag on GPT-Image-2', () => {
    const built = buildPictureRequest({ ...base, tier: 'gptimage', transparentBackground: true });
    expect(blockingNotice(built)).toBeUndefined();
    expect(built.transparentBackground).toBe(true);
  });
});

describe('negative flags', () => {
  it('extracts --no / --negative terms out of the user text', () => {
    const { text, terms } = extractNegativeTerms('a cat --no text, watermark');
    expect(text).toBe('a cat');
    expect(terms).toEqual(['text', 'watermark']);
  });

  it('turns them into a disclosed Avoid clause plus a warning', () => {
    const built = buildPictureRequest({
      ...base,
      prompt: 'a cat --negative blurry',
      style: PICTURE_STYLE_NONE,
    });
    expect(built.negativeTerms).toEqual(['blurry']);
    expect(built.prompt).toContain('Avoid: blurry.');
    expect(built.prompt).not.toContain('--negative');
    expect(built.notices.some((n) => n.code === 'NEGATIVE_AS_LANGUAGE')).toBe(true);
  });
});

describe('references', () => {
  it('adds an explicit style-reference clause that forbids copying composition', () => {
    const built = buildPictureRequest({
      ...base,
      tier: 'ideogram',
      mode: 'restyle',
      style: PICTURE_STYLE_NONE,
      styleRefs: ['https://example.test/s.jpg'],
    });
    expect(built.segments.find((s) => s.source === 'reference')?.text)
      .toContain('Do not copy its subject or composition');
  });

  it('warns when create mode still carries references', () => {
    const built = buildPictureRequest({
      ...base,
      mode: 'create',
      subjectRefs: ['https://example.test/a.jpg'],
    });
    expect(built.notices.some((n) => n.code === 'REFERENCES_IGNORED')).toBe(true);
  });

  it('appends the aspect ratio only for chat-shaped gateway models', () => {
    const gemini = buildPictureRequest({ ...base, tier: 'standard', aspectRatio: '16:9' });
    expect(gemini.prompt).toContain('Aspect ratio: 16:9.');
    const replicate = buildPictureRequest({ ...base, tier: 'ultra', aspectRatio: '16:9' });
    expect(replicate.prompt).not.toContain('Aspect ratio');
  });
});
