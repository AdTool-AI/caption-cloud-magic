import { usePlannerRequestScope, usePlannerScopedState } from '@/hooks/usePlannerRequestScope';
import { PlannerRecommendationsDialog } from './PlannerRecommendationsDialog';
import { createPlannerBlockWriter, PlannerBlockSaveError } from "@/lib/plannerBlockWrite";
import { Card } from "@/components/ui/card";
import { tx } from "@/lib/i18nText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { usePlannerHandoff } from "@/hooks/usePlannerHandoff";
import { PlannerHandoffError } from "@/lib/plannerHandoff";
import { plannerHandoffErrorText } from "@/lib/plannerHandoffText";
import { 
  Calendar, 
  Clock, 
  Plus, 
  Sparkles,
  LayoutGrid,
  List,
  Filter,
  SortAsc,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  X,
  Send,
  CheckSquare,
  Package,
  FileText
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignTab } from "./CampaignTab";
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { de, enUS, es } from "date-fns/locale";

interface PlannerV2Props {
  className?: string;
  /** Eingebettet im Content Command Center: eigene Kopfzeile und Tabs entfallen. */
  embedded?: boolean;
  /** Erzwingt eine Ansicht (Beiträge oder Kampagnen) im eingebetteten Modus. */
  forcedTab?: "posts" | "campaigns";
}

interface ScheduledPost {
  id: string;
  title_override: string | null;
  caption_override: string | null;
  platform: string;
  start_at: string;
  end_at: string;
  status: string;
  content_id: string | null;
  workspace_id: string;
  weekplan_id: string;
  updated_at: string | null;
  meta?: unknown;
  content_items?: {
    id: string;
    updated_at: string | null;
    media_id?: string | null;
    title: string;
    caption?: string | null;
    thumb_url?: string | null;
  } | null;
}

type SortOption = "date-asc" | "date-desc" | "platform" | "status";
type FilterPlatform = "all" | "instagram" | "tiktok" | "linkedin" | "youtube" | "twitter";
type FilterStatus = "all" | "draft" | "scheduled" | "approved" | "queued" | "published";

const localeMap = { en: enUS, de, es } as const;

