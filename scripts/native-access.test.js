const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../electron/main.js'),'utf8');
test('native paid operations reject revoked access while account recovery stays available',()=>{
 const handlers=new Map();let active=false,calls=0;
 const context={ipcMain:{},originalHandle:(name,handler)=>handlers.set(name,handler),trustedSender:()=>true,readVerifiedEntitlement:()=>({isActivated:active})};
 vm.runInNewContext(source.slice(source.indexOf('ipcMain.handle ='),source.indexOf('ipcMain.on =')),context);
 for(const name of ['transcribe-audio','format-with-ollama','type-text','start-template-listener','start-keyword-listener']) {
  context.ipcMain.handle(name,()=>++calls);assert.throws(()=>handlers.get(name)({}),/Active verified access/);
  active=true;handlers.get(name)({});active=false;
 }
 assert.equal(calls,5);
 context.ipcMain.handle('save-subscription-cache',()=>true);assert.equal(handlers.get('save-subscription-cache')({}),true);
});
test('native typing refuses stale access before injecting text',async()=>{
 const start=source.indexOf('async function typeText('),end=source.indexOf('    console.log',start);
 const context={readVerifiedEntitlement:()=>null};
 vm.runInNewContext(source.slice(start,end)+'}',context);
 const result=await context.typeText('patient text');assert.equal(result.success,false);assert.match(result.error,/Active verified access/);
});
