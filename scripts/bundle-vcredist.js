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
    try {
        execSync(`curl -L -o "${outputPath}" "${URL}"`, { stdio: 'inherit' });
        console.log(`✅ VC++ Redistributable successfully downloaded to ${outputPath}`);
    } catch (e) {
        console.error('❌ VC++ Redistributable download failed:', e.message);
        process.exit(1);
    }
}

bundleVcRedist();
