const fs = require('fs');
const path = require('path');

// Read CSV file
const csvPath = path.join(__dirname, '../verified_users.csv');
if (!fs.existsSync(csvPath)) {
    console.error('Error: verified_users.csv not found in the root directory.');
    process.exit(1);
}

const csv = fs.readFileSync(csvPath, 'utf8');

// Parse CSV simple parser (handling commas/quotes)
const lines = csv.split('\n').map(line => line.trim()).filter(line => line.length > 0);
const users = [];

for (let i = 1; i < lines.length; i++) {
    // Basic CSV row parsing: Match fields separating by commas, ignoring commas in double quotes
    const matches = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
    const email = matches[0] ? matches[0].replace(/"/g, '').trim() : '';
    const displayName = matches[1] ? matches[1].replace(/"/g, '').trim() : '';
    const role = matches[2] ? matches[2].replace(/"/g, '').trim() : 'User';
    const joined = matches[3] ? matches[3].replace(/"/g, '').trim() : '';
    
    if (email && email.includes('@')) {
        users.push({ email, displayName, role, joined });
    }
}

console.log(`Parsed ${users.length} users from CSV.`);

// Initialize Firebase Admin
const admin = require('firebase-admin');
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountPath) {
    console.error('\n❌ ERROR: FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
    console.log('\nTo run this script, please download your Firebase Service Account JSON key:');
    console.log('1. Go to Firebase Console > Project Settings > Service Accounts.');
    console.log('2. Click "Generate new private key" and download the JSON file.');
    console.log('3. Run the script pointing to that file:');
    console.log('   export FIREBASE_SERVICE_ACCOUNT="/path/to/your-service-account.json"');
    console.log('   node scripts/import-users.js\n');
    process.exit(1);
}

const serviceAccount = require(path.resolve(serviceAccountPath));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function importUsers() {
    let count = 0;
    for (const user of users) {
        const docRef = db.collection('users').doc(user.email.toLowerCase());
        
        await docRef.set({
            email: user.email.toLowerCase(),
            displayName: user.displayName || '',
            role: user.role || 'User',
            isActivated: true, // Default to true since they are from your website list
            createdAt: user.joined || new Date().toISOString(),
            importedAt: new Date().toISOString()
        }, { merge: true });
        
        console.log(`Imported: ${user.email}`);
        count++;
    }
    console.log(`\n🎉 Success! Imported ${count} users to Firestore.`);
}

importUsers().catch(error => {
    console.error('Import failed:', error);
    process.exit(1);
});
