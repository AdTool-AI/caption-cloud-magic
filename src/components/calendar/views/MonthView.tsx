import { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek, isSameMonth } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { tx } from "@/lib/i18nText";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { PostChip } from "./PostChip";

interface Post {
  id: string;
  title: string;
  channels: string[];
  status: string;
  start_at: string;
}

interface MonthViewProps {
  posts: Post[];
  onPostClick: (post: Post) => void;
  onPostMove?: (postId: string, newDate: Date) => void;
  onDateClick?: (date: Date) => void;
  readOnly?: boolean;
  selectedEventIds?: string[];
}

const statusColors: Record<string, string> = {
  briefing: "bg-gray-500",
  in_progress: "bg-blue-500",
  review: "bg-yellow-500",
  pending_approval: "bg-orange-500",
  approved: "bg-green-500",
  scheduled: "bg-indigo-500",
  published: "bg-purple-500",
};

const platformColors: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  instagram: { 
    bg: "bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400", 
    border: "border-pink-400", 
    text: "text-white",
    glow: "hover:shadow-[0_0_20px_rgba(236,72,153,0.5)]"
  },
  facebook: { 
    bg: "bg-[#1877F2]", 
    border: "border-[#1877F2]", 
    text: "text-white",
    glow: "hover:shadow-[0_0_20px_rgba(24,119,242,0.5)]"
  },
  linkedin: { 
    bg: "bg-[#0A8A0A]", 
    border: "border-[#0A8A0A]", 
    text: "text-white",
    glow: "hover:shadow-[0_0_20px_rgba(10,138,10,0.5)]"
  },
  tiktok: { 
    bg: "bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900", 
    border: "border-cyan-400 border-2", 
    text: "text-white",
    glow: "hover:shadow-[0_0_20px_rgba(34,211,238,0.5)]"
  },
  youtube: { 
    bg: "bg-[#FF0000]", 
    border: "border-[#FF0000]", 
    text: "text-white",
    glow: "hover:shadow-[0_0_20px_rgba(255,0,0,0.5)]"
  },
};

const getPlatformStyle = (channels: string[]) => {
  const primaryChannel = channels[0]?.toLowerCase() || '';
  return platformColors[primaryChannel] || { 
    bg: "bg-gradient-to-r from-gold/80 to-gold/60", 
    border: "border-gold/50", 
    text: "text-black",
    glow: "hover:shadow-[0_0_20px_rgba(245,199,106,0.5)]"
  };
};

