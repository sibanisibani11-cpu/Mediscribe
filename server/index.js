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
    return { uid: decoded.uid, email: user.email || '', admin: decoded.admin === true, createdAt: user.metadata.creationTime };
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
async function telemetry(data) {
  if (!validId(data.installId) || !validId(data.sessionId)) fail('Invalid event IDs');
  const os = ['windows', 'mac', 'linux', 'android', 'ios', 'unknown'].includes(data.os) ? data.os : 'unknown';
  const source = ['microsoft_store', 'mac_app_store', 'direct', 'website', 'android', 'unknown'].includes(data.source) ? data.source : 'unknown';
  const value = { app: 'mediscribe', installId: data.installId, sessionId: data.sessionId, os, source, country: 'Unknown', isGuest: true, timestamp: new Date().toISOString(), version: String(data.version || '').slice(0, 30) };
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
    return { userId: doc.id, displayName: user.displayName || user.email || doc.id, email: user.email || null, phone: null, hwid: null,
      country: { name: 'Unknown', code: '', flag: '🌐' }, currentPlan: active ? license.billing : trial ? 'trial' : 'free', status, isActive: active || trial, isTrial: trial,
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
    if (req.url === '/v1/telemetry' && req.method === 'POST') return res.end(JSON.stringify(await telemetry(data)));
    const user = await identity(req);
    await rateLimit('authenticated', user.uid, 120);
    let result;
    if (req.url === '/v1/entitlement' && req.method === 'POST') result = await billing.entitlement(user, data.deviceId);
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
