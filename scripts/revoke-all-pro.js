/**
 * Revoke Pro access for ALL activated users — except exempt accounts
 * (admin / test IDs).
 *
 * Sets isActivated: false on every users doc where isActivated == true,
 * excluding the exempt email list. Reversible: docs keep licenseDetails,
 * and get revokedAt / revokedBy markers so a restore is possible.
 *
 * Usage:
 *   export FIREBASE_SERVICE_ACCOUNT="/path/to/service-account.json"
 *   node scripts/revoke-all-pro.js --dry-run                      # preview only
 *   node scripts/revoke-all-pro.js                                # apply
 *   node scripts/revoke-all-pro.js --exempt=a@x.com,b@y.com       # override exempt list
 */

const path = require('path');
const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');

// Default exempt accounts: admin + test IDs. Override with --exempt=...
const DEFAULT_EXEMPT = [
    'jeetumdc@gmail.com', // admin
];

const exemptArg = process.argv.find(a => a.startsWith('--exempt='));
const EXEMPT = new Set(
    (exemptArg ? exemptArg.replace('--exempt=', '').split(',') : DEFAULT_EXEMPT)
        .map(e => e.trim().toLowerCase())
        .filter(Boolean)
);

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountPath) {
    console.error('\n❌ ERROR: FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
    console.log('\n1. Firebase Console > Project Settings > Service Accounts.');
    console.log('2. "Generate new private key" and download the JSON file.');
    console.log('3. export FIREBASE_SERVICE_ACCOUNT="/path/to/service-account.json"');
    console.log('4. node scripts/revoke-all-pro.js --dry-run\n');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(require(path.resolve(serviceAccountPath))),
});

const db = admin.firestore();
// REST transport instead of gRPC (works through HTTP proxies / restricted networks)
db.settings({ preferRest: true });

function isExempt(docSnap) {
    const data = docSnap.data();
    const candidates = [docSnap.id, data.email, data.userEmail]
        .filter(Boolean)
        .map(s => String(s).trim().toLowerCase());
    return candidates.some(c => EXEMPT.has(c));
}

async function run() {
    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Exempt accounts: ${[...EXEMPT].join(', ') || '(none!)'}\n`);

    const snapshot = await db.collection('users').where('isActivated', '==', true).get();

    if (snapshot.empty) {
        console.log('No activated users found. Nothing to do.');
        return;
    }
    console.log(`Found ${snapshot.size} activated user doc(s).\n`);

    let revoked = 0, exempted = 0;

    for (const docSnap of snapshot.docs) {
        if (isExempt(docSnap)) {
            exempted++;
            console.log(`  EXEMPT (kept Pro): ${docSnap.id}`);
            continue;
        }

        if (DRY_RUN) {
            console.log(`  WOULD REVOKE: ${docSnap.id}`);
        } else {
            await docSnap.ref.set({
                isActivated: false,
                revokedAt: new Date().toISOString(),
                revokedBy: 'revoke-all-pro-script',
            }, { merge: true });
            console.log(`  REVOKED: ${docSnap.id}`);
        }
        revoked++;
    }

    console.log(`\nDone. ${DRY_RUN ? 'Would revoke' : 'Revoked'}: ${revoked}, exempt: ${exempted}, total scanned: ${snapshot.size}`);
    if (DRY_RUN) console.log('Re-run without --dry-run to apply.');
}

run().then(() => process.exit(0)).catch(err => {
    console.error('Failed:', err);
    process.exit(1);
});
