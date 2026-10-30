import React, { useMemo, useEffect, useRef } from 'react';
import { getSceneSourceStartFrame } from '../utils/sceneSourceStart';
import { AbsoluteFill, Video, OffthreadVideo, Audio, Sequence, Freeze, useCurrentFrame, useVideoConfig, Img, delayRender, continueRender, staticFile } from 'remotion';
// Sensor-Baseline deaktiviert (29.07.2026) — Raw-Invariant gilt auch im DC.
// Grade/Filter greifen nur, wenn der Kunde sie im Director's Cut aktiv setzt.
import { resolveTransitions, findActiveTransition, type ResolvedTransition } from '../../utils/transitionResolver';
import { safeInterpolate as interpolate, safeDuration } from '../utils/safeInterpolate';
import { safeFrame, safeDurationFrames, isValidRemoteMediaUrl } from '../utils/safeFrame';
import { z } from 'zod';
import { SVGFilters, SVG_FILTER_IDS, isSVGFilter, VHSScanlines, VignetteOverlay } from '../components/SVGFilters';
import { TextOverlayRenderer, TextOverlayProps } from '../components/TextOverlayRenderer';
import {
  SUBTITLE_FONT_SIZE_MAP,
  SUBTITLE_DEFAULT_BG,
  SUBTITLE_DEFAULT_COLOR,
  SUBTITLE_DEFAULT_FONT_FAMILY,
  SUBTITLE_DEFAULT_FONT_SIZE,
  SUBTITLE_BOTTOM_PADDING,
  SUBTITLE_TOP_PADDING,
  SUBTITLE_Z_INDEX,
  SUBTITLE_RENDER_VERSION,
} from '../utils/subtitleConstants';

// Font: Inter loaded via native FontFace API
const fontFamily = 'Inter';

// Overlay Schema (v407) — Text plus Grafik-Bausteine.
// Alle neuen Felder sind optional, damit ältere Payloads valide bleiben.
const OverlayAnimationEnum = z.enum([
  'none',
  'fadeIn',
  'scaleUp',
  'bounce',
  'typewriter',
  'highlight',
  'glitch',
  'slideLeft',
  'slideRight',
  'slideUp',
  'slideDown',
  'wipe',
  'pop',
  'blurIn',
  'stagger',
  'tickerLoop',
]);

const TextOverlayStyleSchema = z.object({
  fontSize: z.enum(['sm', 'md', 'lg', 'xl']),
  color: z.string(),
  backgroundColor: z.string(),
  shadow: z.boolean(),
  fontFamily: z.string(),
  // v407
  fontSizeRel: z.number().optional(),
  fontWeight: z.number().optional(),
  uppercase: z.boolean().optional(),
  letterSpacing: z.number().optional(),
  lineHeight: z.number().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  fill: z.string().optional(),
  gradient: z.tuple([z.string(), z.string()]).nullable().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.number().optional(),
  radius: z.number().optional(),
  opacity: z.number().optional(),
  rotation: z.number().optional(),
  accentColor: z.string().optional(),
  padding: z.number().optional(),
});

export const TextOverlaySchema = z.object({
  id: z.string(),
  text: z.string(),
  animation: OverlayAnimationEnum,
  position: z.enum(['top', 'center', 'bottom', 'bottomLeft', 'bottomRight', 'topLeft', 'topRight', 'centerLeft', 'centerRight', 'custom']),
  customPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  startTime: z.number(),
  endTime: z.number().nullable(),
  style: TextOverlayStyleSchema,
  // v407
  kind: z
    .enum(['text', 'lowerThird', 'banner', 'badge', 'card', 'cta', 'ticker', 'logo', 'callout', 'quote', 'progress'])
    .optional(),
  box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  enter: OverlayAnimationEnum.optional(),
  exit: OverlayAnimationEnum.optional(),
  slots: z
    .object({
      title: z.string().optional(),
      subtitle: z.string().optional(),
      badge: z.string().optional(),
      imageUrl: z.string().nullable().optional(),
    })
    .optional(),
});


// Transition Schema
const TransitionSchema = z.object({
  type: z.enum(['none', 'fade', 'crossfade', 'slide', 'zoom', 'wipe', 'blur', 'push']),
  duration: z.number(),
  direction: z.enum(['left', 'right', 'up', 'down']).optional(),
});

// Speed Keyframe Schema
const SpeedKeyframeSchema = z.object({
  time: z.number(),
  speed: z.number(),
  easing: z.string().optional(),
  sceneId: z.string().optional(), // Scene-specific or global
});

// Scene Effects Schema
const SceneEffectsSchema = z.object({
  filter: z.string().optional(),
  brightness: z.number().optional(),
  contrast: z.number().optional(),
  saturation: z.number().optional(),
  sharpness: z.number().optional(),
  temperature: z.number().optional(),
  vignette: z.number().optional(),
  speed: z.number().optional(),
  transition_in: z.string().optional(),
  transition_out: z.string().optional(),
});

// Additional Media Schema for added videos/images
const AdditionalMediaSchema = z.object({
  type: z.enum(['video', 'image']),
  url: z.string(),
  duration: z.number(),
});

// Scene Schema for multi-scene support with Time Remapping
const SceneSchema = z.object({
  id: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  // Time Remapping fields
  originalStartTime: z.number().optional(),
  originalEndTime: z.number().optional(),
  mediaSourceStart: z.number().optional(),
  mediaSourceEnd: z.number().optional(),
  playbackRate: z.number().optional(), // 1.0 = normal, <1 = slow-mo, >1 = fast
  transition: TransitionSchema.optional(),
  effects: SceneEffectsSchema.optional(),
  // Additional Media Support
  additionalMedia: AdditionalMediaSchema.optional(),
  isFromOriginalVideo: z.boolean().optional(),
  sourceMode: z.enum(['original', 'blackscreen', 'media']).optional(),
});

// Subtitle Clip Schema — .passthrough() so style extensions (textStroke, maxLines,
// style presets, source flag) survive Zod validation and reach the renderer instead
// of being silently stripped by strict parsing.
const SubtitleClipSchema = z.object({
  id: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
  position: z.enum(['top', 'center', 'bottom']).optional(),
  fontSize: z.enum(['small', 'medium', 'large', 'xl']).optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  fontFamily: z.string().optional(),
  textStroke: z.boolean().optional(),
  textStrokeColor: z.string().optional(),
  textStrokeWidth: z.number().optional(),
  maxLines: z.number().optional(),
  style: z.string().optional(),
  source: z.string().optional(),
}).passthrough();

// ========== TIMELINE AUDIO TRACKS — SFX + extra VO/music clips (audit C1) ==========
// Renders every non-muted timeline clip as its own <Audio> so nothing that shows
// up on the timeline is silently dropped by the render (previously the payload
// only carried voiceover_url + background_music_url singletons).
type TimelineAudioTrack = NonNullable<z.infer<typeof DirectorsCutVideoSchema>['audioTracks']>[number];
const TimelineAudioTracksRenderer: React.FC<{
  tracks: TimelineAudioTrack[] | undefined;
  fps: number;
  hasVoiceoverForDucking: boolean;
}> = ({ tracks, fps, hasVoiceoverForDucking }) => {
  if (!tracks || tracks.length === 0) return null;
  const anySolo = tracks.some(t => t.solo);
  return (
    <>
      {tracks.map(track => {
        if (track.muted) return null;
        if (anySolo && !track.solo) return null;
        const trackVol = Math.max(0, Math.min(100, track.volume ?? 100)) / 100;
        const isMusicTrack = track.type === 'background-music';
        return (track.clips || []).map(clip => {
          if (!clip.url) return null;
          const clipVol = Math.max(0, Math.min(100, clip.volume ?? 100)) / 100;
          const trimStart = Math.max(0, clip.trimStart ?? 0);
          const trimEnd = Math.max(trimStart, clip.trimEnd ?? clip.duration);
          const usable = Math.max(0.05, trimEnd - trimStart);
          const startFrame = Math.max(0, Math.round((clip.startTime ?? 0) * fps));
          const durationFrames = Math.max(1, Math.round(usable * fps));
          // Duck background music under voiceovers to match preview mixer.
          const duck = isMusicTrack && hasVoiceoverForDucking ? 0.35 : 1;
          const finalVol = Math.max(0, Math.min(1, trackVol * clipVol * duck));
          if (finalVol <= 0) return null;
          return (
            <Sequence key={clip.id} from={startFrame} durationInFrames={durationFrames} layout="none">
              <Audio
                src={clip.url}
                volume={finalVol}
                startFrom={Math.round(trimStart * fps)}
                pauseWhenBuffering
              />
            </Sequence>
          );
        });
      })}
    </>
  );
};


