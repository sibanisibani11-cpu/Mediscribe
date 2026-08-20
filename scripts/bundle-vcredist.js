const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BUILD_DIR = path.join(__dirname, '../build');
const URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';

async function bundleVcRedist() {
    console.log('📦 Checking VC++ Redistributable requirements...');

    // Determine target platform
    let platforms = ['darwin', 'win32', 'linux'];
    if (process.env.TARGET_PLATFORM) {
        platforms = [process.env.TARGET_PLATFORM];
    } else if (process.platform === 'darwin') {
        platforms = ['darwin'];
    } else if (process.platform === 'linux') {
        platforms = ['linux'];
    }

    if (!platforms.includes('win32')) {
        console.log('⏭️  Windows is not the target platform. Skipping VC++ Redistributable download.');
        return;
    }

    // Ensure build directory exists
    if (!fs.existsSync(BUILD_DIR)) {
        fs.mkdirSync(BUILD_DIR, { recursive: true });
    }

    const outputPath = path.join(BUILD_DIR, 'vc_redist.x64.exe');

    // Skip if already exists and is a reasonable size (>10MB)
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10 * 1024 * 1024) {
        console.log('✅ VC++ Redistributable already exists in build/, skipping download.');
        return;
    }

    console.log('\n--- Bundling VC++ Redistributable for win32 ---');
    console.log(`⬇️  Downloading VC++ Redistributable from ${URL}...`);
    let downloaded = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            // --retry handles connection issues; --retry-delay gives the CDN time to recover
            execSync(`curl -L --retry 3 --retry-delay 10 --retry-max-time 120 -o "${outputPath}" "${URL}"`, { stdio: 'inherit' });
            // Validate size
            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10 * 1024 * 1024) {
                console.log(`✅ VC++ Redistributable successfully downloaded to ${outputPath}`);
                downloaded = true;
                break;
            } else {
                console.warn(`⚠️  Attempt ${attempt}: Downloaded file is too small, retrying...`);
                fs.rmSync(outputPath, { force: true });
            }
        } catch (e) {
            console.warn(`⚠️  Attempt ${attempt} failed: ${e.message}`);
        }
    }
    if (!downloaded) {
        console.warn('⚠️  VC++ Redistributable download failed after 3 attempts. Build will continue without it.');
        console.warn('   Users without VC++ Runtime installed may need to install it manually.');
    }
}

bundleVcRedist();
