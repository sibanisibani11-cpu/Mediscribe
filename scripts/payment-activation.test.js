const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createBilling, priceFor } = require('../server/billing');
const { verifyEntitlement } = require('../electron/entitlement');
function setup() {
  let now = Date.parse('2026-09-20T12:00:00Z');
  const keys = crypto.generateKeyPairSync('ed25519');
  const rows = new Map();
  const store = { async get(c,id) { return rows.get(c+'/'+id) || null; }, async set(c,id,v) { rows.set(c+'/'+id,structuredClone(v)); }, async paymentsForUser(uid) { return [...rows].filter(([key,value]) => key.startsWith('payments/') && value.uid === uid).map(([key,value]) => ({...value,id:key.slice(9)})); }, async transaction(fn) { return fn(this); } };
  const payment = { id: 'pay_test123', order_id: 'order_test123', status: 'captured', captured: true, amount: 19000, currency: 'USD', amount_refunded: 0, created_at: Math.floor(now / 1000) };
  const gateway = { keyId:'rzp_test', createOrder: async data => ({ id:'order_test123', ...data }), getPayment: async () => payment, getOrder: async () => ({id:payment.order_id,amount:payment.amount,currency:payment.currency}) };
  const billing = createBilling({ store, gateway, privateKey:keys.privateKey, now:() => now });
  const identity = { uid:'user123', email:'test@example.invalid', createdAt:new Date(now).toISOString() };
  return { billing, identity, payment, rows, keys, gateway, store, now, advance: ms => { now+=ms; } };
}
test('canonical prices preserve fractional currency and reject unknown plans/promos', () => {
  assert.equal(priceFor('monthly','USD','WELCOME10'),1710);
  assert.equal(priceFor('yearly','INR','MEDI50'),74500);
  assert.throws(() => priceFor('lifetime','USD'));
  assert.throws(() => priceFor('yearly','USD','FREE'));
});
test('captured payment is durably fulfilled once and signed for the correct installation', async () => {
  const s=setup(); await s.billing.createOrder(s.identity,{plan:'yearly',currency:'USD',deviceId:'device123'});
  await s.billing.fulfill(s.payment.id,s.identity);
  const before=structuredClone(s.rows.get('users/user123'));
  s.advance(86400000);
  await s.billing.fulfill(s.payment.id,s.identity);
  assert.deepEqual(s.rows.get('users/user123'),before);
  const {entitlement}=await s.billing.entitlement(s.identity,'device123');
  const claim=verifyEntitlement(entitlement,s.keys.publicKey,'device123','user123',s.now+86400000);
  assert.equal(claim.billing,'yearly'); assert.equal(claim.isActivated,true);
  assert.equal(verifyEntitlement(entitlement,s.keys.publicKey,'other123','user123',s.now),null);
  assert.equal(verifyEntitlement(entitlement,s.keys.publicKey,'device123','other',s.now),null);
  assert.equal(verifyEntitlement(entitlement,s.keys.publicKey,'device123','user123',s.now+5*86400000),null);
  const forged={...entitlement,payload:Buffer.from(JSON.stringify({...claim,expiresAt:'2099-01-01'})).toString('base64url')};
  assert.equal(verifyEntitlement(forged,s.keys.publicKey,'device123','user123',s.now),null);
});
for (const [label,change] of Object.entries({underpayment:{amount:1},currency:{currency:'INR'},uncaptured:{status:'authorized',captured:false},order:{order_id:'order_other123'}})) {
  test(`rejects ${label} without granting access`,async()=>{
    const s=setup();await s.billing.createOrder(s.identity,{plan:'yearly',currency:'USD',deviceId:'device123'});Object.assign(s.payment,change);
    await assert.rejects(s.billing.fulfill(s.payment.id,s.identity));assert.equal(s.rows.get('users/user123').isActivated,false);
  });
}
test('a payment cannot be claimed by another account',async()=>{
  const s=setup();await s.billing.createOrder(s.identity,{plan:'yearly',currency:'USD',deviceId:'device123'});
  await assert.rejects(s.billing.fulfill(s.payment.id,{uid:'attacker'}),/belong/);
});
test('refund revokes access and replay cannot reactivate it',async()=>{
  const s=setup();await s.billing.createOrder(s.identity,{plan:'yearly',currency:'USD',deviceId:'device123'});
  await s.billing.fulfill(s.payment.id,s.identity);await s.billing.revoke(s.payment.id);
  assert.equal(s.rows.get('users/user123').isActivated,false);
  assert.equal((await s.billing.fulfill(s.payment.id,s.identity)).status,'refunded');
  assert.equal(s.rows.get('users/user123').isActivated,false);
});
test('trial is anchored to provider account creation and cannot be reset on login',async()=>{
  const s=setup();s.identity.createdAt='2020-01-01T00:00:00Z';
  const first=await s.billing.account(s.identity);s.advance(86400000);const second=await s.billing.account(s.identity);
  assert.equal(first.trialExpiresAt,second.trialExpiresAt);
  assert.equal((await s.billing.entitlement(s.identity,'device123')).success,true);
});
test('legacy client-writable activation flags are never signed as paid access', async () => {
  const s = setup(); s.identity.createdAt = '2020-01-01T00:00:00Z';
  s.rows.set('users/user123', { email:s.identity.email, isActivated:true, licenseDetails:{expiresAt:'2099-01-01',billing:'yearly'} });
  const user = await s.billing.account(s.identity);
  assert.equal(user.isActivated,false); assert.equal(user.licenseDetails,null);
});

