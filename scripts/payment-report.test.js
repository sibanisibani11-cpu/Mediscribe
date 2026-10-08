const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fetchPayments,paymentCSV}=require('./list-subscribers');
test('payment export follows all pages without merging payments for the same user',async()=>{
 let calls=0;
 const rows=await fetchPayments('https://example.invalid','synthetic',async url=>{
  calls++;if(calls===2)assert.equal(url.searchParams.get('cursor'),'pay_a');
  return {ok:true,json:async()=>({success:true,payments:[{id:calls===1?'pay_a':'pay_b',uid:'same'}],nextCursor:calls===1?'pay_a':null})};
 });
 assert.equal(rows.length,2);assert.equal(calls,2);
});
test('payment CSV retains partial refund values and neutralizes spreadsheet formulas',()=>{
 const csv=paymentCSV([{id:'pay_a',uid:'=FORMULA()',amount:10000,amountRefunded:2500,status:'refunded'}]);
 assert.ok(csv.includes('"10000","2500","7500"'));assert.ok(csv.includes('"\'=FORMULA()"'));
});
test('payment export rejects repeating cursors',async()=>{
 await assert.rejects(fetchPayments('https://example.invalid','synthetic',async()=>({ok:true,json:async()=>({success:true,payments:[],nextCursor:'pay_a'})})),/Repeated pagination/);
});
