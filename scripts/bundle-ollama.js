const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const RESOURCES_DIR = path.join(__dirname, '../resources/bin');
const TEMP_DIR = path.join(__dirname, '../temp_ollama');

// URLs
const URLS = {
    darwin: 'https://ollama.com/download/Ollama-darwin.zip',
    win32: 'https://ollama.com/download/ollama-windows-amd64.zip',
    linux: 'https://ollama.com/download/ollama-linux-amd64.tgz'
};

async function bundleOllama() {
    console.log('📦 Bundling Ollama for multiple platforms...');

    // Ensure directories exist
    if (!fs.existsSync(RESOURCES_DIR)) {
        fs.mkdirSync(RESOURCES_DIR, { recursive: true });
    }

    // Priority: TARGET_PLATFORM env var, else only darwin if we are on a Mac and want mac only, else all
    let platforms = ['darwin', 'win32', 'linux'];
    if (process.env.TARGET_PLATFORM) {
        platforms = [process.env.TARGET_PLATFORM];
    } else if (process.platform === 'darwin') {
        // If we're on Mac, we likely only need Darwin for quick dev/build
        platforms = ['darwin'];
    } else if (process.platform === 'linux') {
        platforms = ['linux'];
    }

    for (const platform of platforms) {
        const url = URLS[platform];
        if (!url) continue;

        console.log(`\n--- Bundling for ${platform} ---`);

        if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
        }

        const archiveName = `ollama-${platform}.zip`;
        const archivePath = path.join(TEMP_DIR, archiveName);

        console.log(`⬇️  Downloading ${archiveName}...`);
        try {
            execSync(`curl -L -o "${archivePath}" "${url}"`, { stdio: 'inherit' });
        } catch (e) {
            console.error(`❌ Download failed for ${platform}:`, e.message);
            continue;
        }

        console.log('📂 Extracting...');
        try {
            if (platform === 'darwin') {
                // macOS: Extract the binary from the .app bundle
                // The binary is at Ollama.app/Contents/Resources/ollama
                execSync(`unzip -o -j "${archivePath}" "Ollama.app/Contents/Resources/ollama" -d "${RESOURCES_DIR}"`, { stdio: 'inherit' });
                execSync(`chmod +x "${path.join(RESOURCES_DIR, 'ollama')}"`);
            } else if (platform === 'win32') {
                // Windows: Extract ollama.exe
                execSync(`tar -xf "${archivePath}" -C "${RESOURCES_DIR}" ollama.exe`, { stdio: 'inherit' });
            } else if (platform === 'linux') {
                // Linux: Extract ollama binary from tgz
                // The ollama-linux-amd64.tgz has a single 'bin/ollama' file
                execSync(`tar -xzf "${archivePath}" -C "${RESOURCES_DIR}" bin/ollama --strip-components=1`, { stdio: 'inherit' });
                execSync(`chmod +x "${path.join(RESOURCES_DIR, 'ollama')}"`);
            }

            console.log(`✅ Ollama for ${platform} bundled successfully to ${RESOURCES_DIR}`);
        } catch (e) {
            console.error(`❌ Extraction failed for ${platform}:`, e.message);
        } finally {
            // Cleanup temp for this platform
            execSync(`rm -rf "${TEMP_DIR}"`);
        }
    }
}

bundleOllama();