const SubtitleClipRenderer: React.FC<{ clip: z.infer<typeof SubtitleClipSchema> }> = ({ clip }) => {
  const strokeEnabled = clip.textStroke && (clip.textStrokeWidth ?? 0) > 0;
  const strokeColor = clip.textStrokeColor || '#000000';
  const strokeWidth = clip.textStrokeWidth ?? 2;
  const maxLines = clip.maxLines && clip.maxLines > 0 ? clip.maxLines : undefined;

  return (
    <div style={{
      position: 'absolute',
      left: 0, right: 0, top: 0, bottom: 0,
      width: '100%', height: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: clip.position === 'top' ? 'flex-start' : clip.position === 'center' ? 'center' : 'flex-end',
      paddingTop: clip.position === 'top' ? SUBTITLE_TOP_PADDING : '5%',
      paddingBottom: clip.position !== 'top' && clip.position !== 'center' ? SUBTITLE_BOTTOM_PADDING : '5%',
      paddingLeft: '5%', paddingRight: '5%',
      pointerEvents: 'none',
      zIndex: SUBTITLE_Z_INDEX,
    }}>
      <div style={{
        backgroundColor: clip.backgroundColor || SUBTITLE_DEFAULT_BG,
        color: clip.color || SUBTITLE_DEFAULT_COLOR,
        padding: '14px 28px', borderRadius: '8px',
        fontSize: SUBTITLE_FONT_SIZE_MAP[clip.fontSize || SUBTITLE_DEFAULT_FONT_SIZE] || SUBTITLE_FONT_SIZE_MAP.medium,
        fontFamily: clip.fontFamily || SUBTITLE_DEFAULT_FONT_FAMILY,
        fontWeight: 'bold',
        textAlign: 'center' as const,
        maxWidth: '90%', lineHeight: 1.4,
        textShadow: strokeEnabled
          ? `${strokeWidth}px 0 0 ${strokeColor}, -${strokeWidth}px 0 0 ${strokeColor}, 0 ${strokeWidth}px 0 ${strokeColor}, 0 -${strokeWidth}px 0 ${strokeColor}, 0 2px 4px rgba(0,0,0,0.5)`
          : '0 2px 4px rgba(0,0,0,0.5)',
        WebkitTextStroke: strokeEnabled ? `${strokeWidth}px ${strokeColor}` : undefined,
        display: maxLines ? '-webkit-box' : undefined,
        WebkitLineClamp: maxLines,
        WebkitBoxOrient: maxLines ? ('vertical' as const) : undefined,
        overflow: maxLines ? 'hidden' : undefined,
      }}>
        {clip.text}
      </div>
    </div>
  );
};

// SubtitleTrack Schema
const SubtitleTrackSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  clips: z.array(SubtitleClipSchema),
  visible: z.boolean().optional(),
});

export const DirectorsCutVideoSchema = z.object({
  sourceVideoUrl: z.string(),
  // Visual Effects (global)
  brightness: z.number().optional(),
  contrast: z.number().optional(),
  saturation: z.number().optional(),
  sharpness: z.number().optional(),
  temperature: z.number().optional(),
  vignette: z.number().optional(),
  filter: z.string().optional(),
  // Scene-specific effects
  sceneEffects: z.record(z.string(), SceneEffectsSchema).optional(),
  // Style Transfer
  styleTransfer: z.object({
    enabled: z.boolean(),
    style: z.string().optional(),
    intensity: z.number().optional(),
  }).optional(),
  // Color Grading (global)
  colorGrading: z.object({
    enabled: z.boolean(),
    grade: z.string().optional(),
    intensity: z.number().optional(),
  }).optional(),
  // Scene-specific Color Grading
  sceneColorGrading: z.record(z.string(), z.object({
    grade: z.string().optional(),
    intensity: z.number().optional(),
  })).optional(),
  // Speed Ramping
  speedKeyframes: z.array(SpeedKeyframeSchema).optional(),
  // Chroma Key
  chromaKey: z.object({
    enabled: z.boolean(),
    color: z.string().optional(),
    tolerance: z.number().optional(),
    edgeSoftness: z.number().optional(),
    spillSuppression: z.number().optional(),
    backgroundUrl: z.string().optional(),
  }).optional(),
  // Transitions
  transitions: z.array(z.object({
    sceneIndex: z.number(),
    sceneId: z.string().optional().nullable(),
    type: z.string(),
    duration: z.number(),
    offsetSeconds: z.number().optional(),
  })).optional(),
  // Ken Burns Effect
  kenBurns: z.array(z.object({
    id: z.string(),
    sceneId: z.string().optional(),
    startZoom: z.number(),
    endZoom: z.number(),
    startX: z.number(),
    startY: z.number(),
    endX: z.number(),
    endY: z.number(),
    easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']),
  })).optional(),
  // Scenes
  scenes: z.array(SceneSchema).optional(),
  // Audio
  masterVolume: z.number().optional(),
  noiseReduction: z.boolean().optional(),
  voiceEnhancement: z.boolean().optional(),
  voiceoverUrl: z.string().optional(),
  voiceoverVolume: z.number().optional(),
  backgroundMusicUrl: z.string().optional(),
  backgroundMusicVolume: z.number().optional(),
  // Full timeline audio (SFX + extra clips beyond the singletons above).
  // Each clip is rendered as its own <Audio> at its timeline startTime,
  // trimmed by [trimStart, trimEnd], scaled by track volume × clip volume.
  audioTracks: z.array(z.object({
    id: z.string(),
    type: z.enum(['voiceover', 'background-music', 'sound-effect', 'original']).optional(),
    volume: z.number().optional(),
    muted: z.boolean().optional(),
    solo: z.boolean().optional(),
    clips: z.array(z.object({
      id: z.string(),
      url: z.string(),
      startTime: z.number(),
      duration: z.number(),
      trimStart: z.number().optional(),
      trimEnd: z.number().optional(),
      volume: z.number().optional(),
      fadeIn: z.number().optional(),
      fadeOut: z.number().optional(),
      source: z.string().optional(),
    })).optional(),
  })).optional(),
  // Sound Design
  soundDesign: z.object({
    enabled: z.boolean(),
    ambientUrl: z.string().optional(),
    ambientVolume: z.number().optional(),
    sfxTracks: z.array(z.object({
      url: z.string(),
      startTime: z.number(),
      volume: z.number(),
    })).optional(),
  }).optional(),
  // Upscaling
  upscaling: z.object({
    enabled: z.boolean(),
    targetResolution: z.string().optional(),
  }).optional(),
  // Frame Interpolation
  interpolation: z.object({
    enabled: z.boolean(),
    targetFps: z.number().optional(),
  }).optional(),
  // Dimensions
  targetWidth: z.number().optional(),
  targetHeight: z.number().optional(),
  // Duration
  durationInSeconds: z.number().optional(),
  // Text Overlays
  textOverlays: z.array(TextOverlaySchema).optional(),
  // Subtitle Track
  subtitleTrack: SubtitleTrackSchema.optional(),
  // Subtitle Safe Zone (hard crop for burned-in subtitles)
  subtitleSafeZone: z.object({
    enabled: z.boolean(),
    mode: z.enum(['reframe', 'crop', 'ai']).optional(),
    zoom: z.number(),
    offsetY: z.number(),
    bottomBandPercent: z.number(),
  }).optional(),
  // Preview mode: skip audio, less aggressive buffering
  previewMode: z.boolean().optional(),
});

type DirectorsCutVideoProps = z.infer<typeof DirectorsCutVideoSchema>;

