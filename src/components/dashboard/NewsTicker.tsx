import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { useNewsRadar, type NewsItem } from "@/hooks/useNewsRadar";

const CATEGORY_STYLES: Record<string, string> = {
  platform: "text-cyan-400",
  ai_tools: "text-violet-400",
  analytics: "text-emerald-400",
  monetization: "text-amber-400",
  community: "text-pink-400",
  social: "text-cyan-400",
  business: "text-amber-400",
  creator: "text-pink-400",
};

export const NewsTicker = () => {
  const navigate = useNavigate();
  const { news, loading } = useNewsRadar();
  const [isVisible, setIsVisible] = useState(() => {
    const stored = localStorage.getItem("newsticker-visible");
    return stored !== "false";
  });

  useEffect(() => {
    localStorage.setItem("newsticker-visible", String(isVisible));
  }, [isVisible]);

  const renderScrollContent = () => {
    return news.map((item, i) => (
      <div key={`news-${i}`} data-tour={i === 0 ? "news-radar" : undefined} className="flex items-center">
        <button
          onClick={() => navigate(`/news-hub?headline=${encodeURIComponent(item.headline)}`)}
          className="flex-shrink-0 flex items-center gap-2 px-3 py-0.5 group/card cursor-pointer"
        >
          <span className={`text-[9px] font-bold uppercase tracking-wider ${CATEGORY_STYLES[item.category] || 'text-primary/60'}`}>
            {item.source}
          </span>
          <span className="text-[9px] font-medium text-primary/90 max-w-[280px] truncate tracking-wide group-hover/card:text-primary transition-colors">
            {item.headline}
          </span>
        </button>
        {i < news.length - 1 && (
          <div className="w-px h-3 bg-gradient-to-b from-transparent via-primary/40 to-transparent mx-1" />
        )}
      </div>
    ));
  };

  return (
    <AnimatePresence mode="wait">
      {isVisible ? (
        <motion.div
          key="ticker"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="relative w-full max-w-full overflow-hidden bg-gradient-to-r from-[hsl(220,50%,3%)] via-[hsl(var(--background))]/80 to-[hsl(220,50%,3%)] backdrop-blur-md group"
        >
          {/* Top glow line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_12px_hsl(var(--primary)/0.4)]" />
          {/* Bottom glow line */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_12px_hsl(var(--primary)/0.4)]" />

          {/* Scan-line effect */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-primary/[0.06] to-transparent animate-[scanline_4s_linear_infinite]" />
          </div>

          <div className="flex items-center h-5">
            {/* Label badge */}
            <div className="relative z-10 flex-shrink-0 flex items-center gap-1 px-2 h-full bg-gradient-to-r from-[hsl(220,50%,3%)] to-transparent border-r border-primary/20">
              <span className="relative inline-flex items-center gap-1 px-1.5 py-px rounded text-[7px] font-display font-bold tracking-[0.2em] uppercase text-primary border border-primary/40 shadow-[0_0_14px_hsl(var(--primary)/0.35)]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
                NEWS RADAR
              </span>
            </div>

            {/* Scrolling news */}
            <div className="relative h-full w-0 min-w-0 flex-1 overflow-hidden">
              <div className="absolute inset-y-0 left-0 flex whitespace-nowrap animate-[marquee_120s_linear_infinite] group-hover:[animation-play-state:paused]">
                <div className="flex items-center">
                  {renderScrollContent()}
                </div>
                <div className="flex items-center">
                  {renderScrollContent()}
                </div>
              </div>
            </div>

            {/* Toggle switch */}
            <div className="relative z-10 flex-shrink-0 flex items-center gap-1 px-3 h-full bg-gradient-to-l from-[hsl(220,50%,3%)] to-transparent border-l border-primary/20">
              <Switch
                checked={isVisible}
                onCheckedChange={setIsVisible}
                className="data-[state=checked]:bg-primary/80 data-[state=unchecked]:bg-muted h-4 w-7"
              />
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="ticker-collapsed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex justify-end px-4 py-0.5"
        >
          <button
            onClick={() => setIsVisible(true)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-display font-bold tracking-[0.15em] uppercase text-primary/60 border border-primary/20 hover:border-primary/40 hover:text-primary transition-all duration-300 hover:shadow-[0_0_10px_hsl(var(--primary)/0.2)]"
          >
            ◆ NEWS
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
