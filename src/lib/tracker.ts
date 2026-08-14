import posthog from 'posthog-js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let isPostHogInitialized = false;
let supabase: SupabaseClient | null = null;

/**
 * Initialize PostHog and Supabase tracking clients.
 * This runs safely and silently degrades if keys are not configured or when offline.
 */
export function initTracker() {
  if (typeof window === 'undefined') return;

  // Initialize PostHog
  if (POSTHOG_KEY && !isPostHogInitialized) {
    try {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        capture_pageview: false, // We'll manually track or let Next.js handle it
        capture_pageleave: true,
        autocapture: false,      // High medical privacy standard: no auto DOM click capturing
        persistence: 'localStorage',
        loaded: () => {
          isPostHogInitialized = true;
          console.log('[MediScribe Tracker] PostHog initialized successfully.');
        },
      });
    } catch (err) {
      console.warn('[MediScribe Tracker] PostHog initialization failed:', err);
    }
  }

  // Initialize Supabase
  if (SUPABASE_URL && SUPABASE_ANON_KEY && !supabase) {
    try {
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
      console.log('[MediScribe Tracker] Supabase client initialized successfully.');
    } catch (err) {
      console.warn('[MediScribe Tracker] Supabase initialization failed:', err);
    }
  }
}

export interface UserTrackingInfo {
  hwid?: string | null;
  email?: string | null;
  isPro?: boolean | null;
  plan?: string | null;
  appVersion?: string;
  os?: string;
}

/**
 * Track app launch / session start.
 * Records the active session in PostHog and upserts the user in Supabase.
 */
export async function trackAppLaunch(info: UserTrackingInfo) {
  try {
    initTracker();

    const distinctId = info.email?.trim().toLowerCase() || info.hwid || 'anonymous_user';
    const isPro = !!info.isPro;
    const plan = info.plan || (isPro ? 'pro' : 'free');
    const nowIso = new Date().toISOString();

    // 1. PostHog: Identify user and capture app_open
    if (POSTHOG_KEY) {
      try {
        posthog.identify(distinctId, {
          email: info.email || undefined,
          hwid: info.hwid || undefined,
          is_pro: isPro,
          plan: plan,
          app_version: info.appVersion || '1.1.22',
          os: info.os || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
          last_active_at: nowIso,
        });

        posthog.capture('app_open', {
          is_pro: isPro,
          plan: plan,
          app_version: info.appVersion || '1.1.22',
        });
      } catch (phErr) {
        console.warn('[MediScribe Tracker] PostHog trackAppLaunch error:', phErr);
      }
    }

    // 2. Supabase: Upsert record in public.app_users table
    if (supabase && (info.hwid || info.email)) {
      try {
        const userId = info.hwid || info.email || distinctId;
        const payload: Record<string, any> = {
          id: userId,
          email: info.email || null,
          is_pro: isPro,
          plan: plan,
          app_version: info.appVersion || '1.1.22',
          os: info.os || (typeof navigator !== 'undefined' ? (navigator.userAgent.includes('Mac') ? 'macOS' : navigator.userAgent.includes('Win') ? 'Windows' : 'Other') : 'Desktop'),
          last_active_at: nowIso,
        };

        const { error } = await supabase
          .from('app_users')
          .upsert(payload, { onConflict: 'id' });

        if (error) {
          console.warn('[MediScribe Tracker] Supabase upsert error:', error.message);
        }
      } catch (sbErr) {
        console.warn('[MediScribe Tracker] Supabase trackAppLaunch error:', sbErr);
      }
    }
  } catch (err) {
    // Fail silently so the app is never blocked
    console.warn('[MediScribe Tracker] Error in trackAppLaunch:', err);
  }
}

export interface ProActivationInfo {
  hwid?: string | null;
  email?: string | null;
  plan: string;
  amount?: number;
  currency?: string;
  paymentId?: string;
}

/**
 * Track Pro License Activation upon purchase or key verification.
 */
export async function trackProActivation(info: ProActivationInfo) {
  try {
    initTracker();

    const distinctId = info.email?.trim().toLowerCase() || info.hwid || 'pro_user';
    const nowIso = new Date().toISOString();

    // 1. PostHog: Capture Pro conversion & update person profile
    if (POSTHOG_KEY) {
      try {
        posthog.identify(distinctId, {
          is_pro: true,
          plan: info.plan,
          last_payment_id: info.paymentId || undefined,
          subscribed_at: nowIso,
        });

        posthog.capture('pro_subscription_activated', {
          plan: info.plan,
          amount: info.amount,
          currency: info.currency || 'INR',
          payment_id: info.paymentId,
          distinct_id: distinctId,
        });
      } catch (phErr) {
        console.warn('[MediScribe Tracker] PostHog trackProActivation error:', phErr);
      }
    }

    // 2. Supabase: Update user Pro status
    if (supabase && (info.hwid || info.email)) {
      try {
        const userId = info.hwid || info.email || distinctId;
        const { error } = await supabase
          .from('app_users')
          .upsert(
            {
              id: userId,
              email: info.email || null,
              is_pro: true,
              plan: info.plan,
              payment_id: info.paymentId || null,
              subscribed_at: nowIso,
              last_active_at: nowIso,
            },
            { onConflict: 'id' }
          );

        if (error) {
          console.warn('[MediScribe Tracker] Supabase pro activation error:', error.message);
        }
      } catch (sbErr) {
        console.warn('[MediScribe Tracker] Supabase trackProActivation error:', sbErr);
      }
    }
  } catch (err) {
    console.warn('[MediScribe Tracker] Error in trackProActivation:', err);
  }
}

/**
 * Track user dictation / AI transcription activity.
 */
export async function trackDictationCompleted(details?: { durationSeconds?: number; modelUsed?: string }) {
  try {
    if (POSTHOG_KEY) {
      posthog.capture('dictation_completed', {
        duration_seconds: details?.durationSeconds || 0,
        model_used: details?.modelUsed || 'default',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('[MediScribe Tracker] Error in trackDictationCompleted:', err);
  }
}

/**
 * Generic custom event tracker for PostHog.
 */
export function trackCustomEvent(eventName: string, properties?: Record<string, any>) {
  try {
    if (POSTHOG_KEY) {
      posthog.capture(eventName, properties);
    }
  } catch (err) {
    console.warn('[MediScribe Tracker] Error in trackCustomEvent:', err);
  }
}
