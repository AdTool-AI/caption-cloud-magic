import { tx } from "@/lib/i18nText";
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { saveDraft, loadDraft, clearDraft, consumeReloadReset, installReloadFlag, SubtitleSafeZone, DEFAULT_SUBTITLE_SAFE_ZONE } from '@/lib/directors-cut-draft';
import { extractTimestampedFrames, extractRefinementFrames, detectBoundariesAsync, type TimestampedFrame, type DetectedBoundary } from '@/lib/directors-cut-scene-detection';
import { probeMediaDuration } from '@/lib/probeMp4Duration';

import { useTranslation } from '@/hooks/useTranslation';
import { CapCutEditor } from '@/components/directors-cut/studio';
import { UDCWelcomeDialog } from '@/components/directors-cut/UDCWelcomeDialog';
import { VideoImportDialog } from '@/components/directors-cut/studio/VideoImportDialog';
import { AICoPilot } from '@/components/directors-cut/ui/AICoPilot';
import { useAICoPilot } from '@/hooks/useAICoPilot';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { KenBurnsKeyframe } from '@/components/directors-cut/features/KenBurnsEffect';
import type { 
  SelectedVideo, 
  SceneAnalysis, 
  AppliedEffects, 
  AudioEnhancements,
  ExportSettings,
  GlobalEffects,
  SceneEffects,
  TransitionAssignment,
  TextOverlay
} from '@/types/directors-cut';

