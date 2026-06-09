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

function removeDirSync(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

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

        // Skip if binary already exists and is valid
        const binName = platform === 'win32' ? 'ollama.exe' : 'ollama';
        const binPath = path.join(RESOURCES_DIR, binName);
        if (fs.existsSync(binPath) && fs.statSync(binPath).size > 5 * 1024 * 1024) {
            console.log(`✅ Ollama for ${platform} already exists, skipping download.`);
            continue;
        }

        console.log(`\n--- Bundling for ${platform} ---`);

        if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
        }

        const ext = platform === 'linux' ? 'tgz' : 'zip';
        const archiveName = `ollama-${platform}.${ext}`;
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

        console.log('📂 Extracting...');
        try {
            if (platform === 'darwin') {
                // macOS: Extract using tar, then copy binary from .app bundle
                execSync(`tar -xf "${archivePath}" -C "${extractedDir}"`, { stdio: 'inherit' });
                const src = path.join(extractedDir, 'Ollama.app', 'Contents', 'Resources', 'ollama');
                if (fs.existsSync(src)) {
                    fs.copyFileSync(src, path.join(RESOURCES_DIR, 'ollama'));
                    execSync(`chmod +x "${path.join(RESOURCES_DIR, 'ollama')}"`);
                } else {
                    console.warn('⚠️  Could not find ollama binary in extracted archive');
                }
            } else if (platform === 'win32') {
                // Windows: Extract using tar (built-in on Windows 10+)
                execSync(`tar -xf "${archivePath}" -C "${extractedDir}"`, { stdio: 'inherit' });
                const src = path.join(extractedDir, 'ollama.exe');
                if (fs.existsSync(src)) {
                    fs.copyFileSync(src, path.join(RESOURCES_DIR, 'ollama.exe'));
                } else {
                    console.warn('⚠️  Could not find ollama.exe in extracted archive');
                }
            } else if (platform === 'linux') {
                // Linux: Extract ollama binary from tgz
                execSync(`tar -xzf "${archivePath}" -C "${extractedDir}"`, { stdio: 'inherit' });
                const src = path.join(extractedDir, 'bin', 'ollama');
                if (fs.existsSync(src)) {
                    fs.copyFileSync(src, path.join(RESOURCES_DIR, 'ollama'));
                    execSync(`chmod +x "${path.join(RESOURCES_DIR, 'ollama')}"`);
                } else {
                    console.warn('⚠️  Could not find ollama binary in extracted archive');
                }
            }

            console.log(`✅ Ollama for ${platform} bundled successfully to ${RESOURCES_DIR}`);
        } catch (e) {
            console.error(`❌ Extraction failed for ${platform}:`, e.message);
        } finally {
            // Cleanup temp for this platform
            removeDirSync(TEMP_DIR);
        }
    }
}

bundleOllama();
