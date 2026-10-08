'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reconcile } = require('../server/reconciliation');
function setup(records = {}) {
  let state = {}, locked = false;
  const issues = new Map(), calls = [], logs = [];
  const store = {
    async acquire() { if (locked) return null; locked = true; return { ...state }; },
    async page(collection, cursor, limit) { return (records[collection] || []).filter(r => !cursor || r.id > cursor).slice(0, limit); },
    async checkpoint(owner, cursors) { state = { ...cursors }; },
    async finish(owner, result) { state = { ...result }; locked = false; },
    async release() { locked = false; },
    async completeReceipt(id) { records.webhook_events.find(r => r.id === id).status = 'processed'; },
    async recordIssue(id, value) { issues.set(id, { ...value, status: 'open' }); },
    async resolveIssue(id) { if (issues.has(id)) issues.get(id).status = 'resolved'; },
  };
  const billing = { async fulfill(id) { calls.push(['fulfill', id]); }, async revoke(id, amount) { calls.push(['revoke', id, amount]); } };
  return { store, billing, issues, calls, logs, state: () => state, now: () => Date.parse('2026-10-08T12:00:00Z'),
    gatewayRequest: async () => ({ items: [] }), logger: { info: (...x) => logs.push(x), error: (...x) => logs.push(x) } };
}
test('scheduled recovery discovers missed captures, sweeps payments and retries refunds', async () => {
  const s = setup({ orders: [{ id: 'order_one' }], payments: [{ id: 'pay_legacy' }],
    webhook_events: [{ id: 'event_one', type: 'refund.processed', paymentId: 'pay_one', status: 'failed' }] });
  s.gatewayRequest = async route => route.startsWith('orders/')
    ? { items: [{ id: 'pay_one', captured: true, status: 'captured' }] }
    : { id: 'pay_one', amount_refunded: 100 };
  const result = await reconcile(s);
  assert.deepEqual(s.calls, [['fulfill', 'pay_one'], ['fulfill', 'pay_legacy'], ['revoke', 'pay_one', 100]]);
  assert.equal(result.failed, 0); assert.equal(result.recovered, 1);
  assert.ok(s.state().lastCompletedAt);
});
test('durable cursors advance beyond failures and revisit them in subsequent sweeps', async () => {
  const s = setup({ payments: [{ id: 'pay_a' }, { id: 'pay_b' }] });
  let fail = true;
  s.billing.fulfill = async id => { s.calls.push(id); if (id === 'pay_a' && fail) throw Object.assign(Error('private provider detail'), { status: 502 }); };
  await reconcile({ ...s, batchSize: 1 });
  assert.equal(s.state().payments, 'pay_a');assert.equal(s.issues.get('payments_pay_a').errorCode, 502);
  assert.ok(!JSON.stringify([...s.issues]).includes('private'));
  await reconcile({ ...s, batchSize: 1 }); assert.equal(s.state().payments, 'pay_b');
  await reconcile({ ...s, batchSize: 1 }); assert.equal(s.state().payments, null);
  fail = false;await reconcile({ ...s, batchSize: 1 });
  assert.deepEqual(s.calls, ['pay_a', 'pay_b', 'pay_a']);assert.equal(s.issues.get('payments_pay_a').status, 'resolved');
});
test('processed receipts are not replayed; lagging provider refunds remain retryable', async () => {
  const events = [{ id:'a',status:'processed',type:'payment.captured',paymentId:'pay_done' },
    { id:'b',status:'pending',type:'refund.processed',paymentId:'pay_lag' }];
  const s = setup({ webhook_events:events });s.gatewayRequest = async () => ({ id:'pay_lag', amount_refunded:0 });
  const result = await reconcile(s);
  assert.equal(result.failed,1);assert.equal(events[1].status,'pending');assert.deepEqual(s.calls,[]);
});
test('overlapping scheduled invocation does not process a second sweep', async () => {
  const s = setup({ payments:[{id:'pay_a'}] });let unblock;
  const waiting = new Promise(resolve => { unblock = resolve; });
  s.billing.fulfill = async () => waiting;
  const first = reconcile(s);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(await reconcile(s),{skipped:true});
  unblock();await first;
});
test('infrastructure failures release the lease and fail the job without exposing records', async () => {
  const s = setup();s.store.page = async()=>{throw Error('secret detail');};
  await assert.rejects(reconcile(s),/Payment reconciliation failed/);
  assert.ok(await s.store.acquire());assert.ok(!JSON.stringify(s.logs).includes('secret detail'));
});
test('multiple captured payments for one order require review instead of guessing', async () => {
  const s = setup({orders:[{id:'order_one'}]});
  s.gatewayRequest=async()=>({items:[{id:'pay_a',captured:true,status:'captured'},{id:'pay_b',captured:true,status:'captured'}]});
  assert.equal((await reconcile(s)).failed,1);assert.deepEqual(s.calls,[]);
});
