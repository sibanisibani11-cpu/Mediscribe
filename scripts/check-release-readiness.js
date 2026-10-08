'use strict';
// Configuration preflight only; successful output is not an installed-app attestation.
const fs = require('node:fs');
const crypto = require('node:crypto');
require('dotenv').config({ quiet: true });
const { target, asset } = require('./native-assets');
const errors = [];
function check(name, fn) { try { if (!fn()) throw Error(); console.log('OK: ' + name); } catch { errors.push(name); console.error('MISSING OR INVALID: ' + name); } }
check('production backend URL', () => new URL(process.env.NEXT_PUBLIC_BACKEND_URL).protocol === 'https:');
check('Ed25519 entitlement public key', () => crypto.createPublicKey((process.env.ENTITLEMENT_PUBLIC_KEY || '').replace(/\\n/g, '\n')).asymmetricKeyType === 'ed25519');
for (const key of ['NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN']) check(key, () => !!process.env[key]);
const t = target();
if (t) {
  check('desktop Google OAuth configuration', () => {
    if (process.env.GOOGLE_DESKTOP_CLIENT_FILE) {
      const client = JSON.parse(fs.readFileSync(process.env.GOOGLE_DESKTOP_CLIENT_FILE)).installed;
      return client?.client_id?.endsWith('.apps.googleusercontent.com') && !!client.client_secret;
    }
    return process.env.GOOGLE_DESKTOP_CLIENT_ID?.endsWith('.apps.googleusercontent.com') && !!process.env.GOOGLE_DESKTOP_CLIENT_SECRET;
  });
  for (const [name, id] of [['ffmpeg_source','all'],['ollama',t.id],[t.platform==='win32'?'whisper':'whisper_source',t.platform==='win32'?t.id:'all'],['ggml-base.en','all'],['ggml-tiny','all'],...(t.platform==='win32'?[['vcredist',t.id]]:[])]) {
    check('reviewed native pin ' + name + '/' + id, () => { const pin = asset(name,id);return new URL(pin.url).protocol === 'https:'; });
  }
  if (t.platform === 'darwin') {
    check('macOS signing certificate configuration', () => !!process.env.CSC_LINK && !!process.env.CSC_KEY_PASSWORD);
    check('Apple notarization configuration', () => !!process.env.APPLE_ID && !!process.env.APPLE_ID_PASSWORD && !!process.env.APPLE_TEAM_ID);
  }
  if (t.platform === 'win32') check('Windows signing certificate configuration', () => !!process.env.WIN_CSC_LINK && !!process.env.WIN_CSC_KEY_PASSWORD);
}
console.log(errors.length ? `${errors.length} configuration requirement(s) pending. Release is blocked.` : 'Configuration preflight passed. Build, signature verification, provider tests, and installed-app smoke tests are still required.');
process.exitCode = errors.length ? 1 : 0;