export function DirectorsCut() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [user, setUser] = useState<any>(null);
  
  const [projectId, setProjectId] = useState<string | null>(null);
  
  // Step 1: Video Import
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  
  // Scene Analysis
  const [scenes, setScenes] = useState<SceneAnalysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transitions, setTransitions] = useState<TransitionAssignment[]>([]);
  // AI-detected cut markers — propagated into the studio so scene-add / snapping
  // can use them as the canonical anchor grid.
  const [aiCutMarkers, setAiCutMarkers] = useState<Array<{ time: number; confidence?: number; source?: 'auto' | 'manual' }>>([]);

  useEffect(() => {
    if (scenes.length > 1 && transitions.length === 0) {
      const defaultTransitions: TransitionAssignment[] = scenes
        .slice(0, -1)
        .map((scene) => ({
          sceneId: scene.id,
          transitionType: 'none',
          duration: 0.5,
          aiSuggested: false,
        }));
      setTransitions(defaultTransitions);
      return;
    }
    // Prune orphan transitions whose sceneId no longer exists (M5).
    if (transitions.length > 0) {
      const sceneIds = new Set(scenes.map((s) => s.id));
      const pruned = transitions.filter((t) => sceneIds.has(t.sceneId));
      if (pruned.length !== transitions.length) {
        setTransitions(pruned);
      }
    }
  }, [scenes, transitions]);
  
  // Visual Effects
  const [appliedEffects, setAppliedEffects] = useState<AppliedEffects>({
    global: {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      sharpness: 0,
      temperature: 0,
      vignette: 0,
    },
    scenes: {},
  });
  
  // Audio
  const [audioEnhancements, setAudioEnhancements] = useState<AudioEnhancements>({
    master_volume: 100,
    noise_reduction: false,
    noise_reduction_level: 50,
    auto_ducking: false,
    ducking_level: 30,
    voice_enhancement: false,
    added_sounds: [],
  });
  
  const [voiceOverUrl, setVoiceOverUrl] = useState<string | undefined>(undefined);
  
  // Export
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    quality: 'hd',
    format: 'mp4',
    fps: 30,
    aspect_ratio: '16:9',
  });
  
  // Premium feature states
  const [styleTransfer, setStyleTransfer] = useState({
    enabled: false,
    style: null as string | null,
    intensity: 0.8,
  });
  const [colorGrading, setColorGrading] = useState({
    enabled: false,
    grade: null as string | null,
    intensity: 0.7,
  });
  const [sceneColorGrading, setSceneColorGrading] = useState<Record<string, { grade?: string | null; intensity?: number }>>({});
  const [speedKeyframes, setSpeedKeyframes] = useState<Array<{ id: string; time: number; speed: number; sceneId?: string; easing?: string }>>([]);
  const [kenBurnsKeyframes, setKenBurnsKeyframes] = useState<KenBurnsKeyframe[]>([]);
  const [chromaKey, setChromaKey] = useState({
    enabled: false,
    color: '#00ff00',
    tolerance: 30,
    backgroundUrl: undefined as string | undefined,
  });
  const [upscaling, setUpscaling] = useState({
    enabled: false,
    targetResolution: '4k',
  });
  const [interpolation, setInterpolation] = useState({
    enabled: false,
    targetFps: 60,
  });
  const [restoration, setRestoration] = useState({
    enabled: false,
    level: 'standard',
  });
  const [objectRemoval, setObjectRemoval] = useState({
    enabled: false,
    objectsCount: 0,
  });
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);

  // CapCut Editor propagated state
  const [capCutAudioTracks, setCapCutAudioTracks] = useState<any[]>([]);
  const [capCutSubtitleTrack, setCapCutSubtitleTrack] = useState<any | undefined>(undefined);
  const [backgroundMusicUrl, setBackgroundMusicUrl] = useState<string | undefined>(undefined);
  const [subtitleSafeZone, setSubtitleSafeZone] = useState<SubtitleSafeZone>(DEFAULT_SUBTITLE_SAFE_ZONE);
  const [cleanedVideoUrl, setCleanedVideoUrl] = useState<string | undefined>(undefined);
  const handleCleanedVideoUrlChange = useCallback((url: string | null) => {
    setCleanedVideoUrl(url || undefined);
  }, []);

  // Composer handoff fingerprint — declared early so the draft snapshot can include it.
  const [composerSourceProjectId, setComposerSourceProjectId] = useState<string | null>(null);
  const [composerRenderId, setComposerRenderId] = useState<string | null>(null);

  // --- On mount: real F5 reload → reset; SPA navigation → restore draft ---
  const draftLoadedRef = useRef(false);

  useEffect(() => {
    // Install beforeunload flag so we know if the *next* load is a reload
    const removeFlag = installReloadFlag();

    // Composer-Handoff hat Vorrang: ein alter Draft (z.B. von einem
    // vorherigen Auto-Cut auf einem anderen Video) darf den Import nicht
    // verdecken. In diesem Fall Draft komplett verwerfen.
    const isComposerHandoff =
      searchParams.get('source') === 'composer' && !!searchParams.get('project_id');

    if (!draftLoadedRef.current) {
      draftLoadedRef.current = true;

      if (consumeReloadReset() || isComposerHandoff) {
        // Reload während DC offen war ODER frischer Composer-Handoff
        clearDraft();
      } else {
        // SPA navigation back → restore previous session, but ONLY if the draft
        // belongs to the same video. Otherwise we'd paste old scenes (e.g.
        // "Drohnenflug…") on top of an unrelated freshly-imported video.
        const draft = loadDraft();
        const incomingSourceVideoUrl = searchParams.get('source_video');
        const incomingSourceProjectId = searchParams.get('project_id');
        const incomingRenderId = searchParams.get('render_id');
        const draftMatches =
          !!draft &&
          !!draft.selectedVideo &&
          (
            // No incoming params at all → trust the draft
            (!incomingSourceVideoUrl && !incomingSourceProjectId && !incomingRenderId) ||
            (incomingRenderId && (draft as any).composerRenderId === incomingRenderId) ||
            (incomingSourceVideoUrl && draft.selectedVideo.url === incomingSourceVideoUrl) ||
            (incomingSourceProjectId && draft.selectedVideo.id === incomingSourceProjectId)
          );

        if (draftMatches && draft) {
          setSelectedVideo(draft.selectedVideo);
          setScenes(draft.scenes || []);
          setTransitions(draft.transitions || []);
          setAppliedEffects(draft.appliedEffects || appliedEffects);
          setAudioEnhancements(draft.audioEnhancements || audioEnhancements);
          setExportSettings(draft.exportSettings || exportSettings);
          setStyleTransfer(draft.styleTransfer || styleTransfer);
          setColorGrading(draft.colorGrading || colorGrading);
          setSceneColorGrading(draft.sceneColorGrading || {});
          setSpeedKeyframes(draft.speedKeyframes || []);
          setKenBurnsKeyframes(draft.kenBurnsKeyframes || []);
          setChromaKey(draft.chromaKey || chromaKey);
          setUpscaling(draft.upscaling || upscaling);
          setInterpolation(draft.interpolation || interpolation);
          setRestoration(draft.restoration || restoration);
          setObjectRemoval(draft.objectRemoval || objectRemoval);
          setTextOverlays(draft.textOverlays || []);
          setVoiceOverUrl(draft.voiceOverUrl);
          setBackgroundMusicUrl(draft.backgroundMusicUrl);
          setCapCutAudioTracks(draft.capCutAudioTracks || []);
          setCapCutSubtitleTrack(draft.capCutSubtitleTrack);
          setSubtitleSafeZone(draft.subtitleSafeZone || DEFAULT_SUBTITLE_SAFE_ZONE);
          setCleanedVideoUrl(draft.cleanedVideoUrl);
        } else if (draft) {
          // Mismatch → drop the stale draft so we don't show wrong scenes.
          console.info('[DirectorsCut] Discarding stale draft (different source video)');
          clearDraft();
        }
      }
    }

    return removeFlag;
  }, []);

  // --- Auto-save draft on state changes (debounced) + flush on unmount ---
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSnapshotRef = useRef<Parameters<typeof saveDraft>[0] | null>(null);

  // Autosave status (Welle 3 · M3) — exposed to the editor as a small badge.
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autosaveLastSavedAt, setAutosaveLastSavedAt] = useState<number | null>(null);
  const savedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSave = useCallback((snapshot: Parameters<typeof saveDraft>[0]) => {
    setAutosaveStatus('saving');
    try {
      saveDraft(snapshot);
      setAutosaveStatus('saved');
      setAutosaveLastSavedAt(Date.now());
      if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current);
      // Fade the "Saved" chip back to "idle" after a short beat so it doesn't shout.
      savedResetTimerRef.current = setTimeout(() => setAutosaveStatus('idle'), 2500);
    } catch (err) {
      console.warn('[DirectorsCut] autosave failed', err);
      setAutosaveStatus('error');
    }
  }, []);

  // Keep a ref to the latest snapshot so we can flush it synchronously on unmount
  const currentSnapshot = useMemo(() => ({
    currentStep: selectedVideo ? 10 : 1,
    selectedVideo,
    scenes,
    transitions,
    appliedEffects,
    audioEnhancements,
    exportSettings,
    styleTransfer,
    colorGrading,
    sceneColorGrading,
    speedKeyframes,
    kenBurnsKeyframes,
    chromaKey,
    upscaling,
    interpolation,
    restoration,
    objectRemoval,
    textOverlays,
    voiceOverUrl,
    backgroundMusicUrl,
    capCutAudioTracks,
    capCutSubtitleTrack,
    subtitleSafeZone,
    cleanedVideoUrl,
    composerProjectId: composerSourceProjectId,
    composerRenderId,
  }), [selectedVideo, scenes, transitions, appliedEffects, audioEnhancements, exportSettings, styleTransfer, colorGrading, sceneColorGrading, speedKeyframes, kenBurnsKeyframes, chromaKey, upscaling, interpolation, restoration, objectRemoval, textOverlays, voiceOverUrl, backgroundMusicUrl, capCutAudioTracks, capCutSubtitleTrack, subtitleSafeZone, cleanedVideoUrl, composerSourceProjectId, composerRenderId]);

  latestSnapshotRef.current = currentSnapshot;

  useEffect(() => {
    if (!draftLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Signal "pending" immediately so the badge feels responsive.
    setAutosaveStatus((s) => (s === 'error' ? s : 'saving'));
    saveTimerRef.current = setTimeout(() => {
      runSave(currentSnapshot);
    }, 500);
    return () => {
      // On unmount (navigating away): flush the latest state immediately
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (latestSnapshotRef.current) {
        try {
          saveDraft(latestSnapshotRef.current);
        } catch { /* ignore on unmount */ }
      }
    };
  }, [currentSnapshot, runSave]);

  useEffect(() => () => {
    if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current);
  }, []);

  // Original (source) video duration — never changes based on scene edits.
  // Used to decide whether a new/empty scene should pass-through the source
  // or render as a true blackscreen placeholder beyond the source.
  const originalVideoDuration = useMemo(() => {
    return selectedVideo?.duration || 0;
  }, [selectedVideo?.duration]);

  // Timeline (composite) duration — source duration is kept separately above.
  // Once scenes exist, the timeline duration must be the edited EDL length;
  // otherwise trims/deletes still preview/export the full original video.
  const actualTotalDuration = useMemo(() => {
    const base = originalVideoDuration || 30;
    if (scenes.length === 0) return base;
    return Math.max(0.1, ...scenes.map(s => s.end_time));
  }, [scenes, originalVideoDuration]);

  // AI Co-Pilot command handler
  const handleCoPilotCommand = useCallback((command: string, params?: Record<string, any>) => {
    // Composer-Render: Szenen kommen deterministisch aus der Render-Geometrie.
    // Ein KI-Auto-Cut darüber würde die korrekten Szenen mit halluzinierten
    // Beschreibungen überschreiben — daher hart blockieren.
    if (composerSourceProjectId && (command === 'auto_cut' || command === 'analyze_scenes')) {
      toast.info(tx({ de: 'Composer-Render: Szenen sind aus den Render-Metadaten gesperrt.', en: 'Composer render: scenes are locked from the render metadata.', es: 'Renderizado de Composer: las escenas están bloqueadas desde los metadatos de renderizado.' }));
      return;
    }
    switch (command) {
      case 'apply_style':
        if (params?.style) {
          setStyleTransfer({ enabled: true, style: params.style, intensity: 0.8 });
          toast.success(t('dc.styleApplied', { style: params.style }));
        }
        break;
      case 'apply_color':
        if (params?.preset) {
          setColorGrading({ enabled: true, grade: params.preset, intensity: 0.7 });
          toast.success(t('dc.colorCorrectionApplied', { preset: params.preset }));
        }
        break;
      case 'adjust_volume':
        if (params?.change) {
          setAudioEnhancements(prev => ({
            ...prev,
            master_volume: Math.max(0, Math.min(200, prev.master_volume + params.change * 100)),
          }));
        }
        break;
      case 'noise_reduction':
        setAudioEnhancements(prev => ({ ...prev, noise_reduction: true }));
        toast.success(t('dc.noiseReductionActivated'));
        break;
      case 'export':
        if (params?.quality === '4k') {
          setExportSettings(prev => ({ ...prev, quality: '4k' }));
        }
        break;
    }
  }, [composerSourceProjectId, t]);

  // AI Co-Pilot
  const coPilot = useAICoPilot({
    context: {
      currentStep: selectedVideo ? 10 : 1,
      scenesCount: scenes.length,
      hasTransitions: transitions.length > 0,
      hasEffects: styleTransfer.enabled || colorGrading.enabled,
      videoDuration: selectedVideo?.duration || 0,
      videoUrl: selectedVideo?.url,
    },
    onCommand: handleCoPilotCommand,
  });

  // (composerSourceProjectId / composerRenderId declared earlier so the draft snapshot can use them)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        navigate('/auth');
        return;
      }
      setUser(authUser);
    };
    checkAuth();
    
    const sourceVideoUrl = searchParams.get('source_video');
    const sourceProjectId = searchParams.get('project_id');
    const sourceFlag = searchParams.get('source');
    const sourceRenderId = searchParams.get('render_id');
    
    if (sourceVideoUrl) {
      setSelectedVideo({
        id: sourceProjectId || undefined,
        url: sourceVideoUrl,
        name: t('dc.importedVideo'),
        source: 'universal_creator',
      });
      if (sourceFlag === 'composer' && sourceProjectId) {
        setComposerSourceProjectId(sourceProjectId);
        setComposerRenderId(sourceRenderId);
      }
    } else {
      // ── Stock Video Handoff (Phase 6.3) ──
      let raw: string | null = null;
      try { raw = sessionStorage.getItem('directors-cut:incoming-stock-video'); } catch { /* noop */ }
      if (raw) {
        try { sessionStorage.removeItem('directors-cut:incoming-stock-video'); } catch { /* noop */ }
        try {
          const p = JSON.parse(raw);
          setSelectedVideo({
            id: p.external_id ? `stock_${p.provider}_${p.external_id}` : undefined,
            url: p.url,
            name: p.title || t('dc.importedVideo'),
            source: 'stock_library' as any,
          } as any);
        } catch (err) {
          console.warn('[DirectorsCut] stock handoff parse failed', err);
        }
      }
    }
  }, [searchParams, navigate]);

  // ── Composer Handoff: deterministic scene import via EDL ──
  // Primary source of truth: video_renders.content_config.editDecisionList
  // (frame-accurate Edit Decision List written by compose-video-assemble).
  // Fallback 1: legacy sceneGeometry. Fallback 2: composer_scenes durations.
  // Director's Cut NEVER re-detects scenes from the stitched MP4 for
  // composer renders — that's what was producing wrong "shot detection"
  // results inside individual AI clips.
  const [composerLock, setComposerLock] = useState<{
    active: boolean;
    sceneCount: number;
    source: 'edl' | 'edl-rebuilt' | 'sceneGeometry-fallback' | 'composer-scenes-fallback' | null;
    calibratedToMp4?: boolean;
    realMp4Duration?: number;
  }>({ active: false, sceneCount: 0, source: null });

  useEffect(() => {
    if (!composerSourceProjectId || !selectedVideo) return;

    let cancelled = false;
    (async () => {
      try {
        const {
          importComposerRenderEDL,
          importComposerRenderGeometry,
          rebuildEDLFromComposerScenes,
        } = await import('@/lib/directors-cut/composer-edl');
        const { probeMediaDuration } = await import('@/lib/probeMp4Duration');

        // 1. Load the authoritative render row.
        // Strategy: prefer the row that ACTUALLY has an editDecisionList. If
        // composerRenderId is set but that row has no EDL (older render),
        // fall back to the newest composer render for the project that does.
        const hasEDL = (row: any) => {
          const cfg = row?.content_config;
          return !!cfg && Array.isArray(cfg.editDecisionList) && cfg.editDecisionList.length > 0;
        };
        const hasGeometry = (row: any) => {
          const cfg = row?.content_config;
          return !!cfg && Array.isArray(cfg.sceneGeometry) && cfg.sceneGeometry.length > 0;
        };

        let renderRow: any = null;
        if (composerRenderId) {
          const { data } = await supabase
            .from('video_renders')
            .select('render_id, video_url, content_config, format_config')
            .eq('render_id', composerRenderId)
            .maybeSingle();
          renderRow = data;
        }
        // Always also fetch the newest composer render so we can prefer one with EDL.
        const { data: latestRow } = await supabase
          .from('video_renders')
          .select('render_id, video_url, content_config, format_config')
          .eq('project_id', composerSourceProjectId)
          .eq('source', 'composer')
          .order('created_at', { ascending: false })
          .limit(5);
        const candidates: any[] = [renderRow, ...((latestRow as any[]) || [])].filter(Boolean);
        // Prefer EDL > geometry > anything > nothing
        const best =
          candidates.find(hasEDL) ||
          candidates.find(hasGeometry) ||
          candidates[0] ||
          null;
        renderRow = best;

        const cfg: any = renderRow?.content_config || {};
        const edl: any[] = Array.isArray(cfg.editDecisionList) ? cfg.editDecisionList : [];
        const rawGeometry: any[] = Array.isArray(cfg.sceneGeometry) ? cfg.sceneGeometry : [];
        const fps = Number(cfg.fps) || 30;
        const crossfadeFrames = Number(cfg.crossfadeFrames) || 15;

        // 2. Pull labels from composer_scenes (best-effort).
        const { data: composerScenes } = await supabase
          .from('composer_scenes')
          .select('order_index, scene_type, ai_prompt, stock_keywords, text_overlay, duration_seconds')
          .eq('project_id', composerSourceProjectId)
          .order('order_index', { ascending: true });

        if (cancelled) return;

        // 3. Probe REAL mp4 duration for calibration (used by rebuild fallback).
        let realMp4Duration: number | null = null;
        try {
          if (selectedVideo?.url) {
            realMp4Duration = await probeMediaDuration(selectedVideo.url, 6000);
          }
        } catch (e) {
          console.info('[DirectorsCut] MP4 duration probe failed (non-fatal):', e);
        }
        if (cancelled) return;

        let result: ReturnType<typeof importComposerRenderEDL> | null = null;
        if (edl.length > 0) {
          result = importComposerRenderEDL(edl as any, composerScenes as any);
        } else if (rawGeometry.length > 0) {
          result = importComposerRenderGeometry(rawGeometry, composerScenes as any, crossfadeFrames, fps);
        } else if (composerScenes && composerScenes.length > 0) {
          // Frame-accurate rebuild from composer_scenes durations + crossfade
          // math, optionally calibrated to the real MP4 duration.
          result = rebuildEDLFromComposerScenes(composerScenes as any, {
            fps,
            crossfadeFrames,
            realMp4Duration,
          });
        }

        if (!result || result.scenes.length === 0) {
          toast.error(tx({ de: 'Render-Metadaten nicht gefunden – bitte das Video erneut aus dem Motion Studio öffnen.', en: 'Render metadata not found – please reopen the video from Motion Studio.', es: 'No se encontraron los metadatos de renderizado – vuelve a abrir el video desde Motion Studio.' }));
          return;
        }

        if (!cancelled) {
          console.info('[DirectorsCut] Composer EDL import:', {
            projectId: composerSourceProjectId,
            renderId: renderRow?.render_id,
            renderHasEDL: edl.length > 0,
            renderHasGeometry: rawGeometry.length > 0,
            realMp4Duration,
            source: result.source,
            scenesCount: result.scenes.length,
            cutPoints: result.cutPoints,
            totalDuration: result.totalDuration,
            calibratedToMp4: (result as any).calibratedToMp4,
          });
          setScenes(result.scenes as any);
          setAiCutMarkers(result.cutPoints.map(t => ({ time: t, confidence: 1, source: 'auto' as const })));
          setSelectedVideo(prev =>
            prev ? { ...prev, duration: result!.totalDuration || prev.duration } : prev
          );
          setComposerLock({
            active: true,
            sceneCount: result.scenes.length,
            source: result.source,
            calibratedToMp4: (result as any).calibratedToMp4,
            realMp4Duration: (result as any).realMp4Duration,
          });
          if (result.source === 'edl') {
            toast.success(tx({ de: `${result.scenes.length} Composer-Szenen frame-genau importiert`, en: `${result.scenes.length} Composer scenes imported frame-accurate`, es: `${result.scenes.length} Escenas del compositor importadas con precisión de fotograma` }));
          } else if (result.source === 'edl-rebuilt') {
            const calNote = (result as any).calibratedToMp4
              ? tx({ de: ` · auf ${realMp4Duration?.toFixed(1)}s kalibriert`, en: `· calibrated to ${realMp4Duration?.toFixed(1)}s`, es: `· calibrado a ${realMp4Duration?.toFixed(1)}s` })
              : '';
            toast.success(tx({ de: `${result.scenes.length} Szenen rekonstruiert${calNote}`, en: `${result.scenes.length} scenes reconstructed${calNote}`, es: `${result.scenes.length} escenas reconstruidas${calNote}` }));
          } else if (result.source === 'sceneGeometry-fallback') {
            toast.success(tx({ de: `${result.scenes.length} Composer-Szenen importiert (Geometrie-Fallback)`, en: `${result.scenes.length} Composer scenes imported (geometry fallback)`, es: `${result.scenes.length} Escenas de Composer importadas (retroceso de geometría)` }));
          } else {
            toast.warning(
              tx({ de: `${result.scenes.length} Composer-Szenen importiert (Dauern-Fallback). Für frame-genaue Übergänge bitte neu rendern.`, en: `${result.scenes.length} Composer scenes imported (duration fallback). For frame-accurate transitions, please re-render.`, es: `${result.scenes.length} escenas de Composer importadas (duración de reserva). Para transiciones precisas por fotograma, por favor, vuelve a renderizar.` })
            );
          }
        }
      } catch (err) {
        console.warn('[DirectorsCut] Composer scene import failed:', err);
        if (!cancelled) {
          toast.error(tx({ de: 'Composer-Szenen konnten nicht importiert werden – bitte erneut aus dem Motion Studio öffnen.', en: 'Composer scenes could not be imported – please reopen from Motion Studio.', es: 'No se pudieron importar las escenas de Composer – vuelve a abrir desde Motion Studio.' }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [composerSourceProjectId, composerRenderId, selectedVideo?.url]);


  const saveProject = async () => {
    if (!user || !selectedVideo) return null;
    
    try {
      if (projectId) {
        const { error } = await supabase
          .from('director_cut_projects')
          .update({
            source_video_url: selectedVideo.url,
            source_video_id: selectedVideo.id || null,
            duration_seconds: selectedVideo.duration || null,
            scene_analysis: scenes as any,
            applied_effects: appliedEffects as any,
            audio_enhancements: audioEnhancements as any,
            export_settings: exportSettings as any,
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId);
          
        if (error) throw error;
        return projectId;
      } else {
        const { data, error } = await supabase
          .from('director_cut_projects')
          .insert({
            user_id: user.id,
            source_video_url: selectedVideo.url,
            source_video_id: selectedVideo.id || null,
            duration_seconds: selectedVideo.duration || null,
            project_name: selectedVideo.name || t('dc.untitledProject'),
          })
          .select('id')
          .single();
          
        if (error) throw error;
        setProjectId(data.id);
        return data.id;
      }
    } catch (error) {
      console.error('Error saving project:', error);
      toast.error(t('dc.errorSavingProject'));
      return null;
    }
  };

  // Measure real video duration from URL
  const measureVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const dur = video.duration;
        video.src = '';
        resolve(isFinite(dur) && dur > 0 ? dur : 0);
      };
      video.onerror = () => {
        video.src = '';
        resolve(0);
      };
      video.src = url;
    });
  };

  const lastEdlBackupRef = useRef<{ scenes: any[]; markers: any[] } | null>(null);

  const handleStartAnalysis = async () => {
    if (!selectedVideo) return;
    // Hard lock: never run shot detection on a Composer render — the EDL is
    // already the authoritative scene list.
    if (composerLock.active || composerSourceProjectId) {
      toast.info(tx({ de: 'Composer-Render: Szenen sind aus der EDL gesperrt.', en: 'Composer render: scenes are locked from the EDL.', es: 'Renderizado de Composer: las escenas están bloqueadas desde el EDL.' }));
      return;
    }

    // Soft lock: scenes look like they came from a precise EDL (non-round end times).
    const looksLikeEdl =
      scenes.length >= 3 &&
      scenes.every((s: any) => {
        if (s?.source === 'seed') return false;
        const e = Number(s.end_time ?? 0);
        return e > 0 && Math.abs(e * 100 - Math.round(e * 100)) < 0.001 && (e * 100) % 50 !== 0;
      });
    if (looksLikeEdl) {
      const ok = window.confirm(
        tx({ de: 'Dieses Video hat bereits frame-genaue Szenen. Auto-Cut würde sie überschreiben. Trotzdem fortfahren?', en: 'This video already has frame-accurate scenes. Auto-Cut would overwrite them. Continue anyway?', es: 'Este vídeo ya tiene escenas precisas por fotograma. Auto-Cut las sobrescribiría. ¿Continuar de todos modos?' })
      );
      if (!ok) return;
      lastEdlBackupRef.current = {
        scenes: JSON.parse(JSON.stringify(scenes)),
        markers: JSON.parse(JSON.stringify(aiCutMarkers)),
      };
      toast(tx({ de: 'Szenen werden überschrieben', en: 'Scenes will be overwritten', es: 'Las escenas serán sobrescritas' }), {
        action: {
          label: tx({ de: "Rückgängig", en: "Undo", es: "Deshacer" }),
          onClick: () => {
            const b = lastEdlBackupRef.current;
            if (b) {
              setScenes(b.scenes);
              setAiCutMarkers(b.markers);
              toast.success(tx({ de: "Szenen wiederhergestellt", en: "Scenes restored", es: "Escenas restauradas" }));
            }
          },
        },
        duration: 15000,
      });
    }


    setIsAnalyzing(true);
    
    try {
      toast.info(t('dc.extractingFrames'));
      
      let canonicalDuration = selectedVideo.duration || 0;
      if (!canonicalDuration) {
        const measured = await measureVideoDuration(selectedVideo.url);
        if (measured > 0) {
          canonicalDuration = measured;
          setSelectedVideo(prev => prev ? { ...prev, duration: measured } : prev);
        } else {
          canonicalDuration = 30;
        }
      }
      
      let timestampedFrames: TimestampedFrame[] = [];
      let detectedBoundaries: DetectedBoundary[] = [];
      let pysceneSucceeded = false;

      // Diagnostic counters (Artlist-style transparency)
      const diag = {
        adaptiveCuts: 0,
        contentCuts: 0,
        pixelCuts: 0,
        fusedCuts: 0,
        sources: [] as string[],
      };

      // Helper: probe scene-clip URLs and return cumulative cut timestamps
      const clipsToBoundaries = async (sceneUrls: string[]): Promise<number[]> => {
        if (!sceneUrls || sceneUrls.length < 2) return [];
        const durations: number[] = [];
        for (const url of sceneUrls) {
          try {
            const d = await probeMediaDuration(url, 10000);
            durations.push(d);
          } catch {
            durations.push(0);
          }
        }
        const cuts: number[] = [];
        let acc = 0;
        let probeFailed = false;
        for (let i = 0; i < durations.length - 1; i++) {
          if (durations[i] <= 0) { probeFailed = true; break; }
          acc += durations[i];
          if (acc > 0.05 && acc < canonicalDuration - 0.05) {
            cuts.push(Math.round(acc * 100) / 100);
          }
        }
        if (probeFailed && sceneUrls.length > 1) {
          cuts.length = 0;
          const segLen = canonicalDuration / sceneUrls.length;
          for (let i = 1; i < sceneUrls.length; i++) {
            cuts.push(Math.round(i * segLen * 100) / 100);
          }
        }
        return cuts;
      };

      // ── PRIMARY: Dual PySceneDetect (Adaptive + Content-like) ──
      let adaptiveCutTimes: number[] = [];
      let contentCutTimes: number[] = [];
      try {
        toast.info(t('dc.detectingScenes', { defaultValue: tx({ de: 'Erkenne Szenen mit Dual-Detector…', en: 'Detecting scenes with Dual-Detector…', es: 'Detectando escenas con Dual-Detector…' }) } as any));
        const { data: pyData, error: pyErr } = await supabase.functions.invoke('detect-scenes-pyscenedetect', {
          body: { video_url: selectedVideo.url },
        });
        if (pyErr) throw pyErr;
        if (pyData?.ok) {
          const adaptiveUrls: string[] = pyData?.runs?.adaptive?.scene_urls || [];
          const contentUrls: string[] = pyData?.runs?.content?.scene_urls || pyData?.scene_urls || [];
          adaptiveCutTimes = await clipsToBoundaries(adaptiveUrls);
          contentCutTimes = await clipsToBoundaries(contentUrls);
          diag.adaptiveCuts = adaptiveCutTimes.length;
          diag.contentCuts = contentCutTimes.length;
          if (adaptiveCutTimes.length > 0 || contentCutTimes.length > 0) {
            pysceneSucceeded = true;
            diag.sources.push('PySceneDetect');
          }
          console.log('[DirectorsCut] Dual detector — adaptive:', adaptiveCutTimes.length, 'content:', contentCutTimes.length);
        }
      } catch (pyErr) {
        console.warn('[DirectorsCut] PySceneDetect failed:', pyErr);
      }

      // ── PARALLEL: Client-side pixel pass (Artlist-style sanity check) ──
      const backendCuts = adaptiveCutTimes.length + contentCutTimes.length;
      const maxBackendCut = Math.max(0, ...adaptiveCutTimes, ...contentCutTimes);
      const backendCutsTooFew =
        backendCuts === 0 ||
        (adaptiveCutTimes.length <= 1 && contentCutTimes.length <= 1 &&
         maxBackendCut > canonicalDuration * 0.85);
      const shouldRunPixelPass = canonicalDuration < 90 || backendCutsTooFew;

      let pixelCutTimes: number[] = [];
      if (shouldRunPixelPass) {
        const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-video-bytes?url=${encodeURIComponent(selectedVideo.url)}`;
        const extractCandidates = [selectedVideo.url, proxyUrl];
        for (const candidateUrl of extractCandidates) {
          try {
            timestampedFrames = await extractTimestampedFrames(candidateUrl, canonicalDuration);
            if (timestampedFrames.length > 0) {
              const coarseResult = await detectBoundariesAsync(timestampedFrames);
              let pixelBoundaries = coarseResult.boundaries;
              if (pixelBoundaries.length > 0) {
                try {
                  const refinementFrames = await extractRefinementFrames(
                    candidateUrl, canonicalDuration,
                    pixelBoundaries.map(b => b.time)
                  );
                  const refined = await detectBoundariesAsync(timestampedFrames, refinementFrames);
                  pixelBoundaries = refined.boundaries;
                } catch { /* keep coarse */ }
              }
              pixelCutTimes = pixelBoundaries.map(b => b.time);
              diag.pixelCuts = pixelCutTimes.length;
              if (pixelCutTimes.length > 0) diag.sources.push('Pixel');
              break;
            }
          } catch (frameError: any) {
            const msg = String(frameError?.message || '');
            const isCors = frameError?.code === 'cors_taint' || /CORS/i.test(msg);
            const isLoadOrSeek = /load|seek|decode|MEDIA|video error|timeout/i.test(msg);
            console.warn(`[DirectorsCut] Pixel pass failed for ${candidateUrl === proxyUrl ? 'proxy' : 'origin'}:`, frameError);
            if (candidateUrl !== proxyUrl && !(isCors || isLoadOrSeek)) break;
          }
        }
      }

      // ── BOUNDARY FUSION: merge all sources, dedup within 0.6s ──
      const fuseBoundaries = (lists: number[][]): number[] => {
        const all = lists.flat().filter(t => t > 0.1 && t < canonicalDuration - 0.1).sort((a, b) => a - b);
        const merged: number[] = [];
        for (const t of all) {
          if (merged.length === 0 || t - merged[merged.length - 1] > 0.25) {
            merged.push(t);
          }
        }
        return merged;
      };

      const fusedTimes = fuseBoundaries([adaptiveCutTimes, contentCutTimes, pixelCutTimes]);
      diag.fusedCuts = fusedTimes.length;

      detectedBoundaries = fusedTimes.map(time => ({
        time: Math.round(time * 100) / 100,
        score: 0.9,
        type: 'hard_cut' as const,
        signals: { pixelDiff: 1, histogramDiff: 1, edgeDiff: 1 },
      }));

      const fusedSucceeded = detectedBoundaries.length > 0;
      console.log('[DirectorsCut] Fusion result:', diag, '→', fusedTimes);
      toast.info(
        `Detector: Adaptive ${diag.adaptiveCuts} · Content ${diag.contentCuts} · Pixel ${diag.pixelCuts} → ${diag.fusedCuts} fusioniert`
      );

      const framesForAI: Array<{ time: number; image: string }> = [];
      if (timestampedFrames.length > 0) {
        if (detectedBoundaries.length > 0) {
          for (const boundary of detectedBoundaries) {
            const beforeIdx = timestampedFrames.findIndex(f => f.time >= boundary.time) - 1;
            const afterIdx = timestampedFrames.findIndex(f => f.time >= boundary.time);
            if (beforeIdx >= 0) framesForAI.push(timestampedFrames[beforeIdx]);
            if (afterIdx >= 0 && afterIdx < timestampedFrames.length) framesForAI.push(timestampedFrames[afterIdx]);
          }
          const boundaryTimes = [0, ...detectedBoundaries.map(b => b.time), canonicalDuration];
          for (let s = 0; s < boundaryTimes.length - 1; s++) {
            const midTime = (boundaryTimes[s] + boundaryTimes[s + 1]) / 2;
            const closest = timestampedFrames.reduce((best, f) =>
              Math.abs(f.time - midTime) < Math.abs(best.time - midTime) ? f : best
            );
            if (!framesForAI.find(f => Math.abs(f.time - closest.time) < 0.3)) {
              framesForAI.push(closest);
            }
          }
        } else {
          const TARGET = 50;
          const step = Math.max(1, Math.floor(timestampedFrames.length / TARGET));
          for (let i = 0; i < timestampedFrames.length; i += step) {
            framesForAI.push(timestampedFrames[i]);
          }
        }
        framesForAI.sort((a, b) => a.time - b.time);
      }

      const sceneBoundaries = detectedBoundaries.map(b => ({
        time: b.time, type: b.type, score: b.score,
      }));

      const clientExtractionFailed = timestampedFrames.length === 0 && !fusedSucceeded;
      const boundarySource = fusedSucceeded
        ? (diag.sources.length > 1 ? 'fused' : (pysceneSucceeded ? 'pyscenedetect' : 'trusted'))
        : 'auto';

      const { data, error } = await supabase.functions.invoke('analyze-video-scenes', {
        body: {
          video_url: selectedVideo.url,
          duration: canonicalDuration,
          frames: framesForAI.length > 0 ? framesForAI : undefined,
          scene_boundaries: sceneBoundaries,
          client_extraction_failed: clientExtractionFailed,
          boundary_source: boundarySource,
        },
      });

      if (error) throw error;

      if (data?.ok === false) {
        const detail = data.detail ? ` (${String(data.detail).slice(0, 160)})` : '';
        toast.error(`${data.error || t('dc.sceneAnalysisFailed')}${detail}`);
        setIsAnalyzing(false);
        return;
      }

      const rawScenes = data.scenes || [];
      const sortedScenes = [...rawScenes].sort((a: any, b: any) => a.start_time - b.start_time);

      const MIN_SCENE_DURATION = fusedSucceeded ? 0.3 : 3.0;
      const stableScenes: any[] = [];
      for (const scene of sortedScenes) {
        const dur = (scene.end_time || 0) - (scene.start_time || 0);
        if (dur < MIN_SCENE_DURATION && stableScenes.length > 0) {
          stableScenes[stableScenes.length - 1].end_time = scene.end_time;
        } else {
          stableScenes.push({ ...scene });
        }
      }
      
      const normalizedScenes: SceneAnalysis[] = [];
      let currentTimelinePosition = 0;

      for (let i = 0; i < stableScenes.length; i++) {
        const scene = stableScenes[i];
        const originalDuration = scene.end_time - scene.start_time;
        const safeDuration = Math.max(0.5, originalDuration);
        const timelineStart = currentTimelinePosition;
        const timelineEnd = currentTimelinePosition + safeDuration;
        
        normalizedScenes.push({
          ...scene,
          id: `scene-${i + 1}`,
          start_time: timelineStart,
          end_time: timelineEnd,
          original_start_time: scene.original_start_time ?? scene.start_time,
          original_end_time: scene.original_end_time ?? scene.end_time,
          playbackRate: 1.0,
        });
        
        currentTimelinePosition = timelineEnd;
      }
      
      setScenes(normalizedScenes);
      setAiCutMarkers(detectedBoundaries.map(b => ({
        time: b.time,
        confidence: Math.min(1, Math.max(0, b.score ?? 0.7)),
        source: 'auto' as const,
      })));

      // Artlist-style diagnostic toast
      const diagParts: string[] = [];
      if (diag.adaptiveCuts > 0) diagParts.push(`Adaptive ${diag.adaptiveCuts}`);
      if (diag.contentCuts > 0)  diagParts.push(`Content ${diag.contentCuts}`);
      if (diag.pixelCuts > 0)    diagParts.push(`Pixel ${diag.pixelCuts}`);
      const sourceLabel = diagParts.length > 0
        ? `Fusion: ${diagParts.join(' + ')} → ${diag.fusedCuts}`
        : (data.analysis_mode || tx({ de: 'Keine Cuts erkannt', en: 'No cuts detected', es: 'No se detectaron cortes' }));
      toast.success(`${t('dc.scenesDetected', { count: normalizedScenes.length })} · ${sourceLabel}`);
    } catch (error) {
      console.error('Error analyzing video:', error);
      toast.error(t('dc.sceneAnalysisError'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Reset entire project
  const handleResetProject = useCallback(() => {
    clearDraft();
    setSelectedVideo(null);
    setScenes([]);
    setTransitions([]);
    setAppliedEffects({ global: { brightness: 100, contrast: 100, saturation: 100, sharpness: 0, temperature: 0, vignette: 0 }, scenes: {} });
    setAudioEnhancements({ master_volume: 100, noise_reduction: false, noise_reduction_level: 50, auto_ducking: false, ducking_level: 30, voice_enhancement: false, added_sounds: [] });
    setExportSettings({ quality: 'hd', format: 'mp4', fps: 30, aspect_ratio: '16:9' });
    setStyleTransfer({ enabled: false, style: null, intensity: 0.8 });
    setColorGrading({ enabled: false, grade: null, intensity: 0.7 });
    setSceneColorGrading({});
    setSpeedKeyframes([]);
    setKenBurnsKeyframes([]);
    setChromaKey({ enabled: false, color: '#00ff00', tolerance: 30, backgroundUrl: undefined });
    setUpscaling({ enabled: false, targetResolution: '4k' });
    setInterpolation({ enabled: false, targetFps: 60 });
    setRestoration({ enabled: false, level: 'standard' });
    setObjectRemoval({ enabled: false, objectsCount: 0 });
    setTextOverlays([]);
    setVoiceOverUrl(undefined);
    setBackgroundMusicUrl(undefined);
    setCapCutAudioTracks([]);
    setCapCutSubtitleTrack(undefined);
    setSubtitleSafeZone(DEFAULT_SUBTITLE_SAFE_ZONE);
    toast.success(t('dc.projectReset'));
  }, []);

  // Import dialog state — opens only when the user clicks the Import button.
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const handleVideoSelected = useCallback(async (video: SelectedVideo | null) => {
    setSelectedVideo(video);
    if (video) {
      setImportDialogOpen(false);
      saveProject();

      // If the imported video is a Composer render (detected via render_id /
      // metadata in VideoImportStep), wire up the same EDL import path used
      // for the direct ?source=composer handoff. The existing useEffect that
      // depends on composerSourceProjectId will then load the authoritative
      // scene boundaries and lock auto-cut.
      if (video.composerProjectId) {
        setComposerSourceProjectId(video.composerProjectId);
        setComposerRenderId(video.composerRenderId || null);
        return;
      }

      // Seed-Scene: sofort eine Full-Length-Szene anlegen, damit die Timeline
      // nie leer ist. Auto-Cut ersetzt sie später durch die erkannten Cuts.
      setScenes(prev => {
        if (prev && prev.length > 0) return prev;
        let dur = video.duration || 0;
        if (!dur || !isFinite(dur)) dur = 0;
        // Fallback: leichte Default-Länge, wird gleich per measureVideoDuration korrigiert
        const seedEnd = dur > 0 ? dur : 5;
        return [{
          id: 'seed-1',
          start_time: 0,
          end_time: seedEnd,
          thumbnail_url: (video as any).thumbnail_url || undefined,
          description: '',
          suggested_effects: [],
          isFromOriginalVideo: true,
          sourceMode: 'original',
          // internal marker, ignored by renderer
          source: 'seed',
        } as unknown as SceneAnalysis];
      });

      // Immer die echte MP4-Dauer messen und Szenen darauf clampen. Verhindert
      // "15s-Szene spielt nur 11s" wenn die aus Composer/Meta übernommene
      // Duration von der tatsächlichen Quelle abweicht.
      try {
        const measured = await measureVideoDuration(video.url);
        if (measured > 0) {
          const current = video.duration || 0;
          const drift = Math.abs(measured - current);
          if (!current || drift > 0.3) {
            setSelectedVideo(prev => prev ? { ...prev, duration: measured } : prev);
            setScenes(prev => {
              if (!prev || prev.length === 0) return prev;
              // Seed-Szene komplett auf die echte Länge setzen
              if (prev.length === 1 && (prev[0] as any).source === 'seed') {
                return [{ ...prev[0], end_time: measured, original_end_time: measured } as any];
              }
              // Ansonsten: alle Original-Szenen (keine additionalMedia) auf measured clampen
              return prev.map(s => {
                if ((s as any).additionalMedia) return s;
                const origEnd = (s as any).original_end_time;
                const clampedOrigEnd = typeof origEnd === 'number' ? Math.min(origEnd, measured) : undefined;
                return {
                  ...s,
                  end_time: Math.min(s.end_time, s.start_time + measured),
                  ...(clampedOrigEnd !== undefined ? { original_end_time: clampedOrigEnd } : {}),
                } as any;
              });
            });
          }
        }
      } catch (e) {
        console.warn('[DirectorsCut] measureVideoDuration failed', e);
      }

      // Otherwise: regular shot detection on the imported video.
      const isComposerHandoff = searchParams.get('source') === 'composer';
      if (!isComposerHandoff) {
        setTimeout(() => {
          try {
            handleStartAnalysis();
          } catch (e) {
            console.warn('[DirectorsCut] auto-analysis trigger failed', e);
          }
        }, 100);
      }
    }
  }, [searchParams, saveProject]);

  return (
    <div className="min-h-screen bg-background">
      <UDCWelcomeDialog />
      <CapCutEditor
        videoUrl={selectedVideo?.url || ''}
        videoDuration={actualTotalDuration}
        originalVideoDuration={originalVideoDuration || actualTotalDuration}
        scenes={scenes}
        audioEnhancements={audioEnhancements}
        onAudioChange={setAudioEnhancements}
        onScenesUpdate={setScenes}
        voiceOverUrl={voiceOverUrl}
        textOverlays={textOverlays}
        onTextOverlaysChange={setTextOverlays}
        appliedEffects={appliedEffects}
        initialAiCutMarkers={aiCutMarkers}
        transitions={transitions}
        onTransitionsChange={setTransitions}
        colorGrading={colorGrading}
        sceneColorGrading={sceneColorGrading}
        styleTransfer={styleTransfer}
        speedKeyframes={speedKeyframes}
        kenBurns={kenBurnsKeyframes}
        onEffectsChange={(global) => setAppliedEffects(prev => ({ ...prev, global }))}
        onSceneEffectsChange={(scenes) => setAppliedEffects(prev => ({ ...prev, scenes }))}
        onColorGradingChange={(enabled, grade, intensity) => setColorGrading(prev => ({ ...prev, enabled, grade, intensity: intensity ?? prev.intensity }))}
        onStyleTransferChange={(enabled, style) => setStyleTransfer(prev => ({ ...prev, enabled, style }))}
        chromaKey={chromaKey}
        onChromaKeyChange={(ck) => setChromaKey({ ...ck, backgroundUrl: ck.backgroundUrl ?? undefined })}
        upscaling={upscaling}
        onUpscalingChange={(enabled, resolution) => setUpscaling({ enabled, targetResolution: resolution })}
        onUpscaledVideo={(url) => {
          // The AI-upscaled clip becomes the new source; scenes/cuts are
          // time-based and therefore stay valid.
          setSelectedVideo(prev => (prev ? { ...prev, url } : prev));
          toast.success(t('dc.aiUpscaleApplied'));
        }}

        interpolation={interpolation}
        onInterpolationChange={(enabled, fps) => setInterpolation({ enabled, targetFps: fps })}
        restoration={restoration}
        onRestorationChange={(enabled, level) => setRestoration({ enabled, level })}
        exportSettings={exportSettings}
        onExportSettingsChange={setExportSettings}
        isAnalyzing={isAnalyzing}
        onStartAnalysis={(composerSourceProjectId || composerLock.active) ? undefined : handleStartAnalysis}
        composerLockSource={
          composerLock.active
            ? composerLock.source
            : (composerSourceProjectId ? 'edl' : null)
        }
        composerLockSceneCount={composerLock.sceneCount || scenes.length}
        onVoiceOverGenerated={setVoiceOverUrl}
        onAudioTracksChange={setCapCutAudioTracks}
        onSubtitleTrackChange={setCapCutSubtitleTrack}
        onBackgroundMusicUrlChange={setBackgroundMusicUrl}
        initialSubtitleTrack={capCutSubtitleTrack}
        projectId={projectId}
        onCleanedVideoUrlChange={handleCleanedVideoUrlChange}
        onSaveProject={saveProject}
        autosaveStatus={autosaveStatus}
        autosaveLastSavedAt={autosaveLastSavedAt}
        subtitleSafeZone={subtitleSafeZone}
        onSubtitleSafeZoneChange={setSubtitleSafeZone}
        onResetProject={handleResetProject}
        onBackToImport={() => setImportDialogOpen(true)}
      />

      <VideoImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        selectedVideo={selectedVideo}
        onVideoSelect={handleVideoSelected}
      />

      {/* AI Co-Pilot */}
      <AICoPilot
        isOpen={coPilot.isOpen}
        onOpenChange={coPilot.setIsOpen}
        messages={coPilot.messages}
        suggestions={coPilot.suggestions}
        isProcessing={coPilot.isProcessing}
        onSendMessage={coPilot.sendMessage}
        onDismissSuggestion={coPilot.dismissSuggestion}
        onExecuteSuggestion={coPilot.executeSuggestionAction}
        onClearMessages={coPilot.clearMessages}
      />
    </div>
  );
}
