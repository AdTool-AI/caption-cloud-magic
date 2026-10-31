import { motion } from "framer-motion";
import { Menu, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brand } from "./Brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

import { UserMenu } from "./UserMenu";
import { CommandBar } from "@/components/ui/CommandBar";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { SocialConnectionIcons } from "@/components/dashboard/SocialConnectionIcons";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { StreakBadge } from "@/components/streak/StreakBadge";
import { WalletBadge } from "@/components/layout/WalletBadge";
import { EnhanceJobCenter } from "@/components/jobs/EnhanceJobCenter";
import { FounderCrest } from "@/components/founders/FounderCrest";
import { isAwsTestBackend } from '@/lib/backendTarget';
import { toast } from 'sonner';

export function AppHeader() {
  const { toggleSidebar } = useSidebar();
  const { user, signOut } = useAuth();

  if (isAwsTestBackend) return <header role="banner" className="sticky top-0 z-[70] flex h-14 items-center justify-between gap-4 border-b bg-background/90 px-4 backdrop-blur-xl">
    <Brand compact/><div className="flex items-center gap-3"><span className="hidden text-sm text-muted-foreground sm:block">{user?.email}</span><ThemeToggle/><Button variant="outline" size="sm" onClick={()=>void signOut().catch(()=>toast.error('Sign-out could not complete.'))}>Sign out</Button></div>
  </header>;

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-[70] h-14 shrink-0 isolate border-b bg-background/70 dark:bg-background/30 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 before:absolute before:inset-0 before:bg-gradient-to-r before:from-primary/5 before:via-transparent before:to-accent/5 before:pointer-events-none"
      role="banner"
    >
      <div className="relative flex h-14 w-full min-w-0 items-center justify-between gap-1 px-1.5 sm:gap-3 sm:px-4">
        {/* Left: Mobile Menu + Brand */}
        <div className="flex min-w-0 shrink items-center gap-1 sm:gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="lg:hidden rounded-xl"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden lg:block">
            <Brand compact />
          </div>
          <div className="lg:hidden">
            <Brand compact showText={false} />
          </div>
          {user && <FounderCrest className="ml-1 hidden sm:flex" />}
        </div>

        {/* Center-Right: Command Bar + Social Icons */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex-1 max-w-2xl">
            <CommandBar inline />
          </div>
          {user && (
            <SocialConnectionIcons />
          )}
        </div>

        {/* Right: Actions */}
        <div data-tour="header-actions" className="flex min-w-0 shrink-0 items-center gap-0 sm:gap-1 lg:ml-12">
          {user && <EnhanceJobCenter />}
          {user && <WalletBadge className="hidden sm:inline-flex" />}
          {user && <div className="hidden md:block"><StreakBadge /></div>}
          <LanguageSwitcher />
          <div className="hidden sm:block"><ThemeToggle /></div>
          {user && (
            <Button asChild variant="ghost" size="icon" className="rounded-xl hidden sm:inline-flex" aria-label="Community">
              <Link to="/community">
                <MessageSquare className="h-5 w-5" />
              </Link>
            </Button>
          )}

          {user && <NotificationBell />}
          <UserMenu />
        </div>
      </div>
    </motion.header>
  );
}
