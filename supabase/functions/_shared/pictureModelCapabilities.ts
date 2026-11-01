/**
 * Picture Studio — provider capability matrix (SERVER copy).
 *
 * Single source of truth for what each image model really accepts:
 * reference images (how many, in which role, in which request field) and how
 * the output size is controlled (aspect ratio / fixed preset / exact pixels).
 *
 * The client mirror lives in `src/config/pictureModelCapabilities.ts` and is
 * kept byte-equal in its data by `src/config/__tests__/pictureModelCapabilities.test.ts`.
 * Never change one file without the other.
 */

export type PictureTier =
  | 'standard'
  | 'fast'
  | 'pro'
  | 'ultra'
  | 'gptimage'
  | 'flux'
  | 'ideogram'
  | 'recraft'
  | 'qwen';

export type PictureMode = 'create' | 'transform' | 'restyle' | 'mix';

/** Request field the provider expects the reference image(s) in. */
export type ReferenceField =
  | 'input_images'           // GPT Image 2 via Replicate
  | 'image_input'            // Seedream 4, Nano Banana — array of images
  | 'image_prompt'           // FLUX 1.1 Pro Ultra — single image
  | 'image'                  // Qwen Image — single image
  | 'style_reference_images' // Ideogram v3 — style-only array
  | 'chat'                   // Gemini via Lovable AI Gateway — content blocks
  | null;                    // model takes no image input at all

export interface ExactSizeRange {
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
  /** Width/height must be a multiple of this. */
  step: number;
  /** Hard cap on width × height. */
  maxMegapixels: number;
}

export interface PictureModelCapability {
  model: string;
  provider: 'replicate' | 'gateway';
  /** Aspect ratios the provider accepts. */
  aspectRatios: string[];
  references: {
    /** Max. subject/content reference images (image-to-image). */
    subject: number;
    /** Max. style-only reference images. */
    style: number;
    field: ReferenceField;
    /** Hard provider/request total across all reference roles. */
    total: number;
  };
  /** Workflows exposed by the Picture Studio for this concrete endpoint. */
  modes: PictureMode[];
  sizing: {
    kind: 'ratio' | 'preset' | 'exact' | 'resolution';
    /** aspect ratio → "WxH", for `preset`. */
    presets?: Record<string, string>;
    /** for `exact` — free width/height within these bounds. */
    exact?: ExactSizeRange;
    /** Provider-native output options such as 1K/2K or quality/speed. */
    resolutions?: string[];
    defaultResolution?: string;
  };
  strengthField?: 'image_prompt_strength' | 'strength';
  /** Provider documentation the row was verified against. */
  docs: string;
}

export const PICTURE_MODEL_CAPABILITIES: Record<PictureTier, PictureModelCapability> = {
  standard: {
    model: 'Gemini 2.5 Flash Image',
    provider: 'gateway',
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '4:5', '5:4', '21:9'],
    references: { subject: 3, style: 1, field: 'chat', total: 4 },
    modes: ['create', 'transform', 'restyle', 'mix'],
    sizing: { kind: 'ratio' },
    docs: 'https://ai.google.dev/gemini-api/docs/image-generation',
  },
  fast: {
    model: 'Seedream 4',
    provider: 'replicate',
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
    references: { subject: 10, style: 10, field: 'image_input', total: 10 },
    modes: ['create', 'transform', 'restyle', 'mix'],
    sizing: {
      kind: 'exact',
      exact: { minW: 1024, maxW: 4096, minH: 1024, maxH: 4096, step: 8, maxMegapixels: 16.8 },
      resolutions: ['1K', '2K', '4K', 'custom'],
      defaultResolution: '2K',
    },
    docs: 'https://replicate.com/bytedance/seedream-4',
  },
  pro: {
    model: 'Imagen 4 Ultra',
    provider: 'replicate',
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16'],
    references: { subject: 0, style: 0, field: null, total: 0 },
    modes: ['create'],
    sizing: { kind: 'resolution', resolutions: ['1K', '2K'], defaultResolution: '1K' },
    docs: 'https://replicate.com/google/imagen-4-ultra',
  },
  ultra: {
    model: 'Nano Banana',
    provider: 'replicate',
    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    references: { subject: 10, style: 10, field: 'image_input', total: 10 },
    modes: ['create', 'transform', 'restyle', 'mix'],
    sizing: { kind: 'ratio' },
    docs: 'https://replicate.com/google/nano-banana',
  },
  gptimage: {
    model: 'GPT-Image-2',
    provider: 'replicate',
    aspectRatios: ['1:1', '3:2', '2:3'],
    references: { subject: 4, style: 0, field: 'input_images', total: 4 },
    modes: ['create', 'transform', 'mix'],
    sizing: { kind: 'ratio' },
    docs: 'https://replicate.com/openai/gpt-image-2',
  },
  flux: {
    model: 'FLUX 1.1 Pro Ultra',
    provider: 'replicate',
    aspectRatios: ['1:1', '3:2', '2:3', '4:5', '5:4', '16:9', '9:16', '21:9'],
    references: { subject: 1, style: 1, field: 'image_prompt', total: 1 },
    modes: ['create', 'transform', 'restyle'],
    sizing: { kind: 'ratio' },
    strengthField: 'image_prompt_strength',
    docs: 'https://replicate.com/black-forest-labs/flux-1.1-pro-ultra',
  },
  ideogram: {
    model: 'Ideogram v3 Turbo',
    provider: 'replicate',
    aspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'],
    references: { subject: 0, style: 3, field: 'style_reference_images', total: 3 },
    modes: ['create', 'restyle'],
    sizing: {
      kind: 'resolution',
      resolutions: ['Auto', '1024x1024', '1344x768', '1536x640', '768x1344', '640x1536'],
      defaultResolution: 'Auto',
    },
    docs: 'https://replicate.com/ideogram-ai/ideogram-v3-turbo',
  },
  recraft: {
    model: 'Recraft v3',
    provider: 'replicate',
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16'],
    references: { subject: 0, style: 0, field: null, total: 0 },
    modes: ['create'],
    sizing: {
      kind: 'preset',
      presets: {
        '1:1': '1024x1024',
        '4:3': '1365x1024',
        '3:4': '1024x1365',
        '16:9': '1820x1024',
        '9:16': '1024x1820',
      },
    },
    docs: 'https://replicate.com/recraft-ai/recraft-v3',
  },
  qwen: {
    model: 'Qwen Image',
    provider: 'replicate',
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    references: { subject: 1, style: 0, field: 'image', total: 1 },
    modes: ['create', 'transform'],
    sizing: {
      kind: 'resolution',
      resolutions: ['optimize_for_quality', 'optimize_for_speed'],
      defaultResolution: 'optimize_for_quality',
    },
    strengthField: 'strength',
    docs: 'https://replicate.com/qwen/qwen-image',
  },
};

