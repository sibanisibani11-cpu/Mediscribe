// Audit evidence: passing assertions demonstrate defects, NOT repaired behavior.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {createBilling}=require('../../server/billing');
function billingSetup(){
 const rows=new Map();let sequence=0;const payments=new Map();
 const store={get:async(c,id)=>rows.get(c+'/'+id),set:async(c,id,v)=>rows.set(c+'/'+id,structuredClone(v)),transaction:async fn=>fn(store)};
 const billing=createBilling({store,privateKey:crypto.generateKeyPairSync('ed25519').privateKey,now:()=>Date.parse('2026-09-21'),gateway:{createOrder:async data=>({id:'order_test'+(++sequence),...data}),getPayment:async id=>payments.get(id)}});
 const user={uid:'user12345',email:'test@example.invalid',createdAt:'2026-09-21'};
 const buy=async()=>{const o=await billing.createOrder(user,{plan:'monthly',currency:'USD',deviceId:'device123'});const id='pay_test'+sequence;payments.set(id,{id,order_id:o.orderId,amount:o.amount,currency:o.currency,status:'captured',captured:true,amount_refunded:0});await billing.fulfill(id,user);return id;};
 return {billing,rows,user,buy};
}
test('REPRO: active trial disables both purchase buttons',async()=>{
 const s=billingSetup();const result=await s.billing.entitlement(s.user,'device123');const claim=JSON.parse(Buffer.from(result.entitlement.payload,'base64url'));
 const source=read('src/components/pricing-view.tsx');const tree=ts.createSourceFile('view.tsx',source,99,true,ts.ScriptKind.TSX);let condition;
 function visit(n){if(ts.isJsxAttribute(n)&&n.name.getText(tree)==='disabled'&&n.initializer?.getText(tree).includes('currentPlan === plan.id'))condition=n.initializer.expression.getText(tree);ts.forEachChild(n,visit);}visit(tree);
 for(const id of ['monthly','yearly'])assert.equal(vm.runInNewContext(condition,{backendConfigured:true,isLoading:null,daysRemaining:7,currentPlan:claim.licenseDetails?.billing||null,isActivated:claim.isActivated,plan:{id}}),true);
});
test('REPRO: refund of earlier payment wipes unrelated paid renewal; reconciliation does not restore it',async()=>{
 const s=billingSetup();const first=await s.buy();const second=await s.buy();await s.billing.revoke(first);
 assert.equal(s.rows.get('payments/'+second).status,'captured');assert.equal(s.rows.get('users/'+s.user.uid).isActivated,false);
 await s.billing.fulfill(second,s.user);assert.equal(s.rows.get('users/'+s.user.uid).isActivated,false);
});
test('REPRO: replaying old refund revokes a subsequent new purchase',async()=>{
 const s=billingSetup();const first=await s.buy();await s.billing.revoke(first);await s.buy();assert.equal(s.rows.get('users/'+s.user.uid).isActivated,true);
 await s.billing.revoke(first);assert.equal(s.rows.get('users/'+s.user.uid).isActivated,false);
});
test('REPRO: legacy paid user loses entitlement during first refresh',async()=>{
 const s=billingSetup();s.user.createdAt='2020-01-01';s.rows.set('users/'+s.user.uid,{isActivated:true,licenseDetails:{billing:'yearly',expiresAt:'2027-01-01'}});
 const result=await s.billing.entitlement(s.user,'device123');const claim=JSON.parse(Buffer.from(result.entitlement.payload,'base64url'));
 assert.equal(claim.isActivated,false);assert.equal(claim.licenseDetails,null);
});
test('REPRO: Store snapshot writer and reader disagree on collection and total field',()=>{
 assert.match(read('scripts/sync-msstore-stats.js'),/collection\('analytics_sources'\)/);
 assert.match(read('server/index.js'),/store.get\('app_stats', 'microsoft_store'\)/);
 assert.match(read('server/index.js'),/ms\?\.acquisitions/);
 assert.match(read('scripts/sync-msstore-stats.js'),/return \{ total, storeId/);
});
test('REPRO: native local libraries have no account namespace',()=>{
 const s=read('electron/main.js');for(const name of ['user-dictionary.json','user-keywords.json','user-templates.json'])assert.ok(s.includes("path.join(app.getPath('userData'), '"+name+"')"));
});
test('REPRO: Windows brace escaping re-escapes generated closing brace',()=>{
 const source=read('electron/main.js');const tree=ts.createSourceFile('main.js',source,99,true);let expression;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='sendKeysText')expression=n.initializer.getText(tree);ts.forEachChild(n,visit);}visit(tree);
 assert.notEqual(vm.runInNewContext(expression,{text:'{'}),'{{}');
});
test('REPRO: packaged artifact safety check is not invoked by release workflows',()=>{
 for(const file of fs.readdirSync(path.join(root,'.github/workflows')))assert.ok(!read('.github/workflows/'+file).includes('check-packaged-app'));
});
function nativeFunction(name){const tree=ts.createSourceFile('main.js',read('electron/main.js'),99,true);return tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(tree);}
test('REPRO: dictionary save swallows disk failure',()=>{
 const save=vm.runInNewContext('('+nativeFunction('saveDictionary')+')',{fs:{writeFileSync(){throw Error('disk full');}},dictionaryPath:'/synthetic',userDictionary:['word'],console:{error(){}},spellChecker:null});
 assert.doesNotThrow(save);
});
test('REPRO: sync validation accepts unusable keyword and template records',()=>{
 const module={exports:{}};vm.runInNewContext(read('electron/google-drive-sync.js'),{module,require:name=>name==='./oauth-handler'?{}:require(name)});
 for(const name of ['user-keywords.json','user-templates.json'])assert.doesNotThrow(()=>module.exports.validateData(name,[{id:'broken'}]));
});
test('REPRO: spelling correction accepts changed negation and dose outside flagged word',async()=>{
 const format=vm.runInNewContext('('+nativeFunction('formatTextWithOllama')+')',{ollamaEnabled:true,require,console:{log(){},error(){}},userDictionary:[],keywordLibrary:[],currentOllamaModel:'synthetic',makeOllamaRequest:async()=> 'Patient has fever. Give 50 mg.'});
 assert.equal(await format('Patient has no feever. Give 5 mg.','clean',[{word:'feever',position:15,length:6,suggestions:['fever']}]),'Patient has fever. Give 50 mg.');
});