export function MonthView({
  posts,
  onPostClick,
  onPostMove,
  onDateClick,
  readOnly,
  selectedEventIds = [],
}: MonthViewProps) {
  const selectableStatuses = ['briefing', 'in_progress', 'review', 'approved'];
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, postId: string) => {
    if (readOnly) return;
    setDraggedPostId(postId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedPostId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (draggedPostId && !readOnly && onPostMove) {
      onPostMove(draggedPostId, date);
    }
    setDraggedPostId(null);
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getPostsForDay = (date: Date) => {
    return posts.filter((post) => isSameDay(new Date(post.start_at), date));
  };

  const getPlatformIcon = (platform: string | undefined) => {
    if (!platform) return '📝';
    switch (platform.toLowerCase()) {
      case 'instagram': return '📷';
      case 'facebook': return '👍';
      case 'linkedin': return '💼';
      case 'twitter':
      case 'x': return '🐦';
      case 'tiktok': return '🎵';
      case 'youtube': return '▶️';
      default: return '📱';
    }
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const weekDays = tx({
    de: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
    en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    es: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
  });

  if (isMobile) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{format(currentMonth, "MMMM yyyy")}</h2>
          <div className="flex gap-2">
            <Button onClick={prevMonth} variant="outline" size="sm">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button onClick={nextMonth} variant="outline" size="sm">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {days.map((day) => {
            const dayPosts = getPostsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            if (!isCurrentMonth || dayPosts.length === 0) return null;

            return (
              <Card key={day.toISOString()} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-lg font-bold">{format(day, "EEE, MMM d")}</div>
                    <div className="text-sm text-muted-foreground">
                      {dayPosts.length} {t("calendar.mobile.events")}
                    </div>
                  </div>
                  {!readOnly && onDateClick && <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDateClick?.(day)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>}
                </div>

                <div className="space-y-2">
                  {dayPosts.map((post) => (
                  <div
                    key={post.id}
                    onClick={() => onPostClick(post)}
                    className={cn(
                      "p-3 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer relative",
                      selectableStatuses.includes(post.status) && "hover:ring-2 hover:ring-primary/50",
                      selectedEventIds.includes(post.id) && "ring-2 ring-primary bg-primary/10"
                    )}
                  >
                      <Badge className={statusColors[post.status] + " text-white mb-2"}>
                        {post.status}
                      </Badge>
                      <div className="font-medium">{post.title}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {post.channels.join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // Density bar color by dominant status of the day
  const dominantStatusColor = (dayPosts: Post[]) => {
    if (dayPosts.length === 0) return null;
    const counts: Record<string, number> = {};
    dayPosts.forEach((p) => (counts[p.status] = (counts[p.status] || 0) + 1));
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return statusColors[dominant] ?? "bg-primary";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            {format(currentMonth, "MMMM")}
          </h2>
          <span className="text-xl text-muted-foreground/60 tabular-nums">
            {format(currentMonth, "yyyy")}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={prevMonth}
            variant="outline"
            size="default"
            className="bg-card/40 backdrop-blur-md border-white/10 hover:border-primary/40 hover:bg-primary/10 hover:shadow-[0_0_15px_hsla(43,90%,68%,0.2)] transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button
            onClick={nextMonth}
            variant="outline"
            size="default"
            className="bg-card/40 backdrop-blur-md border-white/10 hover:border-primary/40 hover:bg-primary/10 hover:shadow-[0_0_15px_hsla(43,90%,68%,0.2)] transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Weekday header with gold hairline */}
      <div className="relative">
        <div className="grid grid-cols-7 gap-3 pb-2">
          {weekDays.map((day, idx) => {
            const isWeekend = idx >= 5;
            return (
              <div
                key={day}
                className={cn(
                  "text-center text-[10px] font-semibold tracking-[0.18em] uppercase py-2",
                  isWeekend ? "text-cyan-400/70" : "text-muted-foreground/80"
                )}
              >
                {day}
              </div>
            );
          })}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </div>

      <div className="grid grid-cols-7 gap-3">
        {/* Days */}
        {days.map((day) => {
          const dayPosts = getPostsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, new Date());
          const dayOfWeek = day.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const density = Math.min(dayPosts.length, 4); // 0..4
          const densityColor = dominantStatusColor(dayPosts);

          return (
            <motion.div
              key={day.toISOString()}
              onClick={() => !readOnly && isCurrentMonth && onDateClick?.(day)}
              onDragOver={isCurrentMonth ? handleDragOver : undefined}
              onDrop={isCurrentMonth ? (e) => handleDrop(e, day) : undefined}
              whileHover={isCurrentMonth ? { y: -2 } : undefined}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className={cn(
                "min-h-[110px] p-3 pl-4 border rounded-2xl transition-all cursor-pointer group relative overflow-hidden",
                "backdrop-blur-md",
                isToday
                  ? "bg-primary/[0.07] border-primary/50 shadow-[0_0_25px_hsla(43,90%,68%,0.18),inset_0_0_20px_hsla(43,90%,68%,0.04)]"
                  : isCurrentMonth
                  ? cn(
                      "bg-card/40 border-white/5 hover:border-primary/40 hover:bg-card/60 hover:shadow-[0_8px_24px_-8px_hsla(43,90%,68%,0.25)]",
                      isWeekend && "bg-card/30"
                    )
                  : "opacity-30 bg-muted/5 border-white/5",
                draggedPostId && isCurrentMonth && "border-dashed border-primary/60 bg-primary/10",
                "flex flex-col"
              )}
            >
              {/* Density bar on left edge */}
              {density > 0 && (
                <div
                  className={cn(
                    "absolute left-0 top-2 bottom-2 w-[3px] rounded-full",
                    densityColor,
                    "opacity-80"
                  )}
                  style={{ height: `${20 + density * 18}%`, top: "10%" }}
                />
              )}

              {/* Today double-ring pulse */}
              {isToday && (
                <motion.div
                  className="absolute -inset-px rounded-2xl border border-primary/30 pointer-events-none"
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                />
              )}

              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-base font-bold tabular-nums leading-none",
                      isToday ? "text-primary" : isWeekend ? "text-cyan-300/80" : "text-foreground/90"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {isToday && (
                    <span className="text-[8px] font-bold tracking-[0.15em] text-primary/80 uppercase">
                      {t("postingTimes.today") || "Today"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {dayPosts.length > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 tabular-nums">
                      {dayPosts.length}
                    </span>
                  )}
                  {!readOnly && onDateClick && isCurrentMonth && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-6 w-6 transition-all rounded-md",
                        dayPosts.length === 0
                          ? "opacity-60 hover:opacity-100 hover:bg-primary/20 hover:text-primary"
                          : "opacity-0 group-hover:opacity-100 hover:bg-primary/20 hover:text-primary"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDateClick?.(day);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1 flex-1">
                {dayPosts.slice(0, 3).map((post) => {
                  const channels = Array.isArray(post.channels) ? post.channels : [post.channels];
                  const isSelected = selectedEventIds.includes(post.id);
                  return (
                    <PostChip
                      key={post.id}
                      id={post.id}
                      title={post.title}
                      channels={channels}
                      status={post.status}
                      selected={isSelected}
                      selectable={selectableStatuses.includes(post.status)}
                      dragging={draggedPostId === post.id}
                      draggable={!readOnly}
                      onDragStart={(e) => handleDragStart(e, post.id)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPostClick(post);
                      }}
                    />
                  );
                })}
                {dayPosts.length > 3 && (
                  <div className="text-[10px] text-primary/80 text-center py-1 font-semibold bg-primary/10 border border-primary/20 rounded-md">
                    +{dayPosts.length - 3} {t("calendar.mobile.events") || ""}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
