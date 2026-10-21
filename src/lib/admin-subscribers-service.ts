export interface SubscriptionHistoryItem {
  id: string;
  paymentId: string;
  orderId?: string;
  uid?: string;
  recordedAt?: string;
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
  contact?: string | null;
  cardCountry?: string | null;
  method?: string | null;
  email?: string | null;
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

export const ISO_MAP: Record<string, { name: string; flag: string }> = {
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
  GH: { name: 'Ghana', flag: '🇬🇭' },
  NG: { name: 'Nigeria', flag: '🇳🇬' },
  KE: { name: 'Kenya', flag: '🇰🇪' },
  EG: { name: 'Egypt', flag: '🇪🇬' },
  PK: { name: 'Pakistan', flag: '🇵🇰' },
  BD: { name: 'Bangladesh', flag: '🇧🇩' },
  NP: { name: 'Nepal', flag: '🇳🇵' },
  LK: { name: 'Sri Lanka', flag: '🇱🇰' },
  BR: { name: 'Brazil', flag: '🇧🇷' },
  MX: { name: 'Mexico', flag: '🇲🇽' },
  JP: { name: 'Japan', flag: '🇯🇵' },
  KR: { name: 'South Korea', flag: '🇰🇷' },
  CN: { name: 'China', flag: '🇨🇳' },
  CH: { name: 'Switzerland', flag: '🇨🇭' },
  SE: { name: 'Sweden', flag: '🇸🇪' },
  NO: { name: 'Norway', flag: '🇳🇴' },
  DK: { name: 'Denmark', flag: '🇩🇰' },
  FI: { name: 'Finland', flag: '🇫🇮' },
  BE: { name: 'Belgium', flag: '🇧🇪' },
  AT: { name: 'Austria', flag: '🇦🇹' },
  IL: { name: 'Israel', flag: '🇮🇱' },
  TR: { name: 'Turkey', flag: '🇹🇷' },
  ID: { name: 'Indonesia', flag: '🇮🇩' },
  TH: { name: 'Thailand', flag: '🇹🇭' },
  VN: { name: 'Vietnam', flag: '🇻🇳' },
  QA: { name: 'Qatar', flag: '🇶🇦' },
  OM: { name: 'Oman', flag: '🇴🇲' },
  KW: { name: 'Kuwait', flag: '🇰🇼' },
  BH: { name: 'Bahrain', flag: '🇧🇭' },
};

const PHONE_PREFIX_MAP: [string, string][] = [
  ['+233', 'GH'], ['+234', 'NG'], ['+254', 'KE'], ['+880', 'BD'],
  ['+977', 'NP'], ['+971', 'AE'], ['+966', 'SA'], ['+972', 'IL'],
  ['+353', 'IE'], ['+358', 'FI'], ['+974', 'QA'], ['+968', 'OM'],
  ['+965', 'KW'], ['+973', 'BH'],
  ['+91', 'IN'],  ['+44', 'GB'],  ['+61', 'AU'],  ['+49', 'DE'],
  ['+33', 'FR'],  ['+65', 'SG'],  ['+63', 'PH'],  ['+27', 'ZA'],
  ['+92', 'PK'],  ['+94', 'LK'],  ['+20', 'EG'],  ['+90', 'TR'],
  ['+62', 'ID'],  ['+60', 'MY'],  ['+64', 'NZ'],  ['+34', 'ES'],
  ['+39', 'IT'],  ['+31', 'NL'],  ['+41', 'CH'],  ['+46', 'SE'],
  ['+47', 'NO'],  ['+45', 'DK'],  ['+81', 'JP'],  ['+82', 'KR'],
  ['+86', 'CN'],  ['+55', 'BR'],  ['+52', 'MX'],  ['+54', 'AR'],
  ['+57', 'CO'],  ['+56', 'CL'],  ['+1', 'US'],
];

export function detectCountry(info: {
  phone?: string | null;
  currency?: string | null;
  cardCountry?: string | null;
  email?: string | null;
  international?: boolean;
  country?: string | { name?: string; code?: string; flag?: string } | null;
  timezone?: string | null;
  ip?: string | null;
  history?: any[];
}): { name: string; code: string; flag: string } {
  // 1. Explicit country object or string code
  if (info.country) {
    if (typeof info.country === 'object' && info.country.name && info.country.name !== 'Unknown') {
      return {
        name: info.country.name,
        code: info.country.code || '',
        flag: info.country.flag || ISO_MAP[info.country.code?.toUpperCase() || '']?.flag || '🌐',
      };
    }
    if (typeof info.country === 'string') {
      const code = info.country.toUpperCase();
      if (ISO_MAP[code]) return { name: ISO_MAP[code].name, code, flag: ISO_MAP[code].flag };
    }
  }

  // 2. Card Country from payment gateway
  const cardCode = info.cardCountry?.toUpperCase() ||
    info.history?.find(p => p.cardCountry || p.card?.country)?.cardCountry?.toUpperCase() ||
    info.history?.find(p => p.card?.country)?.card?.country?.toUpperCase();
  if (cardCode && ISO_MAP[cardCode]) {
    return { name: ISO_MAP[cardCode].name, code: cardCode, flag: ISO_MAP[cardCode].flag };
  }

  // 3. Phone Number dial prefix
  const phone = info.phone ||
    info.history?.find(p => p.contact || p.phone)?.contact ||
    info.history?.find(p => p.phone)?.phone;
  if (phone && typeof phone === 'string') {
    const clean = phone.replace(/[^\d+]/g, '');
    const normalized = clean.startsWith('+') ? clean : (clean.length >= 11 && clean.startsWith('91') ? '+' + clean : '+' + clean);
    for (const [prefix, iso] of PHONE_PREFIX_MAP) {
      if (normalized.startsWith(prefix)) {
        const found = ISO_MAP[iso];
        if (found) return { name: found.name, code: iso, flag: found.flag };
      }
    }
  }

  // 4. Email Domain & Institutional TLDs
  if (info.email && typeof info.email === 'string') {
    const email = info.email.toLowerCase().trim();
    if (email.endsWith('@aiims.edu') || /@(.*\.)?aiims\.edu$/.test(email)) {
      return { name: 'India', code: 'IN', flag: '🇮🇳' };
    }
    if (/\.(in|co\.in|ac\.in|edu\.in|gov\.in|res\.in)$/.test(email)) {
      return { name: 'India', code: 'IN', flag: '🇮🇳' };
    }
    if (/\.(uk|co\.uk|nhs\.uk|ac\.uk|gov\.uk)$/.test(email)) {
      return { name: 'United Kingdom', code: 'GB', flag: '🇬🇧' };
    }
    if (/\.(ca|gc\.ca|on\.ca|qc\.ca)$/.test(email)) {
      return { name: 'Canada', code: 'CA', flag: '🇨🇦' };
    }
    if (/\.(au|com\.au|edu\.au|gov\.au)$/.test(email)) {
      return { name: 'Australia', code: 'AU', flag: '🇦🇺' };
    }
    if (/\.(gh|edu\.gh|com\.gh|gov\.gh)$/.test(email)) {
      return { name: 'Ghana', code: 'GH', flag: '🇬🇭' };
    }
    if (/\.(ng|edu\.ng|gov\.ng|com\.ng)$/.test(email)) {
      return { name: 'Nigeria', code: 'NG', flag: '🇳🇬' };
    }
    if (/\.(za|co\.za|ac\.za)$/.test(email)) {
      return { name: 'South Africa', code: 'ZA', flag: '🇿🇦' };
    }
    if (/\.(ph|com\.ph|edu\.ph)$/.test(email)) {
      return { name: 'Philippines', code: 'PH', flag: '🇵🇭' };
    }
    if (/\.(sg|com\.sg|edu\.sg)$/.test(email)) {
      return { name: 'Singapore', code: 'SG', flag: '🇸🇬' };
    }
    if (/\.de$/.test(email)) return { name: 'Germany', code: 'DE', flag: '🇩🇪' };
    if (/\.fr$/.test(email)) return { name: 'France', code: 'FR', flag: '🇫🇷' };
    if (/\.(nz|co\.nz)$/.test(email)) return { name: 'New Zealand', code: 'NZ', flag: '🇳🇿' };
    if (/\.ie$/.test(email)) return { name: 'Ireland', code: 'IE', flag: '🇮🇪' };
    if (/\.es$/.test(email)) return { name: 'Spain', code: 'ES', flag: '🇪🇸' };
    if (/\.it$/.test(email)) return { name: 'Italy', code: 'IT', flag: '🇮🇹' };
    if (/\.nl$/.test(email)) return { name: 'Netherlands', code: 'NL', flag: '🇳🇱' };
    if (/\.(jp|co\.jp)$/.test(email)) return { name: 'Japan', code: 'JP', flag: '🇯🇵' };
    if (/\.(br|com\.br)$/.test(email)) return { name: 'Brazil', code: 'BR', flag: '🇧🇷' };
    if (/\.(mx|com\.mx)$/.test(email)) return { name: 'Mexico', code: 'MX', flag: '🇲🇽' };
    if (/\.(mil|gov)$/.test(email)) return { name: 'United States', code: 'US', flag: '🇺🇸' };
  }

  // 5. Timezone (Client Internet / Locale context)
  if (info.timezone && typeof info.timezone === 'string') {
    const tz = info.timezone.toLowerCase();
    if (tz.includes('kolkata') || tz.includes('calcutta')) return { name: 'India', code: 'IN', flag: '🇮🇳' };
    if (tz.includes('accra')) return { name: 'Ghana', code: 'GH', flag: '🇬🇭' };
    if (tz.includes('lagos')) return { name: 'Nigeria', code: 'NG', flag: '🇳🇬' };
    if (tz.includes('london')) return { name: 'United Kingdom', code: 'GB', flag: '🇬🇧' };
    if (tz.includes('new_york') || tz.includes('chicago') || tz.includes('denver') || tz.includes('los_angeles') || tz.includes('phoenix') || tz.includes('detroit') || tz.includes('anchorage') || tz.includes('honolulu')) {
      return { name: 'United States', code: 'US', flag: '🇺🇸' };
    }
    if (tz.includes('toronto') || tz.includes('vancouver') || tz.includes('montreal') || tz.includes('edmonton') || tz.includes('winnipeg')) {
      return { name: 'Canada', code: 'CA', flag: '🇨🇦' };
    }
    if (tz.includes('sydney') || tz.includes('melbourne') || tz.includes('brisbane') || tz.includes('perth') || tz.includes('adelaide')) {
      return { name: 'Australia', code: 'AU', flag: '🇦🇺' };
    }
    if (tz.includes('berlin')) return { name: 'Germany', code: 'DE', flag: '🇩🇪' };
    if (tz.includes('paris')) return { name: 'France', flag: '🇫🇷', code: 'FR' };
    if (tz.includes('dubai')) return { name: 'UAE', code: 'AE', flag: '🇦🇪' };
    if (tz.includes('riyadh')) return { name: 'Saudi Arabia', code: 'SA', flag: '🇸🇦' };
    if (tz.includes('singapore')) return { name: 'Singapore', code: 'SG', flag: '🇸🇬' };
    if (tz.includes('manila')) return { name: 'Philippines', code: 'PH', flag: '🇵🇭' };
    if (tz.includes('johannesburg')) return { name: 'South Africa', code: 'ZA', flag: '🇿🇦' };
    if (tz.includes('karachi')) return { name: 'Pakistan', code: 'PK', flag: '🇵🇰' };
    if (tz.includes('dhaka')) return { name: 'Bangladesh', code: 'BD', flag: '🇧🇩' };
    if (tz.includes('kathmandu')) return { name: 'Nepal', code: 'NP', flag: '🇳🇵' };
    if (tz.includes('colombo')) return { name: 'Sri Lanka', code: 'LK', flag: '🇱🇰' };
    if (tz.includes('nairobi')) return { name: 'Kenya', code: 'KE', flag: '🇰🇪' };
    if (tz.includes('cairo')) return { name: 'Egypt', code: 'EG', flag: '🇪🇬' };
    if (tz.includes('tokyo')) return { name: 'Japan', code: 'JP', flag: '🇯🇵' };
    if (tz.includes('seoul')) return { name: 'South Korea', code: 'KR', flag: '🇰🇷' };
    if (tz.includes('sao_paulo')) return { name: 'Brazil', code: 'BR', flag: '🇧🇷' };
    if (tz.includes('mexico_city')) return { name: 'Mexico', code: 'MX', flag: '🇲🇽' };
    if (tz.includes('rome')) return { name: 'Italy', code: 'IT', flag: '🇮🇹' };
    if (tz.includes('madrid')) return { name: 'Spain', code: 'ES', flag: '🇪🇸' };
    if (tz.includes('amsterdam')) return { name: 'Netherlands', code: 'NL', flag: '🇳🇱' };
    if (tz.includes('zurich')) return { name: 'Switzerland', code: 'CH', flag: '🇨🇭' };
    if (tz.includes('stockholm')) return { name: 'Sweden', code: 'SE', flag: '🇸🇪' };
    if (tz.includes('oslo')) return { name: 'Norway', code: 'NO', flag: '🇳🇴' };
    if (tz.includes('copenhagen')) return { name: 'Denmark', code: 'DK', flag: '🇩🇰' };
    if (tz.includes('helsinki')) return { name: 'Finland', code: 'FI', flag: '🇫🇮' };
    if (tz.includes('dublin')) return { name: 'Ireland', code: 'IE', flag: '🇮🇪' };
    if (tz.includes('auckland')) return { name: 'New Zealand', code: 'NZ', flag: '🇳🇿' };
  }

  // 6. Payment method or currency
  const hasUpi = info.history?.some(p => p.method === 'upi' || p.vpa || (p.notes && p.notes.vpa));
  if (hasUpi || (info.currency === 'INR' && !info.international)) {
    return { name: 'India', code: 'IN', flag: '🇮🇳' };
  }

  return { name: 'Unknown', code: '', flag: '🌐' };
}
