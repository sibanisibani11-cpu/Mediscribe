const path = require('path');

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== 'darwin') {
        return;
    }

    // Skip notarization if developer didn't provide credentials
    if (!(process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD)) {
        console.warn('⚠️  Skipping Mac notarization: APPLE_ID and APPLE_ID_PASSWORD not set in environment.');
        return;
    }

    const { notarize } = await import('@electron/notarize');
    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(appOutDir, `${appName}.app`);

    console.log(`🔒 Notarizing Mac app: ${appName} at ${appPath}...`);

    try {
        await notarize({
            appPath,
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_ID_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
        });
        console.log('✅ Notarization complete!');
    } catch (error) {
        console.warn('⚠️  Notarization skipped/failed (expected on local dev without setup):', error.message);
        // Don't throw for local development
    }
};
