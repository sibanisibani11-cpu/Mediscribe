const fs = require('fs');
const path = require('path');

const csvPath = '/Users/kalpa/Documents/MediApp/mediapp_users.csv';
const scriptPath = '/Users/kalpa/Documents/MediScribe v 1.0.2/scripts/send-broadcast.js';

function syncEmails() {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');

    // Skip header and extract first column (emails)
    const emails = lines.slice(1).map(line => {
        const matches = line.match(/"([^"]+)"|([^,]+)/);
        return matches[1] || matches[2];
    });

    console.log(`Found ${emails.length} emails in CSV.`);

    let scriptContent = fs.readFileSync(scriptPath, 'utf8');

    // Replace the RECIPIENTS array
    const recipientsRegex = /const RECIPIENTS = \[([\s\S]*?)\];/;
    const formattedArray = `const RECIPIENTS = [\n    '${emails.join("',\n    '")}'\n];`;

    const newContent = scriptContent.replace(recipientsRegex, formattedArray);

    fs.writeFileSync(scriptPath, newContent);
    console.log('✅ Updated scripts/send-broadcast.js with correct emails from CSV.');
}

syncEmails();
