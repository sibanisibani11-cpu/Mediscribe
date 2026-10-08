'use strict';
// Provisioning is explicit: run only after approval for cloud services and secret transfer.
// No secrets are logged. Existing cloud secret versions are preserved.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const root = path.join(__dirname, '..');
async function main() {
  const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
  const project = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (project !== 'studio-1170771809-75956') throw Error('Unexpected project; review the provisioning target.');
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw Error('Missing local payment credentials.');
  const cfg = JSON.parse(fs.readFileSync(path.join(require('node:os').homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  const api = require('/usr/local/lib/node_modules/firebase-tools/lib/api');
  const client = new OAuth2Client(api.clientId(), api.clientSecret());
  client.setCredentials({ refresh_token: cfg.tokens.refresh_token });
  const { token } = await client.getAccessToken();
  async function request(url, method = 'GET', body) {
    const response = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    if (!response.ok) { const error = Error(`Cloud request failed: HTTP ${response.status}`); error.status = response.status; throw error; }
    return data;
  }
  const serviceIds = ['cloudfunctions.googleapis.com', 'run.googleapis.com', 'cloudbuild.googleapis.com',
    'artifactregistry.googleapis.com', 'eventarc.googleapis.com', 'pubsub.googleapis.com', 'secretmanager.googleapis.com'];
  const operation = await request(`https://serviceusage.googleapis.com/v1/projects/${project}/services:batchEnable`, 'POST', { serviceIds });
  console.log('Service enablement requested: ' + operation.name);
  const secretRoot = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets`;
  const values = {
    ENTITLEMENT_PRIVATE_KEY: () => crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }),
    RAZORPAY_KEY_ID: () => env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: () => env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: () => crypto.randomBytes(32).toString('hex'),
  };
  let publicKey;
  for (const [name, generate] of Object.entries(values)) {
    let value;
    try {
      const existing = await request(`${secretRoot}/${name}/versions/latest:access`);
      value = Buffer.from(existing.payload.data, 'base64').toString();
      console.log('Preserved existing secret: ' + name);
    } catch (error) {
      if (error.status !== 404) throw error;
      try { await request(`${secretRoot}?secretId=${name}`, 'POST', { replication: { automatic: {} } }); }
      catch (createError) { if (createError.status !== 409) throw createError; }
      value = generate();
      await request(`${secretRoot}/${name}:addVersion`, 'POST', { payload: { data: Buffer.from(value).toString('base64') } });
      console.log('Configured secret: ' + name);
    }
    if (name === 'ENTITLEMENT_PRIVATE_KEY') {
      const key = crypto.createPublicKey(value);
      if (key.asymmetricKeyType !== 'ed25519') throw Error('Existing signing key is not Ed25519.');
      publicKey = key.export({ format: 'pem', type: 'spki' });
    }
  }
  fs.writeFileSync(path.join(root, 'server', `.env.${project}`),
    `ALLOWED_ORIGINS=https://mediapp.store,https://www.mediapp.store,https://${project}.web.app,https://${project}.firebaseapp.com,https://localhost,http://localhost,http://localhost:9002,capacitor://localhost\n`, { mode: 0o600 });
  let text = fs.readFileSync(path.join(root, '.env'), 'utf8');
  const line = 'ENTITLEMENT_PUBLIC_KEY=' + JSON.stringify(publicKey);
  text = /^ENTITLEMENT_PUBLIC_KEY=.*$/m.test(text) ? text.replace(/^ENTITLEMENT_PUBLIC_KEY=.*$/m, () => line) : text.trimEnd() + '\n' + line + '\n';
  fs.writeFileSync(path.join(root, '.env'), text, { mode: 0o600 });
  console.log('Saved the matching public key and backend origins. Private values remain in Secret Manager.');
}
if (require.main === module) main().catch(error => {
  console.error(error.status ? error.message : 'Backend preparation failed; no secret values were printed.');
  process.exitCode = 1;
});
