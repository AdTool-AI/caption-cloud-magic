import { isAwsTestBackend } from '@/lib/backendTarget';
import { CalendarDraftDrawer } from './CalendarDraftDrawer';
import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommentThread } from "./CommentThread";
import { TaskList } from "./TaskList";
import { ApprovalDialog } from "./ApprovalDialog";
import { ApprovalTimeline } from "./ApprovalTimeline";
import { Copy, Trash2, FileText, MessageSquare, CheckSquare, UserCheck } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { PostComposerPanel } from "./PostComposerPanel";
import { tx } from '@/lib/i18nText';
import { uiLocale } from '@/lib/uiLocale';

interface EventDrawerProps {
  workspaceId?: string | null;
  open: boolean;
  onClose: () => void;
  eventId: string | null;
  onDelete?: () => void;
  onUpdate?: () => void;
}

// Plattform-Akzente — passend zu PostChip „Lightsaber"-Look
const PLATFORM_BLADES: Record<string, { color: string; rgb: string }> = {
  instagram: { color: "#ec4899", rgb: "236,72,153" },
  facebook:  { color: "#1877f2", rgb: "24,119,242" },
  linkedin:  { color: "#22d3ee", rgb: "34,211,238" },
  tiktok:    { color: "#22d3ee", rgb: "34,211,238" },
  youtube:   { color: "#ef4444", rgb: "239,68,68" },
  x:         { color: "#cbd5e1", rgb: "203,213,225" },
};

const STATUS_META: Record<string, { label: string; dot: string; ring: string; pulse: boolean }> = {
  briefing:         { label: tx({ de: 'Entwurf', en: 'Draft', es: 'Borrador' }),         dot: "bg-zinc-300",    ring: "border-zinc-500/40", pulse: false },
  in_progress:      { label: tx({ de: 'In Arbeit', en: 'In progress', es: 'En progreso' }),       dot: "bg-cyan-300",    ring: "border-cyan-400/40", pulse: true  },
  review:           { label: tx({ de: 'Review', en: 'Review', es: 'Revisión' }),          dot: "bg-amber-300",   ring: "border-amber-400/40", pulse: false },
  pending_approval: { label: tx({ de: 'Freigabe offen', en: 'Pending approval', es: 'Aprobación pendiente' }),  dot: "bg-orange-300",  ring: "border-orange-400/40", pulse: true },
  approved:         { label: tx({ de: 'Freigegeben', en: 'Approved', es: 'Aprobado' }),     dot: "bg-emerald-300", ring: "border-emerald-400/40", pulse: false },
  scheduled:        { label: tx({ de: 'Geplant', en: 'Scheduled', es: 'Programado' }),         dot: "bg-indigo-300",  ring: "border-indigo-400/40", pulse: true  },
  published:        { label: tx({ de: 'Veröffentlicht', en: 'Published', es: 'Publicado' }),  dot: "bg-fuchsia-300", ring: "border-fuchsia-400/40", pulse: false },
};