test('refunding an old payment preserves a later grant and refund replay is idempotent',async()=>{
 const s=setup();await s.billing.createOrder(s.identity,{plan:'yearly',currency:'USD',deviceId:'device123'});await s.billing.fulfill(s.payment.id,s.identity);
 s.advance(86400000);s.rows.set('orders/order_second',{id:'order_second',uid:s.identity.uid,amount:19000,currency:'USD',plan:'yearly'});
 s.payment.id='pay_second';s.payment.order_id='order_second';s.payment.created_at+=86400;await s.billing.fulfill(s.payment.id,s.identity);
 await s.billing.revoke('pay_test123',100);const before=structuredClone(s.rows.get('users/user123'));
 assert.equal(before.isActivated,true);assert.equal(before.licenseDetails.paymentId,'pay_second');assert.equal(before.licenseDetails.expiresAt,new Date(s.now+366*86400000).toISOString());
 s.advance(86400000);await s.billing.revoke('pay_test123',100);assert.deepEqual(s.rows.get('users/user123'),before);
 s.rows.set('users/user123',{...before,isActivated:false,licenseDetails:null});await s.billing.fulfill('pay_second',s.identity);assert.deepEqual(s.rows.get('users/user123'),before);
});

test('legacy payment import requires an administrator, retains evidence, and preserves original purchase date',async()=>{
 const s=setup();s.payment.created_at=Math.floor((s.now-10*86400000)/1000);
 const input={paymentId:s.payment.id,plan:'yearly',reason:'Verified purchaser identity with provider receipt',evidenceReference:'support-case-123'};
 await assert.rejects(s.billing.migrateLegacy({uid:'ordinary'},s.identity,input),/Administrator/);
 await s.billing.migrateLegacy({uid:'admin',admin:true},s.identity,input);
 const user=structuredClone(s.rows.get('users/user123'));
 assert.equal(user.licenseDetails.expiresAt,new Date(s.now+355*86400000).toISOString());
 assert.equal(s.rows.get('legacy_payment_migrations/pay_test123').evidenceReference,input.evidenceReference);
 s.advance(86400000);await s.billing.migrateLegacy({uid:'admin',admin:true},s.identity,input);assert.deepEqual(s.rows.get('users/user123'),user);
 await assert.rejects(s.billing.migrateLegacy({uid:'admin',admin:true},{...s.identity,uid:'other'},input),/assigned differently/);
});