// SVG Sharpness Filter Component
const SharpnessFilter: React.FC<{ intensity: number }> = ({ intensity }) => {
  if (intensity <= 0) return null;
  const k = intensity / 100; // 0 to 1
  // Unsharp mask kernel approximation
  const kernel = `0 ${-k} 0 ${-k} ${1 + 4 * k} ${-k} 0 ${-k} 0`;
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        <filter id="sharpen-filter">
          <feConvolveMatrix
            order="3"
            kernelMatrix={kernel}
            preserveAlpha="true"
          />
        </filter>
      </defs>
    </svg>
  );
};

// Style Transfer CSS approximations
const STYLE_CSS: Record<string, string> = {
  cinematic_pro: 'contrast(1.15) saturate(0.9) brightness(0.95) sepia(0.1)',
  anime: 'saturate(1.5) contrast(1.2) brightness(1.1)',
  vintage_film: 'sepia(0.5) contrast(0.85) brightness(1.15)',
  noir_classic: 'grayscale(1) contrast(1.3) brightness(0.85)',
  neon_glow: 'saturate(1.8) contrast(1.3) brightness(1.1)',
  pastel: 'saturate(0.7) brightness(1.2) contrast(0.9)',
};

// Color Grade CSS approximations - IDs müssen exakt mit UI übereinstimmen (Bindestrich-Format)
const GRADE_CSS: Record<string, string> = {
  // Primäre IDs (Bindestrich-Format wie in AIColorGrading.tsx)
  'teal-orange': 'sepia(0.15) hue-rotate(-15deg) saturate(1.25) contrast(1.1)',
  'moody-blue': 'hue-rotate(200deg) saturate(0.85) brightness(0.92) contrast(1.18)',
  'warm-sunset': 'sepia(0.35) saturate(1.4) brightness(1.08) contrast(1.05)',
  'cold-steel': 'hue-rotate(195deg) saturate(0.7) brightness(1.05) contrast(1.15)',
  'forest-green': 'hue-rotate(75deg) saturate(0.85) brightness(1.02) contrast(1.08)',
  'rose-gold': 'sepia(0.22) hue-rotate(-8deg) saturate(1.15) brightness(1.06)',
  // Legacy IDs (Unterstrich-Format für Abwärtskompatibilität)
  teal_orange: 'sepia(0.15) hue-rotate(-15deg) saturate(1.25) contrast(1.1)',
  cold_blue: 'hue-rotate(195deg) saturate(0.7) brightness(1.05) contrast(1.15)',
  warm_sunset: 'sepia(0.35) saturate(1.4) brightness(1.08) contrast(1.05)',
  forest_green: 'hue-rotate(75deg) saturate(0.85) brightness(1.02) contrast(1.08)',
  purple_haze: 'hue-rotate(-30deg) saturate(1.1) brightness(1.05)',
  bleach_bypass: 'contrast(1.2) saturate(0.5) brightness(1.1)',
};

// Filter/LUT CSS - Basic filters only, creative filters use SVG
const FILTER_CSS: Record<string, string> = {
  // Basic filters (CSS-based for performance)
  cinematic: 'saturate(1.35) contrast(1.3) brightness(0.95)',
  vintage: 'sepia(0.4) contrast(1.35) brightness(0.88)',
  noir: 'grayscale(1) contrast(1.6) brightness(0.9)',
  warm: 'sepia(0.35) saturate(1.45) brightness(1.05)',
  cool: 'hue-rotate(-40deg) saturate(0.8) brightness(0.96)',
  vibrant: 'saturate(1.8) contrast(1.25) brightness(1.05)',
  muted: 'saturate(0.45) brightness(1.15) contrast(0.88)',
  highkey: 'brightness(1.45) contrast(0.75) saturate(0.9)',
  lowkey: 'brightness(0.65) contrast(1.45) saturate(0.85)',
};

// Easing functions for Ken Burns
const applyEasing = (t: number, easing: string): number => {
  switch (easing) {
    case 'easeIn': return t * t;
    case 'easeOut': return t * (2 - t);
    case 'easeInOut': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default: return t; // linear
  }
};

