'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
require('dotenv').config({ quiet: true });
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const entitlementPublicKey = (process.env.ENTITLEMENT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
let googleClientId = process.env.GOOGLE_DESKTOP_CLIENT_ID || '';
let googleDesktopClientSecret = process.env.GOOGLE_DESKTOP_CLIENT_SECRET || '';
if (process.env.GOOGLE_DESKTOP_CLIENT_FILE) {
  const installed = JSON.parse(fs.readFileSync(process.env.GOOGLE_DESKTOP_CLIENT_FILE, 'utf8')).installed;
  if (!installed?.client_id || !installed?.client_secret) throw new Error('Use a downloaded Google Desktop app client JSON (installed), not a web client');
  googleClientId = installed.client_id;
  googleDesktopClientSecret = installed.client_secret;
}
if (!/^https:\/\//.test(backendUrl)) throw new Error('Set NEXT_PUBLIC_BACKEND_URL to the deployed MediScribe Firebase function URL');
if (crypto.createPublicKey(entitlementPublicKey).asymmetricKeyType !== 'ed25519') throw new Error('An Ed25519 entitlement public key is required');
if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY || !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) throw new Error('Firebase public configuration is required');
if (process.env.TARGET_PLATFORM !== 'none' && (!googleClientId.endsWith('.apps.googleusercontent.com') || !googleDesktopClientSecret)) throw new Error('Configure GOOGLE_DESKTOP_CLIENT_FILE or the desktop client ID/secret before a native build');
fs.writeFileSync('electron/public-config.json', JSON.stringify({ backendUrl, entitlementPublicKey,
  googleClientId,
  // An installed-application OAuth client has public credentials. Never use a web/server client here.
  googleDesktopClientSecret }, null, 2) + '\n');
console.log('Public app configuration written. No merchant or service-account secrets included.');
