/**
 * generate-icons.js
 * Converts icon.png -> icon.ico (Windows) and icon.icns (macOS) for electron-builder.
 * Also generates AppX tile assets in build/appx/ for Windows Store compliance.
 *
 * Run with: node scripts/generate-icons.js
 *
 * Requires: npm install --save-dev sharp png-to-ico
 * (These are lightweight dev-only packages)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// In CI, icons are generated in a dedicated job and passed as artifacts.
// The prebuild step sets SKIP_ICON_GENERATION=true to avoid overwriting them.
if (process.env.SKIP_ICON_GENERATION === 'true') {
    console.log('⏭️  SKIP_ICON_GENERATION=true — skipping icon generation (already done in CI).');
    process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const SRC_PNG = path.join(ROOT, 'build', 'icon.png');  // icon lives in build/
const BUILD_DIR = path.join(ROOT, 'build');
const OUT_ICO = path.join(BUILD_DIR, 'icon.ico');
const APPX_DIR = path.join(BUILD_DIR, 'appx');

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

async function generateAppxIcons() {
    if (!fs.existsSync(APPX_DIR)) {
        fs.mkdirSync(APPX_DIR, { recursive: true });
    }

    const appxTargets = [
        { name: 'Square44x44Logo.png', w: 44, h: 44, fit: 'cover' },
        { name: 'Square150x150Logo.png', w: 150, h: 150, fit: 'cover' },
        { name: 'Wide310x150Logo.png', w: 310, h: 150, fit: 'contain' },
        { name: 'StoreLogo.png', w: 50, h: 50, fit: 'cover' },
        { name: 'BadgeLogo.png', w: 24, h: 24, fit: 'cover' },
        { name: 'LargeTile.png', w: 310, h: 310, fit: 'cover' },
        { name: 'SmallTile.png', w: 71, h: 71, fit: 'cover' },
        { name: 'SplashScreen.png', w: 620, h: 300, fit: 'contain' }
    ];

    console.log('🎨  Generating Windows AppX Tile Assets...');
    for (const target of appxTargets) {
        const outPath = path.join(APPX_DIR, target.name);
        await sharp(SRC_PNG)
            .resize(target.w, target.h, {
                fit: target.fit,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png()
            .toFile(outPath);
        console.log(`✅  ${target.name}  → ${outPath} (${target.w}x${target.h})`);
    }
}

async function main() {
    await generateIco();
    await generateAppxIcons();
    console.log('🎉  All icons successfully generated!');
}

main().catch(err => {
    console.error('❌  Icon generation failed:', err.message);
    process.exit(1);
});
