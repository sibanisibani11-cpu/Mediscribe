'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const { createBilling, validId, fail } = require('./billing');
if (!getApps().length) initializeApp();
const db = getFirestore();
const privateKey = process.env.ENTITLEMENT_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!privateKey || !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || !process.env.RAZORPAY_WEBHOOK_SECRET) throw Error('Backend secrets are not configured');
const key = crypto.createPrivateKey(privateKey);
if (key.asymmetricKeyType !== 'ed25519') throw Error('Use an Ed25519 entitlement key');
const store = {
  async get(collection, id) { const snap = await db.collection(collection).doc(id).get(); return snap.exists ? snap.data() : null; },
  async set(collection, id, data) { await db.collection(collection).doc(id).set(data); },
  transaction(fn) { return db.runTransaction(tx => fn({
    async get(collection, id) { const snap = await tx.get(db.collection(collection).doc(id)); return snap.exists ? snap.data() : null; },
    async paymentsForUser(uid) { const snap = await tx.get(db.collection('payments').where('uid', '==', uid)); return snap.docs.map(doc => ({ ...doc.data(), id: doc.id })); },
    set(collection, id, data) { tx.set(db.collection(collection).doc(id), data); },
  })); },
};
async function gatewayRequest(route, body) {
  const response = await fetch('https://api.razorpay.com/v1/' + route, {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Basic ' + Buffer.from(process.env.RAZORPAY_KEY_ID + ':' + process.env.RAZORPAY_KEY_SECRET).toString('base64'), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) fail('Payment provider temporarily unavailable', 502);
  return response.json();
}
const billing = createBilling({ store, privateKey: key, gateway: {
  keyId: process.env.RAZORPAY_KEY_ID,
  createOrder: input => gatewayRequest('orders', input),
  getPayment: id => gatewayRequest('payments/' + id),
  getOrder: id => gatewayRequest('orders/' + id),
} });
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
async function identity(req) {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  if (!match) fail('Sign in to continue', 401);
  try {
    const decoded = await getAuth().verifyIdToken(match[1], true);
    const user = await getAuth().getUser(decoded.uid);
    return { uid: decoded.uid, email: user.email || '', admin: user.customClaims?.admin === true, createdAt: user.metadata.creationTime };
  } catch { fail('Session expired. Sign in again.', 401); }
}
async function rawBody(req) {
  // Firebase consumes the stream first; preserve the exact bytes used for signatures.
  if (Buffer.isBuffer(req.rawBody)) {
    if (req.rawBody.length > 65536) fail('Request too large', 413);
    return req.rawBody;
  }
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 65536) fail('Request too large', 413); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function rateLimit(scope, subject, maximum) {
  // Shared across instances and separated by authenticated UID. Configure edge
  // protection for anonymous endpoints; never trust caller-supplied forwarded IPs.
  const id = crypto.createHash('sha256').update(scope + ':' + subject).digest('hex');
  const now = Date.now();
  await store.transaction(async tx => {
    const old = await tx.get('request_limits', id);
    const value = old && old.until > now ? old : { count: 0, until: now + 60000 };
    if (value.count >= maximum) fail('Please try again shortly', 429);
    tx.set('request_limits', id, { count: value.count + 1, until: value.until, expiresAt: new Date(value.until + 3600000) });
  });
}
const ISO_MAP = {
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
};

const PHONE_PREFIX_MAP = [
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

function resolveSubscriberCountry(info = {}) {
  if (info.country) {
    if (typeof info.country === 'object' && info.country.name && info.country.name !== 'Unknown') {
      return { name: info.country.name, code: info.country.code || '', flag: info.country.flag || ISO_MAP[info.country.code?.toUpperCase()]?.flag || '🌐' };
    }
    if (typeof info.country === 'string') {
      const code = info.country.toUpperCase();
      if (ISO_MAP[code]) return { name: ISO_MAP[code].name, code, flag: ISO_MAP[code].flag };
    }
  }
  const cardCode = info.cardCountry?.toUpperCase() ||
    info.history?.find(p => p.cardCountry || p.card?.country)?.cardCountry?.toUpperCase() ||
    info.history?.find(p => p.card?.country)?.card?.country?.toUpperCase();
  if (cardCode && ISO_MAP[cardCode]) return { name: ISO_MAP[cardCode].name, code: cardCode, flag: ISO_MAP[cardCode].flag };

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

  if (info.email && typeof info.email === 'string') {
    const email = info.email.toLowerCase().trim();
    if (email.endsWith('@aiims.edu') || /@(.*\.)?aiims\.edu$/.test(email)) return { name: 'India', code: 'IN', flag: '🇮🇳' };
    if (/\.(in|co\.in|ac\.in|edu\.in|gov\.in|res\.in)$/.test(email)) return { name: 'India', code: 'IN', flag: '🇮🇳' };
    if (/\.(uk|co\.uk|nhs\.uk|ac\.uk|gov\.uk)$/.test(email)) return { name: 'United Kingdom', code: 'GB', flag: '🇬🇧' };
    if (/\.(ca|gc\.ca|on\.ca|qc\.ca)$/.test(email)) return { name: 'Canada', code: 'CA', flag: '🇨🇦' };
    if (/\.(au|com\.au|edu\.au|gov\.au)$/.test(email)) return { name: 'Australia', code: 'AU', flag: '🇦🇺' };
    if (/\.(gh|edu\.gh|com\.gh|gov\.gh)$/.test(email)) return { name: 'Ghana', code: 'GH', flag: '🇬🇭' };
    if (/\.(ng|edu\.ng|gov\.ng|com\.ng)$/.test(email)) return { name: 'Nigeria', code: 'NG', flag: '🇳🇬' };
    if (/\.(za|co\.za|ac\.za)$/.test(email)) return { name: 'South Africa', code: 'ZA', flag: '🇿🇦' };
    if (/\.(ph|com\.ph|edu\.ph)$/.test(email)) return { name: 'Philippines', code: 'PH', flag: '🇵🇭' };
    if (/\.(sg|com\.sg|edu\.sg)$/.test(email)) return { name: 'Singapore', code: 'SG', flag: '🇸🇬' };
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

  if (info.timezone && typeof info.timezone === 'string') {
    const tz = info.timezone.toLowerCase();
    if (tz.includes('kolkata') || tz.includes('calcutta')) return { name: 'India', code: 'IN', flag: '🇮🇳' };
    if (tz.includes('accra')) return { name: 'Ghana', code: 'GH', flag: '🇬🇭' };
    if (tz.includes('lagos')) return { name: 'Nigeria', code: 'NG', flag: '🇳🇬' };
    if (tz.includes('london')) return { name: 'United Kingdom', code: 'GB', flag: '🇬🇧' };
    if (tz.includes('new_york') || tz.includes('chicago') || tz.includes('denver') || tz.includes('los_angeles') || tz.includes('phoenix') || tz.includes('detroit') || tz.includes('anchorage') || tz.includes('honolulu')) {
      return { name: 'United States', code: 'US', flag: '🇺🇸' };
    }
    if (tz.includes('toronto') || tz.includes('vancouver') || tz.includes('montreal') || tz.includes('edmonton')) return { name: 'Canada', code: 'CA', flag: '🇨🇦' };
    if (tz.includes('sydney') || tz.includes('melbourne') || tz.includes('brisbane') || tz.includes('perth')) return { name: 'Australia', code: 'AU', flag: '🇦🇺' };
    if (tz.includes('berlin')) return { name: 'Germany', code: 'DE', flag: '🇩🇪' };
    if (tz.includes('paris')) return { name: 'France', code: 'FR', flag: '🇫🇷' };
    if (tz.includes('dubai')) return { name: 'UAE', code: 'AE', flag: '🇦🇪' };
    if (tz.includes('riyadh')) return { name: 'Saudi Arabia', code: 'SA', flag: '🇸🇦' };
    if (tz.includes('singapore')) return { name: 'Singapore', code: 'SG', flag: '🇸🇬' };
    if (tz.includes('manila')) return { name: 'Philippines', code: 'PH', flag: '🇵🇭' };
    if (tz.includes('johannesburg')) return { name: 'South Africa', code: 'ZA', flag: '🇿🇦' };
  }

  const hasUpi = info.history?.some(p => p.method === 'upi' || p.vpa || (p.notes && p.notes.vpa));
  if (hasUpi || (info.currency === 'INR' && !info.international)) return { name: 'India', code: 'IN', flag: '🇮🇳' };

  return { name: 'Unknown', code: '', flag: '🌐' };
}

async function telemetry(data, req = null) {
  if (!validId(data.installId) || !validId(data.sessionId)) fail('Invalid event IDs');
  const os = ['windows', 'mac', 'linux', 'android', 'ios', 'unknown'].includes(data.os) ? data.os : 'unknown';
  const source = ['microsoft_store', 'mac_app_store', 'direct', 'website', 'android', 'unknown'].includes(data.source) ? data.source : 'unknown';
  const cloudCountry = req?.headers ? (req.headers['x-appengine-country'] || req.headers['cf-ipcountry'] || null) : null;
  const ip = req?.headers ? ((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null) : null;
  const countryObj = resolveSubscriberCountry({ country: cloudCountry, timezone: data.timezone });
  const value = { app: 'mediscribe', installId: data.installId, sessionId: data.sessionId, os, source, country: countryObj.name, isGuest: true, timestamp: new Date().toISOString(), version: String(data.version || '').slice(0, 30), ip };
  await store.transaction(async tx => {
    const first = await tx.get('downloads', data.installId);
    const launch = await tx.get('app_launches', data.sessionId);
    if (!first) tx.set('downloads', data.installId, { ...value, event: 'first_open' });
    if (!launch) tx.set('app_launches', data.sessionId, { ...value, event: 'app_launch' });
  });
  return { success: true };
}
async function adminData(url) {
  const limit = Number(url.searchParams.get('limit') || 50);
  const cursor = url.searchParams.get('cursor');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (cursor && (!/^[A-Za-z0-9_-]{1,128}$/.test(cursor)))) fail('Invalid pagination');
  let query = db.collection('users').orderBy(FieldPath.documentId()).limit(limit + 1);
  if (cursor) query = query.startAfter(cursor);
  const [page, totalUsers] = await Promise.all([query.get(), db.collection('users').count().get()]);
  const users = { docs: page.docs.slice(0, limit), size: Math.min(page.size, limit) };
  const histories = await Promise.all(users.docs.map(doc => db.collection('payments').where('uid', '==', doc.id).orderBy('date', 'desc').limit(101).get()));
  const truncated = new Set(users.docs.filter((_, index) => histories[index].size > 100).map(doc => doc.id));
  const payments = { docs: histories.flatMap(snap => snap.docs.slice(0, 100)) };
  const count = async (collection, field, value) => {
    let q = db.collection(collection);
    if (field) q = q.where(field, '==', value);
    return (await q.count().get()).data().count;
  };
  const [installs, launches, windows, mac, linux, ms, reconciliation, openIssues] = await Promise.all([
    count('downloads'), count('app_launches'), count('downloads', 'os', 'windows'), count('downloads', 'os', 'mac'), count('downloads', 'os', 'linux'), store.get('app_stats', 'microsoft_store'),
    store.get('operations', 'payment_reconciliation'), count('reconciliation_issues', 'status', 'open'),
  ]);
  const allPayments = payments.docs.map(d => ({ ...d.data(), id: d.id }));
  const money = (amount, currency) => new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount);
  const summary = { scope: 'page', totalUsers: users.size, activePro: 0, trial: 0, expired: 0, refunded: 0, free: 0, totalRevenueINR: 0 };
  const subscribers = users.docs.map(doc => {
    const user = doc.data(), license = user.licenseDetails;
    const active = !!(user.isActivated && Date.parse(license?.expiresAt) > Date.now());
    const trial = !active && Date.parse(user.trialExpiresAt) > Date.now();
    const history = allPayments.filter(p => p.uid === doc.id).map(p => ({ ...p, paymentId: p.id, amount: p.amount / 100, amountRefunded: (p.amountRefunded || (p.status === 'refunded' ? p.amount : 0)) / 100, netAmount: (p.amount - (p.amountRefunded || (p.status === 'refunded' ? p.amount : 0))) / 100, rawDate: p.date, source: 'Razorpay' }));
    const last = history.filter(p => p.status === 'captured').sort((a,b) => b.date.localeCompare(a.date))[0];
    const currency = last?.currency || history[0]?.currency || 'INR';
    const total = history.filter(p => p.currency === currency && ['captured', 'refunded'].includes(p.status)).reduce((n,p) => n + p.netAmount, 0);
    const refunded = history.some(p => p.status === 'refunded');
    const status = active ? `Active Pro (${license.billing === 'yearly' ? 'Yearly' : 'Monthly'})` : trial ? 'Free Trial (Active)' : refunded ? 'Refunded' : license ? 'Expired' : user.trialExpiresAt ? 'Free Trial (Expired)' : 'Inactive / Free';
    summary[active ? 'activePro' : trial ? 'trial' : refunded ? 'refunded' : status.includes('Expired') ? 'expired' : 'free']++;
    const expiresAt = license?.expiresAt || user.trialExpiresAt;
    const phone = user.phoneNumber || user.phone || last?.contact || history[0]?.contact || null;
    const country = resolveSubscriberCountry({
      country: user.country,
      phone,
      email: user.email,
      currency,
      cardCountry: last?.cardCountry || last?.card?.country || history[0]?.cardCountry || history[0]?.card?.country,
      timezone: user.timezone,
      history,
    });
    return { userId: doc.id, displayName: user.displayName || user.email || doc.id, email: user.email || null, phone, hwid: user.deviceId || null,
      country, currentPlan: active ? license.billing : trial ? 'trial' : 'free', status, isActive: active || trial, isTrial: trial,
      startDate: license?.date || user.createdAt || '—', rawStartDate: license?.date || user.createdAt || null, expiresAt: expiresAt || '—', rawExpiresAt: expiresAt || null,
      daysRemaining: expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 86400000)) : null, validityText: active || trial ? 'Active' : 'Inactive',
      currentAmount: last?.amount || 0, currentAmountFormatted: money(last?.amount || 0, currency), totalAmountSubscribed: total, totalAmountSubscribedFormatted: money(total, currency), currency, source: 'Backend', history, historyTruncated: truncated.has(doc.id) };
  });
  summary.totalRevenueINR = allPayments.filter(p => p.currency === 'INR' && ['captured', 'refunded'].includes(p.status)).reduce((n,p) => n + (p.amount - (p.amountRefunded ?? (p.status === 'refunded' ? p.amount : 0))) / 100, 0);
  return { success: true, subscribers, summary,
    operations: { lastCompletedAt: reconciliation?.lastCompletedAt || null, openIssues,
      stale: !(Date.parse(reconciliation?.lastCompletedAt) > Date.now() - 45 * 60 * 1000),
      lastChecked: reconciliation?.checked || 0, lastFailed: reconciliation?.failed || 0 },
    pagination: { limit, nextCursor: page.size > limit ? users.docs.at(-1).id : null, totalUsers: totalUsers.data().count },
    downloads: { total: installs, windows, mac, linux, guest: installs, loggedIn: 0,
      launches: { total: launches, guest: launches, loggedIn: 0 },
      sources: { msStore: { total: ms?.acquisitions ?? null, startDate: ms?.startDate || null, endDate: ms?.endDate || null, syncedAt: ms?.syncedAt || null } } } };

}
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && !allowedOrigins.has(origin)) fail('Origin is not allowed', 403);
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'); res.writeHead(204); return res.end(); }
    if (req.url === '/health' && req.method === 'GET') return res.end(JSON.stringify({ ok: true }));
    const url = new URL(req.url, 'https://localhost');
    if (req.method === 'GET' && req.url.startsWith('/checkout?')) {
      const orderId = new URL(req.url, 'https://localhost').searchParams.get('order');
      if (!/^order_[A-Za-z0-9]+$/.test(orderId || '')) fail('Invalid order');
      const order = await store.get('orders', orderId);
      if (!order || order.paymentId || Date.now() - order.createdAt > 3600000) fail('Order expired or already paid', 409);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const options = JSON.stringify({ key: process.env.RAZORPAY_KEY_ID, order_id: order.id, amount: order.amount, currency: order.currency, name: 'MediScribe', description: order.plan + ' subscription' }).replace(/</g, '\u003c');
      return res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>MediScribe checkout</title><h1>MediScribe secure checkout</h1><p id="status">Complete payment, then return to the app. Keep your payment ID for recovery.</p><button id="pay">Pay securely</button><script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>const options=' + options + ';options.handler=function(r){document.getElementById("status").textContent="Payment received: "+r.razorpay_payment_id+". Return to MediScribe to verify and activate access.";document.getElementById("pay").disabled=true;};document.getElementById("pay").onclick=function(){new Razorpay(options).open();};</script>');
    }
    const raw = req.method === 'POST' ? await rawBody(req) : Buffer.alloc(0);
    if (req.url === '/v1/webhooks/razorpay' && req.method === 'POST') {
      const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest();
      const supplied = Buffer.from(req.headers['x-razorpay-signature'] || '', 'hex');
      if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) fail('Invalid webhook signature', 401);
      const event = JSON.parse(raw);
      if (!['payment.captured', 'refund.processed'].includes(event.event)) return res.end(JSON.stringify({ success: true }));
      const eventId = String(req.headers['x-razorpay-event-id'] || '').slice(0, 256);
      const eventKey = crypto.createHash('sha256').update(raw).digest('hex');
      const receipt = { eventId, type: event.event, paymentId: event.payload?.payment?.entity?.id || event.payload?.refund?.entity?.payment_id || null,
        refundId: event.payload?.refund?.entity?.id || null, refundAmount: event.payload?.refund?.entity?.amount || null, providerCreatedAt: event.created_at || null };
      const done = await store.transaction(async tx => {
        const previous = await tx.get('webhook_events', eventKey);
        if (previous?.status === 'processed') return true;
        tx.set('webhook_events', eventKey, { ...receipt, receivedAt: previous?.receivedAt || new Date().toISOString(), status: 'pending' });
        return false;
      });
      if (done) return res.end(JSON.stringify({ success: true }));
      try {
      if (event.event === 'payment.captured') await billing.fulfill(event.payload.payment.entity.id);
      if (event.event === 'refund.processed') {
        const id = event.payload.refund.entity.payment_id;
        if (!/^pay_[A-Za-z0-9]+$/.test(id)) fail('Invalid payment ID');
        const payment = await gatewayRequest('payments/' + id);
        if (payment.id !== id) fail('Provider payment ID mismatch', 502);
        if (!(payment.amount_refunded > 0)) fail('Refund is not yet reflected by the provider', 502);
        await billing.revoke(id, payment.amount_refunded);
      }
      await store.transaction(async tx => {
        const previous = await tx.get('webhook_events', eventKey);
        tx.set('webhook_events', eventKey, { ...previous, status: 'processed', processedAt: new Date().toISOString() });
      });
      } catch (error) {
        await store.transaction(async tx => {
          const previous = await tx.get('webhook_events', eventKey);
          if (previous?.status !== 'processed') tx.set('webhook_events', eventKey, { ...previous, status: 'failed', failedAt: new Date().toISOString(), errorCode: error.status || 500 });
        });
        throw error;
      }
      return res.end(JSON.stringify({ success: true }));
    }
    const data = raw.length ? JSON.parse(raw) : {};
    if (req.url === '/v1/telemetry' && req.method === 'POST') return res.end(JSON.stringify(await telemetry(data, req)));
    const user = await identity(req);
    await rateLimit('authenticated', user.uid, 120);
    let result;
    if (req.url === '/v1/entitlement' && req.method === 'POST') {
      result = await billing.entitlement(user, data.deviceId);
      const cloudCountry = req.headers['x-appengine-country'] || req.headers['cf-ipcountry'] || null;
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;
      const detected = resolveSubscriberCountry({ country: cloudCountry, timezone: data.timezone, email: user.email, phone: user.phoneNumber });
      if (detected.name !== 'Unknown') {
        db.collection('users').doc(user.uid).set({ country: detected, lastIp: ip, timezone: data.timezone || null, lastSeenAt: new Date().toISOString() }, { merge: true }).catch(() => {});
      }
    }
    else if (req.url === '/v1/orders' && req.method === 'POST') result = await billing.createOrder(user, data);
    else if (req.url === '/v1/orders/status' && req.method === 'POST') {
      if (!/^order_[A-Za-z0-9]+$/.test(data.orderId || '')) fail('Invalid order');
      const order = await store.get('orders', data.orderId);
      if (!order || order.uid !== user.uid) fail('Order does not belong to this account', 403);
      const payments = await gatewayRequest('orders/' + order.id + '/payments');
      const payment = payments.items?.find(p => p.id === order.paymentId) || payments.items?.find(p => p.captured === true && ['captured', 'refunded'].includes(p.status));
      result = payment ? await billing.fulfill(payment.id, user) : { success: true, fulfilled: false, status: 'pending' };
    }
    else if (req.url === '/v1/admin/reconcile' && req.method === 'POST') {
      if (!user.admin) fail('Administrator access required', 403);
      result = await billing.fulfill(data.paymentId);
    }
    else if (req.url === '/v1/payments/reconcile' && req.method === 'POST') { await billing.fulfill(data.paymentId, user); result = await billing.entitlement(user, data.deviceId); }
    else if (url.pathname === '/v1/admin/payments' && req.method === 'GET') {
      if (!user.admin) fail('Administrator access required', 403);
      const limit = Number(url.searchParams.get('limit') || 100), cursor = url.searchParams.get('cursor');
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (cursor && !/^pay_[A-Za-z0-9]+$/.test(cursor))) fail('Invalid pagination');
      let query = db.collection('payments').orderBy(FieldPath.documentId()).limit(limit + 1);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get(), docs = page.docs.slice(0, limit);
      result = { success: true, payments: docs.map(doc => ({ ...doc.data(), id: doc.id })), nextCursor: page.size > limit ? docs.at(-1).id : null };
    }
    else if (url.pathname === '/v1/admin/subscribers' && req.method === 'GET') { if (!user.admin) fail('Administrator access required', 403); result = await adminData(url); }
    else if (req.url === '/v1/admin/migrate-legacy' && req.method === 'POST') {
      if (!user.admin) fail('Administrator access required', 403);
      if (typeof data.uid !== 'string' || !data.uid || data.uid.length > 128) fail('Invalid account ID');
      const target = await getAuth().getUser(data.uid);
      result = await billing.migrateLegacy(user, { uid: data.uid, email: target.email || '', createdAt: target.metadata.creationTime }, data);
    }
    else fail('Not found', 404);
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = error.status || (error instanceof SyntaxError ? 400 : 500);
    res.end(JSON.stringify({ success: false, error: error.status ? error.message : 'Request could not be completed. Please retry.' }));
  }
});
server.requestTimeout = 20000;
server.headersTimeout = 10000;
if (require.main === module) server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
module.exports = server.listeners('request')[0];
module.exports.reconcile = () => {
  const { reconcile, firestoreStore } = require('./reconciliation');
  return reconcile({ store: firestoreStore(db, FieldPath), billing, gatewayRequest, logger: require('firebase-functions/logger') });
};