export function PlannerV2({ className, embedded, forcedTab }: PlannerV2Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = forcedTab ?? (searchParams.get('tab') === 'campaigns' ? 'campaigns' : 'posts');
  const initialOpenTemplates = searchParams.get('newCampaign') === '1';
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  useEffect(() => {
    if (initialOpenTemplates || searchParams.get('tab')) {
      // Clean URL after consuming the params so refresh doesn't reopen the dialog.
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      next.delete('newCampaign');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { user } = useAuth();
  const blockWriter = useRef(createPlannerBlockWriter());
  const { t, language } = useTranslation();
  const dateFnsLocale = localeMap[language] || enUS;
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const accountScope = usePlannerRequestScope(user?.id);
  const [membershipReload, setMembershipReload] = usePlannerScopedState(accountScope, () => 0);
  const [workspaceId, setWorkspaceId] = usePlannerScopedState<string | null>(accountScope, () => null);
  const dataScope = usePlannerRequestScope(user?.id, workspaceId);
  const [posts, setPosts] = usePlannerScopedState<ScheduledPost[]>(dataScope, () => []);
  const [loading, setLoading] = usePlannerScopedState(dataScope, () => Boolean(user));
  const [postsLoadFailed, setPostsLoadFailed] = usePlannerScopedState(dataScope, () => false);
  const [postsReload, setPostsReload] = usePlannerScopedState(dataScope, () => 0);
  const [recommendationOpen, setRecommendationOpen] = usePlannerScopedState(dataScope, () => false);
  
  const [sortBy, setSortBy] = useState<SortOption>("date-asc");
  const [filterPlatform, setFilterPlatform] = useState<FilterPlatform>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  
  const [editingPost, setEditingPost] = usePlannerScopedState<ScheduledPost | null>(dataScope, () => null);
  const [editTitle, setEditTitle] = useState("");
  const [editPlatform, setEditPlatform] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [saving, setSaving] = usePlannerScopedState(dataScope, () => false);
  const [deleting, setDeleting] = usePlannerScopedState(dataScope, () => false);
  
  const [selectedPosts, setSelectedPosts] = usePlannerScopedState<Set<string>>(dataScope, () => new Set());
  const { transfer: transferDrafts, pending: transferring, timezone: handoffTimezone } = usePlannerHandoff(workspaceId);
  const [transferDialogOpen, setTransferDialogOpen] = usePlannerScopedState(dataScope, () => false);
  useEffect(() => { setSelectedPosts(new Set()); setTransferDialogOpen(false); }, [workspaceId, user?.id]);

  useEffect(() => { blockWriter.current.clear(); }, [user?.id, workspaceId]);

  // Membership and post responses belong to the actor/workspace that requested them.
  useEffect(() => {
    const canCommit = accountScope.startRequest('membership');
    if (!user) { setLoading(false); return; }
    setPostsLoadFailed(false); setLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase.from('workspace_members')
          .select('workspace_id').eq('user_id', user.id).limit(1).single();
        if (!canCommit()) return;
        if (error || !data?.workspace_id) throw new Error('WORKSPACE_UNAVAILABLE');
        setWorkspaceId(data.workspace_id);
      } catch {
        if (!canCommit()) return;
        setPostsLoadFailed(true); setLoading(false); toast.error(t('planner.errorLoading'));
      }
    })();
  }, [accountScope, membershipReload]);

  useEffect(() => {
    const canCommit = dataScope.startRequest('posts');
    setPosts([]); setPostsLoadFailed(false);
    if (!workspaceId || !user) { setLoading(Boolean(user) && !workspaceId); return; }
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase.from('schedule_blocks')
          .select('*, content_items(*)').eq('workspace_id', workspaceId).order('start_at', { ascending: true });
        if (!canCommit()) return;
        if (error || !Array.isArray(data) || data.some(row => row.workspace_id !== workspaceId)) throw new Error('POSTS_UNAVAILABLE');
        setPosts(data);
      } catch {
        if (!canCommit()) return;
        setPostsLoadFailed(true); toast.error(t('planner.errorLoading'));
      } finally { if (canCommit()) setLoading(false); }
    })();
  }, [dataScope, postsReload]);

  const filteredPosts = posts
    .filter(post => {
      if (filterPlatform !== "all" && post.platform.toLowerCase() !== filterPlatform) return false;
      if (filterStatus !== "all" && post.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "date-asc": return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
        case "date-desc": return new Date(b.start_at).getTime() - new Date(a.start_at).getTime();
        case "platform": return a.platform.localeCompare(b.platform);
        case "status": return a.status.localeCompare(b.status);
        default: return 0;
      }
    });

  const scheduledCount = posts.filter(p => p.status === "scheduled" || p.status === "approved" || p.status === "queued").length;
  const uniquePlatforms = new Set(posts.map(p => p.platform.toLowerCase())).size;
  const weeklyUtilization = Math.min(100, Math.round((posts.length / 21) * 100));

  const handleNewPost = () => navigate("/calendar?quickAdd=true");

  const handleAiSuggestions = () => {
    if (!workspaceId) { toast.error(t('planner.noWorkspace')); return; }
    setRecommendationOpen(true);
  };

  const handleCalendarView = () => navigate("/calendar");

  const openPostEditor = (post: ScheduledPost) => {
    setEditingPost(post);
    setEditTitle(post.title_override || post.content_items?.title || "");
    setEditPlatform(post.platform);
    setEditDate(format(parseISO(post.start_at), "yyyy-MM-dd'T'HH:mm"));
    setEditStatus(post.status);
  };

  const closePostEditor = () => {
    setEditingPost(null);
    setEditTitle("");
    setEditPlatform("");
    setEditDate("");
    setEditStatus("");
  };

  const handleSavePost = async () => {
    if (!editingPost || !user || !workspaceId || saving) return;
    if (editingPost.status !== "draft" || editStatus !== "draft") {
      toast.error(tx({ de: "Hier können nur Entwürfe bearbeitet werden.", en: "Only drafts can be edited here.", es: "Aquí solo se pueden editar borradores." }));
      return;
    }
    setSaving(true);
    const snapshot = editingPost;
    try {
      const startAt = new Date(editDate).toISOString();
      const duration = new Date(snapshot.end_at).getTime() - new Date(snapshot.start_at).getTime();
      const endAt = new Date(new Date(startAt).getTime() + duration).toISOString();
      const [saved] = await blockWriter.current.save(user.id, workspaceId,
        [{ ...snapshot, title_override: editTitle, platform: editPlatform, start_at: startAt, end_at: endAt }],
        body => supabase.functions.invoke("planner-upsert-blocks", { body }));
      if (!dataScope.isCurrent()) return;
      setPosts(prev => prev.map(post => post.id === saved.id ? { ...post, ...saved } : post));
      toast.success(t('planner.postUpdated'));
      setEditingPost(current => current?.id === snapshot.id ? null : current);
    } catch (error) {
      if (!dataScope.isCurrent()) return;
      const code = error instanceof PlannerBlockSaveError ? error.code : "BLOCK_SAVE_FAILED";
      if (code !== "SAVE_SCOPE_CHANGED") toast.error(code === "STALE_WRITE_RETRY_REQUIRED" || code === "REQUEST_ID_REUSED"
        ? tx({ de: "Dieser Entwurf wurde geändert. Bitte neu laden und erneut speichern.", en: "This draft changed. Reload it before saving again.", es: "Este borrador cambió. Vuelve a cargarlo antes de guardar." })
        : t('planner.errorSaving'));
    } finally { setSaving(false); }
  };

  const handleDeletePost = async () => {
    if (!editingPost) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("schedule_blocks").delete().eq("id", editingPost.id);
      if (error) throw error;
      if (!dataScope.isCurrent()) return;
      setPosts(prev => prev.filter(p => p.id !== editingPost.id));
      toast.success(t('planner.postDeleted'));
      closePostEditor();
    } catch (error: any) {
      if (!dataScope.isCurrent()) return;
      console.error("Delete error:", error);
      toast.error(t('planner.errorDeleting'));
    } finally {
      setDeleting(false);
    }
  };

  const getPostTitle = (post: ScheduledPost) => post.title_override || post.content_items?.title || t('planner.untitledPost');

  const formatPostDate = (dateStr: string) => {
    try { return format(parseISO(dateStr), "dd. MMM yyyy", { locale: dateFnsLocale }); } catch { return dateStr; }
  };

  const formatPostTime = (dateStr: string) => {
    try { return format(parseISO(dateStr), "HH:mm", { locale: dateFnsLocale }); } catch { return ""; }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case "scheduled": case "approved": return "default";
      case "queued": return "secondary";
      case "published": return "outline";
      default: return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      draft: t('planner.draft'),
      scheduled: t('planner.scheduled'),
      approved: t('planner.approved'),
      queued: t('planner.queued'),
      published: t('planner.published'),
    };
    return map[status] || status;
  };

  const getPlatformColor = (platform: string) => {
    switch (platform.toLowerCase()) {
      case "instagram": return "text-pink-500";
      case "tiktok": return "text-cyan-400";
      case "linkedin": return "text-blue-500";
      case "youtube": return "text-red-500";
      case "twitter": return "text-sky-400";
      default: return "text-muted-foreground";
    }
  };

  const togglePostSelection = (postId: string) => {
    setSelectedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId); else next.add(postId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPosts.size === filteredPosts.length) setSelectedPosts(new Set());
    else setSelectedPosts(new Set(filteredPosts.map(p => p.id)));
  };

  const handleTransferToCalendar = async () => {
    if (selectedPosts.size === 0 || !workspaceId) { toast.error(t('planner.noPosts')); return; }
    try {
      const selected = posts.filter(post => selectedPosts.has(post.id));
      if (selected.length !== selectedPosts.size) throw new PlannerHandoffError('HANDOFF_VERSION_REQUIRED');
      const result = await transferDrafts(selected);
      if (!result || !dataScope.isCurrent()) return;
      toast.success(tx({ en: `${result.results.length} calendar drafts created. Planner posts are unchanged.`, de: `${result.results.length} Kalenderentwürfe erstellt. Die Planerbeiträge bleiben unverändert.` }));
      setTransferDialogOpen(false);
      setSelectedPosts(new Set());
      navigate("/calendar");
    } catch (error) {
      toast.error(plannerHandoffErrorText(error));
    }
  };

  return (
    <div className={className}>
      {/* Header — im eingebetteten Modus übernimmt das Command Center die Kopfzeile */}
      {!embedded && (
      <Card className="p-6 mb-6 bg-gradient-to-r from-primary/10 via-purple-500/10 to-blue-500/10 border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{t('planner.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('planner.subtitle')}</p>
            </div>
          </div>
          <Badge variant="default" className="gap-1">
            <Sparkles className="h-3 w-3" />
            AI-Powered
          </Badge>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" className="gap-2" onClick={handleNewPost}>
            <Plus className="h-4 w-4" />
            {t('planner.newPost')}
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={handleAiSuggestions} disabled={!workspaceId}>
            <Sparkles className="h-4 w-4" />
            {t('planner.aiSuggestions')}
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={handleCalendarView}>
            <Calendar className="h-4 w-4" />
            {t('planner.calendarView')}
          </Button>
        </div>
      </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList className={embedded ? "hidden" : "mb-4"}>
          <TabsTrigger value="posts" className="gap-2">
            <FileText className="h-4 w-4" />
            Posts
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-2">
            <Package className="h-4 w-4" />
            {t('planner.campaigns')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          {/* Toolbar */}
          <Card className="p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant={viewMode === "grid" ? "default" : "outline"} onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button size="sm" variant={viewMode === "list" ? "default" : "outline"} onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {selectedPosts.size > 0 && (
              <Button size="sm" className="gap-2 bg-primary" onClick={() => setTransferDialogOpen(true)}>
                <Send className="h-4 w-4" />
                {selectedPosts.size} {t('planner.toCalendar')}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={toggleSelectAll} className="gap-2">
              <CheckSquare className="h-4 w-4" />
              {selectedPosts.size === filteredPosts.length && filteredPosts.length > 0 ? t('planner.none') : t('planner.all')}
            </Button>
            {/* Filter Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <Filter className="h-4 w-4" />
                  {t('planner.filter')}
                  {(filterPlatform !== "all" || filterStatus !== "all") && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {(filterPlatform !== "all" ? 1 : 0) + (filterStatus !== "all" ? 1 : 0)}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>{t('planner.platform')}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setFilterPlatform("all")}>
                  {t('planner.allPlatforms')} {filterPlatform === "all" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterPlatform("instagram")}>
                  Instagram {filterPlatform === "instagram" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterPlatform("tiktok")}>
                  TikTok {filterPlatform === "tiktok" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterPlatform("linkedin")}>
                  LinkedIn {filterPlatform === "linkedin" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t('planner.status')}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setFilterStatus("all")}>
                  {t('planner.allStatuses')} {filterStatus === "all" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterStatus("draft")}>
                  {t('planner.draft')} {filterStatus === "draft" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterStatus("scheduled")}>
                  {t('planner.scheduled')} {filterStatus === "scheduled" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterStatus("published")}>
                  {t('planner.published')} {filterStatus === "published" && "✓"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <SortAsc className="h-4 w-4" />
                  {t('planner.sort')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSortBy("date-asc")}>
                  {t('planner.dateAsc')} {sortBy === "date-asc" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("date-desc")}>
                  {t('planner.dateDesc')} {sortBy === "date-desc" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("platform")}>
                  {t('planner.platform')} {sortBy === "platform" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("status")}>
                  {t('planner.status')} {sortBy === "status" && "✓"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>

      {/* Content */}
      {loading ? (
        <Card className="p-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </Card>
      ) : postsLoadFailed ? (
        <Card role="alert" className="p-6">
          <p>{t('planner.errorLoading')}</p>
          <Button variant="outline" className="mt-3" onClick={() => workspaceId ? setPostsReload(value => value + 1) : setMembershipReload(value => value + 1)}>
            {tx({ en: 'Reload', de: 'Neu laden', es: 'Volver a cargar' })}
          </Button>
        </Card>
      ) : filteredPosts.length === 0 ? (
        <Card className="p-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {posts.length === 0 ? t('planner.noPostsYet') : t('planner.noPostsFound')}
          </h3>
          <p className="text-muted-foreground mb-4">
            {posts.length === 0 ? t('planner.createFirst') : t('planner.adjustFilters')}
          </p>
          {posts.length === 0 && (
            <div className="flex gap-2 justify-center">
              <Button onClick={handleNewPost} className="gap-2">
                <Plus className="h-4 w-4" />
                {t('planner.newPost')}
              </Button>
              <Button variant="outline" onClick={handleAiSuggestions} disabled={!workspaceId} className="gap-2">
                <Sparkles className="h-4 w-4" />
                {t('planner.aiSuggestions')}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className={viewMode === "grid" ? "grid md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
          {filteredPosts.map((post) => (
            <Card 
              key={post.id} 
              className="p-4 hover:border-primary/50 transition-colors cursor-pointer group"
              onClick={() => openPostEditor(post)}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold line-clamp-1">{getPostTitle(post)}</h3>
                    <p className={`text-sm mt-1 font-medium ${getPlatformColor(post.platform)}`}>
                      {post.platform}
                    </p>
                  </div>
                  <Badge variant={getStatusVariant(post.status)}>
                    {getStatusLabel(post.status)}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatPostDate(post.start_at)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatPostTime(post.start_at)}
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="flex-1 gap-2"
                    onClick={(e) => { e.stopPropagation(); openPostEditor(post); }}
                  >
                    <Pencil className="h-3 w-3" />
                    {t('planner.edit')}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); navigate(`/ai-posts?enhance=${post.id}`); }}
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Stats Footer */}
      <Card className="p-4 mt-6 bg-muted/50">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{scheduledCount}</p>
            <p className="text-sm text-muted-foreground">{t('planner.postsScheduled')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{uniquePlatforms}</p>
            <p className="text-sm text-muted-foreground">{t('planner.platforms')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{weeklyUtilization}%</p>
            <p className="text-sm text-muted-foreground">{t('planner.weeklyUtilization')}</p>
          </div>
        </div>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingPost} onOpenChange={(open) => !open && closePostEditor()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('planner.editPost')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('planner.titleLabel')}</Label>
              <Input id="title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder={tx({ de: 'Post-Titel', en: 'Post title', es: 'Título de la publicación' })} />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="platform">{t('planner.platform')}</Label>
              <Select value={editPlatform} onValueChange={setEditPlatform}>
                <SelectTrigger>
                  <SelectValue placeholder={t('planner.choosePlatform')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Instagram">Instagram</SelectItem>
                  <SelectItem value="TikTok">TikTok</SelectItem>
                  <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                  <SelectItem value="YouTube">YouTube</SelectItem>
                  <SelectItem value="Twitter">Twitter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="datetime">{t('planner.dateTime')}</Label>
              <Input id="datetime" type="datetime-local" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="status">{t('planner.status')}</Label>
              <Select value={editStatus} onValueChange={setEditStatus} disabled>
                <SelectTrigger>
                  <SelectValue placeholder={t('planner.chooseStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t('planner.draft')}</SelectItem>
                  <SelectItem value="scheduled">{t('planner.scheduled')}</SelectItem>
                  <SelectItem value="approved">{t('planner.approved')}</SelectItem>
                  <SelectItem value="queued">{t('planner.queued')}</SelectItem>
                  <SelectItem value="published">{t('planner.published')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="destructive" onClick={handleDeletePost} disabled={deleting} className="gap-2">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t('planner.delete')}
            </Button>
            <div className="flex gap-2 flex-1 justify-end">
              <Button variant="outline" onClick={closePostEditor}>{t('planner.cancel')}</Button>
              <Button onClick={handleSavePost} disabled={saving || editingPost?.status !== "draft"}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t('planner.save')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer to Calendar Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tx({ en: 'Create calendar drafts', de: 'Kalenderentwürfe erstellen' })}</DialogTitle>
            <DialogDescription>
              {tx({ en: `${selectedPosts.size} selected · ${handoffTimezone}`, de: `${selectedPosts.size} ausgewählt · ${handoffTimezone}` })}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {tx({ en: 'Create up to 50 text-only drafts. Planner posts stay unchanged. Nothing is scheduled or published.', de: 'Bis zu 50 reine Textentwürfe erstellen. Planerbeiträge bleiben unverändert. Es wird nichts eingeplant oder veröffentlicht.' })}
            </p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>{t('planner.cancel')}</Button>
            <Button onClick={handleTransferToCalendar} disabled={transferring}>
              {transferring ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {tx({ en: 'Create drafts', de: 'Entwürfe erstellen' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>

        <TabsContent value="campaigns">
          <CampaignTab workspaceId={workspaceId} initialOpenTemplates={initialOpenTemplates} />
        </TabsContent>
      </Tabs>
      <PlannerRecommendationsDialog open={recommendationOpen} onOpenChange={setRecommendationOpen}
        workspaceId={workspaceId} onApplied={() => setPostsReload(value => value + 1)} />
    </div>
  );
}
