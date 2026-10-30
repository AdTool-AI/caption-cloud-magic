/**
 * Analytics utility for PostHog event tracking
 * 
 * To enable PostHog analytics:
 * 1. Sign up at https://posthog.com
 * 2. Get your Project API Key from Settings > Project > Project API Key
 * 3. Set these environment variables:
 *    - VITE_PUBLIC_POSTHOG_KEY=phc_xxx
 *    - VITE_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com (optional, defaults to US)
 * 
 * @example
 * // Track an event
 * trackEvent('button_clicked', { button_name: 'signup' });
 * 
 * // Identify a user (after login)
 * identifyUser('user_123', { email: 'REDACTED_ACCOUNT_EMAIL', plan: 'pro' });
 * 
 * // Reset user (after logout)
 * resetUser();
 */

import posthog from 'posthog-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Calculate days since user signup
 */
const getDaysSinceSignup = (): number | null => {
  try {
    const signupDate = localStorage.getItem('signup_date');
    if (!signupDate) return null;
    
    const daysSince = Math.floor((Date.now() - new Date(signupDate).getTime()) / (1000 * 60 * 60 * 24));
    return daysSince;
  } catch {
    return null;
  }
};

/**
 * Track an event with automatic enrichment
 */
export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  if (posthog?.capture) {
    try {
      const enrichedProperties = {
        ...properties,
        days_since_signup: getDaysSinceSignup(),
        timestamp: new Date().toISOString(),
      };
      
      posthog.capture(eventName, enrichedProperties);
    } catch (error) {
      console.error('PostHog tracking error:', error);
    }
  }
};

/**
 * Identify a user with enriched properties
 */
export const identifyUser = (userId: string, properties?: Record<string, any>) => {
  if (posthog?.identify) {
    try {
      // Store signup date if not already stored
      if (!localStorage.getItem('signup_date')) {
        localStorage.setItem('signup_date', new Date().toISOString());
      }

      const allProperties = {
        ...properties,
        signup_date: localStorage.getItem('signup_date'),
        days_since_signup: getDaysSinceSignup(),
      };

      posthog.identify(userId, allProperties);
    } catch (error) {
      console.error('PostHog identify error:', error);
    }
  }
};

/**
 * Update user properties (call this when plan changes, posts created, etc.)
 */
export const updateUserProperties = (properties: Record<string, any>) => {
  if (posthog?.people?.set) {
    try {
      posthog.people.set(properties);
    } catch (error) {
      console.error('PostHog update properties error:', error);
    }
  }
};

export const resetUser = () => {
  if (posthog?.reset) {
    posthog.reset();
  }
};

