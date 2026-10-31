import { usePlannerRequestScope, usePlannerScopedState } from '@/hooks/usePlannerRequestScope';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Rocket, 
  Calendar, 
  ChevronDown, 
  Trash2, 
  Send, 
  Loader2,
  Package,
  Clock,
  Sparkles,
  Eye,
  ExternalLink,
  Plus
} from "lucide-react";
import { CampaignTemplateDialog } from "@/components/calendar/CampaignTemplateDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { de, enUS, es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PostGeneratorInline } from "@/components/campaigns/PostGeneratorInline";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { tx } from "@/lib/i18nText";
import { usePlannerHandoff } from "@/hooks/usePlannerHandoff";
import { plannerHandoffErrorText } from "@/lib/plannerHandoffText";

interface CampaignPost {
  id: string;
  workspace_id: string;
  updated_at: string | null;
  content_id: string | null;
  title_override: string | null;
  caption_override?: string | null;
  platform: string;
  start_at: string;
  status: string;
  meta: {
    template_id?: string;
    campaign_id?: string;
    campaign_name?: string;
    day?: string;
    hashtags?: string[];
    cta?: string;
    post_type?: string;
  } | null;
  content_items?: {
    id: string;
    updated_at: string | null;
    media_id?: string | null;
    thumb_url?: string | null;
    title: string;
    caption?: string;
    source_id?: string;
  } | null;
}

interface Campaign {
  templateId: string;
  name: string;
  startDate: string;
  posts: CampaignPost[];
}

interface CampaignTabProps {
  workspaceId: string | null;
  initialOpenTemplates?: boolean;
}

const localeMap = { en: enUS, de, es } as const;

