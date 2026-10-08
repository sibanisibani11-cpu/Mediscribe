export interface SubscriptionHistoryItem {
  id: string;
  paymentId: string;
  amount: number;
  amountRefunded?: number;
  netAmount?: number;
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
  currentPlan: 'monthly' | 'yearly' | 'lifetime' | 'trial' | 'free';
  status: 'Active Pro (Yearly)' | 'Active Pro (Monthly)' | 'Active Pro (Lifetime)' | 'Free Trial (Active)' | 'Free Trial (Expired)' | 'Expired' | 'Refunded' | 'Inactive / Free';
  isActive: boolean;
  isTrial?: boolean;
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
  historyTruncated?: boolean;
}

export interface DownloadStats {
  total: number;
  windows: number;
  mac: number;
  linux: number;
  guest: number;
  loggedIn: number;
  windowsBreakdown?: {
    msStore: number;
    directExe: number;
  };
  sources?: {
    github?: { windows: number; mac: number; linux: number; total: number } | null;
    msStore?: { total: number; startDate: string | null; endDate: string | null; syncedAt: string | null };
    website?: { windows: number; mac: number; linux: number; guest: number; loggedIn: number; total: number };
  };
  launches?: {
    total: number;
    guest: number;
    loggedIn: number;
  };
  recentDownloads?: Array<{
    os: 'windows' | 'mac' | 'linux';
    isGuest: boolean;
    user?: string;
    timestamp: string;
    country?: string;
  }>;
}

export interface AdminSubscribersResponse {
  success: boolean;
  subscribers: AdminSubscriberRecord[];
  summary: {
    totalUsers: number;
    activePro: number;
    trial: number;
    expired: number;
    refunded: number;
    free: number;
    totalRevenueINR: number;
    scope?: 'page';
  };
  pagination?: { limit: number; nextCursor: string | null; totalUsers: number };
  downloads?: DownloadStats;
  operations?: { lastCompletedAt: string | null; openIssues: number; stale: boolean; lastChecked: number; lastFailed: number };
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

  return { name: 'Unknown', code: '', flag: '🌐' };
}