test('forged version-2 billing and trial flags cannot mint access without trusted ledger',async()=>{
 const s=setup();s.identity.createdAt='2020-01-01';
 s.rows.set('users/user123',{billingVersion:2,isActivated:true,trialExpiresAt:'2099-01-01',licenseDetails:{billing:'yearly',expiresAt:'2099-01-01'}});
 const {entitlement}=await s.billing.entitlement(s.identity,'device123');
 const claim=JSON.parse(Buffer.from(entitlement.payload,'base64url'));
 assert.equal(claim.isActivated,false);assert.equal(claim.licenseDetails,null);
});
test('refund before capture persists and wins over a stale captured snapshot',async()=>{
 const s=setup();await s.billing.createOrder(s.identity,{plan:'yearly',currency:'USD',deviceId:'device123'});
 await s.billing.revoke(s.payment.id,s.payment.amount);
 assert.equal(s.rows.get('payment_refunds/'+s.payment.id).amountRefunded,s.payment.amount);
 await s.billing.fulfill(s.payment.id,s.identity);
 assert.equal(s.rows.get('payments/'+s.payment.id).status,'refunded');
 assert.equal(s.rows.get('users/user123').isActivated,false);
});
test('reconciliation repairs a missed partial refund and keeps original purchase time',async()=>{
 const s=setup();await s.billing.createOrder(s.identity,{plan:'yearly',currency:'USD',deviceId:'device123'});
 s.advance(10*86400000);await s.billing.fulfill(s.payment.id,s.identity);
 assert.equal(s.rows.get('payments/'+s.payment.id).date,new Date(s.now).toISOString());
 assert.equal(s.rows.get('users/user123').licenseDetails.expiresAt,new Date(s.now+365*86400000).toISOString());
 s.payment.amount_refunded=100;await s.billing.fulfill(s.payment.id,s.identity);
 assert.equal(s.rows.get('payments/'+s.payment.id).amountRefunded,100);
 assert.equal(s.rows.get('users/user123').isActivated,false);
 s.payment.amount_refunded=0;await s.billing.fulfill(s.payment.id,s.identity);
 assert.equal(s.rows.get('payments/'+s.payment.id).amountRefunded,100);
});
test('legacy import cannot resurrect a previously recorded refund',async()=>{
 const s=setup();await s.billing.revoke(s.payment.id,100);
 await assert.rejects(s.billing.migrateLegacy({uid:'admin',admin:true},s.identity,{paymentId:s.payment.id,plan:'yearly',reason:'Verified provider receipt and account identity',evidenceReference:'case-123'}),/revoked/);
});

