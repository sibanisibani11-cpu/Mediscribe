/**
 * Lightweight Application Telemetry & Launch Logger
 * (PostHog has been completely removed to minimize bundle size and network overhead)
 */

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

export interface UserTrackingInfo {
  hwid?: string | null;
  email?: string | null;
  isPro?: boolean | null;
  plan?: string | null;
  appVersion?: string;
  os?: string;
}

export interface ProActivationInfo {
  hwid?: string | null;
  email?: string | null;
  plan: string;
  amount?: number;
  currency?: string;
  paymentId?: string;
}

function getOrCreateLocalId(key: string): string {
  if (typeof window === 'undefined') return 'server';

  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const id = window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, id);
  return id;
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'server';

  const existing = sessionStorage.getItem('mediscribe_launch_session_id');
  if (existing) return existing;

  const id = window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem('mediscribe_launch_session_id', id);
  return id;
}

function detectOs(): string {
  if (typeof window !== 'undefined' && window.electron?.platform) {
    if (window.electron.platform === 'win32') return 'windows';
    if (window.electron.platform === 'darwin') return 'mac';
    return window.electron.platform;
  }

  if (typeof navigator === 'undefined') return 'unknown';
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('win')) return 'windows';
  if (platform.includes('mac')) return 'mac';
  if (platform.includes('linux')) return 'linux';
  return platform || 'unknown';
}

/**
 * Track app launch / session start.
 */
export async function trackAppLaunch(info: UserTrackingInfo): Promise<void> {
  const installId = getOrCreateLocalId('mediscribe_install_id');
  const sessionId = getOrCreateSessionId();
  const os = info.os || detectOs();
  const email = info.email ? info.email.toLowerCase().trim() : null;
  const isGuest = !email;
  const source = os === 'windows' ? 'desktop_windows' : os === 'mac' ? 'desktop_mac' : os === 'linux' ? 'desktop_linux' : 'desktop';

  if (isFirebaseConfigured && db) {
    try {
      const nowIso = new Date().toISOString();
      const firstOpenTrackedKey = 'mediscribe_first_open_tracked';

      if (typeof window !== 'undefined' && !localStorage.getItem(firstOpenTrackedKey)) {
        await setDoc(doc(db, 'downloads', installId), {
          app: 'mediscribe',
          event: 'first_open',
          installId,
          hwid: info.hwid || null,
          email,
          isGuest,
          isPro: !!info.isPro,
          plan: info.plan || null,
          os,
          source,
          version: info.appVersion || null,
          timestamp: serverTimestamp(),
          installedAt: nowIso,
          createdAt: serverTimestamp(),
        }, { merge: true });

        localStorage.setItem(firstOpenTrackedKey, nowIso);
      }

      await setDoc(doc(db, 'app_launches', sessionId), {
        app: 'mediscribe',
        event: 'app_launch',
        installId,
        sessionId,
        hwid: info.hwid || null,
        email,
        isGuest,
        isPro: !!info.isPro,
        plan: info.plan || null,
        os,
        source,
        version: info.appVersion || null,
        timestamp: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[MediScribe Telemetry] Firebase app launch tracking failed:', err);
      }
    }
  }

  try {
    if (typeof window !== 'undefined' && window.electron?.trackAppLaunch) {
      await window.electron.trackAppLaunch(info);
      return;
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[MediScribe Telemetry] App launch tracking failed:', err);
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[MediScribe Telemetry] App launch:', info.email || info.hwid || 'anonymous');
  }
}

/**
 * Track Pro License Activation upon purchase or key verification.
 */
export async function trackProActivation(info: ProActivationInfo): Promise<void> {
  if (process.env.NODE_ENV === 'development') {
    console.log('[MediScribe Telemetry] Pro activated:', info.plan, info.paymentId);
  }
}

/**
 * Track user dictation / AI transcription activity.
 */
export async function trackDictationCompleted(details?: { durationSeconds?: number; modelUsed?: string }): Promise<void> {
  // No-op
}

/**
 * Generic custom event tracker.
 */
export function trackCustomEvent(eventName: string, properties?: Record<string, any>): void {
  // No-op
}