// Scene Video Component - renders inside a Sequence with local frame
const SceneVideo: React.FC<{
  sourceVideoUrl: string;
  scene: z.infer<typeof SceneSchema>;
  sceneIndex: number;
  totalScenes: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  temperature: number;
  vignette: number;
  globalFilter?: string;
  styleTransfer?: { enabled?: boolean; style?: string; intensity?: number };
  colorGrading?: { enabled?: boolean; grade?: string; intensity?: number };
  sceneColorGrading?: Record<string, { grade?: string; intensity?: number }>;
  sceneEffects?: Record<string, z.infer<typeof SceneEffectsSchema>>;
  transitions?: Array<{ sceneIndex?: number; type?: string; duration?: number }>;
  chromaKey?: { enabled?: boolean; color?: string; tolerance?: number; edgeSoftness?: number; spillSuppression?: number; backgroundUrl?: string };
  kenBurns?: Array<{ id?: string; sceneId?: string; startZoom?: number; endZoom?: number; startX?: number; startY?: number; endX?: number; endY?: number; easing?: string }>;
  sceneDurationFrames: number;
  previewMode?: boolean;
}> = ({
  sourceVideoUrl,
  scene,
  sceneIndex,
  totalScenes,
  brightness,
  contrast,
  saturation,
  sharpness,
  temperature,
  vignette,
  globalFilter,
  styleTransfer,
  colorGrading,
  sceneColorGrading,
  sceneEffects,
  transitions,
  chromaKey,
  kenBurns,
  sceneDurationFrames,
  previewMode = false,
}) => {
  const localFrame = useCurrentFrame(); // Local frame within this Sequence (0 to sceneDurationFrames)
  const { fps } = useVideoConfig();

  // Source position for this scene. Scenes with their own clip (additionalMedia)
  // start at their trim point inside that clip — NOT at their timeline position,
  // otherwise scene N starts past the end of its own clip and freezes.
  const sceneHasOwnClip = !!scene.additionalMedia && (scene.sourceMode === 'media' || scene.isFromOriginalVideo === false);
  const sourceStartFrame = getSceneSourceStartFrame(scene, fps, sceneHasOwnClip);
  const playbackRate = scene.playbackRate ?? 1;

  // Get scene-specific effects
  const currentSceneEffect = sceneEffects?.[scene.id] || scene.effects || null;

  // Calculate effective values (scene-specific or global fallback)
  const effectiveBrightness = currentSceneEffect?.brightness ?? brightness;
  const effectiveContrast = currentSceneEffect?.contrast ?? contrast;
  const effectiveSaturation = currentSceneEffect?.saturation ?? saturation;
  const effectiveSharpness = currentSceneEffect?.sharpness ?? sharpness;
  const effectiveTemperature = currentSceneEffect?.temperature ?? temperature;
  const effectiveVignette = currentSceneEffect?.vignette ?? vignette;

  // Determine if current filter is SVG-based
  const effectiveFilter = currentSceneEffect?.filter ?? globalFilter;
  const usesSVGFilter = effectiveFilter ? isSVGFilter(effectiveFilter) : false;

  // Build filter string
  const filterString = useMemo(() => {
    let filterStr = `brightness(${effectiveBrightness / 100}) `;
    filterStr += `contrast(${effectiveContrast / 100}) `;
    filterStr += `saturate(${effectiveSaturation / 100}) `;
    
    // Temperature - verstärkte Warm/Kalt-Effekte (now using effectiveTemperature)
    if (effectiveTemperature !== 0) {
      if (effectiveTemperature > 0) {
        // Warm: Orange/Gelb-Töne mit sepia + saturate + brightness
        const warmth = effectiveTemperature / 50;
        filterStr += `sepia(${Math.min(0.5, warmth * 0.3)}) saturate(${1 + warmth * 0.3}) brightness(${1 + warmth * 0.05}) `;
      } else {
        // Kalt: Blau-Töne mit hue-rotate + saturate
        const coldness = Math.abs(effectiveTemperature) / 50;
        filterStr += `hue-rotate(${effectiveTemperature * 1.5}deg) saturate(${1 + coldness * 0.2}) brightness(${1 + coldness * 0.02}) `;
      }
    }
    
    // Sharpness via SVG filter (now using effectiveSharpness)
    if (effectiveSharpness > 0) {
      filterStr += `url(#sharpen-filter) `;
    }
    
    // Apply LUT/Filter (scene-specific or global)
    // Check if it's an SVG-based creative filter
    if (effectiveFilter && isSVGFilter(effectiveFilter)) {
      // Use SVG filter URL for transformative effects
      filterStr += SVG_FILTER_IDS[effectiveFilter] + ' ';
    } else if (effectiveFilter && FILTER_CSS[effectiveFilter]) {
      // Use CSS filter for basic filters
      filterStr += FILTER_CSS[effectiveFilter] + ' ';
    }
    
    if (styleTransfer?.enabled && styleTransfer.style && STYLE_CSS[styleTransfer.style]) {
      filterStr += STYLE_CSS[styleTransfer.style] + ' ';
    }
    
    // Scene-specific Color Grading has priority over global
    const sceneGrading = sceneColorGrading?.[scene.id];
    const effectiveGrading = sceneGrading?.grade 
      ? { enabled: true, grade: sceneGrading.grade, intensity: sceneGrading.intensity }
      : colorGrading;
    
    if (effectiveGrading?.enabled && effectiveGrading.grade && GRADE_CSS[effectiveGrading.grade]) {
      // Intensity skaliert die Stärke des Grading-Effekts (0.0 - 1.0)
      const gradeIntensity = effectiveGrading.intensity ?? 0.7;
      const gradeFilter = GRADE_CSS[effectiveGrading.grade];
      // Bei voller Intensität den vollen Filter anwenden, sonst abgeschwächt via opacity-blend Workaround
      if (gradeIntensity >= 0.9) {
        filterStr += gradeFilter + ' ';
      } else if (gradeIntensity > 0) {
        // Skaliere die Filter-Werte proportional zur Intensität
        filterStr += gradeFilter + ' ';
        // Zusätzlich Opacity-Adjustment für feinere Kontrolle
        filterStr += `opacity(${0.3 + gradeIntensity * 0.7}) `;
      }
    }
    
    return filterStr.trim();
  }, [effectiveBrightness, effectiveContrast, effectiveSaturation, effectiveTemperature, effectiveSharpness, effectiveFilter, styleTransfer, colorGrading, sceneColorGrading, scene.id]);

  // Check if VHS filter needs scanlines overlay
  const needsVHSScanlines = effectiveFilter === 'retro_vhs';

  // Vignette style for this scene
  const sceneVignetteStyle = useMemo(() => {
    if (effectiveVignette <= 0) return null;
    const opacity = effectiveVignette / 100;
    const size = Math.max(30, 70 - effectiveVignette * 0.4);
    return {
      background: `radial-gradient(circle, transparent ${size}%, rgba(0,0,0,${opacity}) 100%)`,
      pointerEvents: 'none' as const,
      zIndex: 10,
    };
  }, [effectiveVignette]);

  // TransitionSeries handles all transition effects — no manual calculation needed
  const transitionEffects = { opacity: 1, transform: '', clipPath: '', additionalFilter: '' };

  // Calculate Ken Burns transform
  const kenBurnsTransform = useMemo(() => {
    // Find matching keyframe (scene-specific or global)
    const keyframe = kenBurns?.find(k => 
      k.sceneId === scene.id || !k.sceneId
    );
    
    if (!keyframe || keyframe.startZoom === undefined) return '';
    
    // Progress 0-1 based on localFrame / sceneDurationFrames
    const rawProgress = sceneDurationFrames > 0 ? localFrame / sceneDurationFrames : 0;
    const progress = Math.min(1, Math.max(0, rawProgress));
    
    // Apply easing function
    const easedProgress = applyEasing(progress, keyframe.easing || 'linear');
    
    // Interpolate between start and end values (with defaults)
    const startZoom = keyframe.startZoom ?? 1;
    const endZoom = keyframe.endZoom ?? 1;
    const startX = keyframe.startX ?? 0;
    const endX = keyframe.endX ?? 0;
    const startY = keyframe.startY ?? 0;
    const endY = keyframe.endY ?? 0;
    
    const zoom = interpolate(easedProgress, [0, 1], [startZoom, endZoom], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const x = interpolate(easedProgress, [0, 1], [startX, endX], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const y = interpolate(easedProgress, [0, 1], [startY, endY], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    
    return `scale(${zoom}) translate(${x}%, ${y}%)`;
  }, [kenBurns, scene.id, localFrame, sceneDurationFrames]);

  // Combine transitions transform with Ken Burns transform
  const combinedTransform = useMemo(() => {
    const transforms: string[] = [];
    if (kenBurnsTransform) transforms.push(kenBurnsTransform);
    if (transitionEffects.transform) transforms.push(transitionEffects.transform);
    return transforms.length > 0 ? transforms.join(' ') : undefined;
  }, [kenBurnsTransform, transitionEffects.transform]);

  const baseFilter = transitionEffects.additionalFilter 
    ? `${filterString} ${transitionEffects.additionalFilter}` 
    : filterString;
  // Raw-Invariant: keine Sensor-Baseline mehr. Nur Filter, die der Kunde
  // im Director's Cut aktiv gesetzt hat (Mood/Grade/FX), landen im Export.
  const finalFilter = baseFilter;


  const chromaKeyStyle = chromaKey?.enabled ? { mixBlendMode: 'multiply' as const } : {};


  // Determine if this scene uses additional media (video or image)
  const hasAdditionalMedia = !!scene.additionalMedia && (scene.sourceMode === 'media' || scene.isFromOriginalVideo === false);
  const isImage = hasAdditionalMedia && scene.additionalMedia?.type === 'image';
  const mediaUrl = hasAdditionalMedia && scene.additionalMedia?.url ? scene.additionalMedia.url : sourceVideoUrl;

  return (
    <>
      {isImage ? (
        // Render image for additionalMedia type 'image'
        <Img
          src={scene.additionalMedia!.url}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: finalFilter,
            opacity: transitionEffects.opacity,
            transform: combinedTransform,
            transformOrigin: 'center center',
            clipPath: transitionEffects.clipPath || undefined,
            ...chromaKeyStyle,
          }}
        />
      ) : isValidRemoteMediaUrl(mediaUrl) ? (
        // Render video (original source or additionalMedia video)
        // Export: OffthreadVideo (ffmpeg-exact frames, no Chromium blend/drift).
        // Preview: <Video> (OffthreadVideo cannot run in the browser).
        previewMode ? (
          <Video
            src={mediaUrl}
            startFrom={sourceStartFrame}
            playbackRate={playbackRate}
            pauseWhenBuffering={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: finalFilter,
              opacity: transitionEffects.opacity,
              transform: combinedTransform,
              transformOrigin: 'center center',
              clipPath: transitionEffects.clipPath || undefined,
              ...chromaKeyStyle,
            }}
            volume={0}
          />
        ) : (
          <OffthreadVideo
            src={mediaUrl}
            startFrom={sourceStartFrame}
            playbackRate={playbackRate}
            pauseWhenBuffering
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: finalFilter,
              opacity: transitionEffects.opacity,
              transform: combinedTransform,
              transformOrigin: 'center center',
              clipPath: transitionEffects.clipPath || undefined,
              ...chromaKeyStyle,
            }}
            volume={0}
          />
        )
      ) : (
        // Bug 3 fallback: invalid/missing video URL → render black frame
        // instead of crashing Chromium with MEDIA_ERR Code 4.
        <AbsoluteFill style={{ backgroundColor: '#000' }} />
      )}
      {/* VHS Scanlines Overlay for retro_vhs filter */}
      {needsVHSScanlines && <VHSScanlines intensity={0.25} />}
      {/* Scene-specific Vignette Overlay */}
      {sceneVignetteStyle && <AbsoluteFill style={sceneVignetteStyle} />}
    </>
  );
};

