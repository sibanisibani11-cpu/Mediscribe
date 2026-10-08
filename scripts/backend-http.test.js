const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const path = require('node:path');
function setup(provider) {
 const key = crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});
 const rows=new Map();
 const reference=(c,id)=>({get:async()=>({exists:rows.has(c+'/'+id),data:()=>rows.get(c+'/'+id)}),set:async v=>rows.set(c+'/'+id,v), key:c+'/'+id});
 const collection = (c, filters = [], order = null, maximum = Infinity, cursor = null) => {
  const snapshot = async () => {
   let docs = [...rows].filter(([k,v]) => k.startsWith(c + '/') && filters.every(([f,vv]) => v[f] === vv)).map(([k,v]) => ({ id:k.slice(c.length+1), data:()=>v }));
   if (order) docs.sort((a,b) => String(order[0] === '__name__' ? a.id : a.data()[order[0]]).localeCompare(String(order[0] === '__name__' ? b.id : b.data()[order[0]])) * (order[1] === 'desc' ? -1 : 1));
   if (cursor) docs = docs.filter(d => d.id > cursor);
   docs = docs.slice(0, maximum); return {docs,size:docs.length};
  };
  return { doc:id=>reference(c,id), get:snapshot,
   where:(f,op,v)=>collection(c,[...filters,[f,v]],order,maximum,cursor),
   orderBy:(f,d)=>collection(c,filters,[f,d],maximum,cursor),
   limit:n=>collection(c,filters,order,n,cursor), startAfter:id=>collection(c,filters,order,maximum,id),
   count:()=>({get:async()=>({data:()=>({count:[...rows].filter(([k,v])=>k.startsWith(c+'/') && filters.every(([f,vv])=>v[f]===vv)).length})})}) };
 };
 const db={collection,runTransaction:async fn=>fn({get:ref=>ref.get(),set:(ref,v)=>rows.set(ref.key,v)})};
 const admin={apps:[{}],firestore:()=>db,auth:()=>({verifyIdToken:async token=>{if(token==='bad')throw Error();return {uid:'user123',admin:token==='admin'};},getUser:async()=>({email:'test@example.invalid',metadata:{creationTime:'2020-01-01'}})})};
 admin.firestore.FieldPath = {documentId:()=>'__name__'};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server/index.js'),'utf8'),{module,Buffer,URL,AbortSignal,Date,console,
  process:{env:{ENTITLEMENT_PRIVATE_KEY:key,RAZORPAY_KEY_ID:'test',RAZORPAY_KEY_SECRET:'synthetic',RAZORPAY_WEBHOOK_SECRET:'webhook',ALLOWED_ORIGINS:'https://app.example.invalid'}},
  require:name=>name==='firebase-admin/app'?{getApps:()=>admin.apps,initializeApp:()=>{}}:name==='firebase-admin/auth'?{getAuth:admin.auth}:name==='firebase-admin/firestore'?{getFirestore:admin.firestore,FieldPath:admin.firestore.FieldPath}:name==='./billing'?require('../server/billing'):require(name),
  fetch:async url=>{if(provider)return {ok:true,json:async()=>provider(url)};throw Error('No provider network allowed in this test');}});
 const request=async(route,{token,body,rawBody,headers={},method=body===undefined?'GET':'POST'}={})=>{
  const req=Readable.from(rawBody!==undefined||body===undefined?[]:[Buffer.from(JSON.stringify(body))]);Object.assign(req,{url:route,method,rawBody,headers:{...(token?{authorization:'Bearer '+token}:{}),...headers},socket:{remoteAddress:'127.0.0.1'}});
  let data,status=200;const response={setHeader(){},set statusCode(value){status=value;},get statusCode(){return status;},writeHead(value){status=value;},end(value){data=value;}};
  await module.exports(req,response);return {status,data:data?JSON.parse(data):null};
 };
 return {request,rows};
}
test('admin endpoints reject missing, invalid and non-admin identities',async()=>{
 const {request}=setup();
 assert.equal((await request('/v1/admin/subscribers')).status,401);
 assert.equal((await request('/v1/admin/subscribers',{token:'bad'})).status,401);
 assert.equal((await request('/v1/admin/subscribers',{token:'user'})).status,403);
 assert.equal((await request('/v1/admin/subscribers',{token:'admin'})).status,200);
});
test('client-supplied admin email cannot replace a verified role',async()=>{
 const {request}=setup();
 assert.equal((await request('/v1/admin/reconcile',{token:'user',body:{email:'admin@mediapp.store',paymentId:'pay_test'}})).status,403);
});
test('telemetry is anonymous and idempotent across repeated frontend/native requests',async()=>{
 const {request,rows}=setup();const body={installId:'install123',sessionId:'session123',os:'windows',source:'microsoft_store',email:'ignored@example.invalid',isPro:true};
 await request('/v1/telemetry',{body});await request('/v1/telemetry',{body});
 assert.equal(rows.size,2);assert.equal(rows.get('downloads/install123').email,undefined);assert.equal(rows.has('app_stats/microsoft_store'),false);
});
test('webhook rejects invalid signatures before reading payment claims',async()=>{
 const {request}=setup();
 assert.equal((await request('/v1/webhooks/razorpay',{body:{event:'payment.captured'},headers:{'x-razorpay-signature':'00'}})).status,401);
});
test('unapproved origins cannot invoke authenticated APIs',async()=>{
 const {request}=setup();assert.equal((await request('/v1/admin/subscribers',{token:'admin',headers:{origin:'https://untrusted.invalid'}})).status,403);
});

