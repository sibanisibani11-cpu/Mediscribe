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
            execSync(`rm -rf "${TEMP_DIR}"`);
            continue;
        }

        try {
            if (platform === 'win32') {
                // Extract whisper-server.exe and required DLLs
                const filesToExtract = [
                    'Release/whisper-server.exe',
                    'Release/ggml.dll',
                    'Release/ggml-base.dll',
                    'Release/ggml-cpu.dll',
                    'Release/whisper.dll',
                    'Release/SDL2.dll'
                ];

                for (const file of filesToExtract) {
                    try {
                        execSync(`unzip -o -j "${archivePath}" "${file}" -d "${RESOURCES_DIR}"`, { stdio: 'inherit' });
                    } catch (err) {
                        console.warn(`⚠️  Could not extract ${file}: ${err.message}`);
                    }
                }
            } else if (platform === 'linux') {
                // Linux: Extract whisper-server
                try {
                    execSync(`unzip -o -j "${archivePath}" "whisper-server" -d "${RESOURCES_DIR}"`, { stdio: 'inherit' });
                    execSync(`chmod +x "${path.join(RESOURCES_DIR, 'whisper-server')}"`);
                } catch (err) {
                    console.warn(`⚠️  Could not extract whisper-server from ${archiveName}: ${err.message}`);
                    console.log('Listing files in zip:');
                    execSync(`unzip -l "${archivePath}"`);
                }
            }
            console.log(`✅ Whisper Server for ${platform} bundled successfully to ${RESOURCES_DIR}`);
        } catch (e) {
            console.error(`❌ Extraction failed for ${platform}:`, e.message);
        } finally {
            // Cleanup temp
            execSync(`rm -rf "${TEMP_DIR}"`);
        }
    }
}

bundleWhisper();
