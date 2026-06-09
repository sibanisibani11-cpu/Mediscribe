const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RESOURCES_DIR = path.join(__dirname, '../resources/bin');
const TEMP_DIR = path.join(__dirname, '../temp_whisper');

// URLs for whisper-server binaries (whisper.cpp v1.8.2)
const URLS = {
    win32: 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.2/whisper-bin-x64.zip',
    linux: 'https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.1/whisper-bin-v1.7.1-linux-intel.zip',
    // Mac binary is handled manually as it's not available as a simple standalone zip in v1.8.2
    darwin: null
};

function removeDirSync(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

async function bundleWhisper() {
    console.log('📦 Bundling Whisper Server...');

    // Ensure resources directory exists
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
        console.log(`\n--- Bundling for ${platform} ---`);

        if (platform === 'darwin') {
            const macBinary = path.join(RESOURCES_DIR, 'whisper-server');
            if (fs.existsSync(macBinary)) {
                console.log('✅ Whisper Server for Mac already exists.');
                try {
                    execSync(`chmod +x "${macBinary}"`);
                    console.log('   Permissions updated (chmod +x).');
                } catch (e) {
                    console.warn(`   Could not set permissions: ${e.message}`);
                }
            } else {
                console.warn('⚠️  Whisper Server for Mac NOT found at resources/bin/whisper-server');
                console.warn('   Please build whisper.cpp manually or provide the binary.');
            }
            continue;
        }

        const url = URLS[platform];
        if (!url) {
            console.log(`ℹ️  No URL defined for ${platform}, skipping.`);
            continue;
        }

        // Check if Windows binary already exists and validate it
        // Note: whisper-server.exe is a thin loader (~700KB) — the heavy lifting is in the DLLs
        if (platform === 'win32') {
            const exePath = path.join(RESOURCES_DIR, 'whisper-server.exe');
            if (fs.existsSync(exePath) && fs.statSync(exePath).size > 500000) {
                console.log('\u2705 whisper-server.exe already exists and looks valid, skipping download.');
                continue;
            } else if (fs.existsSync(exePath)) {
                console.log(`\u26a0\ufe0f  whisper-server.exe exists but is suspiciously small (${fs.statSync(exePath).size} bytes) - re-downloading.`);
            }
        }

        if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
        }

        const archiveName = `whisper-${platform}.zip`;
        const archivePath = path.join(TEMP_DIR, archiveName);

        console.log(`⬇️  Downloading ${archiveName}...`);
        try {
            execSync(`curl -L -o "${archivePath}" "${url}"`, { stdio: 'inherit' });
        } catch (e) {
            console.error(`❌ Download failed for ${platform}:`, e.message);
            removeDirSync(TEMP_DIR);
            continue;
        }

        const extractedDir = path.join(TEMP_DIR, 'extracted');
        if (!fs.existsSync(extractedDir)) {
            fs.mkdirSync(extractedDir, { recursive: true });
        }

        try {
            // Extract using tar (built-in on Windows 10+, macOS, Linux)
            execSync(`tar -xf "${archivePath}" -C "${extractedDir}"`, { stdio: 'inherit' });
        } catch (e) {
            console.error(`❌ Extraction failed for ${platform}:`, e.message);
            removeDirSync(TEMP_DIR);
            continue;
        }

        try {
            if (platform === 'win32') {
                // Copy whisper-server.exe and required DLLs from Release/
                const filesToCopy = [
                    { from: 'Release/whisper-server.exe', to: 'whisper-server.exe' },
                    { from: 'Release/ggml.dll', to: 'ggml.dll' },
                    { from: 'Release/ggml-base.dll', to: 'ggml-base.dll' },
                    { from: 'Release/ggml-cpu.dll', to: 'ggml-cpu.dll' },
                    { from: 'Release/whisper.dll', to: 'whisper.dll' },
                    { from: 'Release/SDL2.dll', to: 'SDL2.dll' }
                ];

                for (const { from, to } of filesToCopy) {
                    const src = path.join(extractedDir, from);
                    const dst = path.join(RESOURCES_DIR, to);
                    if (fs.existsSync(src)) {
                        fs.copyFileSync(src, dst);
                    } else {
                        console.warn(`⚠️  Could not find ${from} in extracted archive`);
                    }
                }

                // Validate the downloaded binary size
                const exePath = path.join(RESOURCES_DIR, 'whisper-server.exe');
                if (fs.existsSync(exePath)) {
                    const size = fs.statSync(exePath).size;
                    console.log(`   whisper-server.exe size: ${(size / 1024).toFixed(0)} KB`);
                    if (size < 200000) {
                        console.warn('⚠️  whisper-server.exe seems too small - check the archive contents.');
                    }
                }
            } else if (platform === 'linux') {
                // Linux: find whisper-server in extracted directory
                const findResult = execSync(`find "${extractedDir}" -name "whisper-server" -type f`).toString().trim();
                if (findResult) {
                    fs.copyFileSync(findResult, path.join(RESOURCES_DIR, 'whisper-server'));
                    execSync(`chmod +x "${path.join(RESOURCES_DIR, 'whisper-server')}"`);
                } else {
                    console.warn(`⚠️  Could not find whisper-server in ${archiveName}`);
                }
            }
            console.log(`✅ Whisper Server for ${platform} bundled successfully to ${RESOURCES_DIR}`);
        } catch (e) {
            console.error(`❌ Extraction failed for ${platform}:`, e.message);
        } finally {
            // Cleanup temp
            removeDirSync(TEMP_DIR);
        }
    }
}

bundleWhisper();
