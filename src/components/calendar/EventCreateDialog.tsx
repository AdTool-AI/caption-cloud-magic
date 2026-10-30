import { tx } from "@/lib/i18nText";
import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import { useCalendarApprovals } from "@/hooks/useCalendarApprovals";
import type { ApprovalRequest } from "@/hooks/useCalendarApprovals";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BestTimeSuggestions } from "@/components/calendar/BestTimeSuggestions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, ArrowLeft, ArrowRight, Save, Sparkles, Loader2, Video, CheckCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface EventCreateDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  clients: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; brand_name?: string }>;
  workspaceMembers: Array<{ user_id: string; profiles: { email: string } }>;
  prefillDate?: Date | null;
  prefillCaption?: string;
  prefillHashtags?: string[];
  prefillChannels?: string[];
  prefillStartDate?: Date;
  onSuccess: () => void;
}

const CHANNELS = ["Instagram", "TikTok", "LinkedIn", "Facebook", "Twitter", "YouTube"];
const STATUSES = [
  { value: "briefing", label: "Briefing" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
];

export function EventCreateDialog({
  open,
  onClose,
  workspaceId,
  clients,
  brands,
  workspaceMembers,
  prefillDate,
  prefillCaption,
  prefillHashtags,
  prefillChannels,
  prefillStartDate,
  onSuccess,
}: EventCreateDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { emit } = useEventEmitter();
  const isMobile = useIsMobile();

  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'de' | 'en' | 'es'>('de');

  // Step 1: Basics
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [brandId, setBrandId] = useState<string>("");
  const [campaignId, setCampaignId] = useState<string>("");

  // Step 2: Planning
  const [status, setStatus] = useState("briefing");
  const [selectedChannels, setSelectedChannels] = useState<string[]>(prefillChannels || []);
  const [startDate, setStartDate] = useState<Date | undefined>(
    prefillStartDate || prefillDate || undefined
  );
  const [startTime, setStartTime] = useState(() => {
    if (prefillStartDate) {
      return `${String(prefillStartDate.getHours()).padStart(2, "0")}:${String(
        prefillStartDate.getMinutes()
      ).padStart(2, "0")}`;
    }
    return "12:00";
  });
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [endTime, setEndTime] = useState("13:00");
  const [timezone, setTimezone] = useState("Europe/Berlin");

  // Step 3: Content
  const [caption, setCaption] = useState(prefillCaption || "");
  const [hashtags, setHashtags] = useState(
    prefillHashtags ? prefillHashtags.join(", ") : ""
  );
  const [tags, setTags] = useState("");

  // Step 4: Team
  const [ownerId, setOwnerId] = useState<string>(user?.id || "");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [etaMinutes, setEtaMinutes] = useState<number>(60);

  // Video Integration
  const [videoProjectId, setVideoProjectId] = useState<string>("");
  const [autoRender, setAutoRender] = useState(false);
  const [videoProjects, setVideoProjects] = useState<Array<{ id: string; project_name: string }>>([]);

  // Approval Workflow
  const [approvers, setApprovers] = useState<ApprovalRequest[]>([]);
  const [approverId, setApproverId] = useState("");

  const { requestApproval } = useCalendarApprovals();

  // Fetch video projects
  useEffect(() => {
    const fetchVideoProjects = async () => {
      const { data } = await supabase
        .from("content_projects")
        .select("id, project_name")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      
      if (data) setVideoProjects(data);
    };

    if (open && workspaceId) {
      fetchVideoProjects();
    }
  }, [open, workspaceId]);

  const toggleChannel = (channel: string) => {
    setSelectedChannels(prev =>
      prev.includes(channel)
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };

  const toggleAssignee = (userId: string) => {
    setAssignees(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const addApprover = () => {
    const member = workspaceMembers.find(row => row.user_id === approverId);
    if (!member || approvers.length >= 10 || approvers.some(row => row.user_id === member.user_id)) return;
    setApprovers(prev => [...prev, { user_id: member.user_id, email: member.profiles?.email || `Workspace member (${member.user_id.slice(-6)})` }]);
    setApproverId("");
  };
  const removeApprover = (id: string) => setApprovers(prev => prev.filter(row => row.user_id !== id));

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!title.trim()) {
          toast.error(t("calendar.create.titleRequired"));
          return false;
        }
        return true;
      case 2:
        if (selectedChannels.length === 0) {
          toast.error(t("calendar.create.channelRequired"));
          return false;
        }
        return true;
      case 3:
      case 4:
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSaveAsDraft = async () => {
    await handleSave("briefing");
  };

  const handleCreate = async () => {
    if (!validateStep(4)) return;
    await handleSave(status);
  };

  const handleSave = async (eventStatus: string) => {
    setSaving(true);

    try {
      const startDateTime = startDate
        ? new Date(`${format(startDate, "yyyy-MM-dd")}T${startTime}:00`)
        : null;
      const endDateTime = endDate
        ? new Date(`${format(endDate, "yyyy-MM-dd")}T${endTime}:00`)
        : null;

      const hashtagsArray = hashtags
        .split(",")
        .map(h => h.trim())
        .filter(Boolean);
      const tagsArray = tags
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);

      const eventData = {
        workspace_id: workspaceId,
        client_id: clientId || null,
        brand_kit_id: brandId || null,
        campaign_id: campaignId || null,
        title,
        brief: brief || null,
        caption: caption || null,
        channels: selectedChannels,
        status: eventStatus as any,
        start_at: startDateTime?.toISOString() || null,
        end_at: endDateTime?.toISOString() || null,
        timezone,
        owner_id: ownerId || null,
        assignees: assignees.length > 0 ? assignees : null,
        eta_minutes: etaMinutes || null,
        hashtags: hashtagsArray.length > 0 ? hashtagsArray : null,
        tags: tagsArray.length > 0 ? tagsArray : null,
        created_by: user?.id,
        video_project_id: videoProjectId || null,
        auto_render: autoRender,
      };

      const { data: createdEvent, error } = await supabase
        .from("calendar_events")
        .insert([eventData])
        .select()
        .single();

      if (error || !createdEvent) {
        console.error("Event creation error:", error);
        toast.error(t("calendar.create.eventCreationFailed"));
        return;
      }

      // Request approvals if any approvers were added
      if (approvers.length > 0) {
        const receipt = await requestApproval(createdEvent, approvers, new Date(Date.now() + 3 * 86400000).toISOString());
        if (!receipt) {
          // Event creation already committed. Do not retry insertion or claim review success.
          toast.warning('Event created; the review request is not confirmed. Open the event to check its review history.');
          onSuccess(); onClose();
          return;
        }
      }

      // Track first post scheduled
      trackEvent(ANALYTICS_EVENTS.FIRST_POST_SCHEDULED, {
        platform: selectedChannels[0] || 'unknown',
        from_generator: !!prefillCaption,
        has_tags: tagsArray.length > 0,
        status: eventStatus,
        channels_count: selectedChannels.length
      });

      await emit(
        {
          event_type: "calendar.post.scheduled",
          source: "calendar_create",
          payload: { workspace_id: workspaceId, title },
        },
        { silent: true }
      );

      toast.success(t("calendar.create.eventCreated"));
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Save error:", error);
      toast.error(t("calendar.create.eventCreationFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateCaption = async () => {
    if (!title) {
      toast.error(t("calendarEventCreate.titleRequired"));
      return;
    }
    
    if (selectedChannels.length === 0) {
      toast.error(t("calendarEventCreate.channelRequired"));
      return;
    }

    setIsGeneratingCaption(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      let tone = "professional";
      if (brandId) {
        const { data: brandKit } = await supabase
          .from("brand_kits")
          .select("brand_tone")
          .eq("id", brandId)
          .single();
        
        if (brandKit?.brand_tone) {
          tone = brandKit.brand_tone;
        }
      }

      const platformMapping: Record<string, string> = {
        "Instagram": "instagram",
        "Facebook": "facebook",
        "LinkedIn": "linkedin",
        "Twitter": "twitter",
        "TikTok": "tiktok",
        "YouTube": "youtube"
      };
      
      const platform = platformMapping[selectedChannels[0]] || "instagram";

      let topic = title;
      if (brief) {
        topic += ` - ${brief}`;
      }

      const language = selectedLanguage;

      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: {
          topic: topic.slice(0, 200),
          tone,
          platform,
          language
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;

      setCaption(data.caption);
      setHashtags(data.hashtags.join(", "));

      toast.success(tx({ de: "✨ Caption erfolgreich generiert!", en: "✨ Caption successfully generated!", es: "✨ ¡Subtítulo generado exitosamente!" }));

    } catch (error: any) {
      console.error("Caption generation error:", error);
      toast.error(error.message || tx({ de: "Caption-Generierung fehlgeschlagen", en: "Caption generation failed", es: "Falló la generación de subtítulos" }));
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">{t("calendar.create.eventTitle")} *</Label>
              <Input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t("calendar.create.eventTitle")}
              />
            </div>

            <div>
              <Label htmlFor="brief">{t("calendar.create.eventBrief")}</Label>
              <Textarea
                id="brief"
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder={t("calendar.create.eventBrief")}
                rows={4}
              />
            </div>

            <div>
              <Label htmlFor="client">{t("calendar.create.selectClient")}</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger id="client">
                  <SelectValue placeholder={t("calendar.create.selectClient")} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="brand">{t("calendar.create.selectBrand")}</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger id="brand">
                  <SelectValue placeholder={t("calendar.create.selectBrand")} />
                </SelectTrigger>
                <SelectContent>
                  {brands.map(brand => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.brand_name || "Unnamed Brand"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="status">{t("calendar.create.selectStatus")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t("calendar.create.selectChannels")} *</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {CHANNELS.map(channel => (
                  <Button
                    key={channel}
                    type="button"
                    variant={selectedChannels.includes(channel) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleChannel(channel)}
                  >
                    {channel}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="startDate">{t("calendar.create.startDateTime")}</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal flex-1",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-32"
                />
              </div>
              <BestTimeSuggestions
                className="mt-2"
                channels={selectedChannels}
                onPick={(date) => {
                  setStartDate(date);
                  setStartTime(format(date, "HH:mm"));
                }}
              />
            </div>

            <div>
              <Label htmlFor="endDate">{t("calendar.create.endDateTime")}</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal flex-1",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="timezone">{t("calendar.create.timezone")}</Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">{tx({ de: "Sprache:", en: "Language:", es: "Idioma:" })}</Label>
                <Select
                  value={selectedLanguage}
                  onValueChange={(value: 'de' | 'en' | 'es') => setSelectedLanguage(value)}
                >
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="de">
                      <span className="flex items-center gap-2">
                        🇩🇪 Deutsch
                      </span>
                    </SelectItem>
                    <SelectItem value="en">
                      <span className="flex items-center gap-2">
                        🇬🇧 English
                      </span>
                    </SelectItem>
                    <SelectItem value="es">
                      <span className="flex items-center gap-2">
                        🇪🇸 Español
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateCaption}
                disabled={isGeneratingCaption || !title || selectedChannels.length === 0}
                className="gap-2"
              >
                {isGeneratingCaption ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tx({ de: 'Generiere...', en: 'Generating...', es: 'Generando...' })}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {tx({ de: "Caption mit AI generieren", en: "Generate Caption with AI", es: "Generar pie de foto con IA" })}
                  </>
                )}
              </Button>
            </div>

            <div>
              <Label htmlFor="caption">{t("calendar.create.caption")}</Label>
              <Textarea
                id="caption"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder={t("calendar.create.caption")}
                rows={6}
              />
              <p className="text-sm text-muted-foreground mt-1">
                {caption.length} characters
              </p>
            </div>

            <div>
              <Label htmlFor="hashtags">{t("calendar.create.hashtags")}</Label>
              <Input
                id="hashtags"
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
                placeholder="#marketing, #socialmedia"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Separate with commas
              </p>
            </div>

            <div>
              <Label htmlFor="tags">{t("calendar.create.tags")}</Label>
              <Input
                id="tags"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="promo, sale, announcement"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Separate with commas
              </p>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            {/* Team Section */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Team & Workflow</h4>
              
              <div>
                <Label htmlFor="owner">{t("calendar.create.selectOwner")}</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger id="owner">
                    <SelectValue placeholder={t("calendar.create.selectOwner")} />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaceMembers.map(member => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.profiles.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t("calendar.create.selectAssignees")}</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {workspaceMembers.map(member => (
                    <Button
                      key={member.user_id}
                      type="button"
                      variant={assignees.includes(member.user_id) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleAssignee(member.user_id)}
                    >
                      {member.profiles.email}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="eta">{t("calendar.create.estimatedMinutes")}</Label>
                <Input
                  id="eta"
                  type="number"
                  value={etaMinutes}
                  onChange={e => setEtaMinutes(parseInt(e.target.value) || 0)}
                  min={0}
                />
              </div>
            </div>

            {/* Video Integration Section */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                <h4 className="font-medium text-sm">Video Integration</h4>
              </div>
              
              <div>
                <Label htmlFor="videoProject">{tx({ de: "Video Projekt verknüpfen", en: "Link Video Project", es: "Vincular Proyecto de Video" })}</Label>
                <Select value={videoProjectId} onValueChange={setVideoProjectId}>
                  <SelectTrigger id="videoProject">
                    <SelectValue placeholder={tx({ de: "Video Projekt auswählen (optional)", en: "Select video project (optional)", es: "Seleccionar proyecto de vídeo (opcional)" })} />
                  </SelectTrigger>
                  <SelectContent>
                    {videoProjects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.project_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {videoProjectId && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="autoRender">Automatisches Rendering</Label>
                  <Switch
                    id="autoRender"
                    checked={autoRender}
                    onCheckedChange={setAutoRender}
                  />
                </div>
              )}
            </div>

            {/* Approval Workflow Section */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                <h4 className="font-medium text-sm">Approval Workflow</h4>
              </div>
              
              <div className="space-y-2">
                <Label>{tx({ de: "Approver hinzufügen", en: "Add Approver", es: "Agregar aprobador" })}</Label>
                <div className="flex gap-2">
                  <Select value={approverId} onValueChange={setApproverId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Choose a workspace member" /></SelectTrigger>
                    <SelectContent>{workspaceMembers.map(member => <SelectItem key={member.user_id} value={member.user_id}>
                      {member.profiles?.email || `Workspace member (${member.user_id.slice(-6)})`}
                    </SelectItem>)}</SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addApprover}
                    disabled={!approverId || approvers.length >= 10}
                  >
                    Add
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">Workspace reviewers sign in to decide. Requests expire after three days; no email or publishing is triggered.</p>

              {approvers.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Approvers:</Label>
                  {approvers.map((approver, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-muted rounded-md"
                    >
                      <div className="text-sm">
                        <span className="font-medium">{approver.email}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeApprover(approver.user_id)}
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const dialogContent = (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{t("calendar.create.title")}</h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={currentStep >= 1 ? "text-primary font-medium" : ""}>
            1
          </span>
          <span>→</span>
          <span className={currentStep >= 2 ? "text-primary font-medium" : ""}>
            2
          </span>
          <span>→</span>
          <span className={currentStep >= 3 ? "text-primary font-medium" : ""}>
            3
          </span>
          <span>→</span>
          <span className={currentStep >= 4 ? "text-primary font-medium" : ""}>
            4
          </span>
        </div>
      </div>

      <div className="py-6">{renderStepContent()}</div>

      <div className="flex justify-between items-center pt-4 border-t">
        <div>
          {currentStep > 1 && (
            <Button variant="outline" onClick={handleBack} disabled={saving}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("calendar.create.back")}
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={handleSaveAsDraft}
            disabled={saving}
          >
            <Save className="mr-2 h-4 w-4" />
            {t("calendar.create.saveAsDraft")}
          </Button>

          {currentStep < 4 ? (
            <Button onClick={handleNext} disabled={saving}>
              {t("calendar.create.next")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? t("calendar.messages.saving") : t("calendar.create.createEvent")}
            </Button>
          )}
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("calendar.create.title")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{dialogContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("calendar.create.title")}</DialogTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
            <span className={currentStep >= 1 ? "text-primary font-medium" : ""}>
              1. {t("calendar.create.stepBasics")}
            </span>
            <span>→</span>
            <span className={currentStep >= 2 ? "text-primary font-medium" : ""}>
              2. {t("calendar.create.stepPlanning")}
            </span>
            <span>→</span>
            <span className={currentStep >= 3 ? "text-primary font-medium" : ""}>
              3. {t("calendar.create.stepContent")}
            </span>
            <span>→</span>
            <span className={currentStep >= 4 ? "text-primary font-medium" : ""}>
              4. {t("calendar.create.stepTeam")}
            </span>
          </div>
        </DialogHeader>

        <div className="py-6">{renderStepContent()}</div>

        <div className="flex justify-between items-center pt-4 border-t">
          <div>
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack} disabled={saving}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("calendar.create.back")}
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={handleSaveAsDraft}
              disabled={saving}
            >
              <Save className="mr-2 h-4 w-4" />
              {t("calendar.create.saveAsDraft")}
            </Button>

            {currentStep < 4 ? (
              <Button onClick={handleNext} disabled={saving}>
                {t("calendar.create.next")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? t("calendar.messages.saving") : t("calendar.create.createEvent")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