// Event constants for type safety
export const ANALYTICS_EVENTS = {
  // Onboarding & Auth
  SIGNUP_COMPLETED: 'signup_completed',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_FINISHED: 'onboarding_finished',
  
  // Content Creation
  POST_GENERATED: 'post_generated',
  FIRST_POST_SCHEDULED: 'first_post_scheduled',
  CAMPAIGN_GENERATED: 'campaign_generated',
  CAPTION_COPIED: 'caption_copied',
  HOOK_COPIED: 'hook_copied',
  CONTENT_EXPORTED: 'content_exported',
  
  // Calendar & Planning
  CALENDAR_VIEWED: 'calendar_viewed',
  CALENDAR_EVENT_CREATED: 'calendar_event_created',
  
  // Brand & Workspace
  BRAND_KIT_CREATED: 'brand_kit_created',
  BRAND_KIT_DELETED: 'brand_kit_deleted',
  WORKSPACE_CREATED: 'workspace_created',
  
  // Monetization
  UPGRADE_CLICKED: 'upgrade_clicked',
  PAYMENT_COMPLETED: 'payment_completed',
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_COMPLETED: 'checkout_completed',
  CHECKOUT_ABANDONED: 'checkout_abandoned',
  CHECKOUT_FAILED: 'checkout_failed',
  COUPON_APPLIED: 'coupon_applied',
  COUPON_INVALID: 'coupon_invalid',
  FOUNDERS_SLOT_CLAIMED: 'founders_slot_claimed',
  SUBSCRIPTION_DETECTED: 'subscription_detected',
  CREDIT_PACK_CHECKOUT_STARTED: 'credit_pack_checkout_started',
  ENTERPRISE_CHECKOUT_STARTED: 'enterprise_checkout_started',
  CUSTOMER_PORTAL_OPENED: 'customer_portal_opened',

  // Performance & Limits
  USAGE_LIMIT_REACHED: 'usage_limit_reached',
  
  // Video Rendering
  RENDER_STARTED: 'render_started',
  RENDER_COMPLETED: 'render_completed',
  RENDER_FAILED: 'render_failed',
  RENDER_ENGINE_SELECTED: 'render_engine_selected',

  // AI Generation (provider-level)
  AI_GENERATION_STARTED: 'ai_generation_started',
  AI_GENERATION_COMPLETED: 'ai_generation_completed',
  AI_GENERATION_FAILED: 'ai_generation_failed',
  AI_GENERATION_REFUNDED: 'ai_generation_refunded',
  CREDIT_INSUFFICIENT: 'credit_insufficient',

  // Social Publishing
  SOCIAL_PUBLISH_STARTED: 'social_publish_started',
  SOCIAL_PUBLISH_SUCCEEDED: 'social_publish_succeeded',
  SOCIAL_PUBLISH_FAILED: 'social_publish_failed',
  SOCIAL_ACCOUNT_CONNECTED: 'social_account_connected',
  SOCIAL_ACCOUNT_DISCONNECTED: 'social_account_disconnected',

  // Engagement & Retention
  FEATURE_FIRST_USE: 'feature_first_use',
  SESSION_STARTED: 'session_started',
  SESSION_ENDED: 'session_ended',
  TUTORIAL_STARTED: 'tutorial_started',
  TUTORIAL_COMPLETED: 'tutorial_completed',
  TUTORIAL_SKIPPED: 'tutorial_skipped',
  STREAK_MILESTONE: 'streak_milestone',
  WELCOME_BONUS_CLAIMED: 'welcome_bonus_claimed',

  // Errors & Friction
  ERROR_SHOWN_TO_USER: 'error_shown_to_user',
  RATE_LIMIT_HIT_CLIENT: 'rate_limit_hit_client',
  QUOTA_WARNING_SHOWN: 'quota_warning_shown',

  // Marketplace
  CHARACTER_PURCHASED: 'character_purchased',
  CHARACTER_LISTED: 'character_listed',
  CHARACTER_TAKEDOWN: 'character_takedown',
  CHARACTER_REPORTED: 'character_reported',
  MARKETPLACE_VIEWED: 'marketplace_viewed',
  MARKETPLACE_SEARCH: 'marketplace_search',

  // Universal Directors Cut — Moat features (Consistency-First NLE)
  UDC_VOICE_LOCK_SET: 'udc_voice_lock_set',
  UDC_VOICE_LOCK_MISMATCH_SHOWN: 'udc_voice_lock_mismatch_shown',
  UDC_ANCHOR_REFRESH_OPENED: 'udc_anchor_refresh_opened',
  UDC_ANCHOR_SNAP_APPLIED: 'udc_anchor_snap_applied',
  UDC_PREFLIGHT_OPENED: 'udc_preflight_opened',
  UDC_PREFLIGHT_BLOCKED_EXPORT: 'udc_preflight_blocked_export',
  UDC_PREFLIGHT_BYPASSED: 'udc_preflight_bypassed',
  UDC_AUTOCUT_OPENED: 'udc_autocut_opened',
  UDC_AUTOCUT_GENERATED: 'udc_autocut_generated',
  UDC_MASTER_RESTORED: 'udc_master_restored',
  UDC_EXPORT_COMPLETED: 'udc_export_completed',
  UDC_SHOWCASE_CTA_CLICKED: 'udc_showcase_cta_clicked',
  UDC_PRICING_CTA_CLICKED: 'udc_pricing_cta_clicked',

  // Beta launch observability (Phase 5.4)
  BETA_SIGNUP: 'beta_signup',
  FEATURE_GATE_HIT: 'feature_gate_hit',
  CREDIT_REFUND_TRIGGERED: 'credit_refund_triggered',
  AUTH_ERROR_SHOWN: 'auth_error_shown',

  // Storyboard ensemble guarantee (Phase 5+)
  STORYBOARD_ENSEMBLE_REPAIR: 'storyboard_ensemble_repair',
} as const;

