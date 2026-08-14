/**
 * List & Track Subscribers and their Subscription Status
 *
 * Usage:
 *   node scripts/list-subscribers.js                      # List all users & subscription statuses
 *   node scripts/list-subscribers.js --active             # List only active Pro subscribers
 *   node scripts/list-subscribers.js --expired            # List only expired subscribers
 *   node scripts/list-subscribers.js --csv=subscribers.csv # Export report to CSV
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Auto-detect service account key if not provided in environment
let serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountPath) {
    const rootFiles = fs.readdirSync(path.join(__dirname, '..'));
    const keyFile = rootFiles.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
    if (keyFile) {
        serviceAccountPath = path.join(__dirname, '..', keyFile);
    }
}

if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) {
    console.error('\n❌ ERROR: Firebase Service Account JSON key not found.');
    console.log('Set the environment variable or place the service account JSON in the project root:');
    console.log('  export FIREBASE_SERVICE_ACCOUNT="/path/to/service-account.json"\n');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(require(path.resolve(serviceAccountPath))),
});

const db = admin.firestore();
db.settings({ preferRest: true });

const FILTER_ACTIVE = process.argv.includes('--active');
const FILTER_EXPIRED = process.argv.includes('--expired');
const csvArg = process.argv.find(a => a.startsWith('--csv=') || a === '--csv');
const CSV_FILE = csvArg ? (csvArg.includes('=') ? csvArg.split('=')[1] : 'subscribers_report.csv') : null;

async function trackSubscribers() {
    console.log('🔍 Fetching users from Firestore...\n');

    const snapshot = await db.collection('users').get();
    if (snapshot.empty) {
        console.log('No user documents found in Firestore.');
        return;
    }

    const now = new Date();
    const records = [];

    snapshot.forEach(docSnap => {
        const data = docSnap.data() || {};
        const email = data.email || data.userEmail || docSnap.id;
        const isActivated = !!data.isActivated;
        const license = data.licenseDetails || {};
        const billing = license.billing || (license.expiresAt ? 'custom' : 'none');
        const expiresAtStr = license.expiresAt || null;

        let status = 'Inactive / Free';
        let daysRemaining = null;

        if (expiresAtStr) {
            const expDate = new Date(expiresAtStr);
            const diffMs = expDate.getTime() - now.getTime();
            daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

            if (isActivated && expDate > now) {
                status = 'Active Pro';
            } else {
                status = 'Expired';
            }
        } else if (isActivated) {
            status = 'Active (No Expiry)';
        }

        records.push({
            id: docSnap.id,
            email: email,
            status: status,
            billing: billing,
            expiresAt: expiresAtStr ? new Date(expiresAtStr).toLocaleDateString() : 'N/A',
            daysRemaining: daysRemaining !== null ? (daysRemaining > 0 ? `${daysRemaining} days left` : `${Math.abs(daysRemaining)} days ago`) : 'N/A',
            hwid: license.hwid || 'N/A',
            createdAt: data.createdAt ? new Date(data.createdAt).toLocaleDateString() : 'N/A'
        });
    });

    let filtered = records;
    if (FILTER_ACTIVE) {
        filtered = records.filter(r => r.status.startsWith('Active'));
    } else if (FILTER_EXPIRED) {
        filtered = records.filter(r => r.status === 'Expired');
    }

    // Sort by status (Active first) then expiration
    filtered.sort((a, b) => {
        if (a.status.startsWith('Active') && !b.status.startsWith('Active')) return -1;
        if (!a.status.startsWith('Active') && b.status.startsWith('Active')) return 1;
        return a.email.localeCompare(b.email);
    });

    // Summary counts
    const activeCount = records.filter(r => r.status.startsWith('Active')).length;
    const expiredCount = records.filter(r => r.status === 'Expired').length;
    const freeCount = records.filter(r => r.status === 'Inactive / Free').length;

    console.table(filtered.map(r => ({
        Email: r.email,
        Status: r.status,
        Plan: r.billing,
        'Expires On': r.expiresAt,
        'Validity': r.daysRemaining,
        'Created': r.createdAt
    })));

    console.log(`\n📊 Summary: Total Users: ${records.length} | 🟢 Active Pro: ${activeCount} | 🔴 Expired: ${expiredCount} | ⚪ Free/Inactive: ${freeCount}\n`);

    if (CSV_FILE) {
        const headers = ['User ID', 'Email', 'Status', 'Plan', 'Expires At', 'Validity', 'Hardware ID', 'Created At'];
        const csvRows = [headers.join(',')];

        filtered.forEach(r => {
            csvRows.push([
                `"${r.id}"`,
                `"${r.email}"`,
                `"${r.status}"`,
                `"${r.billing}"`,
                `"${r.expiresAt}"`,
                `"${r.daysRemaining}"`,
                `"${r.hwid}"`,
                `"${r.createdAt}"`
            ].join(','));
        });

        fs.writeFileSync(CSV_FILE, csvRows.join('\n'), 'utf8');
        console.log(`✅ Exported subscriber list to ${path.resolve(CSV_FILE)}`);
    }
}

trackSubscribers().catch(err => {
    console.error('Error tracking subscribers:', err);
    process.exit(1);
});
