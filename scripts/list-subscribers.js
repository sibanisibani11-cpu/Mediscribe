/**
 * MediScribe - Comprehensive Subscriber & Revenue Dashboard
 *
 * Fetches and merges subscriber status from:
 * 1. Razorpay Live Payment Gateway (Live captured payments, subscriptions & customer contact)
 * 2. Firebase Firestore (User documents & license records)
 * 3. Firebase Authentication (Registered accounts & sign-in activity)
 *
 * Usage:
 *   node scripts/list-subscribers.js                      # Complete dashboard of all subscribers & users
 *   node scripts/list-subscribers.js --active             # Filter: only currently active Pro subscribers
 *   node scripts/list-subscribers.js --expired            # Filter: only expired subscriptions
 *   node scripts/list-subscribers.js --csv                # Export all data to subscribers_report.csv
 *   node scripts/list-subscribers.js --sync               # Sync captured Razorpay subscribers into Firestore
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables from .env
try {
    const dotenv = require('dotenv');
    dotenv.config({ path: path.join(__dirname, '../.env') });
} catch (e) {
    // If dotenv not available, continue
}

// ----------------------------------------------------
// 1. Razorpay API Setup
// ----------------------------------------------------
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_live_SiXmXO4YoPaPyF';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'v8Z3T2qXFdz5iXZ2M0oc6jgR';

function rzpFetch(endpoint) {
    return new Promise((resolve) => {
        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
            resolve({ error: 'Razorpay keys not configured' });
            return;
        }

        const credentials = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
        const req = https.get(
            `https://api.razorpay.com/v1/${endpoint}`,
            {
                headers: {
                    Authorization: `Basic ${credentials}`,
                },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (err) {
                        resolve({ error: err.message });
                    }
                });
            }
        );

        req.on('error', (err) => {
            resolve({ error: err.message });
        });

        req.setTimeout(15000, () => {
            req.destroy();
            resolve({ error: 'Timeout' });
        });
    });
}

// ----------------------------------------------------
// 2. Firebase Admin Setup
// ----------------------------------------------------
let db = null;
let authAdmin = null;

try {
    const admin = require('firebase-admin');
    let serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!serviceAccountPath) {
        const rootFiles = fs.readdirSync(path.join(__dirname, '..'));
        const keyFile = rootFiles.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
        if (keyFile) {
            serviceAccountPath = path.join(__dirname, '..', keyFile);
        }
    }

    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(require(path.resolve(serviceAccountPath))),
            });
        }
        db = admin.firestore();
        db.settings({ preferRest: true });
        authAdmin = admin.auth();
    }
} catch (err) {
    console.warn('⚠️ Firebase Admin initialization note:', err.message);
}

// ----------------------------------------------------
// CLI Argument Parsing
// ----------------------------------------------------
const FILTER_ACTIVE = process.argv.includes('--active');
const FILTER_EXPIRED = process.argv.includes('--expired');
const DO_SYNC = process.argv.includes('--sync');
const csvArg = process.argv.find(a => a.startsWith('--csv=') || a === '--csv');
const CSV_FILE = csvArg ? (csvArg.includes('=') ? csvArg.split('=')[1] : 'subscribers_report.csv') : null;

// ----------------------------------------------------
// Main Tracker Function
// ----------------------------------------------------
async function getSubscribers() {
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('         🏥  MEDISCRIBE SUBSCRIBER & LICENSE INTELLIGENCE DASHBOARD        ');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    const now = new Date();
    const recordsMap = new Map(); // Keyed by email or HWID or payment ID

    // 1. FETCH RAZORPAY PAYMENTS
    console.log('📡 [1/3] Fetching Live Transactions from Razorpay...');
    const rzpPayments = await rzpFetch('payments?count=100');
    let totalRevenueINR = 0;

    if (rzpPayments && rzpPayments.items) {
        for (const payment of rzpPayments.items) {
            const paymentId = payment.id;
            const amount = payment.amount ? payment.amount / 100 : 0;
            const currency = payment.currency || 'INR';
            const status = payment.status; // 'captured', 'refunded', 'failed', 'authorized'
            const contact = payment.contact || 'N/A';
            const email = payment.email || null;
            const createdAt = new Date(payment.created_at * 1000);
            const notes = payment.notes || {};
            const hwid = notes.activation_id || notes.hwid || 'N/A';
            const planId = notes.plan_id || notes.billing || (amount >= 1000 ? 'yearly' : 'monthly');
            const billing = notes.billing || (planId.includes('year') ? 'yearly' : 'monthly');

            // Calculate Expiration
            let expiresAt = new Date(createdAt);
            if (billing === 'yearly') {
                expiresAt.setFullYear(expiresAt.getFullYear() + 1);
            } else {
                expiresAt.setMonth(expiresAt.getMonth() + 1);
            }

            const isFuture = expiresAt.getTime() > now.getTime();
            const diffMs = expiresAt.getTime() - now.getTime();
            const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

            let computedStatus = 'Inactive';
            if (status === 'captured') {
                totalRevenueINR += currency === 'INR' ? amount : (amount * 85);
                if (isFuture) {
                    computedStatus = `Active Pro (${billing.toUpperCase()})`;
                } else {
                    computedStatus = 'Expired';
                }
            } else if (status === 'refunded') {
                computedStatus = 'Refunded';
            } else if (status === 'failed') {
                computedStatus = 'Failed Payment';
            }

            const primaryKey = email || (hwid !== 'N/A' ? `hwid_${hwid}` : paymentId);

            recordsMap.set(primaryKey, {
                id: primaryKey,
                source: 'Razorpay Live',
                email: email || `Contact: ${contact}`,
                contact: contact,
                hwid: hwid,
                plan: billing,
                amount: `${amount} ${currency}`,
                paymentId: paymentId,
                paymentStatus: status,
                status: computedStatus,
                isActive: status === 'captured' && isFuture,
                subscribedOn: createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                expiresOn: expiresAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                validity: status === 'captured' ? (daysRemaining > 0 ? `${daysRemaining} days left` : `${Math.abs(daysRemaining)} days ago`) : 'N/A',
                rawExpiresAt: expiresAt.toISOString(),
                rawCreatedAt: createdAt.toISOString(),
            });
        }
    }

    // 2. FETCH FIRESTORE USERS
    if (db) {
        console.log('📡 [2/3] Fetching Registered License Profiles from Firestore...');
        try {
            const snapshot = await db.collection('users').get();
            snapshot.forEach((docSnap) => {
                const data = docSnap.data() || {};
                const email = data.email || data.userEmail || docSnap.id;
                const isActivated = !!data.isActivated;
                const license = data.licenseDetails || {};
                const billing = license.billing || (license.expiresAt ? 'custom' : 'none');
                const expiresAtStr = license.expiresAt || null;
                const hwid = license.hwid || 'N/A';
                const paymentId = license.payment_id || 'N/A';

                let computedStatus = 'Inactive / Free';
                let daysRemaining = null;
                let isFuture = false;

                if (expiresAtStr) {
                    const expDate = new Date(expiresAtStr);
                    isFuture = expDate.getTime() > now.getTime();
                    const diffMs = expDate.getTime() - now.getTime();
                    daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

                    if (isActivated && isFuture) {
                        computedStatus = `Active Pro (${billing.toUpperCase()})`;
                    } else if (isActivated && !isFuture) {
                        computedStatus = 'Expired';
                    }
                } else if (isActivated) {
                    computedStatus = 'Active Pro (Lifetime)';
                    isFuture = true;
                }

                // If already in map from Razorpay, enhance it; otherwise insert
                const existing = recordsMap.get(email) || (hwid !== 'N/A' ? recordsMap.get(`hwid_${hwid}`) : null);

                if (existing) {
                    existing.source = 'Razorpay + Firestore';
                    existing.email = email;
                    if (hwid !== 'N/A') existing.hwid = hwid;
                    if (isActivated && isFuture) existing.isActive = true;
                } else {
                    recordsMap.set(email, {
                        id: docSnap.id,
                        source: 'Firestore',
                        email: email,
                        contact: 'N/A',
                        hwid: hwid,
                        plan: billing,
                        amount: 'N/A',
                        paymentId: paymentId,
                        paymentStatus: isActivated ? 'active' : 'inactive',
                        status: computedStatus,
                        isActive: isActivated && isFuture,
                        subscribedOn: data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A',
                        expiresOn: expiresAtStr ? new Date(expiresAtStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A',
                        validity: daysRemaining !== null ? (daysRemaining > 0 ? `${daysRemaining} days left` : `${Math.abs(daysRemaining)} days ago`) : 'N/A',
                        rawExpiresAt: expiresAtStr,
                        rawCreatedAt: data.createdAt || null,
                    });
                }
            });
        } catch (fsErr) {
            console.warn('⚠️ Firestore fetch error:', fsErr.message);
        }
    }

    // 3. FETCH FIREBASE AUTH USERS
    if (authAdmin) {
        console.log('📡 [3/3] Fetching Firebase Auth Directory...');
        try {
            const authList = await authAdmin.listUsers(200);
            authList.users.forEach(u => {
                if (u.email && !recordsMap.has(u.email)) {
                    const createdDate = new Date(u.metadata.creationTime);
                    const trialExpDate = new Date(createdDate.getTime() + 7 * 24 * 60 * 60 * 1000);
                    const diffMs = trialExpDate.getTime() - now.getTime();
                    const daysRem = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                    const isTrialActive = diffMs > 0;

                    recordsMap.set(u.email, {
                        id: u.uid,
                        source: 'Firebase Auth',
                        email: u.email,
                        contact: u.phoneNumber || 'N/A',
                        hwid: 'N/A',
                        plan: 'trial',
                        amount: '0 INR',
                        paymentId: 'N/A',
                        paymentStatus: isTrialActive ? 'trial' : 'expired',
                        status: isTrialActive ? 'Free Trial (Active)' : 'Free Trial (Expired)',
                        isActive: isTrialActive,
                        subscribedOn: createdDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                        expiresOn: trialExpDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                        validity: isTrialActive ? `${daysRem} days left` : `Expired ${Math.abs(daysRem)} days ago`,
                        rawExpiresAt: trialExpDate.toISOString(),
                        rawCreatedAt: u.metadata.creationTime,
                    });
                }
            });
        } catch (authErr) {
            console.warn('⚠️ Firebase Auth fetch note:', authErr.message);
        }
    }

    // Convert map to array
    let allRecords = Array.from(recordsMap.values());

    // Filter if requested
    let displayed = allRecords;
    if (FILTER_ACTIVE) {
        displayed = allRecords.filter(r => r.isActive);
    } else if (FILTER_EXPIRED) {
        displayed = allRecords.filter(r => r.status === 'Expired');
    }

    // Sort: Active first, then by subscription date descending
    displayed.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return (b.rawCreatedAt || '').localeCompare(a.rawCreatedAt || '');
    });

    // Counts
    const activeCount = allRecords.filter(r => r.isActive).length;
    const expiredCount = allRecords.filter(r => r.status === 'Expired').length;
    const refundedCount = allRecords.filter(r => r.status === 'Refunded').length;
    const freeCount = allRecords.filter(r => r.status.includes('Free') || r.status.includes('Inactive')).length;

    function detectCountry(info) {
        const phone = (info.phone || '').replace(/[\s\-\(\)]/g, '');
        if (phone.startsWith('+91') || (phone.startsWith('91') && phone.length >= 12)) return '🇮🇳 India';
        if (phone.startsWith('+1')) return '🇺🇸 USA/Canada';
        if (phone.startsWith('+44')) return '🇬🇧 UK';
        if (phone.startsWith('+61')) return '🇦🇺 Australia';
        if (phone.startsWith('+971')) return '🇦🇪 UAE';
        if (phone.startsWith('+966')) return '🇸🇦 Saudi Arabia';
        if (phone.startsWith('+65')) return '🇸🇬 Singapore';
        if (phone.startsWith('+49')) return '🇩🇪 Germany';
        if (phone.startsWith('+33')) return '🇫🇷 France';

        const curr = (info.currency || '').toUpperCase();
        if (curr === 'INR') return '🇮🇳 India';
        if (curr === 'USD') return '🇺🇸 USA';
        if (curr === 'GBP') return '🇬🇧 UK';
        if (curr === 'EUR') return '🇪🇺 Europe';

        const email = (info.email || '').toLowerCase();
        if (email.endsWith('.in') || email.includes('aiims.edu')) return '🇮🇳 India';
        if (email.endsWith('.uk')) return '🇬🇧 UK';
        if (email.endsWith('.au')) return '🇦🇺 Australia';

        return '🇮🇳 India';
    }

    console.log('\n');
    console.table(displayed.map(r => ({
        'Subscriber / Email': r.email,
        'Country': detectCountry({ phone: r.contact, email: r.email, currency: r.amount }),
        'Phone / Contact': r.contact,
        'Hardware ID': r.hwid,
        'Plan': r.plan,
        'Amount': r.amount,
        'Status': r.status,
        'Subscribed On': r.subscribedOn,
        'Expires On': r.expiresOn,
        'Validity': r.validity,
        'Payment ID': r.paymentId,
    })));

    console.log('\n📊 ─────────────────────── FINANCIAL & SUBSCRIBER SUMMARY ───────────────────────');
    console.log(`  🟢 Active Pro Subscribers : ${activeCount}`);
    console.log(`  🔴 Expired Subscriptions   : ${expiredCount}`);
    console.log(`  🔄 Refunded Payments      : ${refundedCount}`);
    console.log(`  ⚪ Free / Registered Users : ${freeCount}`);
    console.log(`  👥 Total Tracked Profiles : ${allRecords.length}`);
    console.log(`  💰 Total Realized Revenue : ₹${totalRevenueINR.toLocaleString('en-IN')}`);
    console.log('────────────────────────────────────────────────────────────────────────────────\n');

    // Sync option to write active Razorpay subscribers into Firestore
    if (DO_SYNC && db) {
        console.log('🔄 Syncing active Razorpay subscribers into Firestore "users" collection...');
        let syncedCount = 0;
        for (const r of allRecords) {
            if (r.isActive && r.paymentId !== 'N/A') {
                const docId = r.email.includes('@') ? r.email.toLowerCase() : (r.hwid !== 'N/A' ? r.hwid : r.paymentId);
                const docRef = db.collection('users').doc(docId);

                await docRef.set({
                    email: r.email.includes('@') ? r.email.toLowerCase() : null,
                    contact: r.contact,
                    isActivated: true,
                    licenseDetails: {
                        billing: r.plan,
                        expiresAt: r.rawExpiresAt,
                        date: r.rawCreatedAt,
                        hwid: r.hwid !== 'N/A' ? r.hwid : null,
                        payment_id: r.paymentId,
                        syncedFromRazorpay: true,
                    },
                    lastSyncedAt: new Date().toISOString(),
                }, { merge: true });

                syncedCount++;
                console.log(`  ✅ Synced [${docId}] -> Active Pro (${r.plan})`);
            }
        }
        console.log(`\n🎉 Successfully synced ${syncedCount} active subscriber(s) to Firestore!\n`);
    }

    // CSV Export
    if (CSV_FILE) {
        const headers = [
            'Subscriber/Email',
            'Phone/Contact',
            'Hardware ID',
            'Status',
            'Plan',
            'Amount Paid',
            'Payment ID',
            'Subscribed On',
            'Expires On',
            'Validity',
            'Data Source'
        ];

        const csvRows = [headers.join(',')];
        allRecords.forEach(r => {
            csvRows.push([
                `"${r.email}"`,
                `"${r.contact}"`,
                `"${r.hwid}"`,
                `"${r.status}"`,
                `"${r.plan}"`,
                `"${r.amount}"`,
                `"${r.paymentId}"`,
                `"${r.subscribedOn}"`,
                `"${r.expiresOn}"`,
                `"${r.validity}"`,
                `"${r.source}"`
            ].join(','));
        });

        fs.writeFileSync(CSV_FILE, csvRows.join('\n'), 'utf8');
        console.log(`📁 Detailed subscriber report exported to: ${path.resolve(CSV_FILE)}\n`);
    }
}

getSubscribers().catch((err) => {
    console.error('❌ Error generating subscriber dashboard:', err);
    process.exit(1);
});
