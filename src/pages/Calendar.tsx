import { isAwsTestBackend } from '@/lib/backendTarget';
import { useCalendarDraftEdit } from '@/hooks/useCalendarDraftEdit';
import { calendarDraftMove } from '@/lib/calendarDraftEdit';
import { usePlannerRequestScope, usePlannerScopedState } from '@/hooks/usePlannerRequestScope';
import { calendarEventsQueryKey, calendarClientsQueryKey, calendarMembersQueryKey } from '@/lib/calendarQueryKeys';
import { tx } from "@/lib/i18nText";
import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOptimizedCache } from "@/hooks/useOptimizedCache";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarToolbar, ViewType } from "@/components/calendar/CalendarToolbar";
import { MonthView } from "@/components/calendar/views/MonthView";
import { WeekView } from "@/components/calendar/views/WeekView";
import { ListView } from "@/components/calendar/views/ListView";
import { KanbanView } from "@/components/calendar/views/KanbanView";
import { HeatmapView } from "@/components/calendar/views/HeatmapView";
import { EventDetailDialog } from "@/components/calendar/EventDetailDialog";
import { EventCreateDialog } from "@/components/calendar/EventCreateDialog";
import { EventDrawer } from "@/components/calendar/EventDrawer";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { CalendarEmptyState } from "@/components/calendar/CalendarEmptyState";
import { AutoScheduleDialog } from "@/components/calendar/AutoScheduleDialog";
import { CampaignTemplateDialog } from "@/components/calendar/CampaignTemplateDialog";
import { BlackoutDatePicker } from "@/components/calendar/BlackoutDatePicker";
import { HolidaySuggestionsDialog } from "@/components/calendar/HolidaySuggestionsDialog";
import { IntegrationSettingsDialog } from "@/components/calendar/IntegrationSettingsDialog";
import { CalendarMetricsDashboard } from "@/components/calendar/CalendarMetricsDashboard";
import { CalendarHeroHeader } from "@/components/calendar/CalendarHeroHeader";
import { CalendarBackgroundAurora } from "@/components/calendar/CalendarBackgroundAurora";

import { exportToCSV, exportToPDF, exportToICS, exportMetricsToCSV } from "@/lib/calendarExport";
import { ScheduleQuickForm } from "@/components/calendar/ScheduleQuickForm";
import { DayCockpitDialog } from "@/components/calendar/DayCockpitDialog";

import { NotificationCenter } from "@/components/calendar/NotificationCenter";
import { NotificationBadge } from "@/components/calendar/NotificationBadge";
import { BulkScheduleDialog } from "@/components/calendar/BulkScheduleDialog";
import { RecurringRuleDialog } from "@/components/calendar/RecurringRuleDialog";
import { useCalendarFilters } from "@/hooks/useCalendarFilters";
import { CalendarFilterPopover } from "@/components/calendar/filters/CalendarFilterPopover";
import { CalendarFilterBar } from "@/components/calendar/filters/CalendarFilterBar";

