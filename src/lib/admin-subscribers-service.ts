export interface SubscriptionHistoryItem {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: 'captured' | 'refunded' | 'failed' | 'authorized' | string;
  date: string;
  rawDate: string;
  billing: 'monthly' | 'yearly' | 'lifetime' | 'custom' | string;
  hwid?: string;
  notes?: Record<string, any>;
  source: 'Razorpay' | 'Firestore' | 'Local';
}

export interface AdminSubscriberRecord {
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  hwid: string | null;
  country: {
    name: string;
    code: string;
    flag: string;
  };
  currentPlan: 'monthly' | 'yearly' | 'lifetime' | 'free';
  status: 'Active Pro (Yearly)' | 'Active Pro (Monthly)' | 'Active Pro (Lifetime)' | 'Expired' | 'Refunded' | 'Inactive / Free';
  isActive: boolean;
  startDate: string;
  expiresAt: string;
  rawExpiresAt: string | null;
  rawStartDate: string | null;
  daysRemaining: number | null;
  validityText: string;
  currentAmount: number;
  currentAmountFormatted: string;
  totalAmountSubscribed: number;
  totalAmountSubscribedFormatted: string;
  currency: string;
  source: string;
  history: SubscriptionHistoryItem[];
}

export interface AdminSubscribersResponse {
  success: boolean;
  subscribers: AdminSubscriberRecord[];
  summary: {
    totalUsers: number;
    activePro: number;
    expired: number;
    refunded: number;
    free: number;
    totalRevenueINR: number;
  };
  error?: string;
}

export const ADMIN_EMAILS = new Set([
  'jeetumdc@gmail.com',
  'kalpadass@aiims.edu',
  'admin@mediapp.store',
  'support@mediapp.store',
]);

export function isAuthorizedAdmin(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase().trim());
}

export function detectCountry(info: {
  phone?: string | null;
  currency?: string | null;
  cardCountry?: string | null;
  email?: string | null;
  international?: boolean;
}): { name: string; code: string; flag: string } {
  const ISO_MAP: Record<string, { name: string; flag: string }> = {
    IN: { name: 'India', flag: '🇮🇳' },
    US: { name: 'United States', flag: '🇺🇸' },
    GB: { name: 'United Kingdom', flag: '🇬🇧' },
    CA: { name: 'Canada', flag: '🇨🇦' },
    AU: { name: 'Australia', flag: '🇦🇺' },
    DE: { name: 'Germany', flag: '🇩🇪' },
    FR: { name: 'France', flag: '🇫🇷' },
    AE: { name: 'UAE', flag: '🇦🇪' },
    SA: { name: 'Saudi Arabia', flag: '🇸🇦' },
    SG: { name: 'Singapore', flag: '🇸🇬' },
    NZ: { name: 'New Zealand', flag: '🇳🇿' },
    MY: { name: 'Malaysia', flag: '🇲🇾' },
    PH: { name: 'Philippines', flag: '🇵🇭' },
    ZA: { name: 'South Africa', flag: '🇿🇦' },
    IE: { name: 'Ireland', flag: '🇮🇪' },
    ES: { name: 'Spain', flag: '🇪🇸' },
    IT: { name: 'Italy', flag: '🇮🇹' },
    NL: { name: 'Netherlands', flag: '🇳🇱' },
  };

  if (info.cardCountry && ISO_MAP[info.cardCountry.toUpperCase()]) {
    const found = ISO_MAP[info.cardCountry.toUpperCase()];
    return { name: found.name, code: info.cardCountry.toUpperCase(), flag: found.flag };
  }

  const phone = (info.phone || '').replace(/[\s\-\(\)]/g, '');
  if (phone.startsWith('+91') || (phone.startsWith('91') && phone.length >= 12)) {
    return { name: 'India', code: 'IN', flag: '🇮🇳' };
  }
  if (phone.startsWith('+1') || (phone.startsWith('1') && phone.length === 11)) {
    return { name: 'United States', code: 'US', flag: '🇺🇸' };
  }
  if (phone.startsWith('+44')) {
    return { name: 'United Kingdom', code: 'GB', flag: '🇬🇧' };
  }
  if (phone.startsWith('+61')) {
    return { name: 'Australia', code: 'AU', flag: '🇦🇺' };
  }
  if (phone.startsWith('+971')) {
    return { name: 'UAE', code: 'AE', flag: '🇦🇪' };
  }
  if (phone.startsWith('+966')) {
    return { name: 'Saudi Arabia', code: 'SA', flag: '🇸🇦' };
  }
  if (phone.startsWith('+65')) {
    return { name: 'Singapore', code: 'SG', flag: '🇸🇬' };
  }
  if (phone.startsWith('+49')) {
    return { name: 'Germany', code: 'DE', flag: '🇩🇪' };
  }
  if (phone.startsWith('+33')) {
    return { name: 'France', code: 'FR', flag: '🇫🇷' };
  }

  const curr = (info.currency || '').toUpperCase();
  if (curr === 'INR') {
    return { name: 'India', code: 'IN', flag: '🇮🇳' };
  }
  if (curr === 'USD') {
    return { name: 'United States', code: 'US', flag: '🇺🇸' };
  }
  if (curr === 'GBP') {
    return { name: 'United Kingdom', code: 'GB', flag: '🇬🇧' };
  }
  if (curr === 'EUR') {
    return { name: 'Europe', code: 'EU', flag: '🇪🇺' };
  }
  if (curr === 'AUD') {
    return { name: 'Australia', code: 'AU', flag: '🇦🇺' };
  }
  if (curr === 'CAD') {
    return { name: 'Canada', code: 'CA', flag: '🇨🇦' };
  }

  const email = (info.email || '').toLowerCase();
  if (
    email.endsWith('.in') ||
    email.endsWith('.edu.in') ||
    email.endsWith('.co.in') ||
    email.endsWith('.gov.in') ||
    email.includes('aiims.edu')
  ) {
    return { name: 'India', code: 'IN', flag: '🇮🇳' };
  }
  if (email.endsWith('.uk') || email.endsWith('.co.uk') || email.endsWith('.nhs.uk')) {
    return { name: 'United Kingdom', code: 'GB', flag: '🇬🇧' };
  }
  if (email.endsWith('.au') || email.endsWith('.com.au')) {
    return { name: 'Australia', code: 'AU', flag: '🇦🇺' };
  }
  if (email.endsWith('.ca')) {
    return { name: 'Canada', code: 'CA', flag: '🇨🇦' };
  }
  if (email.endsWith('.de')) {
    return { name: 'Germany', code: 'DE', flag: '🇩🇪' };
  }

  return { name: 'India', code: 'IN', flag: '🇮🇳' };
}
