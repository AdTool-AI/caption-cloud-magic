import { useState, useEffect, useRef, useCallback } from "react";
import { LazyVideoThumb } from "@/components/media-library/LazyVideoThumb";
import { DEMO_VIDEO, isDemoVideo } from "@/constants/demo-video";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Image, Video, FileText, Trash2, Search, ExternalLink, Play, Sparkles, Send, Calendar, Layers, FolderOpen, Download, Cloud, Images, FolderPlus } from "lucide-react";
import { SaveToAlbumDialog } from "@/components/picture-studio/SaveToAlbumDialog";
import { resolveAssetByUrl } from '@/lib/videoEnhance/resolveAssetByUrl';
import { EnhanceVideoDialog } from "@/components/ai-video/EnhanceVideoDialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MediaLibraryHeroHeader } from "@/components/media-library/MediaLibraryHeroHeader";
import { CloudStorageConnect } from "@/components/media-library/CloudStorageConnect";
import { MediaAlbumManager } from "@/components/media-library/MediaAlbumManager";
import { motion, AnimatePresence } from "framer-motion";
import { useCloudStorage } from "@/hooks/useCloudStorage";
import { enforceLimits, deleteMediaItem, type CleanupMediaItem } from "@/lib/media-library/autoCleanup";
import { LicenseButton } from "@/components/licensing/LicenseButton";
import { tx } from "@/lib/i18nText";
import { uiLocale } from '@/lib/uiLocale';

// Storage Limits
const MAX_VIDEOS = 500;
const MAX_IMAGES = 2500;
const MAX_STORAGE_GB = 10;

// Admin archive account (REDACTED_ACCOUNT_EMAIL) is exempt from the library cap.
// Mirrors the server-side exemption in enforce_user_video_library_limits.
const ARCHIVE_EXEMPT_USER_ID = '8948d3d9-2c5e-4405-9e9c-1624448e7189';


// Normalized media item type
interface NormalizedMediaItem {
  id: string;
  source: 'upload' | 'ai' | 'ai_generator' | 'campaign' | 'video-creator' | 'cloud';
  type: 'image' | 'video';
  title?: string;
  caption?: string;
  url: string;
  storagePath?: string;
  thumbUrl?: string;
  createdAt: string;
  sourceId?: string;
  platforms?: string[];
  sizeBytes?: number;
  fileSizeMb?: number;
  storageLocation?: 'local' | 'cloud';
  driveFileId?: string;
  /** Motion-Studio Szenen-Gruppierung */
  sceneId?: string;
  isSuperseded?: boolean;
  olderVersionCount?: number;
}

/** Interne Pipeline-Artefakte (Preclips, Dialog-Stitch-Zwischenschritte) gehören nicht in die Mediathek. */
const INTERNAL_ARTIFACT_PATTERN = /dialog-pass-preclip|dialog-turn-preclip|dialog-stitch/i;

