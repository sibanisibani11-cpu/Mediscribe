'use strict';
const crypto = require('node:crypto');

// Bounded sweeps revisit every known order/payment and retry failed receipts.
// No provider-side charges, captures, refunds, or ownership assignments occur.
async function reconcile({ store, billing, gatewayRequest, now = Date.now, logger = console, batchSize = 10 }) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10) throw Error('Invalid reconciliation batch size');
  const owner = crypto.randomUUID();
  const state = await store.acquire(owner, now(), 10 * 60 * 1000);
  if (!state) return { skipped: true };
  const counts = { checked: 0, failed: 0, recovered: 0 };
  try {
    for (const collection of ['orders', 'payments', 'webhook_events']) {
      const page = await store.page(collection, state[collection] || null, batchSize);
      for (const record of page) {
        if (collection === 'webhook_events' && record.status === 'processed') continue;
        counts.checked++;
        const issueId = collection + '_' + record.id;
        try {
          if (collection === 'orders') {
            if (!/^order_[A-Za-z0-9]+$/.test(record.id)) throw Object.assign(Error(), { status: 409 });
            if (record.paymentId) {
              await billing.fulfill(record.paymentId);
            } else {
              const page = await gatewayRequest('orders/' + record.id + '/payments');
              if (!Array.isArray(page.items)) throw Object.assign(Error(), { status: 502 });
              const paid = page.items.filter(payment => payment.captured === true && ['captured', 'refunded'].includes(payment.status));
              if (paid.length > 1) throw Object.assign(Error(), { status: 409 });
              if (paid.length) await billing.fulfill(paid[0].id);
            }
          } else if (collection === 'payments') {
            await billing.fulfill(record.id);
          } else {
            if (!/^pay_[A-Za-z0-9]+$/.test(record.paymentId || '')) throw Object.assign(Error(), { status: 409 });
            if (record.type === 'payment.captured') await billing.fulfill(record.paymentId);
            else if (record.type === 'refund.processed') {
              const payment = await gatewayRequest('payments/' + record.paymentId);
              if (payment.id !== record.paymentId || !(payment.amount_refunded > 0)) throw Object.assign(Error(), { status: 502 });
              await billing.revoke(record.paymentId, payment.amount_refunded);
            } else throw Object.assign(Error(), { status: 409 });
            await store.completeReceipt(record.id, now());
            counts.recovered++;
          }
          await store.resolveIssue(issueId, now());
        } catch (error) {
          counts.failed++;
          await store.recordIssue(issueId, { collection, recordId: record.id, errorCode: error.status || 500, lastAttemptAt: new Date(now()).toISOString() });
        }
      }
      // Advance past isolated failures; durable issues and repeated full sweeps
      // ensure one poison record cannot block recovery of subsequent payments.
      state[collection] = page.length === batchSize ? page.at(-1).id : null;
      await store.checkpoint(owner, state, now());
    }
    await store.finish(owner, { ...state, lastCompletedAt: new Date(now()).toISOString(), ...counts });
    logger[counts.failed ? 'error' : 'info']('mediscribe_payment_reconciliation', counts);
    return counts;
  } catch {
    await store.release(owner);
    logger.error('mediscribe_payment_reconciliation_failed');
    throw Error('Payment reconciliation failed; inspect protected operations records');
  }
}

function firestoreStore(db, FieldPath) {
  const ref = db.collection('operations').doc('payment_reconciliation');
  return {
    acquire: (owner, time, duration) => db.runTransaction(async tx => {
      const old = (await tx.get(ref)).data() || {};
      if (old.leaseUntil > time) return null;
      tx.set(ref, { ...old, owner, leaseUntil: time + duration, lastStartedAt: new Date(time).toISOString() });
      return { orders: old.orders || null, payments: old.payments || null, webhook_events: old.webhook_events || null };
    }),
    async page(collection, cursor, limit) {
      let q = db.collection(collection).orderBy(FieldPath.documentId()).limit(limit);
      if (cursor) q = q.startAfter(cursor);
      return (await q.get()).docs.map(d => ({ ...d.data(), id: d.id }));
    },
    checkpoint: (owner, cursors, time) => db.runTransaction(async tx => {
      const old = (await tx.get(ref)).data();
      if (old?.owner !== owner || old.leaseUntil <= time) throw Error('Reconciliation lease lost');
      tx.set(ref, { ...old, ...cursors });
    }),
    finish: (owner, result) => db.runTransaction(async tx => {
      const old = (await tx.get(ref)).data();
      if (old?.owner !== owner) throw Error('Reconciliation lease lost');
      tx.set(ref, { ...old, ...result, leaseUntil: 0, owner: null });
    }),
    release: owner => db.runTransaction(async tx => {
      const old = (await tx.get(ref)).data();
      if (old?.owner === owner) tx.set(ref, { ...old, leaseUntil: 0, owner: null });
    }),
    completeReceipt: (id, time) => db.runTransaction(async tx => {
      const r = db.collection('webhook_events').doc(id), old = (await tx.get(r)).data();
      if (old && old.status !== 'processed') tx.set(r, { ...old, status: 'processed', processedAt: new Date(time).toISOString(), recoveredBy: 'scheduled_reconciliation' });
    }),
    recordIssue: (id, data) => db.collection('reconciliation_issues').doc(id).set({ ...data, status: 'open' }),
    resolveIssue: (id, time) => db.runTransaction(async tx => {
      const r = db.collection('reconciliation_issues').doc(id), old = (await tx.get(r)).data();
      if (old?.status === 'open') tx.set(r, { ...old, status: 'resolved', resolvedAt: new Date(time).toISOString() });
    }),
  };
}
module.exports = { reconcile, firestoreStore };
