'use strict';

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const fs = require('fs');

const envPath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
let serviceAccountPath = envPath ? path.resolve(envPath) : null;

if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) {
  const rootFiles = fs.readdirSync(path.join(__dirname, '..'));
  const found = rootFiles.find(f => /firebase-adminsdk.*\.json$/.test(f) || /service-account.*\.json$/.test(f));
  if (found) serviceAccountPath = path.join(__dirname, '..', found);
}

try {
  if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) {
    throw new Error('Service account key file not found. Set FIREBASE_SERVICE_ACCOUNT or place key in root.');
  }
  const sa = require(serviceAccountPath);
  const app = initializeApp({ credential: cert(sa) });
  const auth = getAuth(app);

  async function main() {
    const email = process.argv[2] || 'jeetumdc@gmail.com';
    const remove = process.argv.includes('--remove');

    console.log(`Looking up user: ${email}...`);
    const user = await auth.getUserByEmail(email);
    console.log(`Found UID: ${user.uid}`);
    console.log(`Current claims:`, user.customClaims);

    if (remove) {
      await auth.setCustomUserClaims(user.uid, null);
      console.log(`✅ Removed admin claims from ${email}`);
    } else {
      await auth.setCustomUserClaims(user.uid, { admin: true });
      console.log(`✅ Granted { admin: true } to ${email}`);
    }

    const updated = await auth.getUser(user.uid);
    console.log(`Updated claims:`, updated.customClaims);
  }

  main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
} catch (e) {
  console.error('Could not load Firebase service account:', e.message);
  process.exit(1);
}