export function EventDrawer(props: EventDrawerProps) {
  return isAwsTestBackend ? <CalendarDraftDrawer {...props} /> : <LegacyEventDrawer {...props} />;
}
function LegacyEventDrawer({ open, onClose, eventId, onDelete, onUpdate }: EventDrawerProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);

  useEffect(() => {
    if (eventId && open) fetchEvent();
  }, [eventId, open]);

  const fetchEvent = async () => {
    if (!eventId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("id", eventId)
      .single();
    if (error) {
      console.error("Failed to fetch event:", error);
      toast.error(t("calendar.drawer.loadFailed"));
    } else {
      setEvent(data);
    }
    setLoading(false);
  };

  const handleUpdate = async (field: string, value: any) => {
    if (!eventId) return;
    const { error } = await supabase
      .from("calendar_events")
      .update({ [field]: value } as any)
      .eq("id", eventId);
    if (error) {
      toast.error(t("calendar.drawer.updateFailed"));
    } else {
      setEvent({ ...event, [field]: value });
      onUpdate?.();
    }
  };

  const handlePatch = async (patch: Record<string, any>) => {
    if (!eventId) return;
    const { error } = await supabase
      .from("calendar_events")
      .update(patch as any)
      .eq("id", eventId);
    if (error) {
      toast.error(t("calendar.drawer.updateFailed"));
    } else {
      setEvent({ ...event, ...patch });
      onUpdate?.();
    }
  };

  const handleDuplicate = async () => {
    if (!event) return;
    const { title, brief, caption, channels, brand_kit_id, campaign_id, workspace_id } = event;
    const { error } = await supabase
      .from("calendar_events")
      .insert({
        workspace_id, brand_kit_id, campaign_id,
        title: `${title} (Copy)`, brief, caption, channels,
        status: "briefing",
      });
    if (error) toast.error(t("calendar.drawer.duplicateFailed"));
    else {
      toast.success(t("calendar.drawer.eventDuplicated"));
      onUpdate?.();
    }
  };

  const handleDelete = async () => {
    if (!eventId) return;
    const { error } = await supabase.from("calendar_events").delete().eq("id", eventId);
    if (error) toast.error(t("calendar.drawer.deleteFailed"));
    else {
      toast.success(t("calendar.drawer.eventDeleted"));
      onDelete?.();
      onClose();
    }
  };

  if (!event && !loading) return null;

  const primaryChannel: string = event?.channels?.[0] ?? "instagram";
  const blade = PLATFORM_BLADES[primaryChannel] ?? PLATFORM_BLADES.instagram;
  const status = STATUS_META[event?.status as string] ?? STATUS_META.briefing;

  const dateObj = event?.start_at ? new Date(event.start_at) : null;
  const dateStr = dateObj
    ? dateObj.toLocaleDateString(uiLocale(), { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    : "—";
  const timeStr = dateObj
    ? dateObj.toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent
          className="w-full sm:max-w-5xl overflow-y-auto p-0 border-l border-[hsl(var(--primary))]/15"
          style={{ background: "radial-gradient(120% 100% at 0% 0%, rgba(245,199,106,0.05), transparent 60%), #050816" }}
        >
          {/* Edler Glas-Header mit Lightsaber-Klinge */}
          <div
            className="relative px-6 py-5 border-b border-white/5 backdrop-blur-xl"
            style={{
              background: "linear-gradient(180deg, rgba(11,15,26,0.9) 0%, rgba(5,8,22,0.5) 100%)",
              boxShadow: `inset 2px 0 0 0 ${blade.color}, 0 0 24px -6px rgba(${blade.rgb},0.25)`,
            }}
          >
            <SheetHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--primary))]/70 font-semibold">
                      {tx({ de: "Post-Studio", en: "Post Studio", es: "Post-Studio" })}
                    </span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      {primaryChannel}
                    </span>
                  </div>
                  <SheetTitle className="text-2xl font-serif text-white truncate">
                    {event?.title || t("calendar.drawer.eventDetails")}
                  </SheetTitle>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                    <span className="font-mono tabular-nums text-[hsl(var(--primary))]/80">
                      {dateStr} · {timeStr}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider border bg-white/[0.03]",
                        status.ring,
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          status.dot,
                          status.pulse && "animate-pulse",
                        )}
                      />
                      {status.label}
                    </span>
                  </div>
                </div>
              </div>
            </SheetHeader>
          </div>

          <div className="px-6 py-5">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(var(--primary))]" />
              </div>
            ) : (
              <Tabs defaultValue="details">
                <TabsList
                  className={cn(
                    "grid w-full bg-[#0b0f1a]/60 border border-white/5 rounded-xl p-1",
                    isMobile ? "grid-cols-2 gap-1" : "grid-cols-4",
                  )}
                >
                  <TabsTrigger value="details" className="gap-2 data-[state=active]:bg-[hsl(var(--primary))]/15 data-[state=active]:text-[hsl(var(--primary))]">
                    <FileText className="w-4 h-4" />
                    {!isMobile && t("calendarDrawer.details")}
                  </TabsTrigger>
                  <TabsTrigger value="tasks" className="gap-2 data-[state=active]:bg-[hsl(var(--primary))]/15 data-[state=active]:text-[hsl(var(--primary))]">
                    <CheckSquare className="w-4 h-4" />
                    {!isMobile && t("calendarDrawer.tasks")}
                  </TabsTrigger>
                  <TabsTrigger value="comments" className="gap-2 data-[state=active]:bg-[hsl(var(--primary))]/15 data-[state=active]:text-[hsl(var(--primary))]">
                    <MessageSquare className="w-4 h-4" />
                    {!isMobile && t("calendarDrawer.comments")}
                  </TabsTrigger>
                  <TabsTrigger value="approval" className="gap-2 data-[state=active]:bg-[hsl(var(--primary))]/15 data-[state=active]:text-[hsl(var(--primary))]">
                    <UserCheck className="w-4 h-4" />
                    {!isMobile && t("calendarDrawer.approval")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-5">
                  <div className="space-y-4">
                    <Input
                      value={event?.title || ""}
                      onChange={(e) => setEvent({ ...event, title: e.target.value })}
                      onBlur={() => handleUpdate("title", event?.title)}
                      placeholder={t("calendarDrawer.title")}
                      className="text-lg font-serif bg-[#0b0f1a]/60 border-white/10 focus:border-[hsl(var(--primary))]/40 h-12"
                    />

                    <PostComposerPanel
                      event={event}
                      onUpdate={handleUpdate}
                      onPatch={handlePatch}
                    />

                    <div className="flex flex-wrap gap-2 pt-4 mt-2 border-t border-white/5">
                      <Button variant="outline" size="sm" onClick={handleDuplicate}
                        className="border-white/10 bg-white/[0.02] hover:bg-white/[0.05]">
                        <Copy className="w-3.5 h-3.5 mr-1.5" />
                        {t("calendar.drawer.duplicate")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setApprovalDialogOpen(true)}
                        className="border-white/10 bg-white/[0.02] hover:bg-white/[0.05]">
                        <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                        {t("calendar.drawer.requestApproval")}
                      </Button>
                      {onDelete && (
                        <Button variant="ghost" size="sm" onClick={handleDelete}
                          className="text-destructive hover:bg-destructive/10 ml-auto">
                          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                          {t("calendar.drawer.delete")}
                        </Button>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="tasks" className="mt-4">
                  {eventId && <TaskList eventId={eventId} />}
                </TabsContent>

                <TabsContent value="comments" className="mt-4">
                  {eventId && <CommentThread eventId={eventId} />}
                </TabsContent>

                <TabsContent value="approval" className="mt-4">
                  {eventId && <ApprovalTimeline event_id={eventId} />}
                  <div className="space-y-4 p-5 rounded-xl bg-[#0b0f1a]/60 border border-white/5">
                    <p className="text-sm text-muted-foreground">
                      {t("calendar.drawer.approvalDesc")}
                    </p>
                    <Button onClick={() => setApprovalDialogOpen(true)}
                      className="bg-[hsl(var(--primary))]/90 text-black hover:bg-[hsl(var(--primary))]">
                      <UserCheck className="w-4 h-4 mr-2" />
                      {t("calendar.drawer.createApprovalRequest")}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {eventId && (
        <ApprovalDialog
          eventId={eventId}
          open={approvalDialogOpen}
          onClose={() => setApprovalDialogOpen(false)}
        />
      )}
    </>
  );
}