/**
 * UDC moat-feature tracking helper. Prefixes stay stable so we can build a
 * Consistency-First funnel in PostHog without hunting through event names.
 */
export const trackUDC = (
  event:
    | 'udc_voice_lock_set'
    | 'udc_voice_lock_mismatch_shown'
    | 'udc_anchor_refresh_opened'
    | 'udc_anchor_snap_applied'
    | 'udc_preflight_opened'
    | 'udc_preflight_blocked_export'
    | 'udc_preflight_bypassed'
    | 'udc_autocut_opened'
    | 'udc_autocut_generated'
    | 'udc_master_restored'
    | 'udc_export_completed'
    | 'udc_showcase_cta_clicked'
    | 'udc_pricing_cta_clicked',
  properties: Record<string, any> = {},
) => {
  trackEvent(event, { surface: 'universal-directors-cut', ...properties });
};

/**
 * Track a feature's first ever use per user (idempotent via localStorage).
 */
export const trackFeatureFirstUse = (feature: string) => {
  try {
    const key = `feature_first_use_${feature}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, new Date().toISOString());
    trackEvent(ANALYTICS_EVENTS.FEATURE_FIRST_USE, { feature });
  } catch {
    /* noop */
  }
};

/**
 * Track an error surfaced to the user (toast/modal).
 */
export const trackErrorShown = (data: {
  error_type: string;
  source?: string;
  message?: string;
  feature?: string;
}) => {
  trackEvent(ANALYTICS_EVENTS.ERROR_SHOWN_TO_USER, data);
};

/**
 * Track a quota warning shown (storage / credits).
 */
export const trackQuotaWarning = (data: {
  quota_type: 'storage' | 'credits' | 'rate_limit';
  threshold_pct: number;
  used_pct?: number;
}) => {
  trackEvent(ANALYTICS_EVENTS.QUOTA_WARNING_SHOWN, data);
};

/**
 * Track AI generation lifecycle (frontend wrapper)
 */
export const trackAIGeneration = (
  event: 'ai_generation_started' | 'ai_generation_completed' | 'ai_generation_failed',
  data: {
    provider: string;
    model?: string;
    duration_s?: number;
    credits_spent?: number;
    cost_eur?: number;
    aspect_ratio?: string;
    resolution?: string;
    error_type?: string;
    latency_ms?: number;
  }
) => {
  trackEvent(event, data);
};

/**
 * Track social publishing lifecycle (frontend wrapper)
 */
export const trackSocialPublish = (
  event: 'social_publish_started' | 'social_publish_succeeded' | 'social_publish_failed',
  data: {
    platform: string;
    media_type?: 'image' | 'video' | 'carousel' | 'text';
    scheduled?: boolean;
    error_type?: string;
    error_message?: string;
  }
) => {
  trackEvent(event, data);
};

// Remotion/Shotstack rendering analytics
export const trackRenderEvent = (
  event: 'render_started' | 'render_completed' | 'render_failed',
  data: {
    engine: 'remotion' | 'shotstack';
    template_id?: string;
    content_type?: string;
    render_time_ms?: number;
    output_size_mb?: number;
    error_type?: string;
  }
) => {
  trackEvent(event, data);
};

export const trackEngineSelection = (engine: 'remotion' | 'shotstack') => {
  trackEvent('render_engine_selected', { engine });
};
