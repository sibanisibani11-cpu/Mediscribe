'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const pkg = require('../package.json');
for (const platform of ['mac', 'win', 'linux']) {
  assert.ok(!pkg.build[platform].extraResources.some(item => /\.env|firebase-adminsdk|service-account/.test(item.from)), 'Private resources must not be packaged');
}
for (const file of fs.readdirSync(path.join(__dirname, '../electron')).filter(f => f.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(__dirname, '../electron', file), 'utf8');
  assert.ok(!/RAZORPAY_KEY_SECRET|FIREBASE_SERVICE_ACCOUNT|require\(['"]firebase-admin['"]\)|webSecurity:\s*false/.test(source), 'Unsafe client code: ' + file);
}
const publicConfig = require('../electron/public-config.json');
assert.deepEqual(Object.keys(publicConfig).sort(), ['backendUrl','entitlementPublicKey','googleClientId','googleDesktopClientSecret'].sort());
console.log('Client security checks passed');
