import { isAwsTestBackend } from '@/lib/backendTarget';
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ui/ThemeToggle";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, LogOut, User, LayoutDashboard, MessageSquare } from "lucide-react";
import { Badge } from "./ui/badge";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Header = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [testMode, setTestMode] = useState<string | null>(null);

  useEffect(() => {
    const checkTestMode = async () => {
      if (!user || isAwsTestBackend) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('test_mode_plan')
          .eq('id', user.id)
          .maybeSingle();
        
        if (error) {
          console.warn('Error fetching test mode:', error);
          return;
        }
        
        setTestMode(data?.test_mode_plan || null);
      } catch (error) {
        console.warn('Failed to check test mode:', error);
      }
    };
    checkTestMode();
  }, [user]);

  return (
    <>
      {/* Skip to main content link for accessibility */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg"
      >
        Skip to main content
      </a>
      
      <header 
        className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        role="banner"
      >
      <div className="container flex h-16 items-center justify-between">
        <Link 
          to="/" 
          className="flex items-center gap-2 font-bold text-xl"
          aria-label={t("home")}
        >
          <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
          AdTool AI
        </Link>
        
        <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
          <Link 
            to="/pricing" 
            className="text-sm font-medium transition-colors hover:text-primary"
            aria-label={t("nav.pricing")}
          >
            {t("nav.pricing")}
          </Link>
          <Link 
            to="/faq" 
            className="text-sm font-medium transition-colors hover:text-primary"
            aria-label={t("nav.faq")}
          >
            {t("nav.faq")}
          </Link>
          {user && (
            <Link 
              to="/home"
              className="text-sm font-medium transition-colors hover:text-primary"
              aria-label="Dashboard"
            >
              Dashboard
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0" role="toolbar" aria-label="User actions">
          {testMode && (
            <Badge variant="secondary" className="hidden sm:inline-flex bg-warning/20 text-warning border-warning/30">
              🧪 Test Mode: {testMode.charAt(0).toUpperCase() + testMode.slice(1)}
            </Badge>
          )}
          <ThemeToggle />
          <LanguageSwitcher />
          {user && !isAwsTestBackend && (
            <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Community">
              <Link to="/community">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          )}
          {user && !isAwsTestBackend && <NotificationBell />}
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm" aria-label={t("auth.account")}>
                <Link to={isAwsTestBackend ? "/home" : "/account"}>
                  <User className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                  <span className="hidden sm:inline">{t("auth.account")}</span>
                </Link>
              </Button>
              <Button 
                onClick={signOut} 
                variant="ghost" 
                size="sm"
                aria-label={t("auth.logout")}
              >
                <LogOut className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                <span className="hidden sm:inline">{t("auth.logout")}</span>
              </Button>
            </>
          ) : (

            <>
              <Button asChild variant="ghost" size="sm" className={isAwsTestBackend ? "sm:hidden" : undefined} aria-label={t("auth.login")}>
                <Link to="/auth">{t("auth.login")}</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:flex" aria-label={isAwsTestBackend ? t("auth.login") : t("hero.cta")}>
                <Link to="/auth">{isAwsTestBackend ? t("auth.login") : t("hero.cta")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
    </>
  );
};
