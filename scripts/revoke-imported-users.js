/**
 * Revoke the free Pro access that scripts/import-users.js granted.
 *
 * import-users.js wrote isActivated: true for every user imported from the
 * website list (docs keyed by email, marked with an `importedAt` field).
 * This script sets isActivated: false on those docs — EXCEPT users who have
 * since actually paid (their licenseDetails contains a payment_id, or was
 * migrated from a paid local license).
 *
 * Usage:
 *   export FIREBASE_SERVICE_ACCOUNT="/path/to/your-service-account.json"
 *   node scripts/revoke-imported-users.js --dry-run   # preview only
 *   node scripts/revoke-imported-users.js             # apply changes
 */

const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const admin = require('firebase-admin');
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountPath) {
    console.error('\n❌ ERROR: FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
    console.log('\n1. Firebase Console > Project Settings > Service Accounts.');
    console.log('2. "Generate new private key" and download the JSON file.');
    console.log('3. export FIREBASE_SERVICE_ACCOUNT="/path/to/your-service-account.json"');
    console.log('4. node scripts/revoke-imported-users.js --dry-run\n');
    process.exit(1);
}

const serviceAccount = require(path.resolve(serviceAccountPath));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function revokeImportedUsers() {
    // Docs written by import-users.js all carry the importedAt marker
    const snapshot = await db.collection('users')
        .where('importedAt', '!=', null)
        .get();

    if (snapshot.empty) {
        console.log('No imported user docs found (no docs with importedAt field). Nothing to do.');
        return;
    }

    console.log(`Found ${snapshot.size} imported user doc(s).\n`);

    let revoked = 0;
    let skippedPaid = 0;
    let alreadyInactive = 0;

    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const hasPaid = !!(data.licenseDetails && (data.licenseDetails.payment_id || data.licenseDetails.migratedFromLocalLicense));

        if (hasPaid) {
            skippedPaid++;
            console.log(`  SKIP (paid subscriber): ${docSnap.id}`);
            continue;
        }

        if (!data.isActivated) {
            alreadyInactive++;
            continue;
        }

        if (DRY_RUN) {
            console.log(`  WOULD REVOKE: ${docSnap.id}`);
        } else {
            await docSnap.ref.set({
                isActivated: false,
                revokedImportAt: new Date().toISOString(),
            }, { merge: true });
            console.log(`  REVOKED: ${docSnap.id}`);
        }
        revoked++;
    }

    console.log(`\n${DRY_RUN ? '[DRY RUN] Would revoke' : 'Revoked'}: ${revoked}`);
    console.log(`Skipped (paid): ${skippedPaid}`);
    console.log(`Already inactive: ${alreadyInactive}`);
    if (DRY_RUN) console.log('\nRun without --dry-run to apply.');
}

revokeImportedUsers().catch((error) => {
    console.error('Revoke failed:', error);
    process.exit(1);
});
