/**
 * Lightweight Application Telemetry & Launch Logger
 * (PostHog has been completely removed to minimize bundle size and network overhead)
 */

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

/**
 * Track app launch / session start.
 */
export async function trackAppLaunch(info: UserTrackingInfo): Promise<void> {
  // Silent local logging only — no external third-party telemetry
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
