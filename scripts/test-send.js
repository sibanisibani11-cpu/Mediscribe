const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const RESEND_API_KEY = 're_bmeKtiKf_6wXAyf8EUJet65QBSERpfT61';
const FROM_EMAIL = 'MediScribe Team <updates@mediapp.store>';
const TEST_RECIPIENT = 'kalpadass@aiims.edu';

const resend = new Resend(RESEND_API_KEY);

async function runTest() {
    console.log('🧪 Running v1.0.4 Broadcast Test...');
    console.log(`📡 Sending from: ${FROM_EMAIL}`);
    console.log(`👤 Sending to: ${TEST_RECIPIENT}`);

    try {
        const htmlPath = path.join(__dirname, '../docs/v1.0.4-announcement-email.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');

        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [TEST_RECIPIENT],
            subject: 'Release Test: MediScribe v1.0.4 - The Midnight Cobalt Update',
            html: htmlContent,
            text: `MediScribe v1.0.4 Update\n\nDear Doctor,\n\nWe are excited to announce version 1.0.4 of MediScribe. This update introduces the "Midnight Cobalt" theme and improved performance across Windows, Mac, and Linux.\n\nDownload the new version at: https://mediapp.store/apps/YSP7J8pT50Xd2eBTwnBU\n\nRegards,\nMediScribe Team`,
        });

        if (error) {
            console.error('❌ Test Failed:', error.message || error);
        } else {
            console.log('✅ Test Email Sent Successfully!');
            console.log('Please check your inbox (and spam folder) for the v1.0.4 layout.');
        }
    } catch (err) {
        console.error('💥 Fatal Error:', err.message);
    }
}

runTest();
