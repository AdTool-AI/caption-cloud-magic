import { isAwsTestBackend } from '@/lib/backendTarget';
/**
 * DSGVO-konformes Cookie-Consent-Management
 * Speichert Präferenzen in localStorage, blockiert Scripts bis zur Einwilligung
 */

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'comfort';

export interface Consent {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  comfort: boolean;
  ts: number;
  locale: string;
  version: string;
}

const CONSENT_KEY = 'cg_consent_v1';
const CONSENT_VERSION = '1.0.0';
const CONSENT_EXPIRY_DAYS = 180; // 6 Monate

// Globale API für window.CGConsent
declare global {
  interface Window {
    CGConsent: {
      open: () => void;
      getConsent: () => Consent | null;
      hasConsent: (category: ConsentCategory) => boolean;
    };
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

/**
 * Liest gespeicherte Consent-Präferenzen aus localStorage
 */
export function getConsent(): Consent | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) return null;
    
    const consent: Consent = JSON.parse(stored);
    
    // Prüfe Ablauf (6 Monate)
    const ageInDays = (Date.now() - consent.ts) / (1000 * 60 * 60 * 24);
    if (ageInDays > CONSENT_EXPIRY_DAYS) {
      localStorage.removeItem(CONSENT_KEY);
      return null;
    }
    
    // Version-Check (bei Änderungen Banner erneut anzeigen)
    if (consent.version !== CONSENT_VERSION) {
      localStorage.removeItem(CONSENT_KEY);
      return null;
    }
    
    return consent;
  } catch (error) {
    console.error('Error reading consent:', error);
    return null;
  }
}

/**
 * Speichert Consent-Präferenzen in localStorage
 */
export function saveConsent(consent: Omit<Consent, 'ts' | 'version'>): void {
  try {
    const fullConsent: Consent = {
      ...consent,
      necessary: true, // Immer aktiv
      ts: Date.now(),
      version: CONSENT_VERSION,
    };
    
    localStorage.setItem(CONSENT_KEY, JSON.stringify(fullConsent));
    
    // Scripts aktivieren basierend auf Einwilligung
    enableConsentedScripts(fullConsent);
    
    // Google Consent Mode v2 aktualisieren (falls vorhanden)
    updateGoogleConsentMode(fullConsent);
    
    // Optional: Anonymes Log-Event (ohne IP/Fingerprint)
    logConsentEvent(fullConsent);
  } catch (error) {
    console.error('Error saving consent:', error);
  }
}

/**
 * Prüft, ob Einwilligung für bestimmte Kategorie vorliegt
 */
export function hasConsent(category: ConsentCategory): boolean {
  if (category === 'necessary') return true; // Immer erlaubt
  
  const consent = getConsent();
  if (!consent) return false;
  
  return consent[category] === true;
}

/**
 * Aktiviert blockierte Scripts basierend auf Consent
 */
function enableConsentedScripts(consent: Consent): void {
  if (isAwsTestBackend) return;
  document.querySelectorAll<HTMLScriptElement>('script[type="text/plain"][data-category]').forEach(script => {
    const category = script.dataset.category as ConsentCategory;
    
    // Prüfe Einwilligung für diese Kategorie
    if (category === 'analytics' && !consent.analytics) return;
    if (category === 'marketing' && !consent.marketing) return;
    if (category === 'comfort' && !consent.comfort) return;
    
    // Script aktivieren
    const newScript = document.createElement('script');
    newScript.async = true;
    
    if (script.dataset.src) {
      newScript.src = script.dataset.src;
    } else {
      newScript.textContent = script.textContent;
    }
    
    // Attribute kopieren
    Array.from(script.attributes).forEach(attr => {
      if (attr.name !== 'type' && attr.name !== 'data-category' && attr.name !== 'data-src') {
        newScript.setAttribute(attr.name, attr.value);
      }
    });
    
    document.head.appendChild(newScript);
  });
}

/**
 * Google Consent Mode v2 Update
 */
function updateGoogleConsentMode(consent: Consent): void {
  if (isAwsTestBackend) return;
  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: consent.analytics ? 'granted' : 'denied',
      ad_storage: consent.marketing ? 'granted' : 'denied',
      ad_user_data: consent.marketing ? 'granted' : 'denied',
      ad_personalization: consent.marketing ? 'granted' : 'denied',
      personalization_storage: consent.comfort ? 'granted' : 'denied',
      functionality_storage: 'granted', // Immer erlaubt für necessary
      security_storage: 'granted', // Immer erlaubt für necessary
    });
  }
}

/**
 * Anonymes Consent-Log (ohne personenbezogene Daten)
 */
async function logConsentEvent(consent: Consent): Promise<void> {
  try {
    // SHA-256 Hash der Consent-Präferenzen (anonymisiert)
    const consentString = JSON.stringify({
      analytics: consent.analytics,
      marketing: consent.marketing,
      comfort: consent.comfort,
    });
    
    const encoder = new TextEncoder();
    const data = encoder.encode(consentString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const consentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Optional: Sende an Backend (ohne IP, ohne User-ID)
    // fetch('/api/consent-log', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     consentHash,
    //     locale: consent.locale,
    //     version: consent.version,
    //     timestamp: consent.ts,
    //   }),
    // });
    
    console.log('[Consent] Preferences saved:', consentHash);
  } catch (error) {
    console.error('Error logging consent:', error);
  }
}

/**
 * Setzt alle Consent-Präferenzen zurück (Revoke)
 */
export function revokeConsent(): void {
  localStorage.removeItem(CONSENT_KEY);
  
  // Google Consent Mode auf "denied" setzen
  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      personalization_storage: 'denied',
    });
  }
}

/**
 * Initialisiert Consent-System beim App-Start
 */
export function initConsent(): boolean {
  const consent = getConsent();
  
  if (consent) {
    // Consent vorhanden → Scripts aktivieren
    enableConsentedScripts(consent);
    updateGoogleConsentMode(consent);
    return true; // Banner nicht anzeigen
  }
  
  // Kein Consent → Banner anzeigen
  return false;
}

/**
 * Hilfsfunktion: Alle Cookies einer Kategorie löschen (bei Widerruf)
 */
export function deleteCookiesByCategory(category: ConsentCategory): void {
  // Beispiel: Lösche alle Analytics-Cookies
  if (category === 'analytics') {
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      if (name.startsWith('_ga') || name.startsWith('_gid')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      }
    });
  }
  
  // Weitere Kategorien analog
  if (category === 'marketing') {
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      if (name.startsWith('_fbp') || name.startsWith('_gcl')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      }
    });
  }
}
