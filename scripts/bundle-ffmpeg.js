const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RESOURCES_DIR = path.join(__dirname, '../resources/bin');
const TEMP_DIR = path.join(__dirname, '../temp_ffmpeg');

// URLs for static ffmpeg binaries
// Using reliable sources for static binaries
const URLS = {
    darwin: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b5.0.1/darwin-x64',
    win32: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b5.0.1/win32-x64',
    linux: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b5.0.1/linux-x64'
};

function removeDirSync(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

async function bundleFFmpeg() {
    console.log('📦 Bundling FFmpeg for multiple platforms...');

    // Ensure directories exist
    if (!fs.existsSync(RESOURCES_DIR)) {
        fs.mkdirSync(RESOURCES_DIR, { recursive: true });
    }

    let platforms = ['darwin', 'win32', 'linux'];
    if (process.env.TARGET_PLATFORM) {
        platforms = [process.env.TARGET_PLATFORM];
    } else if (process.platform === 'darwin') {
        platforms = ['darwin'];
    } else if (process.platform === 'linux') {
        platforms = ['linux'];
    }

    for (const platform of platforms) {
        const url = URLS[platform];
        if (!url) continue;

        const binName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
        const outputPath = path.join(RESOURCES_DIR, binName);

        // Skip if already exists and is a reasonable size (>10MB)
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10 * 1024 * 1024) {
            console.log(`✅ FFmpeg for ${platform} already exists, skipping download.`);
            continue;
        }

        console.log(`\n--- Bundling FFmpeg for ${platform} ---`);
        console.log(`⬇️  Downloading FFmpeg for ${platform}...`);
        try {
            execSync(`curl -L -o "${outputPath}" "${url}"`, { stdio: 'inherit' });

            if (platform !== 'win32') {
                execSync(`chmod +x "${outputPath}"`);
            }

            console.log(`✅ FFmpeg for ${platform} bundled successfully to ${outputPath}`);
        } catch (e) {
            console.error(`❌ Bundle failed for ${platform}:`, e.message);
        }
    }
}

bundleFFmpeg();
