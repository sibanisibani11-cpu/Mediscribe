'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
const roots = process.argv.slice(2);
if (!roots.length) throw Error('Pass the unpacked application resources directory');
for (const root of roots) {
  const archive = path.join(root, 'app.asar');
  assert.ok(fs.existsSync(archive), 'Missing app.asar');
  assert.ok(!fs.readdirSync(root).some(f => /^\.env|firebase-adminsdk|service-account/.test(f)), 'Private resources in package');
  const files = asar.listPackage(archive);
  assert.ok(!files.some(f => /(^|\/)\.env($|\.)|firebase-adminsdk|service-account|local_simulated_users\.json/.test(f)), 'Private files in archive');
  const main = asar.extractFile(archive,'electron/main.js').toString();
  assert.ok(!/RAZORPAY_KEY_SECRET|FIREBASE_SERVICE_ACCOUNT|webSecurity:\s*false/.test(main), 'Unsafe main process');
  const config = JSON.parse(asar.extractFile(archive,'electron/public-config.json'));
  assert.ok(/^https:\/\//.test(config.backendUrl) && config.entitlementPublicKey, 'Missing production configuration');
  assert.ok(typeof config.googleClientId === 'string' && config.googleClientId.endsWith('.apps.googleusercontent.com'), 'Configure the desktop Google OAuth client before release');
  console.log('Packaged app safety checks passed: ' + root);
}
