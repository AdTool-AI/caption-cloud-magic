import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { identifyUser, resetUser, trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';
import { mapAuthError, trackAuthError } from '@/lib/authErrors';
import { translations, type Language } from '@/lib/translations';
import { clearAllLocalDrafts } from '@/lib/local-draft-scope';
import { isAwsTestBackend, awsTestAuthStorageKey } from '@/lib/backendTarget';

const getLang = (): Language => {
  const saved = (localStorage.getItem('adtool-ai-lang') || 'en').toLowerCase().slice(0, 2);
  return (saved === 'en' || saved === 'de' || saved === 'es') ? (saved as Language) : 'en';
};

const tr = (key: string): string => {
  const lang = getLang();
  const keys = key.split('.');
  let value: any = translations[lang];
  for (const k of keys) value = value?.[k];
  return typeof value === 'string' ? value : key;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  subscriptionCheckStatus: 'signed_out' | 'checking' | 'verified' | 'unavailable' | 'error';
  requiresMfa: boolean;
  refreshSubscription: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any; requiresMfa?: boolean }>;
  signOut: () => Promise<void>;
  clearMfaRequirement: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cache configuration
const SUBSCRIPTION_CACHE_KEY = isAwsTestBackend
  ? 'subscription_cache:' + awsTestAuthStorageKey(import.meta.env.VITE_SUPABASE_URL)
  : 'subscription_cache';
const SUBSCRIPTION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SUBSCRIPTION_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes (was 60 seconds)

interface SubscriptionCache {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  cachedAt: number;
}

const getSubscriptionCache = (): SubscriptionCache | null => {
  try {
    const cached = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    if (!cached) return null;
    
    const data = JSON.parse(cached) as SubscriptionCache;
    const isExpired = Date.now() - data.cachedAt > SUBSCRIPTION_CACHE_TTL;
    
    if (isExpired) {
      localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
      return null;
    }
    
    return data;
  } catch {
    return null;
  }
};

const setSubscriptionCache = (data: Omit<SubscriptionCache, 'cachedAt'>) => {
  try {
    const cache: SubscriptionCache = {
      ...data,
      cachedAt: Date.now()
    };
    localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Silently fail if localStorage is unavailable
  }
};

const clearSubscriptionCache = () => {
  try {
    localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
  } catch {
    // Silently fail
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [subscriptionCheckStatus, setSubscriptionCheckStatus] = useState<AuthContextType['subscriptionCheckStatus']>('signed_out');
  const [requiresMfa, setRequiresMfa] = useState(false);

  const clearMfaRequirement = useCallback(() => {
    setRequiresMfa(false);
  }, []);

  const checkSubscription = useCallback(async (forceRefresh = false) => {
    if (isAwsTestBackend) {
      // Billing has not been migrated. Neither cache nor a fallback may grant access.
      clearSubscriptionCache();
      setSubscribed(false);
      setProductId(null);
      setSubscriptionEnd(null);
      setSubscriptionCheckStatus('unavailable');
      return;
    }
    setSubscriptionCheckStatus('checking');
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getSubscriptionCache();
      if (cached) {
        console.log('[useAuth] Using cached subscription data');
        setSubscribed(cached.subscribed);
        setProductId(cached.productId);
        setSubscriptionEnd(cached.subscriptionEnd);
        setSubscriptionCheckStatus('verified');
        return;
      }
    }

    try {
      console.log('[useAuth] Fetching subscription from Edge Function');
      const { data, error } = await supabase.functions.invoke('check-subscription');
      
      if (error) {
        console.error('Subscription check error:', error);
        setSubscribed(false);
        setProductId(null);
        setSubscriptionEnd(null);
        setSubscriptionCheckStatus('error');
        return;
      }

      if (data) {
        const subData = {
          subscribed: data.subscribed || false,
          productId: data.product_id || null,
          subscriptionEnd: data.subscription_end || null
        };
        
        // Update state
        setSubscribed(subData.subscribed);
        setProductId(subData.productId);
        setSubscriptionEnd(subData.subscriptionEnd);
        setSubscriptionCheckStatus('verified');
        
        // Cache the result
        setSubscriptionCache(subData);
      }
    } catch (error) {
      console.error('Failed to check subscription:', error);
      setSubscribed(false);
      setProductId(null);
      setSubscriptionEnd(null);
      setSubscriptionCheckStatus('error');
    }
  }, []);

  const refreshSubscription = useCallback(async () => {
    // Force refresh bypasses cache
    await checkSubscription(true);
  }, [checkSubscription]);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        if (session?.user) {
          // Use cached data immediately, then background refresh
          setTimeout(() => {
            checkSubscription(false);
          }, 0);
        } else {
          setSubscribed(false);
          setProductId(null);
          setSubscriptionEnd(null);
          setSubscriptionCheckStatus('signed_out');
          if (isAwsTestBackend) setRequiresMfa(false);
          clearSubscriptionCache();
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (session?.user) {
        checkSubscription(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [checkSubscription]);

  // Auto-refresh subscription status every 5 minutes (was 60 seconds)
  useEffect(() => {
    if (!user || isAwsTestBackend) return;

    const interval = setInterval(() => {
      checkSubscription(true); // Force refresh on interval
    }, SUBSCRIPTION_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [user, checkSubscription]);

  const signUp = async (email: string, password: string) => {
    if (isAwsTestBackend) return { error: new Error('Self-service signup is unavailable on this AWS backend.') };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/verify-email`
      }
    });
    
    if (error) {
      const friendly = mapAuthError(error, 'signup');
      toast.error(friendly.title, { description: friendly.description });
      trackAuthError(friendly, 'signup');
    } else {
      toast.success(tr('auth.signupSuccessTitle'), {
        description: tr('auth.signupSuccessDesc'),
      });
      
      if (data.user) {
        localStorage.setItem('signup_date', new Date().toISOString());
        
        trackEvent(ANALYTICS_EVENTS.SIGNUP_COMPLETED, {
          email: data.user.email,
          signup_method: 'email',
        });
        // Beta launch observability
        trackEvent(ANALYTICS_EVENTS.BETA_SIGNUP, {
          email: data.user.email,
          source: 'email',
        });
        
        identifyUser(data.user.id, { 
          email: data.user.email,
          signup_method: 'email',
        });
      }
    }
    
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      const friendly = mapAuthError(error, 'signin');
      toast.error(friendly.title, { description: friendly.description });
      if (!isAwsTestBackend) trackAuthError(friendly, 'signin');
      return { error };
    }
    
    // Check if MFA is required
    if (data.user) {
      const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (isAwsTestBackend && (aalError || !aalData)) {
        setRequiresMfa(true);
        return { error: new Error('Session assurance could not be verified.'), requiresMfa: true };
      }
      
      if (aalData?.nextLevel === 'aal2' && aalData?.currentLevel === 'aal1') {
        // User has MFA enabled but hasn't completed second factor
        setRequiresMfa(true);
        return { error: null, requiresMfa: true };
      }
      
      toast.success('Logged in successfully!');
      if (isAwsTestBackend) setRequiresMfa(false);
      if (!isAwsTestBackend) identifyUser(data.user.id, {
        email: data.user.email,
        last_login: new Date().toISOString(),
      });
    }
    
    return { error };
  };

  const signOut = async () => {
    if (!isAwsTestBackend) resetUser();
    clearSubscriptionCache();
    // Local drafts belong to the leaving account and must not leak into the
    // next sign-in on this browser.
    if (!isAwsTestBackend) clearAllLocalDrafts();
    await supabase.auth.signOut();
    toast.success('Logged out successfully');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      subscribed, 
      productId, 
      subscriptionEnd,
      subscriptionCheckStatus,
      requiresMfa,
      refreshSubscription,
      signUp, 
      signIn, 
      signOut,
      clearMfaRequirement
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
