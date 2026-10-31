import { useAuth } from '@/hooks/useAuth';
import { usePlannerRequestScope, usePlannerScopedState } from '@/hooks/usePlannerRequestScope';
import { tx } from "@/lib/i18nText";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Image, Video, FileText, Sparkles, Calendar, FolderOpen, Upload } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useSearchParams, useNavigate } from "react-router-dom";

/**
 * Extrahiert Plattformen aus verschiedenen targets-Formaten
 * Handhabt: string[], {platforms: string[]}, null, undefined
 */
const extractPlatforms = (targets: any): string[] => {
  if (Array.isArray(targets)) {
    return targets.filter(p => typeof p === 'string');
  }
  
  if (targets && typeof targets === 'object') {
    if (Array.isArray(targets.platforms)) {
      return targets.platforms.filter(p => typeof p === 'string');
    }
    if (typeof targets.platforms === 'string') {
      return [targets.platforms];
    }
  }
  
  return [];
};

interface ContentLibraryProps {
  workspaceId: string;
  onContentSelect: (content: any) => void;
}

export function ContentLibrary({ workspaceId, onContentSelect }: ContentLibraryProps) {
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get("campaign_id");
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Query identity is UI response ownership, never backend authorization.
  const readScope = usePlannerRequestScope(user?.id, JSON.stringify([workspaceId, filter, search, campaignId]));
  const [items, setItems] = usePlannerScopedState<any[]>(readScope, () => []);
  const [loading, setLoading] = usePlannerScopedState(readScope, () => true);
  const [loadFailed, setLoadFailed] = usePlannerScopedState(readScope, () => false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    loadLibrary();
  }, [readScope, retry]);

  const loadLibrary = async () => {
    const canCommit = readScope.startRequest('library');
    if (!canCommit() || !workspaceId) return;
    setLoading(true); setLoadFailed(false); setItems([]);
    try {
      let allData: any[] = [];

      if (campaignId) {
        // When campaign filter is active, fetch campaign, AI, and media library content
        // Query 1: Campaign-specific content
        let campaignQuery = supabase
          .from("content_items")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("source", "campaign")
          .eq("source_id", campaignId);

        if (filter !== "all") {
          campaignQuery = campaignQuery.eq("type", filter);
        }

        if (search) {
          campaignQuery = campaignQuery.or(`title.ilike.%${search}%,caption.ilike.%${search}%`);
        }

        // Query 2: Media library content
        let mediaQuery = supabase
          .from("content_items")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("source", "media_library");

        if (filter !== "all") {
          mediaQuery = mediaQuery.eq("type", filter);
        }

        if (search) {
          mediaQuery = mediaQuery.or(`title.ilike.%${search}%,caption.ilike.%${search}%`);
        }

        // Query 3: AI-generated content
        let aiQuery = supabase
          .from("content_items")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("source", "ai");

        if (filter !== "all") {
          aiQuery = aiQuery.eq("type", filter);
        }

        if (search) {
          aiQuery = aiQuery.or(`title.ilike.%${search}%,caption.ilike.%${search}%`);
        }

        // Execute all three queries
        const [campaignResult, mediaResult, aiResult] = await Promise.all([
          campaignQuery.order("created_at", { ascending: false }),
          mediaQuery.order("created_at", { ascending: false }),
          aiQuery.order("created_at", { ascending: false })
        ]);

        if (!canCommit()) return;
        if ([campaignResult, mediaResult, aiResult].some(result => result.error || !Array.isArray(result.data))) throw new Error('LIBRARY_UNAVAILABLE');
        // Merge only complete successful results
        const campaignData = campaignResult.data || [];
        const mediaData = mediaResult.data || [];
        const aiData = aiResult.data || [];
        allData = [...campaignData, ...mediaData, ...aiData];
      } else {
        // Normal query without campaign filter
        let query = supabase
          .from("content_items")
          .select("*")
          .eq("workspace_id", workspaceId);

        if (filter !== "all") {
          query = query.eq("type", filter);
        }

        if (search) {
          query = query.or(`title.ilike.%${search}%,caption.ilike.%${search}%`);
        }

        const { data, error } = await query.order("created_at", { ascending: false });
        
        if (!canCommit()) return;
        if (error || !Array.isArray(data)) throw new Error('LIBRARY_UNAVAILABLE');
        allData = data;
      }

      if (!canCommit()) return;
      if (allData.some(row => row.workspace_id !== workspaceId)) throw new Error('LIBRARY_SCOPE_CHANGED');
      setItems(allData);
    } catch (error) {
      if (canCommit()) { setItems([]); setLoadFailed(true); }
    } finally {
      if (canCommit()) setLoading(false);
    }
  };

  return (
    <div className="w-80 border-r flex flex-col h-full bg-muted/30">
      <div className="p-4 border-b bg-background">
        <h2 className="text-lg font-semibold mb-3">
          Content Library
          {campaignId && (
            <Badge variant="secondary" className="ml-2 text-xs">
              Kampagne
            </Badge>
          )}
        </h2>

        <div className="relative mb-3">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={tx({ de: "Suchen...", en: "Search...", es: "Buscar..." })}
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all" className="text-xs">
              All
            </TabsTrigger>
            <TabsTrigger value="image" className="text-xs">
              <Image className="h-3 w-3" />
            </TabsTrigger>
            <TabsTrigger value="video" className="text-xs">
              <Video className="h-3 w-3" />
            </TabsTrigger>
            <TabsTrigger value="draft" className="text-xs">
              <FileText className="h-3 w-3" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center text-sm text-muted-foreground">{tx({ de: "Lädt...", en: "Loading...", es: "Cargando..." })}</div>
        ) : loadFailed ? (
          <div role="alert" className="space-y-2 text-sm">
            <p>{tx({ en: 'Content could not be loaded.', de: 'Inhalte konnten nicht geladen werden.', es: 'No se pudo cargar el contenido.' })}</p>
            <Button variant="outline" onClick={() => setRetry(value => value + 1)}>{tx({ en: 'Retry', de: 'Erneut versuchen', es: 'Reintentar' })}</Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyContentLibrary campaignFilter={!!campaignId} />
        ) : (
          items.map((item) => <DraggableContentItem key={item.id} item={item} onClick={() => onContentSelect(item)} />)
        )}
      </div>
    </div>
  );
}