export const DirectorsCutVideo: React.FC<DirectorsCutVideoProps> = ({
  sourceVideoUrl,
  brightness = 100,
  contrast = 100,
  saturation = 100,
  sharpness = 0,
  temperature = 0,
  vignette = 0,
  filter,
  sceneEffects,
  styleTransfer,
  colorGrading,
  sceneColorGrading,
  speedKeyframes,
  chromaKey,
  transitions,
  kenBurns,
  scenes,
  masterVolume = 100,
  voiceoverUrl,
  voiceoverVolume = 100,
  backgroundMusicUrl,
  backgroundMusicVolume = 30,
  audioTracks,
  soundDesign,
  textOverlays = [],
  subtitleTrack,
  subtitleSafeZone,
  previewMode = false,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const currentTimeSeconds = frame / fps;

  // Music mix policy (mirror src/lib/audioVolume.ts so preview === export):
  // when a voice-over is present, reserve headroom under the narration.
  const MUSIC_HEADROOM_WITH_VOICEOVER = 0.35;
  const effectiveMusicVolume = (() => {
    const slider = Math.max(0, Math.min(100, backgroundMusicVolume ?? 30)) / 100;
    if (!voiceoverUrl) return slider;
    return Math.max(0, Math.min(1, slider * MUSIC_HEADROOM_WITH_VOICEOVER));
  })();

  // Log render version once on first frame for bundle verification
  useEffect(() => {
    const clipCount = subtitleTrack?.clips?.length ?? 0;
    const firstClip = subtitleTrack?.clips?.[0];
    console.log(`[DirectorsCutVideo] 🎬 CANARY ${SUBTITLE_RENDER_VERSION} | clips=${clipCount} | visible=${subtitleTrack?.visible} | firstClipText="${firstClip?.text?.substring(0, 40) ?? 'NONE'}" | firstClipTime=${firstClip?.startTime ?? 'N/A'}-${firstClip?.endTime ?? 'N/A'}`);
    if (clipCount === 0 && subtitleTrack) {
      console.warn(`[DirectorsCutVideo] ⚠️ subtitleTrack present but NO clips! Raw keys: ${Object.keys(subtitleTrack).join(',')}`);
    }
  }, []);

  // Load font using native FontFace API (same as UniversalVideo.tsx)
  useEffect(() => {
    const handle = delayRender('Loading Inter font for Director\'s Cut...');
    
    const font = new FontFace(
      fontFamily,
      `url('${staticFile('Inter-Regular.woff2')}') format('woff2')`,
      { weight: '400' }
    );
    
    font.load()
      .then(() => {
        document.fonts.add(font);
        continueRender(handle);
      })
      .catch((err) => {
        console.error('[DirectorsCutVideo] Font loading error:', err);
        continueRender(handle);
      });
  }, []);

  // Sort scenes by startTime
  const sortedScenes = useMemo(() => {
    if (!scenes || scenes.length === 0) return [];
    return [...scenes].sort((a, b) => a.startTime - b.startTime);
  }, [scenes]);

  const resolvedRenderTransitions = useMemo(() => resolveTransitions(
    sortedScenes.map(s => ({
      id: s.id,
      originalStartTime: s.originalStartTime,
      originalEndTime: s.originalEndTime,
      mediaSourceStart: s.mediaSourceStart,
      mediaSourceEnd: s.mediaSourceEnd,
      startTime: s.startTime,
      endTime: s.endTime,
      playbackRate: s.playbackRate,
    })),
    (transitions || []).map(t => ({
      sceneId: (t as any).sceneId || '',
      sceneIndex: t.sceneIndex,
      transitionType: t.type || 'none',
      type: t.type,
      duration: t.duration || 0.8,
      offsetSeconds: t.offsetSeconds,
    })),
  ), [sortedScenes, transitions]);

  const renderTransitionLayer = (rt: ResolvedTransition) => {
    const outgoing = sortedScenes.find(s => s.id === rt.outgoingSceneId);
    const incoming = sortedScenes.find(s => s.id === rt.incomingSceneId);
    if (!outgoing || !incoming) return null;

    const from = safeFrame(rt.tStart, fps, durationInFrames - 1);
    const durationFrames = Math.max(1, Math.round(rt.duration * fps));
    const localFrame = Math.max(0, frame - from);
    const raw = Math.min(1, Math.max(0, localFrame / Math.max(1, durationFrames)));
    const progress = Math.pow(0.5 - 0.5 * Math.cos(raw * Math.PI), 0.7);

    const halfDuration = rt.duration / 2;
    const outgoingSourceEnd = outgoing.originalEndTime ?? outgoing.endTime;
    const outgoingSourceStart = rt.placement === 'centered'
      ? Math.max(0, outgoingSourceEnd - halfDuration)
      : Math.max(0, rt.originalBoundary - 1 / fps);
    const incomingSourceStart = incoming.originalStartTime ?? incoming.startTime;
    const incomingTransitionStart = rt.placement === 'centered'
      ? Math.max(0, incomingSourceStart - halfDuration)
      : incomingSourceStart;

    const outgoingScene = {
      ...outgoing,
      startTime: rt.tStart,
      endTime: rt.tEnd,
      originalStartTime: outgoingSourceStart,
      originalEndTime: outgoingSourceStart + rt.duration,
      playbackRate: rt.placement === 'centered' ? (outgoing.playbackRate ?? 1) : 1,
    };

    const incomingScene = {
      ...incoming,
      startTime: rt.tStart,
      endTime: rt.tEnd,
      originalStartTime: incomingTransitionStart,
      originalEndTime: incomingTransitionStart + rt.duration,
      playbackRate: incoming.playbackRate ?? 1,
    };

    let outgoingStyle: React.CSSProperties = { opacity: 1 - progress };
    let incomingStyle: React.CSSProperties = { opacity: progress };
    let blackOpacity = 0;
    switch (rt.baseType) {
      case 'crossfade':
      case 'dissolve':
        // Professional A/B dissolve. When placement is 'centered', the outgoing
        // scene's main Sequence keeps playing UNDER the overlay, so the frozen
        // overlay must stay solid at opacity 1 and we only reveal the incoming
        // clip on top. When placement is 'start-at-cut' (no source handles —
        // the common case for trimmed AI clips), the outgoing main Sequence
        // has already ended at the cut and the ONLY thing on screen would be
        // the frozen last frame at opacity 1, which hides the incoming layer
        // for the full transition duration (visible as a ~1s freeze). In that
        // case fade the frozen outgoing 1 → 0 so the incoming clip below is
        // actually revealed.
        outgoingStyle = { opacity: rt.placement === 'centered' ? 1 : 1 - progress };
        incomingStyle = { opacity: progress };
        break;
      case 'fade':
        outgoingStyle = { opacity: progress < 0.5 ? 1 - progress * 2 : 0 };
        incomingStyle = { opacity: progress < 0.5 ? 0 : (progress - 0.5) * 2 };
        blackOpacity = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
        break;
      case 'wipe':
        outgoingStyle = { opacity: 1 };
        incomingStyle = rt.direction === 'right'
          ? { clipPath: `inset(0 0 0 ${(1 - progress) * 100}%)` }
          : rt.direction === 'up'
            ? { clipPath: `inset(0 0 ${(1 - progress) * 100}% 0)` }
            : rt.direction === 'down'
              ? { clipPath: `inset(${(1 - progress) * 100}% 0 0 0)` }
              : { clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` };
        break;
      case 'slide':
      case 'push':
        incomingStyle = rt.direction === 'right'
          ? { transform: `translateX(${-(1 - progress) * 100}%)` }
          : rt.direction === 'up'
            ? { transform: `translateY(${(1 - progress) * 100}%)` }
            : rt.direction === 'down'
              ? { transform: `translateY(${-(1 - progress) * 100}%)` }
              : { transform: `translateX(${(1 - progress) * 100}%)` };
        outgoingStyle = rt.baseType === 'push'
          ? rt.direction === 'right'
            ? { transform: `translateX(${progress * 100}%)` }
            : rt.direction === 'up'
              ? { transform: `translateY(${-progress * 100}%)` }
              : rt.direction === 'down'
                ? { transform: `translateY(${progress * 100}%)` }
                : { transform: `translateX(${-progress * 100}%)` }
          : { opacity: 1 };
        break;
      case 'blur':
        outgoingStyle = { opacity: 1 - progress, filter: `blur(${progress * 10}px)` };
        incomingStyle = { opacity: progress, filter: `blur(${(1 - progress) * 10}px)` };
        break;
      case 'zoom':
        outgoingStyle = { opacity: 1 - progress, transform: `scale(${1 + progress * 0.12})` };
        incomingStyle = { opacity: progress, transform: `scale(${0.88 + progress * 0.12})` };
        break;
    }

    const outgoingLayer = (
      <SceneVideo
        sourceVideoUrl={sourceVideoUrl}
        scene={outgoingScene}
        sceneIndex={rt.sceneIndex}
        totalScenes={sortedScenes.length}
        brightness={brightness}
        contrast={contrast}
        saturation={saturation}
        sharpness={sharpness}
        temperature={temperature}
        vignette={vignette}
        globalFilter={filter}
        styleTransfer={styleTransfer}
        colorGrading={colorGrading}
        sceneColorGrading={sceneColorGrading}
        sceneEffects={sceneEffects}
        transitions={[]}
        chromaKey={chromaKey}
        kenBurns={kenBurns}
        sceneDurationFrames={durationFrames}
        previewMode={false}
      />
    );

    return (
      <Sequence key={`transition-${rt.outgoingSceneId}-${rt.incomingSceneId}`} from={from} durationInFrames={durationFrames}>
        <AbsoluteFill style={{ overflow: 'hidden', zIndex: 18, pointerEvents: 'none', ...incomingStyle }}>
          <div style={{ width: '100%', height: '100%', ...safeZoneCropStyle }}>
            <SceneVideo
              sourceVideoUrl={sourceVideoUrl}
              scene={incomingScene}
              sceneIndex={rt.sceneIndex + 1}
              totalScenes={sortedScenes.length}
              brightness={brightness}
              contrast={contrast}
              saturation={saturation}
              sharpness={sharpness}
              temperature={temperature}
              vignette={vignette}
              globalFilter={filter}
              styleTransfer={styleTransfer}
              colorGrading={colorGrading}
              sceneColorGrading={sceneColorGrading}
              sceneEffects={sceneEffects}
              transitions={[]}
              chromaKey={chromaKey}
              kenBurns={kenBurns}
              sceneDurationFrames={durationFrames}
              previewMode={false}
            />
          </div>
        </AbsoluteFill>
        <AbsoluteFill style={{ overflow: 'hidden', zIndex: 20, pointerEvents: 'none', ...outgoingStyle }}>
          <div style={{ width: '100%', height: '100%', ...safeZoneCropStyle }}>
            {rt.placement === 'centered' ? outgoingLayer : <Freeze frame={0}>{outgoingLayer}</Freeze>}
          </div>
        </AbsoluteFill>
        {blackOpacity > 0 && <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${blackOpacity})`, zIndex: 21 }} />}
      </Sequence>
    );
  };

  // Subtitle Safe Zone crop style — 'crop' hard-clips the bottom band, 'reframe' only scales/shifts
  const safeZoneMode = subtitleSafeZone?.mode ?? 'reframe';
  const safeZoneCropStyle: React.CSSProperties = subtitleSafeZone?.enabled ? {
    ...(safeZoneMode === 'crop'
      ? { clipPath: `inset(0 0 ${subtitleSafeZone.bottomBandPercent}% 0)` }
      : {}),
    transform: `scale(${subtitleSafeZone.zoom}) translateY(${subtitleSafeZone.offsetY}%)`,
    transformOrigin: 'top center',
    width: '100%',
    height: '100%',
  } : {};

  // Vignette style - korrigierte Formel für sichtbaren Effekt
  const vignetteStyle = vignette > 0 ? {
    background: `radial-gradient(ellipse at center, transparent 0%, transparent ${Math.max(0, 50 - vignette * 0.5)}%, rgba(0,0,0,${Math.min(1, vignette / 50)}) 100%)`,
  } : {};

  // If no scenes, render single video with global effects
  if (sortedScenes.length === 0) {
    console.log(`[DirectorsCutVideo] ⚡ NO-SCENES FALLBACK BRANCH | subtitleClips=${subtitleTrack?.clips?.length ?? 0} | textOverlays=${textOverlays.length} | visible=${subtitleTrack?.visible}`);
    // Build filter string for fallback
    let filterStr = `brightness(${brightness / 100}) `;
    filterStr += `contrast(${contrast / 100}) `;
    filterStr += `saturate(${saturation / 100}) `;
    // Temperature - verstärkte Warm/Kalt-Effekte
    if (temperature !== 0) {
      if (temperature > 0) {
        const warmth = temperature / 50;
        filterStr += `sepia(${Math.min(0.5, warmth * 0.3)}) saturate(${1 + warmth * 0.3}) brightness(${1 + warmth * 0.05}) `;
      } else {
        const coldness = Math.abs(temperature) / 50;
        filterStr += `hue-rotate(${temperature * 1.5}deg) saturate(${1 + coldness * 0.2}) brightness(${1 + coldness * 0.02}) `;
      }
    }
    // Sharpness via SVG filter
    if (sharpness > 0) {
      filterStr += `url(#sharpen-filter) `;
    }
    // Apply LUT/Filter - check for SVG filters first
    if (filter && isSVGFilter(filter)) {
      filterStr += SVG_FILTER_IDS[filter] + ' ';
    } else if (filter && FILTER_CSS[filter]) {
      filterStr += FILTER_CSS[filter] + ' ';
    }
    if (styleTransfer?.enabled && styleTransfer.style && STYLE_CSS[styleTransfer.style]) {
      filterStr += STYLE_CSS[styleTransfer.style] + ' ';
    }
    if (colorGrading?.enabled && colorGrading.grade && GRADE_CSS[colorGrading.grade]) {
      filterStr += GRADE_CSS[colorGrading.grade] + ' ';
    }

    return (
      <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
        {/* SVG Filter Definitions */}
        <SVGFilters />
        <SharpnessFilter intensity={sharpness} />
        <div style={{ width: '100%', height: '100%', ...safeZoneCropStyle }}>
          {isValidRemoteMediaUrl(sourceVideoUrl) ? (
            <Video
              src={sourceVideoUrl}
              pauseWhenBuffering={!previewMode}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: filterStr.trim(),
              }}
              volume={0}
            />
          ) : (
            <AbsoluteFill style={{ backgroundColor: '#000' }} />
          )}
        </div>
        {/* VHS Scanlines for retro_vhs filter */}
        {filter === 'retro_vhs' && <VHSScanlines intensity={0.25} />}
        {/* Original Audio - skip in preview mode (native audio handles it) */}
        {!previewMode && !voiceoverUrl && !backgroundMusicUrl && isValidRemoteMediaUrl(sourceVideoUrl) && (
          <Audio src={sourceVideoUrl} volume={masterVolume / 100} startFrom={0} pauseWhenBuffering />
        )}
        {vignette > 0 && <AbsoluteFill style={{ ...vignetteStyle, pointerEvents: 'none', zIndex: 10 }} />}
        {/* Voiceover - skip in preview mode */}
        {!previewMode && voiceoverUrl && frame >= 15 && <Audio src={voiceoverUrl} volume={(voiceoverVolume || 100) / 100} startFrom={0} pauseWhenBuffering />}
        {/* Background Music - skip in preview mode */}
        {!previewMode && backgroundMusicUrl && frame >= 30 && <Audio src={backgroundMusicUrl} volume={effectiveMusicVolume} loop pauseWhenBuffering />}
        {!previewMode && <TimelineAudioTracksRenderer tracks={audioTracks} fps={fps} hasVoiceoverForDucking={!!voiceoverUrl} />}
        {/* Text Overlays */}
        {textOverlays.map((overlay) => {
          const startFrame = safeFrame(overlay.startTime, fps, durationInFrames - 1);
          const endFrame = overlay.endTime != null
            ? safeFrame(overlay.endTime, fps, durationInFrames)
            : durationInFrames;
          const overlayDuration = Math.max(1, endFrame - startFrame);
          return (
            <Sequence key={overlay.id} from={startFrame} durationInFrames={overlayDuration}>
              <TextOverlayRenderer overlay={overlay as TextOverlayProps} />
            </Sequence>
          );
        })}
        {/* Subtitles */}
        {subtitleTrack?.visible !== false && subtitleTrack?.clips?.map((clip) => {
          const startFrame = safeFrame(clip.startTime, fps, durationInFrames - 1);
          const endFrame = safeFrame(clip.endTime, fps, durationInFrames);
          const clipDuration = Math.max(1, endFrame - startFrame);
          return (
            <Sequence key={clip.id} from={startFrame} durationInFrames={clipDuration}>
              <SubtitleClipRenderer clip={clip} />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  }

  // ========== PREVIEW MODE: Single continuous video + CSS overlays ==========
  if (previewMode && sortedScenes.length > 0) {
    // Find current scene based on time
    const currentSceneIndex = sortedScenes.findIndex((scene, idx) => {
      const nextScene = sortedScenes[idx + 1];
      if (!nextScene) return currentTimeSeconds >= scene.startTime;
      return currentTimeSeconds >= scene.startTime && currentTimeSeconds < nextScene.startTime;
    });
    const activeIdx = currentSceneIndex >= 0 ? currentSceneIndex : 0;
    const activeScene = sortedScenes[activeIdx];
    const nextScene = sortedScenes[activeIdx + 1];
    // nextSceneStartFrame no longer needed — single video architecture

    // Get scene-specific effects
    const currentSceneEffect = sceneEffects?.[activeScene.id] || activeScene.effects || null;
    const effectiveBrightness = currentSceneEffect?.brightness ?? brightness;
    const effectiveContrast = currentSceneEffect?.contrast ?? contrast;
    const effectiveSaturation = currentSceneEffect?.saturation ?? saturation;
    const effectiveSharpness = currentSceneEffect?.sharpness ?? sharpness;
    const effectiveTemperature = currentSceneEffect?.temperature ?? temperature;
    const effectiveVignette = currentSceneEffect?.vignette ?? vignette;
    const effectiveFilter = currentSceneEffect?.filter ?? filter;
    // Next scene filter no longer needed — single video, no overlay

    // Build filter string for active scene
    let previewFilter = `brightness(${effectiveBrightness / 100}) `;
    previewFilter += `contrast(${effectiveContrast / 100}) `;
    previewFilter += `saturate(${effectiveSaturation / 100}) `;
    if (effectiveTemperature !== 0) {
      if (effectiveTemperature > 0) {
        const warmth = effectiveTemperature / 50;
        previewFilter += `sepia(${Math.min(0.5, warmth * 0.3)}) saturate(${1 + warmth * 0.3}) `;
      } else {
        const coldness = Math.abs(effectiveTemperature) / 50;
        previewFilter += `hue-rotate(${effectiveTemperature * 1.5}deg) saturate(${1 + coldness * 0.2}) `;
      }
    }
    if (effectiveSharpness > 0) previewFilter += `url(#sharpen-filter) `;
    if (effectiveFilter && isSVGFilter(effectiveFilter)) {
      previewFilter += SVG_FILTER_IDS[effectiveFilter] + ' ';
    } else if (effectiveFilter && FILTER_CSS[effectiveFilter]) {
      previewFilter += FILTER_CSS[effectiveFilter] + ' ';
    }
    if (styleTransfer?.enabled && styleTransfer.style && STYLE_CSS[styleTransfer.style]) {
      previewFilter += STYLE_CSS[styleTransfer.style] + ' ';
    }
    const sceneGrading = sceneColorGrading?.[activeScene.id];
    const effectiveGrading = sceneGrading?.grade
      ? { enabled: true, grade: sceneGrading.grade, intensity: sceneGrading.intensity }
      : colorGrading;
    if (effectiveGrading?.enabled && effectiveGrading.grade && GRADE_CSS[effectiveGrading.grade]) {
      previewFilter += GRADE_CSS[effectiveGrading.grade] + ' ';
    }

    // Use shared resolver for transition timing (same as preview player)
    const resolvedTrans = resolveTransitions(
      sortedScenes.map(s => ({
        id: s.id,
        originalStartTime: s.originalStartTime,
        originalEndTime: s.originalEndTime,
        mediaSourceStart: s.mediaSourceStart,
        mediaSourceEnd: s.mediaSourceEnd,
        startTime: s.startTime,
        endTime: s.endTime,
        playbackRate: s.playbackRate,
      })),
      (transitions || []).map(t => ({
        sceneId: (t as any).sceneId || '',
        sceneIndex: t.sceneIndex,
        transitionType: t.type || 'none',
        type: t.type,
        duration: t.duration || 0.8,
        offsetSeconds: t.offsetSeconds,
      })),
    );
    
    let transitionOverlayOpacity = 0;
    let transitionBlur = 0;
    let transitionTransform = '';
    let transitionClipPath = '';
    let transitionVideoOpacity = 1;

    // Use the original_end_time domain (source time) for matching
    const sourceTime = activeScene.originalStartTime != null
      ? (activeScene.originalStartTime + (currentTimeSeconds - activeScene.startTime) * (activeScene.playbackRate ?? 1))
      : currentTimeSeconds;

    const activeRT = findActiveTransition(sourceTime, resolvedTrans);
    if (activeRT) {
      const { transition: rt, progress } = activeRT;
      const eased = progress; // already eased by resolver
      switch (rt.baseType) {
        case 'fade':
          transitionVideoOpacity = 1 - eased * 0.8;
          transitionOverlayOpacity = eased * 0.6;
          break;
        case 'crossfade':
        case 'dissolve':
          transitionVideoOpacity = 1 - eased * 0.7;
          transitionOverlayOpacity = eased * 0.4;
          break;
        case 'blur':
          transitionBlur = eased * 15;
          transitionVideoOpacity = 1 - eased * 0.3;
          break;
        case 'zoom':
          transitionTransform = `scale(${1 + eased * 0.3})`;
          transitionVideoOpacity = 1 - eased * 0.4;
          break;
        case 'wipe': {
          const dir = rt.direction;
          if (dir === 'left') transitionClipPath = `inset(0 0 0 ${eased * 100}%)`;
          else if (dir === 'right') transitionClipPath = `inset(0 ${eased * 100}% 0 0)`;
          else transitionClipPath = `inset(0 0 0 0)`;
          transitionVideoOpacity = 1;
          transitionOverlayOpacity = eased * 0.15;
          break;
        }
        case 'slide': {
          const dir = rt.direction;
          if (dir === 'left') transitionTransform = `translateX(${-eased * 30}%)`;
          else if (dir === 'right') transitionTransform = `translateX(${eased * 30}%)`;
          else if (dir === 'up') transitionTransform = `translateY(${-eased * 30}%)`;
          else transitionTransform = `translateY(${eased * 30}%)`;
          transitionVideoOpacity = 1 - eased * 0.5;
          break;
        }
        case 'push': {
          const dir = rt.direction;
          if (dir === 'left') transitionTransform = `translateX(${-eased * 100}%)`;
          else if (dir === 'right') transitionTransform = `translateX(${eased * 100}%)`;
          else if (dir === 'up') transitionTransform = `translateY(${-eased * 100}%)`;
          else transitionTransform = `translateY(${eased * 100}%)`;
          break;
        }
        default:
          transitionVideoOpacity = 1 - eased * 0.5;
          transitionOverlayOpacity = eased * 0.3;
          break;
      }
    }

    // Ken Burns for active scene
    let kenBurnsStyle = '';
    const kbKeyframe = kenBurns?.find(k => k.sceneId === activeScene.id || !k.sceneId);
    if (kbKeyframe && kbKeyframe.startZoom !== undefined) {
      const sceneDur = activeScene.endTime - activeScene.startTime;
      const sceneProgress = sceneDur > 0 ? Math.min(1, Math.max(0, (currentTimeSeconds - activeScene.startTime) / sceneDur)) : 0;
      const easedP = applyEasing(sceneProgress, kbKeyframe.easing || 'linear');
      const zoom = (kbKeyframe.startZoom ?? 1) + easedP * ((kbKeyframe.endZoom ?? 1) - (kbKeyframe.startZoom ?? 1));
      const x = (kbKeyframe.startX ?? 0) + easedP * ((kbKeyframe.endX ?? 0) - (kbKeyframe.startX ?? 0));
      const y = (kbKeyframe.startY ?? 0) + easedP * ((kbKeyframe.endY ?? 0) - (kbKeyframe.startY ?? 0));
      kenBurnsStyle = `scale(${zoom}) translate(${x}%, ${y}%)`;
    }

    return (
      <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
        <SVGFilters />
        <SharpnessFilter intensity={effectiveSharpness} />
        {chromaKey?.enabled && chromaKey.backgroundUrl && (
          <AbsoluteFill>
            <img src={chromaKey.backgroundUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </AbsoluteFill>
        )}
        {/* Single continuous video — no decoder switches */}
        <div style={{ width: '100%', height: '100%', ...safeZoneCropStyle }}>
          {isValidRemoteMediaUrl(sourceVideoUrl) ? (
          <Video
            src={sourceVideoUrl}
            startFrom={0}
            pauseWhenBuffering={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: transitionVideoOpacity,
              filter: `${previewFilter.trim()}${transitionBlur > 0 ? ` blur(${transitionBlur}px)` : ''}`,
              transform: [kenBurnsStyle, transitionTransform].filter(Boolean).join(' ') || undefined,
              clipPath: transitionClipPath || undefined,
              transformOrigin: 'center center',
            }}
            volume={0}
          />
          ) : (
            <AbsoluteFill style={{ backgroundColor: '#000' }} />
          )}
        </div>
        {/* No second Video element — all transitions are CSS-only on the base video */}
        {/* Darkening overlay for fade transitions */}
        {transitionOverlayOpacity > 0 && (
          <AbsoluteFill style={{
            backgroundColor: `rgba(0,0,0,${transitionOverlayOpacity})`,
            pointerEvents: 'none',
            zIndex: 5,
          }} />
        )}
        {/* VHS Scanlines */}
        {effectiveFilter === 'retro_vhs' && <VHSScanlines intensity={0.25} />}
        {/* Vignette */}
        {effectiveVignette > 0 && (
          <AbsoluteFill style={{
            background: `radial-gradient(ellipse at center, transparent 0%, transparent ${Math.max(0, 50 - effectiveVignette * 0.5)}%, rgba(0,0,0,${Math.min(1, effectiveVignette / 50)}) 100%)`,
            pointerEvents: 'none',
            zIndex: 10,
          }} />
        )}
        {/* Text Overlays */}
        {textOverlays.map((overlay) => {
          const startFrame = safeFrame(overlay.startTime, fps, durationInFrames - 1);
          const endFrame = overlay.endTime != null
            ? safeFrame(overlay.endTime, fps, durationInFrames)
            : durationInFrames;
          const overlayDuration = Math.max(1, endFrame - startFrame);
          return (
            <Sequence key={overlay.id} from={startFrame} durationInFrames={overlayDuration}>
              <TextOverlayRenderer overlay={overlay as TextOverlayProps} />
            </Sequence>
          );
        })}
        {/* Subtitles */}
        {subtitleTrack?.visible !== false && subtitleTrack?.clips?.map((clip) => {
          const startFrame = safeFrame(clip.startTime, fps, durationInFrames - 1);
          const endFrame = safeFrame(clip.endTime, fps, durationInFrames);
          const clipDuration = Math.max(1, endFrame - startFrame);
          return (
            <Sequence key={clip.id} from={startFrame} durationInFrames={clipDuration}>
              <SubtitleClipRenderer clip={clip} />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  }

  // ========== RENDER MODE: TransitionSeries with per-scene Video for frame-perfect output ==========
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* SVG Filter Definitions for all creative filters */}
      <SVGFilters />
      
      {/* SVG Sharpness Filter */}
      <SharpnessFilter intensity={sharpness} />
      
      {/* Chroma Key Background */}
      {chromaKey?.enabled && chromaKey.backgroundUrl && (
        <AbsoluteFill>
          <img
            src={chromaKey.backgroundUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </AbsoluteFill>
      )}

      {/* SCENES — absolute timeline render, so cuts stay exactly where the user placed them */}
      {sortedScenes.map((scene, idx) => {
        const sceneStartFrame = Math.floor(scene.startTime * fps);
        const sceneEndFrame = Math.floor(scene.endTime * fps);
        const sceneDurationFrames = Math.max(1, sceneEndFrame - sceneStartFrame);

        return (
          <Sequence key={scene.id} from={sceneStartFrame} durationInFrames={sceneDurationFrames}>
            <AbsoluteFill style={{ overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', ...safeZoneCropStyle }}>
                <SceneVideo
                  sourceVideoUrl={sourceVideoUrl}
                  scene={scene}
                  sceneIndex={idx}
                  totalScenes={sortedScenes.length}
                  brightness={brightness}
                  contrast={contrast}
                  saturation={saturation}
                  sharpness={sharpness}
                  temperature={temperature}
                  vignette={vignette}
                  globalFilter={filter}
                  styleTransfer={styleTransfer}
                  colorGrading={colorGrading}
                  sceneColorGrading={sceneColorGrading}
                  sceneEffects={sceneEffects}
                  transitions={[]}
                  chromaKey={chromaKey}
                  kenBurns={kenBurns}
                  sceneDurationFrames={sceneDurationFrames}
                  previewMode={false}
                />
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Transitions start at the cut and overlay the held outgoing frame over the incoming scene */}
      {resolvedRenderTransitions.map(renderTransitionLayer)}
      {/* AUDIO - Skip all Remotion audio in preview mode (native audio handles it) */}
      {!previewMode && !voiceoverUrl && !backgroundMusicUrl && (
        <Audio
          src={sourceVideoUrl}
          volume={masterVolume / 100}
          startFrom={0}
          pauseWhenBuffering
        />
      )}

      {/* Vignette Overlay */}
      {vignette > 0 && (
        <AbsoluteFill style={{ ...vignetteStyle, pointerEvents: 'none', zIndex: 10 }} />
      )}

      {/* Voiceover Audio */}
      {!previewMode && voiceoverUrl && frame >= 15 && (
        <Audio
          src={voiceoverUrl}
          volume={(voiceoverVolume || 100) / 100}
          startFrom={0}
          pauseWhenBuffering
        />
      )}

      {/* Background Music */}
      {!previewMode && backgroundMusicUrl && frame >= 30 && (
        <Audio
          src={backgroundMusicUrl}
          volume={effectiveMusicVolume}
          loop
          pauseWhenBuffering
        />
      )}

      {/* Timeline audio tracks (SFX + extra clips) — audit C1 */}
      {!previewMode && (
        <TimelineAudioTracksRenderer
          tracks={audioTracks}
          fps={fps}
          hasVoiceoverForDucking={!!voiceoverUrl}
        />
      )}



      {/* Sound Design Audio */}
      {!previewMode && soundDesign?.enabled && soundDesign.ambientUrl && (
        <Audio
          src={soundDesign.ambientUrl}
          volume={(soundDesign.ambientVolume || 50) / 100}
          loop
          pauseWhenBuffering
        />
      )}

      {!previewMode && soundDesign?.enabled && soundDesign.sfxTracks?.map((sfx, idx) => {
        if (!isValidRemoteMediaUrl(sfx.url)) return null;
        return (
          <Sequence key={`sfx-${idx}`} from={safeFrame(sfx.startTime, fps, durationInFrames - 1)}>
            <Audio
              src={sfx.url}
              volume={(Number(sfx.volume) || 0) / 100}
              pauseWhenBuffering
            />
          </Sequence>
        );
      })}

      {/* Text Overlays */}
      {textOverlays.map((overlay) => {
        const startFrame = safeFrame(overlay.startTime, fps, durationInFrames - 1);
        const endFrame = overlay.endTime != null
          ? safeFrame(overlay.endTime, fps, durationInFrames)
          : durationInFrames;
        const overlayDuration = Math.max(1, endFrame - startFrame);

        return (
          <Sequence
            key={overlay.id}
            from={startFrame}
            durationInFrames={overlayDuration}
          >
            <TextOverlayRenderer overlay={overlay as TextOverlayProps} />
          </Sequence>
        );
      })}

      {/* Subtitles */}
      {subtitleTrack?.visible !== false && subtitleTrack?.clips?.map((clip) => {
        const startFrame = safeFrame(clip.startTime, fps, durationInFrames - 1);
        const endFrame = safeFrame(clip.endTime, fps, durationInFrames);
        const clipDuration = Math.max(1, endFrame - startFrame);
        return (
          <Sequence key={clip.id} from={startFrame} durationInFrames={clipDuration}>
            <SubtitleClipRenderer clip={clip} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