export function capabilityFor(tier: string): PictureModelCapability | undefined {
  return PICTURE_MODEL_CAPABILITIES[tier as PictureTier];
}

/** True when the model accepts any image input at all. */
export function acceptsReferences(tier: string): boolean {
  const cap = capabilityFor(tier);
  if (!cap) return false;
  return cap.references.field !== null && (cap.references.subject > 0 || cap.references.style > 0);
}

export function supportsMode(tier: string, mode: PictureMode): boolean {
  return capabilityFor(tier)?.modes.includes(mode) ?? false;
}

/** Closest supported ratio for a tier — used when switching models. */
export function closestAspectRatioFor(tier: string, requested: string): string {
  const allowed = capabilityFor(tier)?.aspectRatios;
  if (!allowed || allowed.includes(requested)) return requested;
  const parse = (r: string) => {
    const [w, h] = r.split(':').map(Number);
    return w > 0 && h > 0 ? w / h : 1;
  };
  const target = parse(requested);
  return allowed.reduce(
    (best, cand) => (Math.abs(parse(cand) - target) < Math.abs(parse(best) - target) ? cand : best),
    allowed[0],
  );
}

/** Clamp a pixel value into the model's exact-size grid. */
export function clampExact(value: number, min: number, max: number, step: number): number {
  const bounded = Math.min(max, Math.max(min, Math.round(value)));
  const snapped = Math.round(bounded / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

export interface ResolvedSize {
  /** For `ratio` models. */
  aspectRatio?: string;
  /** For `preset` models ("1024x1024"). */
  preset?: string;
  /** For `exact` models. */
  width?: number;
  height?: number;
  resolution?: string;
}

/**
 * Turn the user's request (ratio + optional exact pixels) into what the
 * provider actually accepts for this model.
 */
export function resolveSize(
  tier: string,
  aspectRatio: string,
  requested?: { width?: number; height?: number; resolution?: string },
): ResolvedSize {
  const cap = capabilityFor(tier);
  const safeAspect = closestAspectRatioFor(tier, aspectRatio);
  if (!cap) return { aspectRatio: safeAspect };

  if (cap.sizing.kind === 'preset') {
    return { preset: cap.sizing.presets?.[safeAspect] ?? cap.sizing.presets?.['1:1'] };
  }

  if (cap.sizing.kind === 'resolution') {
    const options = cap.sizing.resolutions ?? [];
    const resolution = requested?.resolution && options.includes(requested.resolution)
      ? requested.resolution
      : cap.sizing.defaultResolution ?? options[0];
    return { aspectRatio: safeAspect, resolution };
  }

  if (cap.sizing.kind === 'exact' && cap.sizing.exact && requested?.width && requested?.height) {
    const e = cap.sizing.exact;
    let w = clampExact(requested.width, e.minW, e.maxW, e.step);
    let h = clampExact(requested.height, e.minH, e.maxH, e.step);
    const maxPixels = e.maxMegapixels * 1_000_000;
    if (w * h > maxPixels) {
      const factor = Math.sqrt(maxPixels / (w * h));
      w = clampExact(w * factor, e.minW, e.maxW, e.step);
      h = clampExact(h * factor, e.minH, e.maxH, e.step);
    }
    return { width: w, height: h, aspectRatio: safeAspect };
  }

  return { aspectRatio: safeAspect };
}