export function CampaignTab({ workspaceId, initialOpenTemplates = false }: CampaignTabProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dataScope = usePlannerRequestScope(user?.id, workspaceId);
  const { t, language } = useTranslation();
  const dateFnsLocale = localeMap[language] || enUS;
  const [campaigns, setCampaigns] = usePlannerScopedState<Campaign[]>(dataScope, () => []);
  const [loading, setLoading] = usePlannerScopedState(dataScope, () => Boolean(user && workspaceId));
  const [campaignLoadFailed, setCampaignLoadFailed] = usePlannerScopedState(dataScope, () => false);
  const [transferring, setTransferring] = usePlannerScopedState<string | null>(dataScope, () => null);
  const { transfer: transferDrafts, pending: handoffPending } = usePlannerHandoff(workspaceId);
  const [deletingCampaign, setDeletingCampaign] = usePlannerScopedState<Campaign | null>(dataScope, () => null);
  const [deleting, setDeleting] = usePlannerScopedState(dataScope, () => false);
  const [expandedCampaignId, setExpandedCampaignId] = usePlannerScopedState<string | null>(dataScope, () => null);
  const [generatorPost, setGeneratorPost] = usePlannerScopedState<CampaignPost | null>(dataScope, () => null);
  const [showTemplateDialog, setShowTemplateDialog] = usePlannerScopedState(dataScope, () => false);

  useEffect(() => {
    if (initialOpenTemplates && workspaceId) {
      setShowTemplateDialog(true);
    }
  }, [initialOpenTemplates, workspaceId]);

  const dayNames = [
    t('planner.monday'), t('planner.tuesday'), t('planner.wednesday'),
    t('planner.thursday'), t('planner.friday'), t('planner.saturday'), t('planner.sunday')
  ];

  useEffect(() => {
    fetchCampaigns();
  }, [dataScope]);

  const fetchCampaigns = async () => {
    const canCommit = dataScope.startRequest('campaigns');
    if (!workspaceId || !user || !canCommit()) { setLoading(false); return; }
    setLoading(true); setCampaignLoadFailed(false);
    try {
      const { data: blocks, error } = await supabase.from('schedule_blocks')
        .select('*, content_items(*)').eq('workspace_id', workspaceId).order('start_at', { ascending: true });
      if (!canCommit()) return;
      if (error || !Array.isArray(blocks) || blocks.some(row => row.workspace_id !== workspaceId)) throw new Error('CAMPAIGNS_UNAVAILABLE');
      const { data: templates, error: templatesError } = await supabase.from('calendar_campaign_templates').select('id, name');
      if (!canCommit()) return;
      if (templatesError || !Array.isArray(templates)) throw new Error('TEMPLATES_UNAVAILABLE');
      const templateMap = new Map(templates.map(row => [row.id, row.name]));
      const campaignMap = new Map<string, Campaign>();
      blocks.forEach((block: any) => {
        const campaignId = block.meta?.campaign_id || block.meta?.template_id || block.content_items?.source_id;
        if (!campaignId) return;
        const campaignName = block.meta?.campaign_name || templateMap.get(campaignId) || t('planner.campaigns');
        if (!campaignMap.has(campaignId)) campaignMap.set(campaignId, { templateId: campaignId, name: campaignName, startDate: block.start_at, posts: [] });
        campaignMap.get(campaignId)!.posts.push(block);
      });
      setCampaigns(Array.from(campaignMap.values()));
    } catch {
      if (!canCommit()) return;
      setCampaignLoadFailed(true); toast.error(t('planner.errorLoadingCampaigns'));
    } finally { if (canCommit()) setLoading(false); }
  };

  const handleTransferToCalendar = async (campaign: Campaign) => {
    if (!workspaceId) return;
    setTransferring(campaign.templateId);
    try {
      const result = await transferDrafts(campaign.posts);
      if (!result || !dataScope.isCurrent()) return;
      toast.success(tx({ en: `${result.results.length} calendar drafts created. Planner posts are unchanged.`, de: `${result.results.length} Kalenderentwürfe erstellt. Die Planerbeiträge bleiben unverändert.` }));
      navigate("/calendar");
    } catch (error) {
      toast.error(plannerHandoffErrorText(error));
    } finally {
      setTransferring(null);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!deletingCampaign) return;
    setDeleting(true);
    try {
      const blockIds = deletingCampaign.posts.map(p => p.id);
      const { error } = await supabase.from("schedule_blocks").delete().in("id", blockIds);
      if (!dataScope.isCurrent()) return;
      if (error) throw error;
      toast.success(t('planner.campaignDeleted'));
      setDeletingCampaign(null);
      fetchCampaigns();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error(t('planner.errorDeleting'));
    } finally {
      setDeleting(false);
    }
  };

  const getStatusCounts = (posts: CampaignPost[]) => {
    const scheduled = posts.filter(p => ["scheduled", "approved", "queued", "published"].includes(p.status)).length;
    return { scheduled, total: posts.length };
  };

  const formatDate = (dateStr: string) => {
    try { return format(parseISO(dateStr), "dd. MMM yyyy", { locale: dateFnsLocale }); } catch { return dateStr; }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
            <Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" />
          </div>
          <span className="text-muted-foreground text-sm">{t('planner.loadingCampaigns')}</span>
        </motion.div>
      </div>
    );
  }

  if (campaignLoadFailed) {
    return <Card role="alert" className="p-6">
      <p>{t('planner.errorLoadingCampaigns')}</p>
      <Button variant="outline" className="mt-3" onClick={fetchCampaigns}>
        {tx({ en: 'Reload', de: 'Neu laden', es: 'Volver a cargar' })}
      </Button>
    </Card>;
  }

  if (campaigns.length === 0) {
    return (
      <>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Card className="p-10 text-center backdrop-blur-xl bg-card/60 border-white/10 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cyan-500/5 pointer-events-none" />
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, type: "spring" }} className="relative z-10">
              <div className="relative mx-auto mb-6 w-20 h-20">
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-cyan-500/20 border border-white/10 flex items-center justify-center">
                  <Package className="h-10 w-10 text-primary" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">{t('planner.noCampaigns')}</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{t('planner.createCampaigns')}</p>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button 
                  onClick={() => setShowTemplateDialog(true)} 
                  disabled={!workspaceId}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.4)] transition-all duration-300"
                >
                  <Rocket className="h-4 w-4" />
                  {t('planner.goToTemplates')}
                  <Sparkles className="h-3 w-3" />
                </Button>
              </motion.div>
            </motion.div>
          </Card>
        </motion.div>
        {workspaceId && (
          <CampaignTemplateDialog
            open={showTemplateDialog}
            onClose={() => setShowTemplateDialog(false)}
            workspaceId={workspaceId}
            onGenerated={() => {
              setShowTemplateDialog(false);
              toast.success(t('planner.contentGenerated') || tx({ de: 'Kampagne erstellt', en: 'Campaign created', es: 'Campaña creada' }));
              fetchCampaigns();
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {campaigns.length} {t('planner.campaigns')}
        </div>
        <Button
          size="sm"
          onClick={() => setShowTemplateDialog(true)}
          disabled={!workspaceId}
          className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
        >
          <Plus className="h-4 w-4" />
          {t('planner.goToTemplates')}
        </Button>
      </div>
      <AnimatePresence mode="popLayout">
        {campaigns.map((campaign, index) => {
          const { scheduled, total } = getStatusCounts(campaign.posts);
          const progress = total > 0 ? (scheduled / total) * 100 : 0;
          const isTransferring = transferring === campaign.templateId;

          return (
            <motion.div
              key={campaign.templateId}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Card className="p-5 backdrop-blur-xl bg-card/60 border-white/10 hover:border-primary/30 hover:shadow-[0_0_30px_rgba(var(--primary),0.15)] transition-all duration-300 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <motion.div whileHover={{ scale: 1.1, rotate: 5 }} className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                        <Rocket className="h-5 w-5 text-primary" />
                      </motion.div>
                      <div>
                        <h3 className="font-semibold text-lg">{campaign.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{t('planner.started')}: {formatDate(campaign.startDate)}</span>
                        </div>
                      </div>
                    </div>
                    <Badge 
                      variant={progress === 100 ? "default" : "secondary"}
                      className={progress === 100 
                        ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-white border-0 shadow-[0_0_15px_rgba(16,185,129,0.4)]" 
                        : "bg-primary/10 text-primary border-primary/20"
                      }
                    >
                      {progress === 100 ? `✓ ${t('planner.completed')}` : t('planner.inProgress')}
                    </Badge>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-5">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">{t('planner.progress')}</span>
                      <span className="font-medium text-primary">{scheduled}/{total} {t('planner.postsPlanned')}</span>
                    </div>
                    <div className="h-2 bg-muted/50 rounded-full overflow-hidden relative">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1, delay: index * 0.1, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-primary via-primary/80 to-cyan-500 rounded-full relative"
                      >
                        {progress > 0 && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                        )}
                      </motion.div>
                    </div>
                  </div>

                  {/* Post Timeline Preview */}
                  <div className="flex gap-2 mb-5 overflow-x-auto pb-2 scrollbar-hide">
                    {campaign.posts.slice(0, 7).map((post, idx) => {
                      const isScheduled = ["scheduled", "approved", "queued", "published"].includes(post.status);
                      return (
                        <motion.div
                          key={post.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3 + idx * 0.05 }}
                          whileHover={{ scale: 1.1, y: -2 }}
                          className={`flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 cursor-default ${
                            isScheduled 
                              ? "bg-gradient-to-br from-primary/30 to-cyan-500/20 border-primary/50 text-primary shadow-[0_0_10px_rgba(var(--primary),0.3)]" 
                              : "bg-muted/30 border-white/10 text-muted-foreground hover:border-white/20"
                          }`}
                          title={post.title_override || post.content_items?.title || `Post ${idx + 1}`}
                        >
                          {isScheduled ? "✓" : idx + 1}
                        </motion.div>
                      );
                    })}
                    {campaign.posts.length > 7 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-xs text-muted-foreground bg-muted/30 border border-white/10"
                      >
                        +{campaign.posts.length - 7}
                      </motion.div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex-1">
                      <Button 
                        size="sm" 
                        className="gap-2 w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-[0_0_15px_rgba(var(--primary),0.2)] hover:shadow-[0_0_25px_rgba(var(--primary),0.35)] transition-all duration-300"
                        onClick={() => handleTransferToCalendar(campaign)}
                        disabled={Boolean(transferring) || handoffPending}
                      >
                        {isTransferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {tx({ en: 'Create calendar drafts', de: 'Kalenderentwürfe erstellen' })}
                      </Button>
                    </motion.div>
                    
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="gap-2 border-white/10 hover:border-primary/30 hover:bg-primary/5"
                        onClick={() => setExpandedCampaignId(expandedCampaignId === campaign.templateId ? null : campaign.templateId)}
                      >
                        <Calendar className="h-4 w-4" />
                        {t('planner.details')}
                        <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", expandedCampaignId === campaign.templateId && "rotate-180")} />
                      </Button>
                    </motion.div>
                    
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletingCampaign(campaign)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  </div>

                  {/* Expanded Post Details */}
                  <AnimatePresence>
                    {expandedCampaignId === campaign.templateId && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden mt-4"
                      >
                        <div className="border-t border-white/10 pt-4 space-y-3">
                          {campaign.posts.map((post, idx) => {
                            const weekNumber = Math.ceil((idx + 1) / 7);
                            const postTitle = post.title_override || post.content_items?.title || `Post ${idx + 1}`;
                            const postCaption = post.caption_override || post.content_items?.caption || post.meta?.cta || "";
                            const hashtags = post.meta?.hashtags || [];
                            const postType = post.meta?.post_type || "Post";
                            const dayName = post.meta?.day || format(parseISO(post.start_at), "EEEE", { locale: dateFnsLocale });
                            const postTime = format(parseISO(post.start_at), "HH:mm");

                            return (
                              <motion.div
                                key={post.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="p-4 rounded-lg bg-muted/30 border border-white/5 hover:border-primary/20 transition-all"
                              >
                                <div className="flex items-center gap-3 mb-3">
                                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                    {idx + 1}
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">{t('planner.week')} {weekNumber}</span>
                                  <Badge variant="secondary" className="text-xs">{postType}</Badge>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 mb-3">
                                  <Select defaultValue={dayName.toLowerCase()}>
                                    <SelectTrigger className="w-32 h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {dayNames.map((name, i) => (
                                        <SelectItem key={i} value={name.toLowerCase()}>{name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  
                                  <Input type="time" defaultValue={postTime} className="w-24 h-8 text-xs" />
                                  
                                  <Badge 
                                    className={cn(
                                      "text-xs capitalize",
                                      post.platform === "instagram" && "bg-gradient-to-r from-pink-500 to-purple-500 text-white border-0",
                                      post.platform === "facebook" && "bg-blue-600 text-white border-0",
                                      post.platform === "linkedin" && "bg-blue-700 text-white border-0",
                                      post.platform === "tiktok" && "bg-black text-white border border-cyan-400",
                                      post.platform === "youtube" && "bg-red-600 text-white border-0"
                                    )}
                                  >
                                    {post.platform}
                                  </Badge>
                                </div>

                                <h4 className="font-medium text-sm mb-1">{postTitle}</h4>
                                {postCaption && <p className="text-muted-foreground text-xs line-clamp-2 mb-2">{postCaption}</p>}

                                {hashtags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-3">
                                    {hashtags.slice(0, 5).map((tag: string, tagIdx: number) => (
                                      <Badge key={tagIdx} variant="secondary" className="text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/20">#{tag}</Badge>
                                    ))}
                                    {hashtags.length > 5 && <Badge variant="secondary" className="text-xs">+{hashtags.length - 5}</Badge>}
                                  </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                  <Button 
                                    size="sm" variant="outline"
                                    className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                                    onClick={() => setGeneratorPost(post)}
                                  >
                                    <Sparkles className="h-3 w-3" />
                                    {t('planner.generateWithAi')}
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-white/10">
                                    <Eye className="h-3 w-3" />
                                    {t('planner.preview')}
                                  </Button>
                                  <Button 
                                    size="sm" variant="outline"
                                    className="h-7 text-xs gap-1.5 border-white/10"
                                    onClick={() => window.open('/compose', '_blank')}
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Generator
                                  </Button>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingCampaign} onOpenChange={() => setDeletingCampaign(null)}>
        <AlertDialogContent className="backdrop-blur-xl bg-card/95 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('planner.deleteCampaign')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('planner.deleteCampaignDesc', { count: deletingCampaign?.posts.length || 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10">{t('planner.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteCampaign}
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('planner.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Post Generator Inline Sheet */}
      {generatorPost && (
        <PostGeneratorInline
          post={{
            title: generatorPost.title_override || generatorPost.content_items?.title || "Post",
            caption_outline: generatorPost.caption_override || generatorPost.content_items?.caption || "",
            post_type: generatorPost.meta?.post_type || "Post",
            hashtags: generatorPost.meta?.hashtags || [],
            cta: generatorPost.meta?.cta || "",
          }}
          postId={generatorPost.id}
          platforms={[generatorPost.platform]}
          isOpen={!!generatorPost}
          onClose={() => setGeneratorPost(null)}
          onApplyContent={(postId, content) => {
            console.log('[CampaignTab] Generated content for post:', postId, content);
            toast.success(t('planner.contentGenerated'));
            setGeneratorPost(null);
            fetchCampaigns();
          }}
        />
      )}
      {workspaceId && (
        <CampaignTemplateDialog
          open={showTemplateDialog}
          onClose={() => setShowTemplateDialog(false)}
          workspaceId={workspaceId}
          onGenerated={() => {
            setShowTemplateDialog(false);
            toast.success(t('planner.contentGenerated') || tx({ de: 'Kampagne erstellt', en: 'Campaign created', es: 'Campaña creada' }));
            fetchCampaigns();
          }}
        />
      )}
    </div>
  );
}
