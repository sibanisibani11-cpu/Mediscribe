'use strict';
const crypto = require('node:crypto');
const catalog = require('./plans.json');
const DAY = 86400000;
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function priceFor(plan, currency, promo = '') {
  if (!['monthly', 'yearly'].includes(plan) || !catalog.prices[currency]) fail('Unsupported plan or currency');
  const discount = promo ? catalog.promos[promo] : 0;
  if (discount === undefined) fail('Invalid promo code');
  return Math.round(catalog.prices[currency][plan] * (100 - discount) / 100);
}
function validatePayment(payment, order) {
  if (!order || payment.order_id !== order.id || payment.amount !== order.amount || payment.currency !== order.currency ||
      payment.status !== 'captured' || payment.captured !== true || payment.amount_refunded !== 0) {
    fail('Payment is not a fully captured, unrefunded payment for this order', 409);
  }
}
function signEntitlement(user, deviceId, privateKey, now = Date.now()) {
  const paidExpiry = Date.parse(user.licenseDetails?.expiresAt);
  const paid = !!(user.isActivated && paidExpiry > now);
  const expiry = paid ? paidExpiry : Date.parse(user.trialExpiresAt);
  const active = expiry > now;
  const payload = { version: 1, uid: user.uid, email: user.email || '', deviceId,
    isActivated: active, billing: paid ? user.licenseDetails.billing : 'trial',
    issuedAt: now, offlineUntil: Math.min(now + 3 * DAY, Number.isFinite(expiry) ? expiry : now),
    expiresAt: Number.isFinite(expiry) ? new Date(expiry).toISOString() : null,
    trialExpiresAt: user.trialExpiresAt || null, licenseDetails: paid ? user.licenseDetails : null };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { payload: encoded, signature: crypto.sign(null, Buffer.from(encoded), privateKey).toString('base64url') };
}
function validId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value); }
function hasNoProviderOrder(payment) { return payment.order_id == null || payment.order_id === ''; }
// An orderless purchase can only be reconciled after an administrator has
// assigned it with evidence. Never manufacture a Razorpay order ID.
function legacyOrder(audit, paymentId) {
  if (!audit || audit.paymentId !== paymentId || audit.orderId !== null) return null;
  return { id: null, uid: audit.uid, plan: audit.plan, amount: audit.amount, currency: audit.currency, paymentId };
}
// Payments are the trusted ledger. Rebuild from purchase times, never from mutable
// user flags or the time reconciliation runs. Any refund revokes only that grant.
function rebuild(user, payments, now) {
  let expiry = 0, last = null;
  for (const payment of payments.filter(p => p.status === 'captured').sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const purchased = Date.parse(payment.date);
    if (!Number.isFinite(purchased) || !['monthly', 'yearly'].includes(payment.billing)) fail('Invalid payment ledger; contact support', 409);
    expiry = Math.max(expiry, purchased) + (payment.billing === 'yearly' ? 365 : 30) * DAY;
    last = payment;
  }
  const licenseDetails = last ? { billing: last.billing, date: last.date, expiresAt: new Date(expiry).toISOString(), paymentId: last.id } : null;
  return { ...user, billingVersion: 2, isActivated: expiry > now, licenseDetails };
}
function createBilling({ store, gateway, privateKey, now = Date.now }) {
  async function account(identity) {
    return store.transaction(async tx => {
      const old = await tx.get('users', identity.uid);
      const ledger = await tx.paymentsForUser(identity.uid);
      const created = Date.parse(identity.createdAt);
      const started = Number.isFinite(created) ? Math.min(created, now()) : now();
      // Never sign client-writable activation, trial, or version fields.
      const user = rebuild({ uid: identity.uid, email: identity.email || '', createdAt: new Date(started).toISOString(),
        trialExpiresAt: new Date(started + 7 * DAY).toISOString() }, ledger, now());
      // Retain historical details for support, explicitly untrusted and never signed.
      if (old && old.billingVersion !== 2) tx.set('legacy_account_reviews', identity.uid, { uid: identity.uid, status: 'unverified', recordedAt: new Date(now()).toISOString(), legacyLicenseDetails: old.licenseDetails || null, legacyIsActivated: old.isActivated === true });
      tx.set('users', identity.uid, user);
      return user;
    });
  }
  async function entitlement(identity, deviceId) {
    if (!validId(deviceId)) fail('Invalid installation ID');
    return { success: true, entitlement: signEntitlement(await account(identity), deviceId, privateKey, now()) };
  }
  async function createOrder(identity, input) {
    const { plan, currency, deviceId } = input;
    if (!validId(deviceId)) fail('Invalid installation ID');
    const promo = String(input.promo || '').trim().toUpperCase();
    const amount = priceFor(plan, currency, promo);
    await account(identity);
    const order = await gateway.createOrder({ amount, currency, receipt: crypto.randomUUID(), notes: { app: 'MediScribe', plan, billing: plan } });
    if (!/^order_[A-Za-z0-9]+$/.test(order.id) || order.amount !== amount || order.currency !== currency) fail('Invalid gateway order', 502);
    await store.set('orders', order.id, { id: order.id, uid: identity.uid, deviceId, plan, currency, amount, promo, createdAt: now() });
    return { success: true, orderId: order.id, amount, currency, keyId: gateway.keyId };
  }
  async function fulfill(paymentId, identity = null) {
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId || '')) fail('Invalid payment ID');
    const payment = await gateway.getPayment(paymentId);
    if (payment.id !== paymentId) fail('Provider payment ID mismatch', 502);
    const orderless = hasNoProviderOrder(payment);
    if (!orderless && !/^order_[A-Za-z0-9]+$/.test(payment.order_id)) fail('Unknown order');
    const order = orderless
      ? legacyOrder(await store.get('legacy_payment_migrations', paymentId), paymentId)
      : await store.get('orders', payment.order_id);
    if (!order) fail('Historical payment needs verified support migration. Contact support with your payment ID.', 409);
    if (identity && order.uid !== identity.uid) fail('Payment does not belong to this account', 403);
    const refunded = payment.amount_refunded;
    if (payment.amount !== order.amount || payment.currency !== order.currency || !Number.isSafeInteger(refunded) || refunded < 0 || refunded > payment.amount ||
        payment.captured !== true || !['captured', 'refunded'].includes(payment.status) || (payment.status === 'refunded' && refunded === 0)) fail('Payment is not captured for this order', 409);
    if (!Number.isSafeInteger(payment.created_at) || payment.created_at <= 0 || payment.created_at * 1000 > now()) fail('Invalid provider payment timestamp', 409);
    let status;
    await store.transaction(async tx => {
      const previous = await tx.get('payments', paymentId);
      const refund = await tx.get('payment_refunds', paymentId);
      const currentOrder = orderless
        ? legacyOrder(await tx.get('legacy_payment_migrations', paymentId), paymentId)
        : await tx.get('orders', order.id);
      const user = await tx.get('users', order.uid);
      const ledger = await tx.paymentsForUser(order.uid);
      if (!user) fail('Account not found', 409);
      if (orderless && (!previous || previous.source !== 'legacy_provider_import')) fail('Historical payment has not been imported', 409);
      if (currentOrder?.uid !== order.uid || currentOrder?.amount !== order.amount || currentOrder?.currency !== order.currency || currentOrder?.plan !== order.plan) fail('Order changed during reconciliation', 409);
      if (previous && (previous.uid !== order.uid || previous.orderId !== order.id)) fail('Payment has been reassigned', 409);
      if (currentOrder.paymentId && currentOrder.paymentId !== paymentId) fail('Order already fulfilled', 409);
      // Refund state never regresses, even when this provider snapshot preceded a refund.
      const amountRefunded = Math.max(refunded, refund?.amountRefunded || 0, previous?.amountRefunded || (previous?.status === 'refunded' ? previous.amount : 0));
      if (amountRefunded > order.amount) fail('Refund exceeds order amount', 409);
      status = amountRefunded > 0 ? 'refunded' : 'captured';
      const entry = { ...(previous || {}), uid: order.uid, orderId: order.id, amount: order.amount, currency: order.currency, billing: order.plan,
        status, amountRefunded, date: new Date(payment.created_at * 1000).toISOString(),
        recordedAt: previous?.recordedAt || new Date(now()).toISOString(),
        ...(amountRefunded > 0 ? { refundedAt: previous?.refundedAt || refund?.recordedAt || new Date(now()).toISOString() } : {}) };
      tx.set('users', order.uid, rebuild(user, ledger.filter(p => p.id !== paymentId).concat({ ...entry, id: paymentId }), now()));
      tx.set('payments', paymentId, entry);
      if (!orderless) tx.set('orders', order.id, { ...currentOrder, paymentId });
      if (amountRefunded > 0) tx.set('payment_refunds', paymentId, { amountRefunded, recordedAt: refund?.recordedAt || new Date(now()).toISOString() });
    });
    return { success: true, status, fulfilled: status === 'captured' };
  }
  async function revoke(paymentId, amountRefunded = null) {
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId || '')) fail('Invalid payment ID');
    await store.transaction(async tx => {
      const payment = await tx.get('payments', paymentId);
      const refund = await tx.get('payment_refunds', paymentId);
      const user = payment ? await tx.get('users', payment.uid) : null;
      const ledger = payment ? await tx.paymentsForUser(payment.uid) : [];
      const refunded = amountRefunded === null ? payment?.amount : amountRefunded;
      if (!Number.isSafeInteger(refunded) || refunded <= 0 || (payment && refunded > payment.amount)) fail('Invalid refund amount', 409);
      const total = Math.max(refund?.amountRefunded || 0, payment?.amountRefunded || 0, refunded);
      // Retain a tombstone even if the capture has not been recorded yet.
      tx.set('payment_refunds', paymentId, { amountRefunded: total, recordedAt: refund?.recordedAt || new Date(now()).toISOString() });
      if (!payment) return;
      const entry = { ...payment, status: 'refunded', amountRefunded: total, refundedAt: payment.refundedAt || new Date(now()).toISOString() };
      tx.set('payments', paymentId, entry);
      if (user) tx.set('users', payment.uid, rebuild(user, ledger.filter(p => p.id !== paymentId).concat({ ...entry, id: paymentId }), now()));
    });
    return { success: true };
  }
  async function migrateLegacy(administrator, identity, input) {
    if (!administrator?.admin) fail('Administrator access required', 403);
    const { paymentId, plan, reason, evidenceReference } = input;
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId || '') || !['monthly', 'yearly'].includes(plan)) fail('A valid payment ID and documented monthly/yearly plan are required');
    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 1000 || typeof evidenceReference !== 'string' || evidenceReference.trim().length < 5 || evidenceReference.length > 500) fail('Provide an ownership-verification reason and evidence reference');
    const payment = await gateway.getPayment(paymentId);
    if (payment.id !== paymentId) fail('Provider payment ID mismatch', 502);
    const orderless = hasNoProviderOrder(payment);
    let order = null;
    if (orderless) {
      if (payment.status !== 'captured' || payment.captured !== true || payment.amount_refunded !== 0) fail('Historical payment must be captured and unrefunded', 409);
      // Historical prices may differ. Use explicit provider plan metadata, never
      // guess a subscription term from an amount or client-written profile.
      const plans = [payment.notes?.billing, payment.notes?.plan].filter(value => value != null && value !== '');
      if (!plans.length || plans.some(value => value !== plan)) fail('Orderless payment requires matching provider plan metadata', 409);
    } else {
      if (!/^order_[A-Za-z0-9]+$/.test(payment.order_id)) fail('Invalid provider order', 409);
      order = await gateway.getOrder(payment.order_id);
      validatePayment(payment, order);
    }
    const orderId = order?.id || null;
    if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0 || !/^[A-Z]{3}$/.test(payment.currency) || !Number.isSafeInteger(payment.created_at) || payment.created_at <= 0 || payment.created_at * 1000 > now()) fail('Invalid historical provider record', 409);
    await account(identity);
    await store.transaction(async tx => {
      const previous = await tx.get('payments', paymentId);
      const existingOrder = orderId ? await tx.get('orders', orderId) : null;
      const existingAudit = await tx.get('legacy_payment_migrations', paymentId);
      const recordedRefund = await tx.get('payment_refunds', paymentId);
      const user = await tx.get('users', identity.uid);
      const ledger = await tx.paymentsForUser(identity.uid);
      if (recordedRefund?.amountRefunded > 0) fail('Historical payment has been revoked', 409);
      if (existingAudit) {
        if (existingAudit.uid !== identity.uid || existingAudit.plan !== plan || existingAudit.orderId !== orderId) fail('Historical payment was already assigned differently', 409);
        if (!previous || previous.status !== 'captured' || previous.amountRefunded > 0) fail('Historical payment has been revoked', 409);
        if (previous.uid !== identity.uid || previous.orderId !== orderId || previous.billing !== plan || previous.amount !== payment.amount || previous.currency !== payment.currency) fail('Historical payment ledger does not match the import', 409);
        tx.set('users', identity.uid, rebuild(user, ledger, now()));
        return;
      }
      if (previous || existingOrder) fail('Payment or order already belongs to the current billing system; use reconciliation', 409);
      const entry = { uid: identity.uid, orderId, amount: payment.amount, currency: payment.currency, billing: plan, status: 'captured', amountRefunded: 0, date: new Date(payment.created_at * 1000).toISOString(), recordedAt: new Date(now()).toISOString(), source: 'legacy_provider_import' };
      if (orderId) tx.set('orders', orderId, { id: orderId, uid: identity.uid, plan, currency: payment.currency, amount: payment.amount, createdAt: payment.created_at * 1000, paymentId, source: 'legacy_provider_import' });
      tx.set('payments', paymentId, entry);
      tx.set('legacy_payment_migrations', paymentId, { uid: identity.uid, paymentId, orderId, plan, amount: payment.amount, currency: payment.currency, administratorUid: administrator.uid, reason: reason.trim(), evidenceReference: evidenceReference.trim(), importedAt: new Date(now()).toISOString() });
      tx.set('users', identity.uid, rebuild(user, ledger.concat({ ...entry, id: paymentId }), now()));
    });
    return { success: true, uid: identity.uid, paymentId };
  }
  return { account, entitlement, createOrder, fulfill, revoke, migrateLegacy };
}
module.exports = { createBilling, priceFor, validatePayment, signEntitlement, validId, fail, rebuild };