function orderlessSetup() {
 const s=setup();s.payment.order_id=null;s.payment.notes={billing:'yearly'};
 s.payment.created_at=Math.floor(Date.parse('2026-04-27T12:00:00Z')/1000);
 s.gateway.getOrder=async()=>{throw Error('Orderless import must not fetch an order');};
 return {...s,admin:{uid:'admin',admin:true},input:{paymentId:s.payment.id,plan:'yearly',reason:'Verified purchaser identity and original provider receipt',evidenceReference:'support-case-456'}};
}
test('orderless legacy import requires admin evidence, records a null order and preserves purchase time',async()=>{
 const s=orderlessSetup();
 await assert.rejects(s.billing.migrateLegacy({uid:'customer'},s.identity,s.input),/Administrator/);
 await assert.rejects(s.billing.migrateLegacy(s.admin,s.identity,{...s.input,evidenceReference:''}),/evidence/);
 await assert.rejects(s.billing.fulfill(s.payment.id,s.identity),/migration/);
 assert.equal(s.rows.size,0);
 await s.billing.migrateLegacy(s.admin,s.identity,s.input);
 const entry=structuredClone(s.rows.get('payments/'+s.payment.id));
 const audit=structuredClone(s.rows.get('legacy_payment_migrations/'+s.payment.id));
 assert.equal(entry.orderId,null);assert.equal(entry.date,'2026-04-27T12:00:00.000Z');
 assert.equal(entry.amountRefunded,0);assert.equal(audit.administratorUid,'admin');
 assert.equal(audit.evidenceReference,s.input.evidenceReference);
 assert.equal([...s.rows.keys()].some(key=>key.startsWith('orders/')),false);
 assert.equal(s.rows.get('users/user123').licenseDetails.expiresAt,'2027-04-27T12:00:00.000Z');
 s.advance(86400000);await s.billing.migrateLegacy(s.admin,s.identity,s.input);
 assert.deepEqual(s.rows.get('payments/'+s.payment.id),entry);
 assert.deepEqual(s.rows.get('legacy_payment_migrations/'+s.payment.id),audit);
 await assert.rejects(s.billing.migrateLegacy(s.admin,{...s.identity,uid:'other'},s.input),/assigned differently/);
});
for(const [label,change] of Object.entries({
 'missing plan':{notes:{}},'conflicting plan':{notes:{billing:'yearly',plan:'monthly'}},
 'wrong plan':{notes:{billing:'monthly'}},'refunded':{amount_refunded:100},
 'uncaptured':{status:'authorized',captured:false},'invalid order':{order_id:'bad'},
 'invalid amount':{amount:0},'future timestamp':{created_at:9999999999},
})) test('orderless import rejects '+label,async()=>{
 const s=orderlessSetup();Object.assign(s.payment,change);
 await assert.rejects(s.billing.migrateLegacy(s.admin,s.identity,s.input));
 assert.equal(s.rows.size,0);
});
test('orderless reconciliation repairs missed refunds without granting cross-account access',async()=>{
 const s=orderlessSetup();await s.billing.migrateLegacy(s.admin,s.identity,s.input);
 await assert.rejects(s.billing.fulfill(s.payment.id,{uid:'other'}),/belong/);
 await s.billing.fulfill(s.payment.id,s.identity);
 assert.equal(s.rows.get('users/user123').isActivated,true);
 s.payment.amount_refunded=100;await s.billing.fulfill(s.payment.id);
 assert.equal(s.rows.get('payments/'+s.payment.id).amountRefunded,100);
 assert.equal(s.rows.get('users/user123').isActivated,false);
 s.payment.amount_refunded=0;await s.billing.fulfill(s.payment.id,s.identity);
 assert.equal(s.rows.get('payments/'+s.payment.id).amountRefunded,100);
 await assert.rejects(s.billing.migrateLegacy(s.admin,s.identity,s.input),/revoked/);
 s.payment.amount_refunded=s.payment.amount;s.payment.status='refunded';await s.billing.fulfill(s.payment.id);
 assert.equal(s.rows.get('payments/'+s.payment.id).amountRefunded,s.payment.amount);
});
test('orderless import rejects a refund recorded before migration',async()=>{
 const s=orderlessSetup();await s.billing.revoke(s.payment.id,100);
 await assert.rejects(s.billing.migrateLegacy(s.admin,s.identity,s.input),/revoked/);
 assert.equal(s.rows.has('payments/'+s.payment.id),false);
});
test('orderless reconciliation requires both the protected migration and its payment ledger',async()=>{
 const s=orderlessSetup();await s.billing.migrateLegacy(s.admin,s.identity,s.input);
 const audit=s.rows.get('legacy_payment_migrations/'+s.payment.id);
 s.rows.delete('legacy_payment_migrations/'+s.payment.id);
 await assert.rejects(s.billing.fulfill(s.payment.id),/migration/);
 s.rows.set('legacy_payment_migrations/'+s.payment.id,audit);s.rows.delete('payments/'+s.payment.id);
 await assert.rejects(s.billing.fulfill(s.payment.id),/not been imported/);
});
test('orderless reconciliation detects assignment changes during provider verification',async()=>{
 const s=orderlessSetup();await s.billing.migrateLegacy(s.admin,s.identity,s.input);
 const original=s.store.transaction.bind(s.store);s.store.transaction=async fn=>{
   s.rows.get('legacy_payment_migrations/'+s.payment.id).uid='other';return original(fn);
 };
 await assert.rejects(s.billing.fulfill(s.payment.id,s.identity),/changed/);
 assert.equal(s.rows.get('payments/'+s.payment.id).uid,s.identity.uid);
});