export default function MediaLibrary() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [media, setMedia] = useState<NormalizedMediaItem[]>([]);
  const [filteredMedia, setFilteredMedia] = useState<NormalizedMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "upload" | "ai" | "ai_generator" | "campaign" | "video-creator" | "cloud" | "albums">("all");
  const [storageQuota, setStorageQuota] = useState({ used_mb: 0, quota_mb: MAX_STORAGE_GB * 1024 });
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [importUrl, setImportUrl] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [enhanceSourceUrl, setEnhanceSourceUrl] = useState<string | null>(null);
  const [enhanceAsset, setEnhanceAsset] = useState<{ assetId: string; assetType: 'generation' | 'creation' } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [studioImageCount, setStudioImageCount] = useState(0);
  const [saveToAlbumImageId, setSaveToAlbumImageId] = useState<string | null>(null);
  const [expandedScenes, setExpandedScenes] = useState<string[]>([]);
  const { connection: cloudConnection, cloudFiles, listCloudFiles, uploadToCloud, deleteFromCloud, syncing: cloudSyncing } = useCloudStorage();

  // Pagination: how many cards we actually render
  const [visibleCount, setVisibleCount] = useState(60);
  const PAGE_SIZE = 60;

  // Debounced reload to absorb realtime bursts (auto-cleanup deletes etc.)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      loadMedia();
    }, 800);
  }, []);

  const handleSaveToAlbum = async (item: NormalizedMediaItem) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('studio_images')
      .insert({
        user_id: user.id,
        image_url: item.url,
        prompt: item.title || 'Upload',
        style: 'upload',
        source: 'upload',
        workflow_type: 'uploaded'
      })
      .select('id')
      .single();
    if (data) {
      setSaveToAlbumImageId(data.id);
    } else {
      toast({ title: tx({ de: "Fehler beim Vorbereiten", en: "Preparation failed", es: "Error de preparación" }), variant: "destructive" });
    }
  };

  // Handle tab parameter from URL
  const albumSlug = new URLSearchParams(location.search).get('album');
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab');
    if (tabParam === 'ai') {
      setCategoryFilter('ai');
    } else if (tabParam === 'rendered') {
      setCategoryFilter('video-creator');
    } else if (tabParam === 'albums') {
      setCategoryFilter('albums');
    }
  }, [location.search]);

  useEffect(() => {
    if (user) {
      loadMedia();
      loadStorageQuota();
      loadWorkspaceId();
    }
  }, [user]);

  const loadWorkspaceId = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    
    if (data) setWorkspaceId(data.workspace_id);
  };

  // Realtime subscription for content_items
  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel('content_items_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_items',
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload) => {
          scheduleReload();
          if (payload.eventType === 'INSERT') {
            toast({
              title: tx({ de: "🎉 Neue Medien hinzugefügt!", en: "🎉 New media added!", es: "🎉 ¡Nuevos medios añadidos!" }),
              description: tx({ de: "Deine Media Library wurde aktualisiert", en: "Your media library has been updated", es: "Su biblioteca multimedia ha sido actualizada" }),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  // Realtime subscription for media_assets (uploads + auto-cleanup)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('media_assets_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'media_assets',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          scheduleReload();
          loadStorageQuota();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Realtime subscription for video_creations (AI videos)
  useEffect(() => {
    if (!user) return;

    console.log("🎥 Setting up Realtime subscription for video_creations");

    const channel = supabase
      .channel('video_creations_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'video_creations',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('🎥 Neues Video hinzugefügt:', payload);
          scheduleReload();
          toast({
            title: tx({ de: "🎬 Neues AI-Video verfügbar!", en: "🎬 New AI video available!", es: "🎬 ¡Nuevo vídeo de IA disponible!" }),
            description: tx({ de: "Dein AI-Video wurde zur Mediathek hinzugefügt", en: "Your AI video was added to the media library", es: "Tu vídeo de IA se añadió a la mediateca" })
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'video_creations',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          // Triggered when the 500-video auto-cleanup removes oldest entries.
          console.log('🧹 Video aus Mediathek entfernt (Auto-Cleanup):', payload);
          scheduleReload();
        }
      )
      .subscribe();

    return () => {
      console.log("🎥 Cleaning up video_creations subscription");
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Removed fetchUserPlan, getPlanDisplayName, getPlanLimitDisplay - using fixed limits now

  useEffect(() => {
    applyFilters();
    setVisibleCount(PAGE_SIZE);
  }, [media, searchQuery, filterType, categoryFilter, cloudFiles, expandedScenes]);

  // Auto-load cloud files when cloud tab is selected
  useEffect(() => {
    if (categoryFilter === 'cloud' && cloudConnection && cloudFiles.length === 0) {
      listCloudFiles();
    }
  }, [categoryFilter, cloudConnection]);

  const loadStorageQuota = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('user_storage')
      .select('used_mb, quota_mb')
      .eq('user_id', user.id)
      .single();
    
    if (data) setStorageQuota(data);
  };

  const loadMedia = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Load from media_assets (manual uploads)
      const { data: assetsData, error: assetsError } = await supabase
        .from('media_assets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (assetsError) throw assetsError;

      // Load from content_items (AI-generated and campaigns)
      // First get user's workspace
      const { data: workspaceData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      let contentData: any[] = [];
      if (workspaceData?.workspace_id) {
        const { data: contentItems, error: contentError } = await supabase
          .from('content_items')
          .select('*')
          .eq('workspace_id', workspaceData.workspace_id)
          .in('source', ['ai', 'ai_generator', 'campaign'])
          .order('created_at', { ascending: false });

        if (!contentError && contentItems) {
          contentData = contentItems;
        }
      }

      // Normalize data from both sources
      const normalizedAssets: NormalizedMediaItem[] = (assetsData || []).map(asset => ({
        id: asset.id,
        source: 'upload' as const,
        type: (asset.type === 'video' ? 'video' : 'image') as 'image' | 'video',
        url: supabase.storage.from('media-assets').getPublicUrl(asset.storage_path).data.publicUrl,
        storagePath: asset.storage_path,
        thumbUrl: asset.storage_path,
        createdAt: asset.created_at,
        sizeBytes: asset.size_bytes,
      }));

      const normalizedContent: NormalizedMediaItem[] = contentData.map(item => ({
        id: item.id,
        source: item.source,
        type: item.type,
        title: item.title,
        caption: item.caption,
        url: item.thumb_url || '',
        thumbUrl: item.thumb_url,
        createdAt: item.created_at,
        sourceId: item.source_id,
        platforms: item.targets || [],
        fileSizeMb: item.file_size_mb,
      }));

      // Load video creations
      const { data: videoCreations, error: videoError } = await supabase
        .from('video_creations')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      // Interne Pipeline-Artefakte (Lip-Sync-Preclips etc.) ausblenden
      const userFacingCreations = (videoCreations || []).filter(
        (v: any) => !INTERNAL_ARTIFACT_PATTERN.test(v.output_url || '')
      );

      let normalizedVideoCreations: NormalizedMediaItem[] = userFacingCreations.map(video => {
        // Check if it's a Sora-2-AI, Director's Cut Enhancement, Director's Cut, or Universal Creator video
        const metadata = video.metadata as any;
        const isSoraAI = metadata?.source === 'sora-2-ai';
        const isDirectorCutEnhancement = metadata?.source === 'director-cut-enhancement';
        const isDirectorsCut = metadata?.source === 'directors-cut';
        const isUniversalCreator = metadata?.source === 'universal-creator';
        const isMotionStudioClip = metadata?.source === 'motion-studio-clip';
        const isSuperseded = metadata?.superseded === true;
        const motionModel = typeof metadata?.model === 'string'
          ? metadata.model.replace(/^ai-/, '').replace(/^\w/, (c: string) => c.toUpperCase())
          : 'AI';

        return {
          id: video.id,
          source: (isSoraAI || isDirectorCutEnhancement || isDirectorsCut || isMotionStudioClip)
            ? 'ai' as const 
            : isUniversalCreator ? 'video-creator' as const : 'upload' as const,
          type: 'video' as const,
          title: isSoraAI 
            ? (metadata?.prompt?.slice(0, 60) + '...' || 'AI Video')
            : isDirectorCutEnhancement
              ? tx({ de: `KI-Szene: ${metadata?.prompt?.slice(0, 40) || 'Enhancement'}...`, en: `AI scene: ${metadata?.prompt?.slice(0, 40) || 'Enhancement'}...`, es: `Escena de IA: ${metadata?.prompt?.slice(0, 40) || 'Realce'}...` })
              : isDirectorsCut
                ? `Director's Cut - ${new Date(video.created_at).toLocaleDateString(uiLocale())}`
                : isMotionStudioClip
                  ? tx({ de: `Motion Studio · Szene ${(metadata?.scene_order ?? 0) + 1}${isSuperseded ? ' (Vorgängerversion)' : ''}`, en: `Motion Studio · Scene ${(metadata?.scene_order ?? 0) + 1}${isSuperseded ? ' (previous version)' : ''}`, es: `Motion Studio · Escena ${(metadata?.scene_order ?? 0) + 1}${isSuperseded ? ' (versión anterior)' : ''}` })
                  : isUniversalCreator
                    ? `Universal Creator Video - ${new Date(video.created_at).toLocaleDateString(uiLocale())}`
                    : tx({
                        de: `Erstelltes Video - ${new Date(video.created_at).toLocaleDateString(uiLocale())}`,
                        en: `Created video - ${new Date(video.created_at).toLocaleDateString(uiLocale())}`,
                        es: `Vídeo creado - ${new Date(video.created_at).toLocaleDateString(uiLocale())}`,
                      }),
          caption: isSoraAI 
            ? `Sora 2 ${metadata?.model === 'sora-2-pro' ? 'Pro' : 'Standard'} · ${metadata?.duration_seconds}s`
            : isDirectorCutEnhancement
              ? `Director's Cut · Sora 2 ${metadata?.model === 'sora-2-pro' ? 'Pro' : 'Standard'} · ${metadata?.duration_seconds}s`
              : isDirectorsCut
                ? tx({ de: tx({ de: "Exportiert mit Universal Director's Cut", en: "Exported with Universal Director's Cut", es: "Exportado con Universal Director's Cut" }), en: "Exported with Universal Director's Cut", es: "Exportado con Universal Director's Cut" })
                : isMotionStudioClip
                  ? `${motionModel} · ${metadata?.duration_seconds ?? '?'}s${metadata?.prompt ? ` · ${String(metadata.prompt).slice(0, 50)}…` : ''}`
                  : isUniversalCreator
                    ? tx({ de: tx({ de: "Gerendert mit Universal Creator", en: "Rendered with Universal Creator", es: "Renderizado con Universal Creator" }), en: 'Rendered with Universal Creator', es: 'Renderizado con Universal Creator' })
                    : '',
          url: video.output_url || '',
          thumbUrl: video.output_url || '',
          createdAt: video.created_at,
          sceneId: isMotionStudioClip ? (metadata?.scene_id as string | undefined) : undefined,
          isSuperseded: isMotionStudioClip ? isSuperseded : false,
        };
      });

      // Motion-Studio: pro Szene nur die aktuellste Version als Hauptkarte,
      // ältere Versionen bleiben erhalten und sind aufklappbar.
      const versionCounts = new Map<string, number>();
      normalizedVideoCreations.forEach(item => {
        if (item.sceneId && item.isSuperseded) {
          versionCounts.set(item.sceneId, (versionCounts.get(item.sceneId) || 0) + 1);
        }
      });
      normalizedVideoCreations = normalizedVideoCreations.map(item =>
        item.sceneId && !item.isSuperseded
          ? { ...item, olderVersionCount: versionCounts.get(item.sceneId) || 0 }
          : item
      );

      // Inject demo video if user has no video creations
      if (normalizedVideoCreations.length === 0) {
        normalizedVideoCreations = [{
          id: DEMO_VIDEO.id,
          source: 'video-creator' as const,
          type: 'video' as const,
          title: 'Demo Video — Universal Creator',
          caption: tx({ de: 'Dein erstes Video könnte so aussehen', en: 'Your first video could look like this', es: 'Tu primer video podría verse así' }),
          url: DEMO_VIDEO.output_url,
          thumbUrl: DEMO_VIDEO.output_url,
          createdAt: DEMO_VIDEO.created_at,
        }];
      }

      // Calculate storage quota including estimated sizes for content_items
      let totalUsedMB = 0;

      // Real file sizes from media_assets
      totalUsedMB += normalizedAssets.reduce((sum, item) => {
        return sum + ((item.sizeBytes || 0) / (1024 * 1024));
      }, 0);

      // Use actual file sizes for content_items if available, otherwise estimate
      totalUsedMB += normalizedContent.reduce((sum, item) => {
        // Use actual file_size_mb if available, otherwise estimate
        const fileSize = item.fileSizeMb || (item.type === 'video' ? 20 : 2);
        return sum + fileSize;
      }, 0);

      // Add AI video sizes to storage calculation
      totalUsedMB += normalizedVideoCreations.reduce((sum, item) => {
        // Estimate 20 MB per AI video if size not available
        const fileSize = item.fileSizeMb || 20;
        return sum + fileSize;
      }, 0);

      setStorageQuota(prev => ({ ...prev, used_mb: totalUsedMB }));

      // Fetch studio_images count for the image counter
      const { count: studioCount } = await supabase
        .from('studio_images')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setStudioImageCount(studioCount || 0);

      // Merge and sort by creation date - including AI videos
      const merged = [...normalizedAssets, ...normalizedContent, ...normalizedVideoCreations].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setMedia(merged);
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...media];

    // Albums tab: handled by MediaAlbumManager component
    if (categoryFilter === "albums") {
      setFilteredMedia([]);
      return;
    }

    // Cloud tab: show cloud files instead
    if (categoryFilter === "cloud") {
      const cloudMedia: NormalizedMediaItem[] = cloudFiles.map(cf => ({
        id: cf.id,
        source: 'cloud' as const,
        type: cf.mimeType?.startsWith('video/') ? 'video' as const : 'image' as const,
        title: cf.name,
        url: cf.thumbnailLink || cf.webViewLink || '',
        thumbUrl: cf.thumbnailLink,
        createdAt: cf.createdTime,
        storageLocation: 'cloud' as const,
        driveFileId: cf.id,
        sizeBytes: parseInt(cf.size || '0'),
      }));
      filtered = cloudMedia;
    } else if (categoryFilter === "ai") {
      // AI tab: show AI videos only, no ai_generator images (those are in Albums)
      filtered = filtered.filter(item => item.source === 'ai' && item.type === 'video');
    } else if (categoryFilter !== "all") {
      filtered = filtered.filter(item => item.source === categoryFilter);
    } else {
      // "all" tab: only show videos, images are only in Albums
      filtered = filtered.filter(item => item.type === 'video');
    }

    // Motion-Studio: ältere Szenenversionen nur zeigen, wenn aufgeklappt
    filtered = filtered.filter(
      item => !item.isSuperseded || (item.sceneId ? expandedScenes.includes(item.sceneId) : true)
    );

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(item => 
        item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.url?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Type filter
    if (filterType !== "all") {
      filtered = filtered.filter(item => item.type === filterType);
    }

    setFilteredMedia(filtered);
  };

  const handleImportUrl = async () => {
    if (!importUrl || !user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('media-import', {
        body: { url: importUrl, type: 'image' }
      });
      
      if (error) throw error;
      
      toast({
        title: 'Import successful',
        description: 'Media imported from URL',
      });
      
      setImportUrl("");
      loadMedia();
      loadStorageQuota();
    } catch (error: any) {
      toast({
        title: 'Import failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !user) return;

    const file = e.target.files[0];
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    const fileSizeMb = file.size / 1024 / 1024;

    // Auto-FIFO cleanup (or block if cloud connected)
    const isArchiveExempt = user.id === ARCHIVE_EXEMPT_USER_ID;
    const decision = isArchiveExempt
      ? { toDelete: [] as CleanupMediaItem[], blocked: false as const }
      : enforceLimits<CleanupMediaItem>({
          media: media as CleanupMediaItem[],
          incoming: { type: isVideo ? 'video' : 'image', sizeMb: fileSizeMb },
          hasCloud: !!cloudConnection,
          limits: { maxVideos: MAX_VIDEOS, maxImages: MAX_IMAGES, maxStorageMb: MAX_STORAGE_GB * 1024 },
          currentUsedMb: storageQuota.used_mb,
        });


    if (decision.blocked) {
      if (decision.blockReason === 'cloud_offload_required') {
        toast({
          title: tx({ de: 'Speicher-Limit erreicht', en: 'Storage limit reached', es: 'Límite de almacenamiento alcanzado' }),
          description: tx({ de: 'Bitte lagere ältere Medien in deine verbundene Google Drive aus, um Platz zu schaffen.', en: 'Please offload older media to your connected Google Drive to free up space.', es: 'Traslada medios antiguos a tu Google Drive conectado para liberar espacio.' }),
          variant: 'destructive',
        });
      } else {
        toast({
          title: tx({ de: 'Limit erreicht', en: 'Limit reached', es: 'Límite alcanzado' }),
          description: tx({ de: 'Keine alten Medien zum Freigeben gefunden. Bitte manuell löschen oder Google Drive verbinden.', en: 'No older media found to free up. Please delete manually or connect Google Drive.', es: 'No se encontraron medios antiguos. Elimina manualmente o conecta Google Drive.' }),
          variant: 'destructive',
        });
      }
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      return;
    }

    if (decision.toDelete.length > 0) {
      try {
        for (const item of decision.toDelete) {
          await deleteMediaItem(item);
        }
        toast({
          title: 'Platz geschaffen',
          description: tx({ de: `${decision.toDelete.length} ältere${decision.toDelete.length === 1 ? 's' : ''} Medi${decision.toDelete.length === 1 ? 'um wurde' : 'en wurden'} automatisch entfernt. Tipp: Verbinde Google Drive, um Medien stattdessen sicher auszulagern.`, en: `${decision.toDelete.length} older medium${decision.toDelete.length === 1 ? '' : 's'} automatically removed. Tip: Connect Google Drive to offload media safely instead.`, es: `${decision.toDelete.length} medio${decision.toDelete.length === 1 ? '' : 's'} antiguo${decision.toDelete.length === 1 ? '' : 's'} eliminado${decision.toDelete.length === 1 ? '' : 's'} automáticamente. Consejo: Conecta Google Drive para descargar medios de forma segura en su lugar.` }),
        });
      } catch (cleanupErr: any) {
        toast({
          title: tx({ de: 'Auto-Cleanup fehlgeschlagen', en: 'Auto cleanup failed', es: 'Error en la limpieza automática' }),
          description: cleanupErr?.message || tx({ de: tx({ de: "Bitte manuell ältere Medien löschen.", en: "Please delete older media manually.", es: "Elimina manualmente los archivos antiguos." }), en: 'Please delete older media manually.', es: 'Elimina manualmente los medios antiguos.' }),
          variant: 'destructive',
        });
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        return;
      }
    }

    setLoading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const fileType = file.type.startsWith('image/') ? 'image' : 'video';

      const { error: dbError } = await supabase
        .from('media_assets')
        .insert({
          user_id: user.id,
          source: 'upload',
          storage_path: filePath,
          type: fileType,
          mime: file.type,
          size_bytes: file.size,
        });

      if (dbError) throw dbError;

      toast({
        title: tx({ de: 'Upload erfolgreich', en: 'Upload successful', es: 'Subida exitosa' }),
        description: 'Media uploaded successfully',
      });

      loadMedia();
      loadStorageQuota();
    } catch (error: any) {
      toast({
        title: tx({ de: 'Upload fehlgeschlagen', en: 'Upload failed', es: 'Error al subir' }),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    }
  };

  const handleDelete = async (id: string, mediaItem: NormalizedMediaItem) => {
    if (id === DEMO_VIDEO.id) {
      toast({ title: tx({ de: 'Demo-Videos können nicht gelöscht werden', en: 'Demo videos cannot be deleted', es: 'Los vídeos de demostración no se pueden eliminar' }) });
      return;
    }
    try {
      // Handle deletion based on source
      if (mediaItem.source === 'upload' && mediaItem.storagePath) {
        await supabase.storage
          .from('media-assets')
          .remove([mediaItem.storagePath]);

        const { error } = await supabase
          .from('media_assets')
          .delete()
          .eq('id', id);

        if (error) throw error;
      } else if (mediaItem.source === 'video-creator') {
        // Delete from video_creations
        const { error } = await supabase
          .from('video_creations')
          .delete()
          .eq('id', id);

        if (error) throw error;
      } else if (mediaItem.source === 'ai' && mediaItem.type === 'video') {
        // AI videos stored in video_creations
        const { error } = await supabase
          .from('video_creations')
          .delete()
          .eq('id', id);

        if (error) throw error;
      } else if (mediaItem.source === 'ai' || mediaItem.source === 'ai_generator' || mediaItem.source === 'campaign') {
        // Delete from content_items
        const { error } = await supabase
          .from('content_items')
          .delete()
          .eq('id', id);

        if (error) throw error;
      }

      toast({
        title: tx({ de: 'Gelöscht', en: 'Deleted', es: 'Eliminado' }),
        description: tx({ de: 'Medium erfolgreich gelöscht', en: 'Media deleted successfully', es: 'Medios eliminados correctamente' }),
      });

      setSelectedAssets(prev => prev.filter(assetId => assetId !== id));
      loadMedia();
      if (mediaItem.source === 'upload') {
        loadStorageQuota();
      }
    } catch (error: any) {
      toast({
        title: tx({ de: 'Fehler beim Löschen', en: 'Delete failed', es: 'Error al eliminar' }),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Send to AI Post Generator
  const sendToAIPostGenerator = (mediaItem: NormalizedMediaItem) => {
    sessionStorage.setItem('generator_media_import', JSON.stringify({
      mediaUrl: mediaItem.url,
      mediaType: mediaItem.type,
      timestamp: Date.now(),
    }));
    
    toast({
      title: `📸 ${t('aipost_media_sent')}`,
      description: t('aipost_media_sent_loading'),
    });
    
    navigate('/content-studio?step=layout');
  };

  // Send to Composer
  const sendToComposer = (mediaItem: NormalizedMediaItem) => {
    localStorage.setItem('composer_import', JSON.stringify({
      mediaUrl: mediaItem.url,
      mediaType: mediaItem.type,
      platforms: ['instagram'],
      timestamp: Date.now(),
    }));
    
    toast({
      title: tx({ de: '✉️ Medien gesendet', en: '✉️ Media sent', es: '✉️ Medios enviados' }),
      description: tx({ de: "Wird im Composer geladen...", en: "Loading in composer...", es: "Cargando en compositor..." }),
    });
    
    navigate('/command-center?compose=1');
  };

  // Send to Calendar
  const sendToCalendar = (mediaItem: NormalizedMediaItem) => {
    sessionStorage.setItem('calendar_prefill', JSON.stringify({
      title: mediaItem.title || tx({ de: `Post vom ${new Date().toLocaleDateString(uiLocale())}`, en: `Post from ${new Date().toLocaleDateString(uiLocale())}`, es: `Publicar desde ${new Date().toLocaleDateString(uiLocale())}` }),
      caption: mediaItem.caption || '',
      mediaUrl: mediaItem.url,
      mediaType: mediaItem.type,
      platforms: mediaItem.platforms || ['instagram'],
      timestamp: Date.now(),
    }));
    
    toast({
      title: tx({ de: '📅 Medien gesendet', en: '📅 Media sent', es: '📅 Medios enviados' }),
      description: tx({ de: "Wird im Kalender geladen...", en: "Loading in calendar...", es: "Cargando en calendario..." }),
    });
    
    navigate('/command-center?view=calendar&prefill=true');
  };

  // Send to Background Replacer
  const sendToBackgroundReplacer = (mediaItem: NormalizedMediaItem) => {
    // Only allow images for background replacer
    if (mediaItem.type !== 'image') {
      toast({
        title: tx({ de: "⚠️ Nur Bilder erlaubt", en: "⚠️ Only images allowed", es: "⚠️ Sólo se permiten imágenes" }),
        description: tx({ de: "Smart Background funktioniert nur mit Bildern.", en: "Smart Background only works with images.", es: "Fondo inteligente solo funciona con imágenes." }),
        variant: "destructive",
      });
      return;
    }
    
    sessionStorage.setItem('bg_replacer_import', JSON.stringify({
      imageUrl: mediaItem.url,
      timestamp: Date.now(),
    }));
    
    toast({
      title: tx({ de: '🎨 Medien gesendet', en: '🎨 Media sent', es: '🎨 Medios enviados' }),
      description: tx({ de: "Wird in Smart Background geladen...", en: "Loading in Smart Background...", es: "Cargando en Fondo inteligente..." }),
    });
    
    navigate('/picture-studio?tab=background');
  };

  // Bulk send to Composer
  const bulkSendToComposer = () => {
    const selectedItems = media.filter(item => selectedAssets.includes(item.id));
    
    if (selectedItems.length === 0) return;
    
    const mediaUrls = selectedItems.map(item => ({
      url: item.url,
      type: item.type,
    }));
    
    localStorage.setItem('composer_import', JSON.stringify({
      media: mediaUrls,
      platforms: ['instagram'],
      timestamp: Date.now(),
    }));
    
    toast({
      title: tx({ de: '✉️ Medien gesendet', en: '✉️ Media sent', es: '✉️ Medios enviados' }),
      description: tx({ de: `${selectedItems.length} Dateien werden im Composer geladen...`, en: `${selectedItems.length} files are loaded in composer...`, es: `Los archivos ${selectedItems.length} están cargados en Composer...` }),
    });
    
    navigate('/command-center?compose=1');
  };

  // Bulk send to AI Post Generator
  const bulkSendToAIPostGenerator = () => {
    const selectedItems = media.filter(item => selectedAssets.includes(item.id));
    
    if (selectedItems.length === 0) return;
    
    // For generator, use first media item only
    const firstItem = selectedItems[0];
    
    sessionStorage.setItem('generator_media_import', JSON.stringify({
      mediaUrl: firstItem.url,
      mediaType: firstItem.type,
      timestamp: Date.now(),
    }));
    
    toast({
      title: tx({ de: '📸 Medien gesendet', en: '📸 Media sent', es: '📸 Medios enviados' }),
      description: tx({ de: `Erstes Medium wird im KI-Post-Generator geladen...`, en: `First medium is loaded in the AI ​​post generator...`, es: `El primer medio se carga en el generador de publicaciones de IA...` }),
    });
    
    navigate('/content-studio?step=layout');
  };

  // Bulk send to Calendar
  const bulkSendToCalendar = () => {
    const selectedItems = media.filter(item => selectedAssets.includes(item.id));
    
    if (selectedItems.length === 0) return;
    
    // For calendar, use first media item only
    const firstItem = selectedItems[0];
    
    sessionStorage.setItem('calendar_prefill', JSON.stringify({
      title: firstItem.title || tx({ de: `Post vom ${new Date().toLocaleDateString(uiLocale())}`, en: `Post from ${new Date().toLocaleDateString(uiLocale())}`, es: `Publicar desde ${new Date().toLocaleDateString(uiLocale())}` }),
      caption: firstItem.caption || '',
      mediaUrl: firstItem.url,
      mediaType: firstItem.type,
      platforms: firstItem.platforms || ['instagram'],
      timestamp: Date.now(),
    }));
    
    toast({
      title: tx({ de: '📅 Medien gesendet', en: '📅 Media sent', es: '📅 Medios enviados' }),
      description: tx({ de: `Erstes Medium wird im Kalender geladen...`, en: `First medium is loaded in the calendar...`, es: `El primer medio está cargado en el calendario...` }),
    });
    
    navigate('/command-center?view=calendar&prefill=true');
  };

  // Bulk send to Background Replacer
  const bulkSendToBackgroundReplacer = () => {
    const selectedItems = media.filter(item => selectedAssets.includes(item.id));
    
    if (selectedItems.length === 0) return;
    
    // For background replacer, use first image only
    const firstImageItem = selectedItems.find(item => item.type === 'image');
    
    if (!firstImageItem) {
      toast({
        title: tx({ de: "⚠️ Kein Bild ausgewählt", en: "⚠️ No image selected", es: "⚠️ Ninguna imagen seleccionada" }),
        description: tx({ de: "Smart Background funktioniert nur mit Bildern.", en: "Smart Background only works with images.", es: "Fondo inteligente solo funciona con imágenes." }),
        variant: "destructive",
      });
      return;
    }
    
    sessionStorage.setItem('bg_replacer_import', JSON.stringify({
      imageUrl: firstImageItem.url,
      timestamp: Date.now(),
    }));
    
    toast({
      title: tx({ de: '🎨 Medien gesendet', en: '🎨 Media sent', es: '🎨 Medios enviados' }),
      description: tx({ de: `Erstes Bild wird in Smart Background geladen...`, en: `First image is loading into Smart Background...`, es: `La primera imagen se está cargando en Smart Background...` }),
    });
    
    navigate('/picture-studio?tab=background');
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'upload':
        return <Badge variant="secondary" className="text-xs"><Upload className="h-3 w-3 mr-1" /> Upload</Badge>;
      case 'ai':
        return <Badge variant="default" className="text-xs bg-purple-500/10 text-purple-500"><Sparkles className="h-3 w-3 mr-1" /> AI Video</Badge>;
      case 'ai_generator':
        return <Badge variant="default" className="text-xs"><Sparkles className="h-3 w-3 mr-1" /> KI</Badge>;
      case 'campaign':
        return <Badge variant="outline" className="text-xs"><Layers className="h-3 w-3 mr-1" /> Kampagne</Badge>;
      case 'video-creator':
        return <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-500"><Video className="h-3 w-3 mr-1" /> Video Creator</Badge>;
      case 'cloud':
        return <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500"><Cloud className="h-3 w-3 mr-1" /> Cloud</Badge>;
      default:
        return null;
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="h-5 w-5" />;
      case 'video': return <Video className="h-5 w-5" />;
      default: return <FileText className="h-5 w-5" />;
    }
  };

  // Calculate counts for header (exclude demo placeholder video)
  const videoCount = media.filter(m => m.type === 'video' && !isDemoVideo(m.id)).length;
  const imageCount = media.filter(m => m.type === 'image').length + studioImageCount;
  const usedGB = storageQuota.used_mb / 1024;

  const triggerUpload = () => {
    document.getElementById('file-upload')?.click();
  };

  return (
    <TooltipProvider>
    <div className="container py-8 space-y-6">
      {/* Hidden file input */}
      <input
        type="file"
        id="file-upload"
        className="hidden"
        onChange={handleUpload}
        accept="image/*,video/*"
      />

      {/* Premium Hero Header */}
      <MediaLibraryHeroHeader
        videoCount={videoCount}
        maxVideos={MAX_VIDEOS}
        imageCount={imageCount}
        maxImages={MAX_IMAGES}
        usedGB={usedGB}
        maxGB={MAX_STORAGE_GB}
        onUploadClick={triggerUpload}
        cloudConnected={!!cloudConnection}
        cloudUsedGB={cloudConnection ? cloudConnection.used_bytes / (1024 * 1024 * 1024) : 0}
        cloudTotalGB={cloudConnection ? cloudConnection.quota_bytes / (1024 * 1024 * 1024) : 0}
      />

      {/* URL Import - Glassmorphism */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="backdrop-blur-xl bg-card/60 border-white/10">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Input 
                placeholder={tx({ de: "Externe URL importieren (z.B. https://...)", en: "Import external URL (e.g. https://...)", es: "Importar URL externa (p. ej. https://...)" })} 
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
              />
              <Button 
                onClick={handleImportUrl} 
                disabled={!importUrl || loading}
                className="group relative overflow-hidden"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent
                                 -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
                <ExternalLink className="h-4 w-4 mr-2" />
                Import
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Category Tabs - Premium Glassmorphism */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card className="backdrop-blur-xl bg-card/60 border-white/10">
          <CardContent className="pt-6">
            <Tabs value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
              <TabsList className="grid w-full grid-cols-7 bg-muted/30">
                <TabsTrigger 
                  value="all" 
                  className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)]"
                >
                  <FolderOpen className="h-4 w-4" />
                  {tx({ de: 'Alle', en: 'All', es: 'Todos' })}
                </TabsTrigger>
                <TabsTrigger 
                  value="upload" 
                  className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)]"
                >
                  <Upload className="h-4 w-4" />
                  {tx({ de: 'Uploads', en: 'Uploads', es: 'Subidas' })}
                </TabsTrigger>
                <TabsTrigger 
                  value="ai" 
                  className="flex items-center gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:shadow-[0_0_15px_hsla(270,80%,60%,0.2)]"
                >
                  <Sparkles className="h-4 w-4" />
                  {tx({ de: 'KI', en: 'AI', es: 'IA' })}
                </TabsTrigger>
                <TabsTrigger 
                  value="video-creator" 
                  className="flex items-center gap-2 data-[state=active]:bg-cyan-500/20 data-[state=active]:shadow-[0_0_15px_hsla(180,80%,60%,0.2)]"
                >
                  <Video className="h-4 w-4" />
                  {tx({ de: 'Gerendert', en: 'Rendered', es: 'Renderizado' })}
                </TabsTrigger>
                <TabsTrigger 
                  value="campaign" 
                  className="flex items-center gap-2 data-[state=active]:bg-orange-500/20 data-[state=active]:shadow-[0_0_15px_hsla(30,80%,60%,0.2)]"
                >
                  <Layers className="h-4 w-4" />
                  {tx({ de: 'Kampagnen', en: 'Campaigns', es: 'Campañas' })}
                </TabsTrigger>
                <TabsTrigger 
                  value="albums" 
                  className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)]"
                >
                  <Images className="h-4 w-4" />
                  {tx({ de: 'Alben', en: 'Albums', es: 'Álbumes' })}
                </TabsTrigger>
                <TabsTrigger 
                  value="cloud" 
                  className="flex items-center gap-2 data-[state=active]:bg-blue-500/20 data-[state=active]:shadow-[0_0_15px_hsla(210,80%,60%,0.2)]"
                >
                  <Cloud className="h-4 w-4" />
                  Cloud
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>

      {/* Albums Tab: show MediaAlbumManager instead of grid */}
      {categoryFilter === "albums" ? (
        <MediaAlbumManager initialAlbumSlug={albumSlug} />
      ) : (
      <>
      {/* Filters & Selection Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search media..."
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label>File Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="image">Images</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedAssets.length > 0 && (
            <div className="flex items-center gap-4 p-4 border-t bg-muted/30 flex-wrap mt-4">
              <span className="text-sm text-muted-foreground">
                {tx({ de: `${selectedAssets.length} ausgewählt`, en: `${selectedAssets.length} selected`, es: `${selectedAssets.length} seleccionados` })}
              </span>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bulkSendToAIPostGenerator}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  An Generator ({selectedAssets.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bulkSendToComposer}
                >
                  <Send className="h-4 w-4 mr-2" />
                  An Composer ({selectedAssets.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bulkSendToCalendar}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  In Kalender ({selectedAssets.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bulkSendToBackgroundReplacer}
                >
                  <Layers className="h-4 w-4 mr-2" />
                  Smart Background ({selectedAssets.length})
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    selectedAssets.forEach(id => {
                      const item = media.find(m => m.id === id);
                      if (item) handleDelete(id, item);
                    });
                    setSelectedAssets([]);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {tx({ de: 'Löschen', en: 'Delete', es: 'Eliminar' })} ({selectedAssets.length})
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cloud connection prompt when not connected */}
      {categoryFilter === 'cloud' && !cloudConnection ? (
        <CloudStorageConnect />
      ) : (
      <>
      {/* Media Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredMedia.slice(0, visibleCount).map((item) => {
          return (
            <Card key={item.id} className="overflow-hidden">
              <div className="aspect-square bg-muted flex items-center justify-center relative group">
                {/* Checkbox for selection */}
                <div className="absolute top-2 left-2 z-10">
                  <Checkbox
                    checked={selectedAssets.includes(item.id)}
                    onCheckedChange={(checked) => {
                      setSelectedAssets(prev => 
                        checked ? [...prev, item.id] : prev.filter(id => id !== item.id)
                      );
                    }}
                  />
                </div>

                {/* Source Badge */}
                <div className="absolute top-2 right-2 z-10">
                  {getSourceBadge(item.source)}
                </div>

                {/* Motion-Studio Versionen */}
                {item.sceneId && !!item.olderVersionCount && (
                  <button
                    type="button"
                    className="absolute bottom-2 left-2 z-10 rounded-md bg-background/80 px-2 py-1 text-xs backdrop-blur hover:bg-background"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedScenes(prev =>
                        prev.includes(item.sceneId!)
                          ? prev.filter(id => id !== item.sceneId)
                          : [...prev, item.sceneId!]
                      );
                    }}
                  >
                    {expandedScenes.includes(item.sceneId)
                      ? tx({ de: 'Ältere Versionen ausblenden', en: 'Hide older versions', es: 'Ocultar versiones anteriores' })
                      : tx({
                          de: `+${item.olderVersionCount} ältere Version${item.olderVersionCount > 1 ? 'en' : ''}`,
                          en: `+${item.olderVersionCount} older version${item.olderVersionCount > 1 ? 's' : ''}`,
                          es: `+${item.olderVersionCount} versión${item.olderVersionCount > 1 ? 'es' : ''} anterior${item.olderVersionCount > 1 ? 'es' : ''}`,
                        })}
                  </button>
                )}
                {item.isSuperseded && (
                  <div className="absolute bottom-2 left-2 z-10 rounded-md bg-background/80 px-2 py-1 text-xs backdrop-blur">
                    {tx({ de: 'Ältere Version', en: 'Older version', es: 'Versión anterior' })}
                  </div>
                )}


                {item.type === 'video' && item.url ? (
                  <LazyVideoThumb
                    src={item.url}
                    onClick={() => setSelectedVideo(item.url)}
                  />
                ) : item.type === 'image' && item.url ? (
                  <img 
                    src={item.url} 
                    alt={item.title || "Media"}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    {getFileIcon(item.type)}
                    <span className="text-sm text-center px-2 break-words">
                      {item.title || item.storagePath?.split('/').pop() || 'Unbenannt'}
                    </span>
                  </div>
                )}
                
                {/* Action Overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <>

                    {item.type === 'video' && item.url && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="secondary"
                            onClick={() => setSelectedVideo(item.url)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Video abspielen</TooltipContent>
                      </Tooltip>
                    )}
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="secondary"
                          onClick={() => sendToAIPostGenerator(item)}
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>An KI-Post-Generator senden</TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="secondary"
                          onClick={() => sendToComposer(item)}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>An Composer senden</TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="secondary"
                          onClick={() => sendToCalendar(item)}
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>In Kalender einplanen</TooltipContent>
                    </Tooltip>
                    
                    {item.type === 'image' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="secondary"
                            onClick={() => sendToBackgroundReplacer(item)}
                          >
                            <Layers className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Hintergrund ersetzen</TooltipContent>
                      </Tooltip>
                    )}
                    
                    {item.url && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="secondary"
                            onClick={() => window.open(item.url, '_blank')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{tx({ de: 'Herunterladen', en: 'Download', es: 'Descargar' })}</TooltipContent>
                      </Tooltip>
                    )}
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="secondary"
                          onClick={() => handleSaveToAlbum(item)}
                        >
                          <FolderPlus className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{tx({ de: "In Album speichern", en: "Save to album", es: "Guardar en álbum" })}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <LicenseButton
                            size="icon"
                            variant="secondary"
                            asset_type={item.type === 'video' ? 'video' : item.type === 'image' ? 'image' : 'asset'}
                            asset_id={item.id}
                            asset_title={item.title || item.storagePath?.split('/').pop() || 'Media Asset'}
                            asset_thumbnail_url={item.url}
                            asset_source_url={item.url}
                            source_provider={
                              item.source === 'upload' ? 'own-generation' :
                              item.source === 'ai' || item.source === 'ai_generator' ? (item.type === 'video' ? 'replicate-video' : 'replicate-image') :
                              item.source === 'video-creator' ? 'replicate-video' :
                              'own-generation'
                            }
                            license_tier="commercial"
                            metadata={{ source: item.source, type: item.type }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Lizenz-Zertifikat</TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="destructive"
                          onClick={() => handleDelete(item.id, item)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{tx({ de: "Löschen", en: "Delete", es: "Borrar" })}</TooltipContent>
                    </Tooltip>
                  </>

                </div>
              </div>
              <CardContent className="p-3">
                <p className="text-sm font-medium truncate">
                  {item.title || item.storagePath?.split('/').pop() || 'Unbenannt'}
                </p>
                {item.caption && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.caption}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {item.type}
                  </Badge>
                  {item.sizeBytes && (
                    <span className="text-xs text-muted-foreground">
                      {(item.sizeBytes / 1024 / 1024).toFixed(2)} MB
                    </span>
                  )}
                  {item.platforms && item.platforms.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {item.platforms.join(', ')}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {visibleCount < filteredMedia.length && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            {tx({ de: "Mehr laden", en: "Load more", es: "Cargar más" })} ({visibleCount} {tx({ de: "von", en: "of", es: "de" })} {filteredMedia.length})
          </Button>
        </div>
      )}



      {filteredMedia.length === 0 && !loading && categoryFilter !== 'cloud' && (
        <Card className="p-12">
          <div className="text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">{tx({ de: "Keine Medien gefunden", en: "No media found", es: "No se encontraron medios" })}</p>
            <p className="text-sm text-muted-foreground mb-4">{tx({ de: "Laden Sie Ihre ersten Dateien hoch", en: "Upload your first files", es: "Sube tus primeros archivos" })}</p>
            <Button asChild>
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="h-4 w-4 mr-2" />
                {tx({ de: "Datei hochladen", en: "Upload file", es: "Subir archivo" })}
              </label>
            </Button>
          </div>
        </Card>
      )}
      </>)}
      </>)}

      {/* Video Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Video Preview</DialogTitle>
          {selectedVideo && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <video
                  src={selectedVideo}
                  controls
                  autoPlay
                  className="max-h-[70vh] w-auto rounded-lg"
                />
              </div>
              <Button
                className="w-full gap-2"
                onClick={() => {
                  const url = selectedVideo;
                  setEnhanceAsset(null);
                  setEnhanceSourceUrl(url);
                  setSelectedVideo(null);
                  if (user) {
                    void resolveAssetByUrl(url, user.id).then((resolved) => {
                      if (resolved) setEnhanceAsset(resolved);
                    });
                  }
                }}
              >
                <Sparkles className="h-4 w-4" />
                {tx({ de: 'Video verbessern', en: 'Enhance video', es: 'Mejorar vídeo' })}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Enhance dialog — same central engine as AI Video Studio */}
      <EnhanceVideoDialog
        open={!!enhanceSourceUrl}
        onOpenChange={(open) => { if (!open) { setEnhanceSourceUrl(null); setEnhanceAsset(null); } }}
        sourceAssetId={enhanceAsset?.assetId}
        sourceAssetType={enhanceAsset?.assetType}
        sourceUrl={enhanceSourceUrl ?? undefined}
        onCompleted={() => loadMedia()}
      />


      {/* Save to Album Dialog */}
      <SaveToAlbumDialog
        open={!!saveToAlbumImageId}
        onOpenChange={(open) => { if (!open) setSaveToAlbumImageId(null); }}
        imageId={saveToAlbumImageId || ''}
        onSaved={() => {
          setSaveToAlbumImageId(null);
          loadMedia();
        }}
      />
    </div>
    </TooltipProvider>
  );
}
