import { tx } from "@/lib/i18nText";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import posthog from "posthog-js";
import { PostHogProvider } from 'posthog-js/react';
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import { AwsTestBanner } from '@/components/AwsTestBanner';
import { isAwsTestBackend } from '@/lib/backendTarget';
import { installFunctionsLangHeader } from "@/lib/functionsLang";
import "./index.css";

installFunctionsLangHeader();


// The AWS validation build does not initialize third-party capture or replay.
if (!isAwsTestBackend) {
// Initialize Sentry
Sentry.init({
  dsn: "https://107ea857a2b43472c3c60ae6da9829b5e@o4510408780480512.ingest.de.sentry.io/4510408787886160",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  // Performance Monitoring
  tracesSampleRate: 0.1,
  // Session Replay
  replaysSessionSampleRate: 0.02,
  replaysOnErrorSampleRate: 1.0,
  // Environment
  environment: window.location.hostname === 'localhost' ? 'development' : 'production',
  // Filter errors
  beforeSend(event, hint) {
    // Add PostHog distinct_id to Sentry events
    if (posthog) {
      event.user = {
        ...event.user,
        id: posthog.get_distinct_id(),
      };
    }
    
    // Filter out non-critical errors
    const errorMessage = hint?.originalException?.toString() || event.message || '';
    const ignoredErrors = [
      'ResizeObserver loop',
      'Loading chunk',
      'Failed to fetch',
      'Network request failed',
      'AbortError',
      'cancelled',
      'ChunkLoadError',
      'timeout'
    ];
    
    if (ignoredErrors.some(err => errorMessage.includes(err))) {
      return null; // Don't send to Sentry
    }
    
    return event;
  },
});

// Initialize PostHog
const posthogKey = 'phc_ckHbHYgHPy5bQuaVlkHzA9Cjt7Ip3wJDVsyUL5AHGq7';
const posthogHost = 'https://eu.i.posthog.com';

posthog.init(posthogKey, {
  api_host: posthogHost,
  autocapture: true,
  capture_pageview: true,
  capture_pageleave: true,
});

// Opt-out only on localhost
if (window.location.hostname === 'localhost') {
  posthog.opt_out_capturing();
} else {
  posthog.opt_in_capturing();
}

// Link PostHog to Sentry
if (posthog) {
  Sentry.setUser({
    id: posthog.get_distinct_id(),
  });
}
}

// Custom error fallback component
const ErrorFallback = ({ error }: { error?: unknown }) => {
  const errorMessage = error instanceof Error ? error.message : String(error || '');
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-foreground mb-2">{tx({ de: "Ein Fehler ist aufgetreten", en: "An error occurred", es: "Ha ocurrido un error" })}</h2>
        <p className="text-muted-foreground mb-4">
          {tx({ de: "Die Seite konnte nicht geladen werden. Bitte lade die Seite neu.", en: "The page could not be loaded. Please reload the page.", es: "No se pudo cargar la página. Por favor, recarga la página." })}
        </p>
        {errorMessage && (
          <p className="text-sm text-destructive bg-destructive/10 p-2 rounded mb-4 font-mono">
            {errorMessage}
          </p>
        )}
        <button 
          onClick={() => window.location.reload()}
          className="w-full bg-primary text-primary-foreground py-2 px-4 rounded hover:bg-primary/90 transition-colors"
        >
          {tx({ de: "Seite neu laden", en: "Reload page", es: "Recargar página" })}
        </button>
      </div>
    </div>
  );
};

// Service Worker: Do NOT register globally. SW is only registered on-demand
// when the user enables Push Notifications (see usePushNotifications.ts).
// This prevents stale caching of old frontend bundles.

// Proactively unregister any old SW and clear caches
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}
if ('caches' in window) {
  caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
}

// ChunkLoadError auto-recovery — after a new deployment the browser may
// hold a stale entry bundle that references chunk hashes that no longer
// exist. Instead of leaving the user on a broken page (which feels like
// the platform "reloaded by itself"), we reload exactly ONCE per session
// to pick up the fresh bundle. The sessionStorage guard prevents an
// infinite reload loop if the error persists for a different reason.
const CHUNK_RELOAD_FLAG = "chunk-reload-attempted";
function isChunkLoadError(reason: unknown): boolean {
  const msg = String(
    (reason as any)?.message ?? (reason as any)?.toString?.() ?? reason ?? "",
  );
  const name = String((reason as any)?.name ?? "");
  return (
    name === "ChunkLoadError" ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}
function maybeRecoverFromChunkError(reason: unknown) {
  if (!isChunkLoadError(reason)) return;
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_FLAG) === "1") {
      console.warn("[chunk-reload] already attempted in this session, skipping");
      return;
    }
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, "1");
  } catch { /* sessionStorage blocked */ }
  console.warn("[chunk-reload] stale bundle detected, reloading once", reason);
  Sentry.addBreadcrumb({
    category: "chunk-reload",
    level: "warning",
    message: String((reason as any)?.message ?? reason),
  });
  window.location.reload();
}
window.addEventListener("error", (ev) => maybeRecoverFromChunkError(ev.error ?? ev.message));
window.addEventListener("unhandledrejection", (ev) => maybeRecoverFromChunkError(ev.reason));



createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={({ error }) => <ErrorFallback error={error} />}>
    <HelmetProvider>
      <PostHogProvider client={posthog}>
        <AwsTestBanner />
        <App />
      </PostHogProvider>
    </HelmetProvider>
  </Sentry.ErrorBoundary>
);
