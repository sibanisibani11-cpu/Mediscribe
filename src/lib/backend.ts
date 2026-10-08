import { auth } from './firebase';
const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
export const backendConfigured = /^https:\/\//.test(backendUrl) || (process.env.NODE_ENV === 'development' && /^http:\/\/127\.0\.0\.1:\d+$/.test(backendUrl));
export async function backendRequest(route: string, body?: unknown, authenticated = true): Promise<any> {
  if (!backendConfigured) throw new Error('The service is not configured. Please contact support@mediapp.store.');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authenticated) {
    await auth?.authStateReady();
    if (!auth?.currentUser) throw new Error('Please sign in again.');
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }
  const response = await fetch(`${backendUrl}${route}`, { method: body === undefined ? 'GET' : 'POST', headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok || result.success === false) throw new Error(result.error || 'Request failed. Please retry.');
  return result;
}
export async function getInstallationId(): Promise<string> {
  if (typeof window === 'undefined') throw new Error('Installation ID is unavailable');
  if ((window.electron as any)?.getTelemetryContext) return (await (window.electron as any).getTelemetryContext()).installId;
  let value = localStorage.getItem('mediscribe_install_id');
  if (!value) { value = crypto.randomUUID(); localStorage.setItem('mediscribe_install_id', value); }
  return value;
}
export async function refreshEntitlement(paymentId?: string) {
  const deviceId = await getInstallationId();
  const result = await backendRequest(paymentId ? '/v1/payments/reconcile' : '/v1/entitlement', { deviceId, ...(paymentId ? { paymentId } : {}) });
  const value = JSON.parse(atob(result.entitlement.payload.replace(/-/g, '+').replace(/_/g, '/')));
  if (value.uid !== auth?.currentUser?.uid || value.deviceId !== deviceId) throw new Error('Account changed. Please retry.');
  if ((window.electron as any)?.saveSubscriptionCache) {
    const saved = await (window.electron as any).saveSubscriptionCache(result.entitlement);
    if (!saved.success) throw new Error(saved.error || 'Could not save verified access');
  }
  return value;
}
