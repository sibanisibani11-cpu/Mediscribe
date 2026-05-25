/**
 * generate-icons.js
 * Converts icon.png -> icon.ico (Windows) and icon.icns (macOS) for electron-builder.
 *
 * Run with: node scripts/generate-icons.js
 *
 * Requires: npm install --save-dev sharp png-to-ico
 * (These are lightweight dev-only packages)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC_PNG = path.join(ROOT, 'build', 'icon.png');  // icon lives in build/
const BUILD_DIR = path.join(ROOT, 'build');
const OUT_ICO = path.join(BUILD_DIR, 'icon.ico');

if (!fs.existsSync(SRC_PNG)) {
    console.error('❌  icon.png not found at project root!');
    process.exit(1);
}

if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
}

// ── Install png-to-ico if needed ────────────────────────────────────────────
function ensurePackage(pkg) {
    try {
        require.resolve(pkg);
    } catch {
        console.log(`📦  Installing ${pkg}...`);
        execSync(`npm install --no-save ${pkg}`, { cwd: ROOT, stdio: 'inherit' });
    }
}

ensurePackage('png-to-ico');
ensurePackage('sharp');

const sharp = require('sharp');
// png-to-ico may export as module.exports directly or via .default
const pngToIcoRaw = require('png-to-ico');
const pngToIco = typeof pngToIcoRaw === 'function' ? pngToIcoRaw : pngToIcoRaw.default;

async function generateIco() {
    // Generate several sizes into temporary buffers
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const buffers = await Promise.all(
        sizes.map(size =>
            sharp(SRC_PNG).resize(size, size).png().toBuffer()
        )
    );

    const icoBuffer = await pngToIco(buffers);
    fs.writeFileSync(OUT_ICO, icoBuffer);
    console.log(`✅  icon.ico  → ${OUT_ICO}  (${(icoBuffer.length / 1024).toFixed(1)} KB, sizes: ${sizes.join(', ')})`);
}

generateIco().catch(err => {
    console.error('❌  ICO generation failed:', err.message);
    process.exit(1);
});
