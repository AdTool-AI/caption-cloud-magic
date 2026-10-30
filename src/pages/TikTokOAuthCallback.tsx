import { tx } from "@/lib/i18nText";
import { useEffect } from "react";

/**
 * TikTok redirects the user to https://useadtool.ai/api/oauth/tiktok/callback
 * (that domain is the one verified in the TikTok Developer Portal).
 * This SPA route only forwards `code` + `state` to the backend callback
 * function, which validates the state, exchanges the tokens and redirects
 * the user back into the app.
 */
export default function TikTokOAuthCallback() {
  useEffect(() => {
    const search = window.location.search;
    const target = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tiktok-oauth-callback${search}`;
    window.location.replace(target);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">{tx({ de: "TikTok-Verbindung wird abgeschlossen…", en: "TikTok connection is being finalized…", es: "Se está finalizando la conexión con TikTok…" })}</p>
    </div>
  );
}
