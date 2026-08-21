const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const RESEND_API_KEY = process.env.RESEND_API_KEY;
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
    'tinulukose@gmail.com',
    'kuddushahmed223@gmail.com',
    'cashwini993@gmail.com',
    'drjacobstephen@gmail.com',
    'chirpymukta@gmail.com',
    'arvind.suresh93@gmail.com',
    'work.arunava@gmail.com',
    'jasim.jaleel@gmail.com',
    'drjasimjaleel@aiims.edu',
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendMicrosoftStoreAnnouncement() {
    console.log(`🚀 Starting Microsoft Store Announcement Broadcast to ${RECIPIENTS.length} users...`);
    console.log(`📡 Using Sender: ${FROM_EMAIL}`);

    const htmlPath = path.join(__dirname, '../docs/msstore-announcement-email.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < RECIPIENTS.length; i++) {
        const email = RECIPIENTS[i];
        try {
            console.log(`[${i + 1}/${RECIPIENTS.length}] Sending to: ${email}...`);

            const { data, error } = await resend.emails.send({
                from: FROM_EMAIL,
                to: [email],
                subject: '🎉 MediScribe is now available on the Microsoft Store!',
                html: htmlContent,
                text: `MediScribe on Microsoft Store\n\nDear Doctor,\n\nWe are excited to announce that MediScribe is now officially certified and available on the Microsoft Store for Windows with 1-click installation and automatic updates!\n\nGet MediScribe on Microsoft Store here:\nhttps://apps.microsoft.com/store/detail/9PNJJSPMX9TR?cid=DevShareMCLPCS\n\nRegards,\nMediScribe Team\nhttps://mediapp.store`,
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

        // Sleep 1.5 seconds between emails to respect Resend rate limits
        await sleep(1500);
    }

    console.log('\n✨ Broadcast complete.');
    console.log(`📊 Summary: ${successCount} Success, ${failCount} Failed.`);
}

sendMicrosoftStoreAnnouncement();