function DraggableContentItem({ item, onClick }: { item: any; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `content-${item.id}`,
    data: { content: item },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <Card
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className="p-3 cursor-move hover:ring-2 hover:ring-primary transition-all"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        <div className="w-16 h-16 bg-muted rounded flex-shrink-0 flex items-center justify-center overflow-hidden">
          {item.thumb_url ? (
            <img src={item.thumb_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div>
              {item.type === "video" && <Video className="h-6 w-6 text-muted-foreground" />}
              {item.type === "image" && <Image className="h-6 w-6 text-muted-foreground" />}
              {item.type === "draft" && <FileText className="h-6 w-6 text-muted-foreground" />}
              {item.type === "text" && <FileText className="h-6 w-6 text-muted-foreground" />}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{item.title}</div>
          <div className="text-xs text-muted-foreground truncate mt-1">
            {item.caption?.substring(0, 50)}
            {item.caption?.length > 50 && "..."}
          </div>

          <div className="flex flex-wrap gap-1 mt-2">
            {extractPlatforms(item.targets).map((platform: string) => (
              <Badge key={platform} variant="secondary" className="text-xs">
                {platform}
              </Badge>
            ))}
            {item.source === "ai" && (
              <Badge variant="outline" className="text-xs">
                <Sparkles className="h-2 w-2 mr-1" />
                AI
              </Badge>
            )}
            {item.source === "campaign" && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Calendar className="h-3 w-3" />
                Kampagne
              </Badge>
            )}
            {item.source === "media_library" && (
              <Badge variant="outline" className="text-xs gap-1">
                <FolderOpen className="h-3 w-3" />
                Media Library
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function EmptyContentLibrary({ campaignFilter }: { campaignFilter: boolean }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="p-4 rounded-full bg-muted mb-4">
        <FolderOpen className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-sm mb-2">
        {campaignFilter ? tx({ de: tx({ de: "Keine Kampagnen-Inhalte", en: "No campaign content", es: "Sin contenido de campaña" }), en: "No campaign content", es: "Sin contenido de campaña" }) : tx({ de: "Keine Inhalte gefunden", en: "No content found", es: "No se encontró contenido" })}
      </h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">
        {campaignFilter 
          ? tx({ de: tx({ de: "Erstellen Sie Inhalte für diese Kampagne oder laden Sie Medien in die Mediathek hoch.", en: "Create content for this campaign or upload media to the library.", es: "Crea contenido para esta campaña o sube archivos a la mediateca." }), en: "Create content for this campaign or upload media to the media library.", es: "Crea contenido para esta campaña o sube medios a la biblioteca de medios." })
          : tx({ de: "Laden Sie Medien in die Mediathek hoch oder erstellen Sie Kampagnen, um Inhalte hier zu planen.", en: "Upload media to the media library or create campaigns to schedule content here.", es: "Sube medios a la biblioteca de medios o crea campañas para programar contenido aquí." })}
      </p>
      {!campaignFilter && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/media-library")}
          className="gap-2"
        >
          <Upload className="h-4 w-4" />
          {tx({ de: 'Zur Mediathek', en: 'Go to media library', es: 'Ir a la mediateca' })}
        </Button>
      )}
    </div>
  );
}
