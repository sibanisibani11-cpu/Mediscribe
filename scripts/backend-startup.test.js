'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('backend starts with the installed Firebase Admin SDK and serves health without network', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    process.env.ENTITLEMENT_PRIVATE_KEY = require('node:crypto').generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});
    process.env.RAZORPAY_KEY_ID = 'synthetic';
    process.env.RAZORPAY_KEY_SECRET = 'synthetic';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'synthetic';
    process.env.GCLOUD_PROJECT = 'synthetic-test-project';
    const handler = require('./server/index');
    handler({method:'GET',url:'/health',headers:{}}, {
      setHeader(){}, end(body){assert.deepEqual(JSON.parse(body),{ok:true});}
    }).catch(error=>{console.error(error);process.exitCode=1;});
  `], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
