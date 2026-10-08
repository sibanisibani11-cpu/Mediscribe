import { backendRequest, getInstallationId } from './backend';
export interface UserTrackingInfo { hwid?: string | null; email?: string | null; isPro?: boolean | null; plan?: string | null; appVersion?: string; os?: string; }
export interface ProActivationInfo { hwid?: string | null; email?: string | null; plan: string; amount?: number; currency?: string; paymentId?: string; }
let pending: Promise<void> | null = null;
let recorded = false;
export async function trackAppLaunch(_info: UserTrackingInfo): Promise<void> {
  if (recorded) return;
  if (pending) return pending;
  pending = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if ((window.electron as any)?.getTelemetryContext) {
          const result = await window.electron.trackAppLaunch({});
          if (!result.success) throw new Error('Tracking unavailable');
        } else {
          let sessionId = sessionStorage.getItem('mediscribe_launch_session_id');
          if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem('mediscribe_launch_session_id', sessionId); }
          const ua = navigator.userAgent;
          const os = /Android/i.test(ua) ? 'android' : /iPhone|iPad/i.test(ua) ? 'ios' : /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) ? 'mac' : /Linux/i.test(ua) ? 'linux' : 'unknown';
          await backendRequest('/v1/telemetry', { installId: await getInstallationId(), sessionId, os, source: (window as any).Capacitor ? 'android' : 'website' }, false);
        }
        recorded = true; return;
      } catch { if (attempt < 2) await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1500)); }
    }
  })().finally(() => { pending = null; });
  return pending;
}
// Purchases are counted by the backend during durable fulfillment, never by client claims.
export async function trackProActivation(_info: ProActivationInfo): Promise<void> {}
export async function trackDictationCompleted(_details?: { durationSeconds?: number; modelUsed?: string }): Promise<void> {}
export function trackCustomEvent(_eventName: string, _properties?: Record<string, any>): void {}