test('Firebase consumed streams preserve exact webhook signature bytes',async()=>{
 const {request}=setup();const rawBody=Buffer.from('{ "event" : "ignored.event" }');
 const signature=crypto.createHmac('sha256','webhook').update(rawBody).digest('hex');
 const result=await request('/v1/webhooks/razorpay',{method:'POST',rawBody,headers:{'x-razorpay-signature':signature}});
 assert.equal(result.status,200);assert.equal(result.data.success,true);
});
test('Firebase pre-parsed JSON reaches API handlers',async()=>{
 const {request,rows}=setup();const rawBody=Buffer.from(JSON.stringify({installId:'install123',sessionId:'session123'}));
 assert.equal((await request('/v1/telemetry',{method:'POST',rawBody})).status,200);assert.equal(rows.size,2);
});
test('Firebase raw bodies retain size limits',async()=>{
 const {request}=setup();assert.equal((await request('/v1/telemetry',{method:'POST',rawBody:Buffer.alloc(65537)})).status,413);
});

test('admin pagination is bounded, ordered, and accepts the frontend query contract',async()=>{
 const {request,rows}=setup();for(let i=0;i<4;i++)rows.set('users/user000'+i,{email:`${i}@example.invalid`});
 const first=await request('/v1/admin/subscribers?limit=2',{token:'admin'});assert.equal(first.status,200);assert.equal(first.data.subscribers.length,2);assert.equal(first.data.pagination.totalUsers,4);assert.equal(first.data.pagination.nextCursor,'user0001');assert.equal(first.data.summary.scope,'page');
 const second=await request('/v1/admin/subscribers?limit=2&cursor=user0001',{token:'admin'});assert.deepEqual(second.data.subscribers.map(s=>s.userId),['user0002','user0003']);assert.equal(second.data.pagination.nextCursor,null);
 assert.equal((await request('/v1/admin/subscribers?limit=1000',{token:'admin'})).status,400);
});
test('authenticated rate limiting is awaited and anonymous telemetry uses no shared ingress bucket',async()=>{
 const {request,rows}=setup();for(let i=0;i<120;i++)assert.equal((await request('/v1/admin/subscribers?limit=1',{token:'admin'})).status,200);
 assert.equal((await request('/v1/admin/subscribers',{token:'admin'})).status,429);
 assert.equal([...rows.keys()].filter(k=>k.startsWith('request_limits/')).length,1);
 assert.equal((await request('/v1/telemetry',{body:{installId:'install123',sessionId:'session123'}})).status,200);
});

test('canonical payment export requires admin and retains every transaction across pages', async () => {
 const {request,rows}=setup();
 for (const id of ['pay_a','pay_b','pay_c']) rows.set('payments/'+id,{uid:'user123',amount:10000,currency:'INR',status:'captured'});
 assert.equal((await request('/v1/admin/payments',{token:'user'})).status,403);
 const first=await request('/v1/admin/payments?limit=2',{token:'admin'});
 assert.deepEqual(first.data.payments.map(p=>p.id),['pay_a','pay_b']);
 const second=await request('/v1/admin/payments?cursor='+first.data.nextCursor,{token:'admin'});
 assert.deepEqual(second.data.payments.map(p=>p.id),['pay_c']);
 assert.equal(second.data.nextCursor,null);
});
test('partial refunds preserve net receipts and original currency in admin history', async () => {
 const {request,rows}=setup();rows.set('users/user123',{});
 rows.set('payments/pay_a',{uid:'user123',amount:10000,amountRefunded:2500,currency:'INR',status:'refunded',date:'2026-01-01'});
 const result=await request('/v1/admin/subscribers',{token:'admin'});
 assert.equal(result.data.summary.totalRevenueINR,75);
 assert.equal(result.data.subscribers[0].totalAmountSubscribed,75);
 assert.equal(result.data.subscribers[0].history[0].amountRefunded,25);
 assert.equal(result.data.subscribers[0].history[0].netAmount,75);
});
test('failed webhook processing leaves a retryable audit record', async () => {
 const {request,rows}=setup();const body={event:'payment.captured',payload:{payment:{entity:{id:'pay_missing'}}}};
 const signature=crypto.createHmac('sha256','webhook').update(JSON.stringify(body)).digest('hex');
 const result=await request('/v1/webhooks/razorpay',{body,headers:{'x-razorpay-signature':signature}});
 assert.equal(result.status,500);
 const receipt=[...rows].find(([key])=>key.startsWith('webhook_events/'))[1];
 assert.equal(receipt.status,'failed');assert.equal(receipt.paymentId,'pay_missing');
});
test('refund webhook retries provider lag and deduplicates processed events', async () => {
 let amount=0,calls=0;
 const {request,rows}=setup(()=>{calls++;return {id:'pay_a',amount_refunded:amount};});
 const body={event:'refund.processed',payload:{refund:{entity:{id:'rfnd_a',payment_id:'pay_a',amount:2500}}}};
 const signature=crypto.createHmac('sha256','webhook').update(JSON.stringify(body)).digest('hex');
 const options={body,headers:{'x-razorpay-signature':signature,'x-razorpay-event-id':'event_a'}};
 assert.equal((await request('/v1/webhooks/razorpay',options)).status,502);
 amount=2500;
 assert.equal((await request('/v1/webhooks/razorpay',options)).status,200);
 assert.equal((await request('/v1/webhooks/razorpay',options)).status,200);
 assert.equal(calls,2);assert.equal(rows.get('payment_refunds/pay_a').amountRefunded,2500);
 const receipt=[...rows].find(([key])=>key.startsWith('webhook_events/'))[1];
 assert.equal(receipt.status,'processed');assert.equal(receipt.eventId,'event_a');assert.ok(receipt.processedAt);
});
