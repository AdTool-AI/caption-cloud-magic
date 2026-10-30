import { PlannerRecommendationsDialog } from '@/components/planner/PlannerRecommendationsDialog';
import { useState, useEffect, useRef } from "react";
import { createPlannerBlockWriter, PlannerBlockSaveError } from "@/lib/plannerBlockWrite";
import { plannerCreateRequestId } from "@/lib/plannerWriteRequest";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Footer } from "@/components/Footer";
import { WeekGrid } from "@/components/planner/WeekGrid";
import { ContentLibrary } from "@/components/planner/ContentLibrary";
import { PlannerToolbar } from "@/components/planner/PlannerToolbar";
import { InspectorDrawer } from "@/components/planner/InspectorDrawer";
import { AIRecommendationsOverlay } from "@/components/planner/AIRecommendationsOverlay";
import { TimePickerDialog } from "@/components/planner/TimePickerDialog";
import { usePlannerShortcuts } from "@/hooks/usePlannerShortcuts";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { PlannerV2 } from "@/components/planner/PlannerV2";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "react-router-dom";
import { DndContext, DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { useUserBehavior } from '@/hooks/useUserBehavior';
import { tx } from "@/lib/i18nText";

export default function Planner() {
  const { user } = useAuth();
  const initialPlanRequests = useRef(new Map<string, string>());
  const blockWriter = useRef(createPlannerBlockWriter());
  const newPlannerUI = useFeatureFlag("enable_new_planner_ui");
  const { trackProjectCreate } = useUserBehavior();
  const [weekplan, setWeekplan] = useState<any>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([]);
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [aiOverlayVisible, setAiOverlayVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [brandKitId, setBrandKitId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ date: Date; content: any } | null>(null);
  const [postsPerDay, setPostsPerDay] = useState<Record<string, { scheduled: number; approved: number }>>({});

  useEffect(() => { blockWriter.current.clear(); }, [user?.id, workspaceId, weekplan?.id]);

  useEffect(() => {
    if (user) {
      loadUserWorkspace();
    }
  }, [user]);

  useEffect(() => {
    if (workspaceId) {
      loadOrCreateWeekplan();
    }
  }, [workspaceId]);

  const loadUserWorkspace = async () => {
    // Timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.error("Workspace load timeout");
      setError(tx({ de: "Laden dauert zu lange. Bitte Seite neu laden.", en: "Loading takes too long. Please reload the page.", es: "La carga tarda demasiado. Por favor recarga la página." }));
      setLoading(false);
    }, 10000);

    try {
      // Use array query instead of maybeSingle for better performance
      const { data: memberships, error } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user?.id)
        .limit(1);

      if (error) {
        console.error("Workspace load error:", error);
        clearTimeout(timeoutId);
        toast.error(tx({ de: "Fehler beim Laden des Workspace", en: "Failed to load workspace", es: "Error al cargar el workspace" }));
        setError(tx({ de: "Workspace konnte nicht geladen werden", en: "Workspace could not be loaded", es: "No se pudo cargar el workspace" }));
        setLoading(false);
        return;
      }

      if (!memberships || memberships.length === 0) {
        console.log("No workspace found, creating default workspace");
        clearTimeout(timeoutId);
        await createDefaultWorkspace();
        return;
      }

      clearTimeout(timeoutId);
      setWorkspaceId(memberships[0].workspace_id);
      
      // Load active brand kit in parallel (non-blocking)
      supabase
        .from("brand_kits")
        .select("id")
        .eq("user_id", user?.id)
        .eq("is_active", true)
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setBrandKitId(data[0].id);
          }
        });
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("Unexpected error loading workspace:", error);
      toast.error(tx({ de: "Unerwarteter Fehler: ", en: "Unexpected error:", es: "Error inesperado:" }) + error.message);
      setError(tx({ de: "Ein unerwarteter Fehler ist aufgetreten", en: "An unexpected error occurred", es: "Se ha producido un error inesperado" }));
      setLoading(false);
    }
  };

  const createDefaultWorkspace = async () => {
    try {
      console.log("Creating default workspace for user");
      
      const { data: newWorkspace, error } = await supabase
        .from("workspaces")
        .insert({
          name: tx({ de: "Mein Workspace", en: "My Workspace", es: "Mi espacio de trabajo" }),
          owner_id: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from("workspace_members")
        .insert({
          workspace_id: newWorkspace.id,
          user_id: user?.id,
          role: "owner",
        });

      setWorkspaceId(newWorkspace.id);
      toast.success(tx({ de: "Workspace erstellt", en: "Workspace created", es: "Espacio de trabajo creado" }));
    } catch (error: any) {
      console.error("Error creating workspace:", error);
      toast.error(tx({ de: "Fehler beim Erstellen des Workspace", en: "Failed to create workspace", es: "Error al crear el workspace" }));
      setError(tx({ de: "Workspace konnte nicht erstellt werden", en: "Workspace could not be created", es: "No se pudo crear el workspace" }));
      setLoading(false);
    }
  };

  const loadOrCreateWeekplan = async () => {
    setLoading(true);
    try {
      // Try to load the most recent weekplan
      const { data: plans } = await supabase
        .from("weekplans")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (plans && plans.length > 0) {
        setWeekplan(plans[0]);
        loadBlocks(plans[0].id);
      } else {
        // Create a default 2-week plan
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);

        console.log("Creating new weekplan for workspace:", workspaceId);

        if (!user?.id) throw new Error('UNAUTHORIZED');
        const createBody = {
          workspace_id: workspaceId,
          name: tx({ de: "Mein Content Plan", en: "My Content Plan", es: "Mi plan de contenido" }),
          start_date: startDate.toISOString().split("T")[0],
          weeks: 2,
          timezone: "Europe/Berlin",
          default_platforms: ["Instagram", "Facebook"],
        };
        const { data, error } = await supabase.functions.invoke("planner-upsert-weekplan", {
          body: { ...createBody, request_id: plannerCreateRequestId(initialPlanRequests.current, user.id, workspaceId, createBody) },
        });

        // A failed/unknown backend result must never fall back to an untracked direct insert.
        if (error) throw error;
        if (data) {
          console.log("Weekplan created via edge function:", data.id);
          setWeekplan(data);
          setBlocks([]);
          toast.success(tx({ de: "Content Plan erstellt", en: "Content Plan created", es: "Plan de contenido creado" }));
        }
      }
    } catch (error: any) {
      console.error("Error loading/creating weekplan:", error);
      toast.error(tx({ de: "Fehler beim Laden des Plans: ", en: "Failed to load plan: ", es: "Error al cargar el plan: " }) + (error.message || tx({ de: "Unbekannter Fehler", en: "Unknown error", es: "Error desconocido" })));
    } finally {
      setLoading(false);
    }
  };

  const loadBlocks = async (weekplanId: string) => {
    const { data } = await supabase
      .from("schedule_blocks")
      .select("*, content_items(*)")
      .eq("weekplan_id", weekplanId)
      .order("start_at", { ascending: true });

    if (data) {
      setBlocks(data);
      
      // Calculate posts per day for mini calendar
      const perDay: Record<string, { scheduled: number; approved: number }> = {};
      data.forEach((block) => {
        const dateKey = format(new Date(block.start_at), "yyyy-MM-dd");
        if (!perDay[dateKey]) {
          perDay[dateKey] = { scheduled: 0, approved: 0 };
        }
        if (block.status === "scheduled" || block.status === "draft") {
          perDay[dateKey].scheduled++;
        } else if (block.status === "approved" || block.status === "queued") {
          perDay[dateKey].approved++;
        }
      });
      setPostsPerDay(perDay);
    }
  };

  const saveDraftBlocks = async (items: any[]) => {
    if (!user || !workspaceId || !weekplan) throw new PlannerBlockSaveError("INVALID_BLOCK_SCOPE");
    return blockWriter.current.save(user.id, workspaceId, items,
      body => supabase.functions.invoke("planner-upsert-blocks", { body }), weekplan.id);
  };

  const showBlockSaveError = (error: unknown) => {
    const code = error instanceof PlannerBlockSaveError ? error.code : "BLOCK_SAVE_FAILED";
    if (code === "SAVE_SCOPE_CHANGED") return;
    toast.error(code === "STALE_WRITE_RETRY_REQUIRED" || code === "REQUEST_ID_REUSED"
      ? tx({ de: "Dieser Entwurf wurde geändert. Bitte neu laden und erneut speichern.", en: "This draft changed. Reload it before saving again.", es: "Este borrador cambió. Vuelve a cargarlo antes de guardar." })
      : code === "DRAFT_EDIT_REQUIRED"
        ? tx({ de: "Hier können nur Entwürfe bearbeitet werden.", en: "Only drafts can be edited here.", es: "Aquí solo se pueden editar borradores." })
        : tx({ de: "Fehler beim Speichern", en: "Failed to save", es: "Error al guardar" }));
  };

  const handleBlockDrop = async (blockData: any) => {
    if (!weekplan || !workspaceId || !user) return;
    try {
      await saveDraftBlocks([blockData]);
      if (!blockData.id) trackProjectCreate('post', weekplan.id);
      await loadBlocks(weekplan.id);
      toast.success(tx({ de: "Entwurf gespeichert", en: "Draft saved", es: "Borrador guardado" }));
    } catch (error) { showBlockSaveError(error); }
  };

  const handleBlockSave = async (updatedBlock: any) => {
    if (!weekplan || !workspaceId || !user) return;
    try {
      await saveDraftBlocks([updatedBlock]);
      await loadBlocks(weekplan.id);
      setSelectedBlock(current => current?.id === updatedBlock.id ? null : current);
      toast.success(tx({ de: "Änderungen gespeichert", en: "Changes saved", es: "Cambios guardados" }));
    } catch (error) { showBlockSaveError(error); }
  };

  const handleBlockDelete = async (blockId: string) => {
    if (!workspaceId || !weekplan) return;

    const loadingToast = toast.loading(tx({ de: "Lösche Post...", en: "Deleting post...", es: "Eliminando publicación..." }));

    try {
      const { error } = await supabase
        .from("schedule_blocks")
        .delete()
        .eq("id", blockId)
        .eq("workspace_id", workspaceId);

      if (error) {
        console.error("Delete error:", error);
        toast.error(tx({ de: "Fehler beim Löschen: ", en: "Failed to delete: ", es: "Error al eliminar: " }) + error.message, { id: loadingToast });
        return;
      }

      await loadBlocks(weekplan.id);
      setSelectedBlock(null);
      toast.success(tx({ de: "Post wurde gelöscht", en: "Post deleted", es: "Publicación eliminada" }), { id: loadingToast });
    } catch (error: any) {
      console.error("Unexpected error:", error);
      toast.error(tx({ de: "Unerwarteter Fehler: ", en: "Unexpected error:", es: "Error inesperado:" }) + error.message, { id: loadingToast });
    }
  };

  const handleWeeksChange = async (weeks: number) => {
    if (!weekplan || !workspaceId) return;

    const { data, error } = await supabase.functions.invoke("planner-upsert-weekplan", {
      body: {
        request_id: crypto.randomUUID(),
        expected_updated_at: weekplan.updated_at,
        id: weekplan.id,
        workspace_id: workspaceId,
        name: weekplan.name,
        start_date: weekplan.start_date,
        weeks,
        timezone: weekplan.timezone,
        default_platforms: weekplan.default_platforms,
      },
    });

    if (error) {
      toast.error(tx({ de: "Fehler beim Aktualisieren", en: "Failed to update", es: "Error al actualizar" }));
      return;
    }

    if (data) {
      setWeekplan(data);
      toast.success(tx({ de: "Zeitraum aktualisiert", en: "Period updated", es: "Período actualizado" }));
    }
  };

  const handleApprove = async (blockIds?: string[]) => {
    if (!weekplan || !workspaceId) return;

    const idsToApprove = blockIds || blocks
      .filter(b => b.status === "draft" || b.status === "scheduled")
      .map(b => b.id);

    if (idsToApprove.length === 0) {
      toast.info(tx({ de: "Keine Posts zum Genehmigen", en: "No posts to approve", es: "No hay publicaciones para aprobar" }));
      return;
    }

    const { data, error } = await supabase.functions.invoke("planner-approve", {
      body: {
        workspace_id: workspaceId,
        weekplan_id: weekplan.id,
        block_ids: idsToApprove,
        create_jobs: true,
      },
    });

    if (error) {
      toast.error(tx({ de: "Fehler beim Genehmigen", en: "Approval failed", es: "Error al aprobar" }));
      return;
    }

    loadBlocks(weekplan.id);
    toast.success(`${data.approved_blocks} Posts genehmigt & in Warteschlange`);
  };

  const handleApplyRecommendations = () => {
    if (workspaceId && weekplan) setRecommendationOpen(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const dropData = over.data.current as any;
    const dragData = active.data.current as any;

    if (dropData?.date && dragData?.content) {
      // Open time picker for new content
      setPendingDrop({
        date: new Date(dropData.date),
        content: dragData.content,
      });
    } else if (dropData?.date && dragData?.block) {
      // Moving existing block
      const dropDate = new Date(dropData.date);
      
      // Wenn hour vorhanden (HourSlot), diese verwenden
      // Sonst originale Zeit beibehalten
      if (dropData.hour !== undefined) {
        dropDate.setHours(dropData.hour, 0, 0, 0);
      } else {
        const originalTime = new Date(dragData.block.start_at);
        dropDate.setHours(originalTime.getHours(), originalTime.getMinutes(), 0, 0);
      }

      const duration = new Date(dragData.block.end_at).getTime() - new Date(dragData.block.start_at).getTime();
      const endDate = new Date(dropDate.getTime() + duration);

      handleBlockDrop({
        ...dragData.block,
        start_at: dropDate.toISOString(),
        end_at: endDate.toISOString(),
      });
    }
  };

  const handleTimeConfirm = (hour: number, minute: number) => {
    if (!pendingDrop || !weekplan) return;

    const { date, content } = pendingDrop;
    const dropDate = new Date(date);
    dropDate.setHours(hour, minute, 0, 0);

    const duration = content.duration_sec || 3600;
    const endDate = new Date(dropDate.getTime() + duration * 1000);

    const blockData = {
      weekplan_id: weekplan.id,
      content_id: content.id,
      platform: content.targets?.[0] || "Instagram",
      start_at: dropDate.toISOString(),
      end_at: endDate.toISOString(),
      status: "draft",
    };

    handleBlockDrop(blockData);
    setPendingDrop(null);
  };

  const handleApplyAISlots = (timeline: any[]) => {
    setRecommendations(timeline);
    toast.success(tx({ de: "AI-Empfehlungen geladen - Nutzen Sie Smart Snap beim Verschieben", en: "AI recommendations loaded - Use Smart Snap when moving", es: "Recomendaciones de IA cargadas: use Smart Snap cuando se mueva" }));
  };

  const scrollToDate = (date: Date) => {
    toast.info(tx({ de: `Springe zu ${format(date, "dd.MM.yyyy")}`, en: `Jumping to ${format(date, "dd.MM.yyyy")}`, es: `Saltando a ${format(date, "dd.MM.yyyy")}` }));
  };

  // Keyboard shortcuts
  usePlannerShortcuts({
    onApprove: () => {
      if (selectedBlocks.length > 0) {
        handleApprove(selectedBlocks);
      } else {
        handleApprove();
      }
    },
    onSetDraft: () => {
      if (selectedBlock) {
        handleBlockSave({ ...selectedBlock, status: "draft" });
      }
    },
    onDelete: () => {
      if (selectedBlock) {
        handleBlockDelete(selectedBlock.id);
      }
    },
  }, !pendingDrop);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {!workspaceId ? tx({ de: tx({ de: "Workspace wird geladen...", en: "Loading workspace...", es: "Cargando el espacio de trabajo..." }), en: "Loading workspace...", es: "Cargando workspace..." }) : tx({ de: "Wochenplan wird erstellt...", en: "Building weekly plan...", es: "Creando el plan semanal..." })}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-destructive font-medium">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline">
          {tx({ de: "Neu laden", en: "Reload", es: "Recargar" })}
        </Button>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{tx({ de: "Kein Workspace gefunden", en: "No workspace found", es: "No se encontró ningún espacio de trabajo" })}</p>
        <Button onClick={() => window.location.reload()} variant="outline">
          {tx({ de: "Neu laden", en: "Reload", es: "Recargar" })}
        </Button>
      </div>
    );
  }

  // Show new UI if feature flag is enabled
  if (newPlannerUI) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="container mx-auto px-4 py-8">
          <PlannerV2 />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <DndContext onDragStart={(e) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Library */}
          <ContentLibrary
            workspaceId={workspaceId}
            onContentSelect={(content) => {
              // Handle content selection for drag
              console.log("Content selected:", content);
            }}
          />

          {/* Main Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <PlannerToolbar
              weekplan={weekplan}
              postsPerDay={postsPerDay}
              onWeeksChange={handleWeeksChange}
              onApprove={() => handleApprove()}
              onApplyRecommendations={handleApplyRecommendations}
              onDateClick={scrollToDate}
            />

            {/* Week Grid with AI Overlay */}
            <div className="relative flex-1 overflow-hidden">
              <WeekGrid
                weeks={weekplan?.weeks || 2}
                startDate={weekplan?.start_date || new Date().toISOString()}
                blocks={blocks}
                recommendations={recommendations}
                onBlockClick={setSelectedBlock}
                onBlockSave={handleBlockSave}
                workspaceId={workspaceId}
                weekplanId={weekplan?.id}
              />

              {/* AI Recommendations Overlay */}
              <AIRecommendationsOverlay
                workspaceId={workspaceId}
                brandKitId={brandKitId}
                platform="Instagram"
                startDate={weekplan?.start_date || new Date().toISOString()}
                weeks={weekplan?.weeks || 2}
                visible={aiOverlayVisible}
                onToggle={() => setAiOverlayVisible(!aiOverlayVisible)}
                onApplySlots={handleApplyAISlots}
              />
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeId ? (
            <Card className="p-2 bg-primary text-primary-foreground opacity-80">
              <div className="text-xs font-semibold">{tx({ de: 'Verschieben …', en: 'Moving …', es: 'Moviendo …' })}</div>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Right Drawer: Inspector */}
      <InspectorDrawer
        block={selectedBlock}
        allBlocks={blocks}
        aiRecommendations={recommendations}
        onSave={handleBlockSave}
        onDelete={handleBlockDelete}
        onApprove={handleApprove}
        onClose={() => setSelectedBlock(null)}
      />

      <TimePickerDialog
        open={!!pendingDrop}
        date={pendingDrop?.date || null}
        content={pendingDrop?.content}
        onConfirm={handleTimeConfirm}
        onCancel={() => setPendingDrop(null)}
      />

      <PlannerRecommendationsDialog open={recommendationOpen} onOpenChange={setRecommendationOpen}
        workspaceId={workspaceId} weekplanId={weekplan?.id}
        onApplied={() => { if (weekplan?.id) void loadBlocks(weekplan.id); }} />

      <Footer />
    </div>
  );
}
