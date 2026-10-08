const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { downloadModel } = require('../electron/model-download');
for (const broken of [true,false]) test(`model download ${broken?'rejects truncated payload':'commits validated payload'}`,async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'model-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const destination=path.join(dir,'model.bin');fs.writeFileSync(destination,'old');
 const bytes=Buffer.alloc(12);bytes.writeUInt32LE(0x67676d6c);
 const run=downloadModel({url:'https://example.invalid/model',destination,minimumSize:8,fetch:async()=>new Response(bytes,{headers:{'content-length':broken?'24':'12'}})});
 if(broken){await assert.rejects(run,/Incomplete/);assert.equal(fs.readFileSync(destination,'utf8'),'old');}
 else{await run;assert.deepEqual(fs.readFileSync(destination),bytes);}
 assert.deepEqual(fs.readdirSync(dir),['model.bin']);
});
