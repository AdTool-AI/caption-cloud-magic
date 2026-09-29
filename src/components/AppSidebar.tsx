import { tx } from "@/lib/i18nText";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bot, Home, Lock } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Brand } from "@/components/layout/Brand";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { hubDefinitions } from "@/config/hubConfig";
import { showBetaSurface } from "@/config/betaFlags";
import {
  Sidebar,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function AppSidebar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isAdmin } = useUserRoles();
  const location = useLocation();
  const navigate = useNavigate();

  const isHubActive = (hubKey: string) => {
    if (hubKey === "home") return location.pathname === "/home" || location.pathname === "/";
    const hub = hubDefinitions.find((h) => h.key === hubKey);
    if (!hub) return false;
    return hub.items.some((item) => location.pathname === item.route) || location.pathname === `/hub/${hubKey}`;
  };

  const visibleHubs = hubDefinitions.filter((h) => {
    if (h.adminOnly && !isAdmin) return false;
    // Hide half-finished hubs during Beta unless the user is admin
    if (h.comingSoon && !showBetaSurface(isAdmin)) return false;
    return true;
  });

  return (
    <TooltipProvider delayDuration={0}>
      <Sidebar className="w-[68px] min-w-[68px] max-w-[68px] sticky top-0 h-screen max-h-screen self-start overflow-hidden" collapsible="none">
        {/* Brand icon */}
        <div className="flex items-center justify-center h-14 border-b border-border bg-card">
          <Brand compact showText={false} />
        </div>

        <div className="bg-card border-r border-border flex min-h-0 flex-1 flex-col items-center py-3 gap-1 overflow-hidden">
          {/* Home */}
          <SidebarMenu className="w-full px-2">
            <SidebarMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      asChild
                      isActive={isHubActive("home")}
                      className={cn(
                        "h-11 w-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200",
                        isHubActive("home")
                          ? "bg-primary/15 text-primary shadow-[0_0_12px_rgba(124,58,237,0.25)]"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <Link to="/home">
                        <Home className="h-5 w-5" />
                      </Link>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8} className="z-[90] bg-popover text-popover-foreground border-border shadow-xl">
                    <p className="font-medium">{t("home")}</p>
                  </TooltipContent>
                </Tooltip>
            </SidebarMenuItem>
          </SidebarMenu>

          {/* AdTool Agent */}
          <SidebarMenu className="w-full px-2">
            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === "/agent"}
                    className={cn(
                      "h-11 w-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200",
                      location.pathname === "/agent"
                        ? "bg-primary/15 text-primary shadow-[0_0_12px_rgba(124,58,237,0.25)]"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <Link to="/agent">
                      <Bot className="h-5 w-5" />
                    </Link>
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8} className="z-[90] bg-popover text-popover-foreground border-border shadow-xl">
                  <p className="font-medium">AdTool Agent</p>
                </TooltipContent>
              </Tooltip>
            </SidebarMenuItem>
          </SidebarMenu>

          {/* Divider */}
          <div className="w-8 h-px bg-border my-1" />

          {/* Hub Icons */}
          <SidebarMenu data-tour="sidebar-hubs" className="w-full px-2 flex-1 space-y-1">
            {visibleHubs.map((hub) => {
              const HubIcon = hub.icon;
              const active = isHubActive(hub.key);
              const comingSoon = hub.comingSoon && !isAdmin;

              return (
                <SidebarMenuItem key={hub.key}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          onClick={() => {
                            if (comingSoon) {
                              toast.info(`${t(hub.titleKey)} — Coming Soon`, {
                                description: tx({ de: 'Wir benachrichtigen dich, sobald dieser Bereich live geht.', en: 'We will notify you as soon as this area goes live.', es: 'Te avisaremos tan pronto como esta área esté disponible.' }),
                              });
                              return;
                            }
                            navigate(`/hub/${hub.key}`);
                          }}
                          whileHover={{ scale: comingSoon ? 1.04 : 1.08 }}
                          whileTap={{ scale: 0.95 }}
                          className={cn(
                            "relative h-11 w-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 cursor-pointer",
                            active
                              ? "bg-primary/15 text-primary shadow-[0_0_12px_rgba(124,58,237,0.25)]"
                              : comingSoon
                              ? "text-muted-foreground/60 hover:text-muted-foreground"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          )}
                        >
                          <HubIcon className="h-5 w-5" />
                          {comingSoon && (
                            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgb(251,191,36)]" />
                          )}
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8} className="z-[90] bg-popover text-popover-foreground border-border shadow-xl">
                        <p className="font-medium">
                          {t(hub.titleKey)}
                          {comingSoon && <span className="ml-1.5 text-[10px] text-amber-400">· Coming Soon</span>}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </div>

      </Sidebar>
    </TooltipProvider>
  );
}
