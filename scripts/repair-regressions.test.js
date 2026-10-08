'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../electron/library-store');
const { correctionChoices, applySpellingCorrections, escapeSendKeys } = require('../electron/text-safety');
const name = 'user-keywords.json';
const keyword = {id:'one',keyword:'example',description:'original'};
function temporary(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mediscribe-repair-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir; }
test('model output cannot rewrite numbers or negation outside an allowed spelling',()=>{
 const text='No feever. Give 5 mg on the left.';
 const choices=correctionChoices(text,[null,{word:'feever',position:3,length:6,suggestions:['fever','50','right']}]);
 assert.equal(choices.length,1);
 assert.equal(applySpellingCorrections(text,choices,'Patient has fever. Give 50 mg.'),text);
 assert.equal(applySpellingCorrections(text,choices,JSON.stringify({corrections:[{index:0,replacement:'fever'}]})),'No fever. Give 5 mg on the left.');
 for(const corrections of [[null],[{index:0,replacement:'right'}],[{index:0,replacement:'fever'},{index:0,replacement:'fever'}]]) assert.equal(applySpellingCorrections(text,choices,JSON.stringify({corrections})),text);
});
test('spelling candidates cannot target protected words or partial Unicode words',()=>{
 for(const [text,word,position] of [['no','no',0],['éfeever','feever',1],['feever中','feever',0]]) assert.equal(correctionChoices(text,[{word,position,length:word.length,suggestions:['fever']}]).length,0);
});
test('SendKeys escapes each literal once and preserves Unicode',()=>{
 assert.equal(escapeSendKeys('{a}+^%~()[]\r\nβ'), '{{}a{}}{+}{^}{%}{~}{(}{)}{[}{]}{ENTER}β');
});
test('account libraries remain isolated across A to B to A and signed out edits fail',t=>{
 const lib=new L.AccountLibraries(temporary(t));lib.select('account-A');lib.save(name,[keyword]);
 lib.select('account-B');assert.deepEqual(lib.get(name),[]);lib.save(name,[{...keyword,description:'B'}]);
 lib.select('account-A');assert.deepEqual(lib.get(name),[keyword]);lib.select(null);assert.throws(()=>lib.save(name,[]),/Sign in/);
});
test('failed account library writes and malformed startup files preserve previous data',t=>{
 const lib=new L.AccountLibraries(temporary(t));lib.select('A');lib.save(name,[keyword]);const file=lib.file(name), before=fs.readFileSync(file,'utf8');
 lib.io={...fs,renameSync(){throw Error('disk full');}};assert.throws(()=>lib.save(name,[]),/disk full/);assert.equal(fs.readFileSync(file,'utf8'),before);
 lib.io=fs;fs.writeFileSync(file,'{broken');assert.throws(()=>lib.save(name,[]),/preserved/);assert.equal(fs.readFileSync(file,'utf8'),'{broken');
});
test('legacy import is explicit, preserves source, and cannot be claimed by a second account',t=>{
 const root=temporary(t),file=path.join(root,name);fs.writeFileSync(file,JSON.stringify([keyword]));const lib=new L.AccountLibraries(root);lib.select('A');assert.deepEqual(lib.get(name),[]);
 lib.importLegacy(()=>{throw Error('No templates in fixture');});assert.deepEqual(lib.get(name),[keyword]);assert.equal(fs.existsSync(file),true);
 lib.select('B');assert.equal(lib.legacyStatus().ownedByAnotherAccount,true);assert.throws(()=>lib.importLegacy(()=>[]),/No unclaimed/);
});
test('deletions survive stale devices and newer edits supersede known ancestors',()=>{
 const base=L.documentFrom(name,[keyword]);const deleted=L.updatedDocument(name,base,[]);
 assert.deepEqual(L.values(L.mergeDocuments(name,deleted,base)),[]);
 const edited=L.updatedDocument(name,base,[{...keyword,description:'new'}]);assert.equal(L.values(L.mergeDocuments(name,base,edited))[0].description,'new');
 assert.throws(()=>L.mergeDocuments(name,deleted,edited),/conflict/);
});
test('incomplete cloud records and duplicate IDs are rejected',()=>{
 assert.throws(()=>L.documentFrom(name,[{id:'broken'}]));
 assert.throws(()=>L.documentFrom('user-templates.json',[{id:'broken'}]));
 assert.throws(()=>L.documentFrom(name,[keyword,keyword]));
});
test('account switch while Drive read is pending prevents a local commit',async t=>{
 const file=path.join(temporary(t),'user-dictionary.json');fs.writeFileSync(file,'["local"]');
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../electron/google-drive-sync.js'),'utf8'),{module,Buffer,console,require:n=>n==='./oauth-handler'?{}:n==='./library-store'?L:require(n)});
 let current=true;const sync=module.exports.createSession(()=>{if(!current)throw Error('Account changed');});sync.initialize=async()=>true;sync.findFile=async()=>({id:'remote'});
 sync.drive={files:{get:async()=>{current=false;return {data:['remote']};}}};
 await assert.rejects(sync.sync('user-dictionary.json',file,'pull'),/Account changed/);assert.equal(fs.readFileSync(file,'utf8'),'["local"]');
});

test('CSV quotes embedded punctuation and neutralizes spreadsheet formulas',()=>{
 const ts=require('typescript'), module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/subscriber-csv.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:module.exports});
 assert.equal(module.exports.csvCell('a"b\nc'),'"a""b\nc"');assert.equal(module.exports.csvCell(' =SUM(A1)'),'"\' =SUM(A1)"');
 const result=module.exports.subscriberCSV([{userId:'one',currency:'USD',currentAmount:19,totalAmountSubscribed:19,history:[],historyTruncated:true}]);
 assert.match(result,/"Currency","Latest Captured Amount"/);assert.match(result,/"USD","19","19","No"/);
});
test('native target validation rejects unsupported Windows ARM packages',()=>{
 const {target}=require('./native-assets');assert.throws(()=>target({TARGET_PLATFORM:'win32',TARGET_ARCH:'arm64'}),/Unsupported/);assert.equal(target({TARGET_PLATFORM:'darwin',TARGET_ARCH:'arm64'}).id,'darwin-arm64');
});
test('native asset checksum failure preserves a previous binary and removes partial data',async t=>{
 const file=path.join(temporary(t),'binary');fs.writeFileSync(file,'existing');
 const {downloadVerified}=require('./native-assets');
 await assert.rejects(downloadVerified({url:'https://example.invalid/binary',sha256:'a'.repeat(64)},file,async()=>new Response('corrupt')),/SHA-256/);
 assert.equal(fs.readFileSync(file,'utf8'),'existing');assert.deepEqual(fs.readdirSync(path.dirname(file)),['binary']);
});
