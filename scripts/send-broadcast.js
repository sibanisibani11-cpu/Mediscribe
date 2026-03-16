const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const RESEND_API_KEY = 're_bmeKtiKf_6wXAyf8EUJet65QBSERpfT61';

// --- CONFIGURATION ---
// 1. If you haven't verified mediapp.store yet, change this to 'onboarding@resend.dev' to test.
// 2. Once verified, change it to 'MediScribe Team <updates@mediapp.store>'
const FROM_EMAIL = 'MediScribe Team <updates@mediapp.store>';

const RECIPIENTS = [
    'jeetumdc@gmail.com',
    'vikas.singhal19@gmail.com',
    'medravinash@gmail.com',
    'vk2246181@gmail.com',
    'drjstephenson@gmail.com',
    'hirakudroadtikrapara@gmail.com',
    'ladakuu13@gmail.com',
    'sr9718454@gmail.com',
    'babanraojagdale3293@gmail.com',
    'ibrahimwar374@gamil.com',
    'abcd@abd.com',
    'tinulukose@gmail.com',
    'kuddushahmed223@gmail.com',
    'cashwini993@gmail.com',
    'drjacobstephen@gmail.com',
    'chirpymukta@gmail.com',
    'arvind.suresh93@gmail.com',
    'work.arunava@gmail.com',
    'jasim.jaleel@gmail.com',
    'drchlua@gmail.com',
    'humairajaan229@gmail.com',
    'das034267@gmail.com',
    'aakashkumarthakur2288@gmail.com',
    'tanmoy77409@gmail.com',
    'dhillongurpreet6298@gmail.com',
    'draditikhurana@gmail.com',
    'kanaramgodrara137@gmail.com',
    'drdeepa2009@gmail.com',
    'yuvrajpatel15042001@gmail.com',
    'riyachaturvedi571@gmail.com',
    'ansariubaidah0@gmail.com',
    'rawathakim518@gmail.com',
    'ramzanjamin793@gmail.com',
    'amey.kodlikeri@gmail.com',
    'santosh.pandagre@gmail.com',
    'mehtak20897@gmail.com',
    'ksubi89@gmail.com',
    'nitin.kumar817840@gmail.com',
    'swatipadhi1987@gmail.com',
    'sharadluhar678@gmail.com',
    'sagarsuldhal47@gmail.com',
    'mahaswetasahu027@gmail.com',
    'ranibaiwadhwani@gmail.com',
    'tashilamo295@gmail.com',
    'vinaytalwadiya58@gmail.com',
    'parul863023@gmail.com',
    'raghuenfield143@gmail.com',
    'omawasthi810@gmail.com',
    'moderninstitute113@gmail.com',
    'rathodvilas964@gmail.com',
    'padamn499@gmail.com',
    'pravalsingh2020@gmail.com',
    'ap675125@gmail.com',
    'yashsapkal79@gmail.com',
    'lovepreet16859@gmail.com',
    'muhammadtkvmuhmmadpilakkathodi@gmail.com',
    'ramaramdevender@gmail.com',
    'darshanawagh32@gmail.com',
    'govindsinghbannahkmsa@gmail.com',
    'vijaymiskeen24@yahoo.com',
    'mohapatranirjharini8@gmail.com',
    'gopaluppara01@gmail.com',
    'poojapandhare856@gmail.com',
    'sateeshs7065@gmail.com',
    'lalmohmedhr@gmail.com',
    'montidas094@gmail.com',
    'shudebmandal9@gmail.com',
    'rjana4606@gmail.com',
    'Anilsharma77887788@gmail.com',
    'sahbazansari123345@gmail.com',
    'roshnishuklaamanroshni@gmail.com',
    'bhartisinghsikarwar14@gmail.com',
    'avdheshkumarpatel13@gmail.com',
    'shelendrathakur68@gmail.com',
    'sahabajakthar057@gmail.com',
    'naresh735479@gmail.com',
    'jaatbanty40@gmail.com',
    'lomayangda123@gmail.com',
    'samelbasumatary947@gmail.com',
    'ankitapaul978423@gmail.com',
    'tokonglego821@gmail.com',
    'ji2522730@gmail.com',
    'rohtaknuclearmedcare@gmail.com',
    'gavisiddahm@gmail.com',
    'sainianand8@gmail.com',
    'ssajan05074@gmail.com',
    'farhany.s.gamer.9@gmail.com',
    'alongbarb777@gmail.com',
    'djejdhehh7@gmail.com',
    'shivamroxx.01714@gmail.com',
    'sambarichauhan84@gmail.com',
    'nbn9325@gmail.com',
    'dilapapavara@gmail.com',
    'mn4812585@gmail.com',
    'dinesh310914@gmail.com',
    'belabellajain@gmail.com',
    'sibanisibani11@gmail.com',
    'kalpadass@aiims.edu',
    'drmeenajk@aiims.edu',
    'srishtiaggarwal1802@gmail.com',
    'teji8508@gmail.com'
];

const resend = new Resend(RESEND_API_KEY);

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendAnnouncements() {
    console.log('🚀 Starting MediScribe v1.0.4 Announcement Broadcast...');
    console.log(`📡 Using Sender: ${FROM_EMAIL}`);

    const htmlPath = path.join(__dirname, '../docs/v1.0.4-announcement-email.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    let successCount = 0;
    let failCount = 0;

    for (const email of RECIPIENTS) {
        try {
            console.log(`Sending to: ${email}...`);

            const { data, error } = await resend.emails.send({
                from: FROM_EMAIL,
                to: [email],
                subject: 'New Release: MediScribe v1.0.4 - The Midnight Cobalt Update',
                html: htmlContent,
                text: `MediScribe v1.0.4 Update\n\nDear Doctor,\n\nWe are excited to announce version 1.0.4 of MediScribe. This update introduces the "Midnight Cobalt" theme and improved performance across Windows, Mac, and Linux.\n\nDownload the new version at: https://mediapp.store/apps/YSP7J8pT50Xd2eBTwnBU\n\nRegards,\nMediScribe Team`,
            });

            if (error) {
                console.error(`❌ Failed for ${email}:`, error.message || error);
                failCount++;
            } else {
                console.log(`✅ Sent to ${email}`);
                successCount++;
            }
        } catch (err) {
            console.error(`💥 Fatal error for ${email}:`, err.message);
            failCount++;
        }

        // ⏱️ Wait for 2000ms (2 seconds) to protect domain reputation
        await sleep(2000);
    }

    console.log('\n✨ Broadcast complete.');
    console.log(`📊 Summary: ${successCount} Success, ${failCount} Failed.`);
}

sendAnnouncements();