interface CalendarEvent {
  id: string;
  workspace_id: string;
  client_id?: string;
  brand_kit_id?: string;
  campaign_id?: string;
  title: string;
  brief?: string;
  caption?: string;
  channels: string[];
  status: string;
  start_at?: string;
  end_at?: string;
  timezone: string;
  owner_id?: string;
  assignees?: string[];
  eta_minutes?: number;
  assets_json?: any;
  hashtags?: string[];
  tags?: string[];
  version: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface Workspace {
  id: string;
  name: string;
}

interface Client {
  id: string;
  name: string;
  workspace_id: string;
}

interface BrandKit {
  id: string;
  brand_name?: string;
  workspace_id?: string;
}

export default function Calendar({ embedded }: { embedded?: boolean } = {}) {
  // QA test-id (language-neutral selector for smoke missions)
  // Used as data-testid="calendar-page" on the root container below.
  const { t } = useTranslation();
  const { user } = useAuth();
  const { emit } = useEventEmitter();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  
  // View State - with localStorage persistence
  const [currentView, setCurrentView] = useState<ViewType>(() => {
    const saved = localStorage.getItem('calendar-view');
    const valid: ViewType[] = ["month", "week", "list", "kanban", "heatmap"];
    return (valid.includes(saved as ViewType) ? (saved as ViewType) : "month");
  });

  // Sync view changes to localStorage
  useEffect(() => {
    localStorage.setItem('calendar-view', currentView);
  }, [currentView]);

  // Track page view on mount
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.CALENDAR_VIEWED, {
      view: currentView,
      user_id: user?.id
    });
  }, []);
  
  // Scope State
  const accountScope = usePlannerRequestScope(user?.id);
  const [selectedWorkspace, setSelectedWorkspace] = usePlannerScopedState<string>(accountScope, () => "");
  const dataScope = usePlannerRequestScope(user?.id, selectedWorkspace || null);
  const draftEditor = useCalendarDraftEdit(selectedWorkspace || null);
  const [selectedClient, setSelectedClient] = usePlannerScopedState<string>(dataScope, () => "");
  const [selectedBrand, setSelectedBrand] = usePlannerScopedState<string>(dataScope, () => "");
  
  // UI State
  const [selectedEvent, setSelectedEvent] = usePlannerScopedState<CalendarEvent | null>(dataScope, () => null);
  const [showEventDetail, setShowEventDetail] = usePlannerScopedState(dataScope, () => false);
  const [showCreateDialog, setShowCreateDialog] = usePlannerScopedState(dataScope, () => false);
  const [showDayCockpit, setShowDayCockpit] = usePlannerScopedState(dataScope, () => false);

  const [showEventDrawer, setShowEventDrawer] = usePlannerScopedState(dataScope, () => false);
  const [selectedEventId, setSelectedEventId] = usePlannerScopedState<string | null>(dataScope, () => null);
  const [prefillDate, setPrefillDate] = usePlannerScopedState<Date | null>(dataScope, () => null);
  const [userPlan, setUserPlan] = usePlannerScopedState<string>(accountScope, () => "free");
  const [showUpgrade, setShowUpgrade] = usePlannerScopedState(dataScope, () => false);
  
  // Sprint 5-6: AI & Automation Dialogs
  const [showAutoSchedule, setShowAutoSchedule] = usePlannerScopedState(dataScope, () => false);
  const [showCampaignTemplates, setShowCampaignTemplates] = usePlannerScopedState(dataScope, () => false);
  const [showBlackoutDates, setShowBlackoutDates] = usePlannerScopedState(dataScope, () => false);
  const [showHolidays, setShowHolidays] = usePlannerScopedState(dataScope, () => false);
  const [showIntegrations, setShowIntegrations] = usePlannerScopedState(dataScope, () => false);
  const [selectedEventIds, setSelectedEventIds] = usePlannerScopedState<string[]>(dataScope, () => []);
  const [showMetricsDashboard, setShowMetricsDashboard] = useState(true);
  const [selectedEventForLogs, setSelectedEventForLogs] = usePlannerScopedState<string | null>(dataScope, () => null);
  
  // Phase 17: Advanced Scheduling & Workflow
  const [showNotifications, setShowNotifications] = usePlannerScopedState(dataScope, () => false);
  const [showBulkSchedule, setShowBulkSchedule] = usePlannerScopedState(dataScope, () => false);
  const [showRecurringRules, setShowRecurringRules] = usePlannerScopedState(dataScope, () => false);

  // React Query: Events with caching
  const {
    data: events = [],
    isLoading: eventsLoading,
    invalidate: invalidateEvents,
  } = useOptimizedCache({
    queryKey: calendarEventsQueryKey(user?.id, selectedWorkspace, selectedClient, selectedBrand),
    queryFn: async () => {
      if (!selectedWorkspace) return [];
      
      let query = supabase
        .from("calendar_events")
        .select("*")
        .eq("workspace_id", selectedWorkspace);
      
      if (selectedClient) query = query.eq("client_id", selectedClient);
      if (selectedBrand) query = query.eq("brand_kit_id", selectedBrand);
      
      query = query.order("start_at", { ascending: true });
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true,
    enabled: !!user?.id && !!selectedWorkspace,
  });

  // React Query: Workspaces
  const {
    data: workspaces = [],
    isLoading: workspacesLoading,
  } = useOptimizedCache({
    queryKey: ['workspaces', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, workspaces(id, name)")
        .eq("user_id", user?.id);
      
      if (error) throw error;
      return data?.map((d: any) => d.workspaces).filter(Boolean) || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  // React Query: Clients
  const { data: clients = [] } = useOptimizedCache({
    queryKey: calendarClientsQueryKey(user?.id, selectedWorkspace),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("workspace_id", selectedWorkspace)
        .order("name");
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user?.id && !!selectedWorkspace,
  });

  // React Query: Brands
  const { data: brands = [] } = useOptimizedCache({
    queryKey: ['brands', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_kits")
        .select("*")
        .eq("user_id", user?.id)
        .order("brand_name");
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  // React Query: Workspace Members
  const { data: workspaceMembers = [] } = useOptimizedCache({
    queryKey: calendarMembersQueryKey(user?.id, selectedWorkspace),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", selectedWorkspace);
      
      if (error) throw error;
      
      // Fetch profiles separately
      if (data && data.length > 0) {
        const userIds = data.map(m => m.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", userIds);
        
        if (!profilesError && profiles) {
          return data.map(m => ({
            user_id: m.user_id,
            profiles: profiles.find(p => p.id === m.user_id) || { id: m.user_id, email: '' }
          }));
        }
      }
      
      return data?.map(m => ({ user_id: m.user_id, profiles: { id: m.user_id, email: '' } })) || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user?.id && !!selectedWorkspace,
  });

  const loading = workspacesLoading || eventsLoading;

  // Advanced filter system
  const filterScope = selectedWorkspace ?? null;
  const calendarFilters = useCalendarFilters(events as any, filterScope);
  const ownerNames = useMemo(() => {
    const map: Record<string, string> = {};
    (workspaceMembers as any[]).forEach((m) => {
      const id = m.user_id ?? m.id;
      const name = m.profiles?.email || m.profiles?.full_name || id;
      if (id) map[id] = name;
    });
    return map;
  }, [workspaceMembers]);

  useEffect(() => {
    if (user) {
      fetchUserPlan();
    }
  }, [user]);

  useEffect(() => {
    if (workspaces.length > 0 && !selectedWorkspace) {
      setSelectedWorkspace(workspaces[0].id);
    }
  }, [workspaces, selectedWorkspace]);

  // Handle prefill URL parameter from AI Post Generator
  useEffect(() => {
    if (searchParams.get('prefill') === 'true') {
      setTimeout(() => {
        document.getElementById('quick-schedule-form')?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 500);
    }
  }, [searchParams]);

  // Handle preset weekday/hour from Performance Insights
  useEffect(() => {
    const presetWeekday = searchParams.get('preset_weekday');
    const presetHour = searchParams.get('preset_hour');

    if (presetWeekday && presetHour) {
      const date = getNextWeekdayDate(parseInt(presetWeekday), parseInt(presetHour));
      setPrefillDate(date);
      setShowCreateDialog(true);
      toast.success(t('calendar.bestPostingTimePrefilled'));
    }
  }, [searchParams, toast]);

  const getNextWeekdayDate = (weekday: number, hour: number): Date => {
    const now = new Date();
    const currentDay = now.getDay();
    const daysUntil = (weekday - currentDay + 7) % 7 || 7;
    const target = new Date(now);
    target.setDate(now.getDate() + daysUntil);
    target.setHours(hour, 0, 0, 0);
    return target;
  };

  const fetchUserPlan = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("plan, test_mode_plan")
      .eq("id", user?.id)
      .single();
    
    if (data) {
      setUserPlan(data.test_mode_plan || data.plan || "free");
    }
  };

  const hasCalendarAccess = () => {
    const planHierarchy: Record<string, number> = {
      'free': 0,
      'basic': 1,
      'pro': 2,
      'enterprise': 3
    };
    
    const userLevel = planHierarchy[userPlan] || 0;
    const requiredLevel = planHierarchy['pro'] || 0;
    
    return userLevel >= requiredLevel;
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    setSelectedEventId(event.id);
    setShowEventDrawer(true);
  };

  const handleDateClick = (date: Date) => {
    setPrefillDate(date);
    setShowDayCockpit(true);
  };


  const handleEventMove = async (eventId: string, newDate: Date) => {
    if (isAwsTestBackend) {
      const row = events.find(event => event.id === eventId);
      if (!row || !dataScope.isCurrent()) return;
      const queryKey = calendarEventsQueryKey(user?.id, selectedWorkspace, selectedClient, selectedBrand);
      try {
        const receipt = await draftEditor.edit(row, calendarDraftMove(row, newDate));
        if (!receipt || !dataScope.isCurrent()) return;
        queryClient.setQueryData<CalendarEvent[]>(queryKey, (old = []) => old.map(event =>
          event.id === receipt.event.id && event.version === row.version && event.updated_at === row.updated_at
            ? { ...event, ...receipt.event } as CalendarEvent : event));
        await queryClient.invalidateQueries({ queryKey });
        if (dataScope.isCurrent()) toast.success(tx({ en: 'Draft time updated.', de: 'Entwurfszeit aktualisiert.', es: 'Hora del borrador actualizada.' }));
      } catch {
        if (dataScope.isCurrent()) toast.error(tx({ en: 'Draft could not be moved. Reload it and try again.', de: 'Entwurf konnte nicht verschoben werden. Neu laden und erneut versuchen.', es: 'No se pudo mover el borrador. Vuelve a cargarlo e inténtalo de nuevo.' }));
      }
      return;
    }

    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }

    // Optimistic Update
    const queryKey = calendarEventsQueryKey(user?.id, selectedWorkspace, selectedClient, selectedBrand);
    const previousEvents = queryClient.getQueryData<CalendarEvent[]>(queryKey);
    
    queryClient.setQueryData<CalendarEvent[]>(queryKey, (old = []) =>
      old.map(e => e.id === eventId ? { ...e, start_at: newDate.toISOString() } : e)
    );

    try {
      const { error } = await supabase
        .from("calendar_events")
        .update({ start_at: newDate.toISOString() })
        .eq("id", eventId);

      if (error) throw error;

      await emit({
        event_type: 'calendar.post.scheduled',
        source: 'calendar',
        payload: { event_id: eventId, new_date: newDate.toISOString() },
      }, { silent: true });
      
      toast.success(t("calendar.messages.eventMoved"));
    } catch (error) {
      // Rollback on error
      if (previousEvents) {
        queryClient.setQueryData(queryKey, previousEvents);
      }
      toast.error(t("calendar.messages.moveFailed"));
      console.error(error);
    }
  };

  const handleStatusChange = async (eventId: string, newStatus: any) => {
    if (isAwsTestBackend) {
      toast.info(tx({ en: 'Status changes are not available yet.', de: 'Statusänderungen sind noch nicht verfügbar.', es: 'Los cambios de estado aún no están disponibles.' }));
      return;
    }

    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }

    // Optimistic Update
    const queryKey = calendarEventsQueryKey(user?.id, selectedWorkspace, selectedClient, selectedBrand);
    const previousEvents = queryClient.getQueryData<CalendarEvent[]>(queryKey);
    
    queryClient.setQueryData<CalendarEvent[]>(queryKey, (old = []) =>
      old.map(e => e.id === eventId ? { ...e, status: newStatus } : e)
    );

    try {
      const { error } = await supabase
        .from("calendar_events")
        .update({ status: newStatus as any })
        .eq("id", eventId);

      if (error) throw error;
      toast.success(t("calendar.messages.statusUpdated"));
    } catch (error) {
      // Rollback on error
      if (previousEvents) {
        queryClient.setQueryData(queryKey, previousEvents);
      }
      toast.error(t("calendar.messages.statusFailed"));
      console.error(error);
    }
  };


  const handleShare = () => {
    toast.info(t("calendar.messages.shareComingSoon"));
  };

  const handleExport = async (format: 'csv' | 'pdf' | 'ics' | 'metrics') => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    
    // Validate that there are events to export
    if (events.length === 0) {
      toast.error(t("calendar.messages.noEventsToExport"));
      return;
    }
    
    try {
      toast.info(`Starting ${format.toUpperCase()} export...`);
      
      switch (format) {
        case 'csv':
          await exportToCSV(events);
          toast.success('CSV export completed');
          break;
          
        case 'pdf':
          toast.info(t("calendar.messages.pdfPrintDialog"));
          const now = new Date();
          await exportToPDF({
            workspaceId: selectedWorkspace,
            brandKitId: selectedBrand,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            format: 'pdf'
          });
          break;
          
        case 'ics':
          await exportToICS(events.filter(e => e.status === 'scheduled'));
          toast.success(t("calendar.messages.exportSuccess"));
          break;
          
        case 'metrics':
          await exportMetricsToCSV(events);
          toast.success('Metrics export completed');
          break;
      }
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(error.message || 'Export failed');
    }
  };

  const handleCreateEvent = () => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    setPrefillDate(null);
    setShowCreateDialog(true);
  };

  const handleAddNote = () => {
    if (!hasCalendarAccess()) {
      setShowUpgrade(true);
      return;
    }
    toast.info(t("calendar.messages.addNoteComingSoon"));
  };

  const renderView = () => {
    // Transform events to Post format that views expect
    const transformedPosts = (calendarFilters.filteredEvents as typeof events).map(event => ({
      id: event.id,
      title: event.title,
      channels: event.channels,
      status: event.status,
      start_at: event.start_at || new Date().toISOString(),
      end_at: event.end_at,
      timezone: event.timezone,
      campaign_id: event.campaign_id,
      owner_id: event.owner_id,
      brief: event.brief,
      assets_json: (event as any).assets_json,
      assignees: (event as any).assignees,
      tags: (event as any).tags,
    }));

    const commonProps = {
      posts: transformedPosts as any,
      onPostClick: (post: any) => {
        // Always open the editor drawer on post click
        handleEventClick(post);
      },
      readOnly: !hasCalendarAccess(),
      selectedEventIds,
    };

    switch (currentView) {
      case "month":
        return (
          <MonthView
            {...commonProps}
            onPostMove={handleEventMove as any}
            onDateClick={handleDateClick}
          />
        );
      case "week":
        return (
          <WeekView
            {...commonProps}
            onPostMove={handleEventMove as any}
            onDateClick={handleDateClick}
          />
        );
      case "list":
        return (
          <ListView
            {...commonProps}
          />
        );
      case "kanban":
        return (
          <KanbanView
            {...commonProps}
            onStatusChange={handleStatusChange as any}
            onCreateInColumn={() => handleDateClick(new Date())}
          />
        );
      case "heatmap":
        return (
          <HeatmapView
            {...commonProps}
            onDateClick={handleDateClick}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      data-testid="calendar-page"
      className={embedded ? "relative flex flex-col" : "relative min-h-screen flex flex-col bg-background"}
    >
      {!embedded && <CalendarBackgroundAurora />}
      <main className={embedded ? "relative flex-1" : "relative flex-1 container mx-auto px-4 py-6"}>
        {!embedded && <Breadcrumbs category="optimize" feature={t('calendar.smartCalendar')} />}

        {/* Compact Layout - reduced spacing */}
        <div className={embedded ? "space-y-3" : "space-y-3 mt-4"}>
          {/* Hero Header - Compact */}
          {!embedded && <CalendarHeroHeader eventCount={events.length} />}

          {/* Scope Switcher + Google (combined row) */}
          <CalendarHeader
            workspaceId={selectedWorkspace}
            clientId={selectedClient}
            brandId={selectedBrand}
            onWorkspaceChange={setSelectedWorkspace}
            onClientChange={setSelectedClient}
            onBrandChange={setSelectedBrand}
            workspaces={workspaces}
            clients={clients}
            brands={brands.map(b => ({ id: b.id, name: b.brand_name || 'Unnamed Brand' }))}
            onOpenIntegrations={() => setShowIntegrations(true)}
          />

          {/* Toolbar - Compact with grouped actions */}
          <div className="flex items-center justify-between gap-3">
            <CalendarToolbar
              currentView={currentView}
              onViewChange={setCurrentView}
              onAddNote={handleAddNote}
              onCreateEvent={handleCreateEvent}
              onShare={handleShare}
              onExport={handleExport}
              onOpenAutoSchedule={() => setShowAutoSchedule(true)}
              onOpenCampaignTemplates={() => setShowCampaignTemplates(true)}
              onOpenBlackoutDates={() => setShowBlackoutDates(true)}
              onOpenHolidays={() => setShowHolidays(true)}
              onOpenIntegrations={() => setShowIntegrations(true)}
              readOnly={!hasCalendarAccess()}
              selectedEventsCount={selectedEventIds.length}
              onSelectAllDrafts={() => {
                const selectableStatuses = ['briefing', 'in_progress', 'review', 'approved'];
                const draftEventIds = events
                  .filter(event => selectableStatuses.includes(event.status))
                  .map(event => event.id);
                setSelectedEventIds(draftEventIds);
              }}
              onDeselectAll={() => setSelectedEventIds([])}
              filterSlot={
                <CalendarFilterPopover
                  filters={calendarFilters.filters}
                  options={calendarFilters.options}
                  saved={calendarFilters.saved}
                  activeCount={calendarFilters.activeCount}
                  onToggle={calendarFilters.toggle}
                  onUpdate={calendarFilters.update}
                  onReset={calendarFilters.reset}
                  onSave={calendarFilters.saveCurrent}
                  onLoad={calendarFilters.loadSaved}
                  onDelete={calendarFilters.deleteSaved}
                  ownerNames={ownerNames}
                />
              }
            />
            
            <NotificationBadge onClick={() => setShowNotifications(true)} />
          </div>

          {/* Filter bar with chips + quick presets */}
          <CalendarFilterBar
            filters={calendarFilters.filters}
            activeCount={calendarFilters.activeCount}
            totalCount={events.length}
            filteredCount={calendarFilters.filteredEvents.length}
            ownerNames={ownerNames}
            onUpdate={calendarFilters.update}
            onToggle={calendarFilters.toggle}
            onReset={calendarFilters.reset}
            onApplyPreset={calendarFilters.applyPreset}
          />

          {/* Metrics Dashboard - Compact (expandable) */}
          {showMetricsDashboard && events.length > 0 && (
            <CalendarMetricsDashboard 
              events={events}
              workspaceMembers={workspaceMembers}
            />
          )}

          {/* Main Calendar View - Glassmorphism Container */}
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto shadow-[0_0_20px_hsla(43,90%,68%,0.4)]"></div>
            </div>
          ) : workspaces.length === 0 ? (
            <CalendarEmptyState />
          ) : !selectedWorkspace ? (
            <div className="text-center py-12 text-muted-foreground backdrop-blur-xl bg-card/40 border border-white/10 rounded-2xl">
              {t("calendar.empty.noWorkspace")}
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden">
              {/* Outer glass shell with double-border + gold corner accents */}
              <div className="absolute inset-0 rounded-2xl pointer-events-none">
                <div className="absolute inset-0 rounded-2xl border border-primary/15" />
                <div className="absolute inset-[1px] rounded-2xl border border-white/5" />
                {/* corner gold ticks */}
                <span className="absolute top-0 left-0 w-6 h-px bg-gradient-to-r from-primary/60 to-transparent" />
                <span className="absolute top-0 left-0 h-6 w-px bg-gradient-to-b from-primary/60 to-transparent" />
                <span className="absolute top-0 right-0 w-6 h-px bg-gradient-to-l from-primary/60 to-transparent" />
                <span className="absolute top-0 right-0 h-6 w-px bg-gradient-to-b from-primary/60 to-transparent" />
                <span className="absolute bottom-0 left-0 w-6 h-px bg-gradient-to-r from-primary/60 to-transparent" />
                <span className="absolute bottom-0 left-0 h-6 w-px bg-gradient-to-t from-primary/60 to-transparent" />
                <span className="absolute bottom-0 right-0 w-6 h-px bg-gradient-to-l from-primary/60 to-transparent" />
                <span className="absolute bottom-0 right-0 h-6 w-px bg-gradient-to-t from-primary/60 to-transparent" />
              </div>
              <div className="backdrop-blur-2xl bg-card/50 rounded-2xl p-6 shadow-[0_30px_80px_-30px_hsla(43,90%,68%,0.18)]">
                {renderView()}
              </div>
            </div>
          )}

          {/* Day Cockpit hint — only on date-based views */}
          {selectedWorkspace && (currentView === "month" || currentView === "week") && (
            <div className="mt-8 text-center text-xs text-muted-foreground/70 tracking-wider uppercase">
              {t('calendar.quickSchedule')} & {t('calendar.publishQueue')} {tx({ de: '→ Klick auf einen Tag', en: '→ Click on a day', es: '→ Haz clic en un día' })}
            </div>
          )}

        </div>
      </main>

      {!embedded && <Footer />}

      {/* Event Detail Dialog */}
      {selectedEvent && (
        <EventDetailDialog
          event={selectedEvent}
          open={showEventDetail}
          onClose={() => {
            setShowEventDetail(false);
            setSelectedEvent(null);
          }}
          onSave={invalidateEvents}
        />
      )}

      {/* Event Create Dialog */}
      {showCreateDialog && (
        <EventCreateDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          workspaceId={selectedWorkspace}
          clients={clients}
          brands={brands}
          workspaceMembers={workspaceMembers}
          prefillDate={prefillDate}
          onSuccess={invalidateEvents}
        />
      )}

      {/* Upgrade Dialog */}
      <PlanLimitDialog
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="Smart Content Calendar"
      />

      {/* Sprint 5-6: AI & Automation Dialogs */}
      <AutoScheduleDialog
        open={showAutoSchedule}
        onClose={() => setShowAutoSchedule(false)}
        workspaceId={selectedWorkspace}
        brandKitId={selectedBrand}
        eventIds={selectedEventIds}
        onScheduled={invalidateEvents}
      />

      <CampaignTemplateDialog
        open={showCampaignTemplates}
        onClose={() => setShowCampaignTemplates(false)}
        workspaceId={selectedWorkspace}
        brandKitId={selectedBrand}
        onGenerated={invalidateEvents}
      />

      <BlackoutDatePicker
        open={showBlackoutDates}
        onClose={() => setShowBlackoutDates(false)}
        workspaceId={selectedWorkspace}
        brandKitId={selectedBrand}
        clientId={selectedClient}
        onSaved={invalidateEvents}
      />

      <HolidaySuggestionsDialog
        open={showHolidays}
        onClose={() => setShowHolidays(false)}
        workspaceId={selectedWorkspace}
        brandKitId={selectedBrand}
        onEventCreated={invalidateEvents}
      />

      <IntegrationSettingsDialog
        open={showIntegrations}
        onClose={() => setShowIntegrations(false)}
        workspaceId={selectedWorkspace}
      />

      {/* Event Drawer (Right Panel) */}
      <EventDrawer
        workspaceId={selectedWorkspace}
        open={showEventDrawer}
        onClose={() => {
          setShowEventDrawer(false);
          setSelectedEventId(null);
        }}
        eventId={selectedEventId}
        onDelete={invalidateEvents}
        onUpdate={invalidateEvents}
      />

      {/* Floating Action Button (Mobile only) */}
      {isMobile && hasCalendarAccess && selectedWorkspace && (
        <Button
          size="lg"
          onClick={handleCreateEvent}
          className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg z-50 p-0"
        >
          <Plus className="w-6 h-6" />
        </Button>
      )}

      {/* Phase 17: Advanced Scheduling & Workflow Dialogs */}
      <NotificationCenter
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
      />

      <BulkScheduleDialog
        workspace_id={selectedWorkspace}
        open={showBulkSchedule}
        onClose={() => setShowBulkSchedule(false)}
      />

      <RecurringRuleDialog
        workspace_id={selectedWorkspace}
        open={showRecurringRules}
        onClose={() => setShowRecurringRules(false)}
      />

      {/* Day Cockpit — combined Quick Schedule + Queue */}
      <DayCockpitDialog
        open={showDayCockpit}
        onOpenChange={setShowDayCockpit}
        date={prefillDate}
        workspaceId={selectedWorkspace || ''}
        onSuccess={invalidateEvents}
        onEventClick={(eventId) => {
          setSelectedEventId(eventId);
          setShowEventDrawer(true);
        }}
      />
    </div>
  );
}
