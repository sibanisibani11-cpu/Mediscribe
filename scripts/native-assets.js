'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const ROOT = path.resolve(__dirname, '..');
const SUPPORTED = new Set(['darwin-x64', 'darwin-arm64', 'win32-x64', 'linux-x64']);

function target(env = process.env) {
  const platform = env.TARGET_PLATFORM || process.platform;
  const arch = env.TARGET_ARCH || process.arch;
  if (platform === 'none') return null;
  if (!SUPPORTED.has(`${platform}-${arch}`)) throw Error(`Unsupported native target: ${platform}-${arch}`);
  return { platform, arch, id: `${platform}-${arch}`, dir: path.join(ROOT, 'resources/bin', `${platform}-${arch}`) };
}
async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function asset(name, id, url) {
  const prefix = `${name}_${id}`.replace(/[^a-z0-9]/gi, '_').toUpperCase();
  const manifest = JSON.parse(fs.readFileSync(process.env.NATIVE_ASSET_MANIFEST || path.join(ROOT, 'docs/native-asset-pins.json'), 'utf8'));
  const entry = manifest[`${name}/${id}`] || {};
  const sha256 = process.env[`${prefix}_SHA256`] || entry.sha256;
  if (!/^[a-f0-9]{64}$/i.test(sha256 || '')) throw Error(`Missing reviewed SHA-256 pin: ${prefix}_SHA256 (see docs/release-configuration.md)`);
  return { url: process.env[`${prefix}_URL`] || entry.url || url, sha256: sha256.toLowerCase() };
}
async function downloadVerified({ url, sha256 }, destination, fetchImpl = fetch) {
  if (!/^[a-f0-9]{64}$/i.test(sha256 || '')) throw Error('A SHA-256 pin is required');
  if (new URL(url).protocol !== 'https:') throw Error('Native assets must use HTTPS');
  if (fs.existsSync(destination) && await digest(destination) === sha256.toLowerCase()) return destination;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temp = `${destination}.${crypto.randomUUID()}.part`;
  for (let attempt = 0; attempt < 3; attempt++) {
   try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(600000) });
    if (!response.ok || !response.body) throw Object.assign(Error(`Asset download failed: HTTP ${response.status}`), { retryable: response.status === 429 || response.status >= 500 });
    if (response.url && new URL(response.url).protocol !== 'https:') throw Error('Insecure download redirect');
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
    const size = Number(response.headers.get('content-length'));
    if (size && fs.statSync(temp).size !== size) throw Error('Incomplete asset download');
    if (await digest(temp) !== sha256.toLowerCase()) throw Error('Asset SHA-256 mismatch');
    fs.renameSync(temp, destination);
    return destination;
   } catch (error) {
    const retryable = error.retryable || error.name === 'TypeError' || error.name === 'TimeoutError' || error.code === 'ECONNRESET';
    if (!retryable || attempt === 2) throw error;
    console.warn(`Native download interrupted; retrying (${attempt + 2}/3)`);
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
   } finally { fs.rmSync(temp, { force: true }); }
  }
}

// Node 22's recursive cpSync may preserve links despite dereference:true.
// Materialize upstream runtime links as files, confined to the extracted archive.
function copyRuntimeTree(source, destination, archiveRoot = source, ancestors = new Set()) {
  const root = fs.realpathSync(archiveRoot), real = fs.realpathSync(source);
  if (real !== root && !real.startsWith(root + path.sep)) throw Error('Runtime link escapes the archive');
  if (ancestors.has(real)) throw Error('Runtime link cycle');
  if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) fs.unlinkSync(destination);
  const stat = fs.statSync(real);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    const next = new Set(ancestors).add(real);
    for (const entry of fs.readdirSync(real)) copyRuntimeTree(path.join(real, entry), path.join(destination, entry), root, next);
  } else if (stat.isFile()) {
    fs.copyFileSync(real, destination);
    fs.chmodSync(destination, stat.mode & 0o777);
  } else throw Error('Unsupported runtime file type');
}
function binaryArchitectures(file) {
  const fd = fs.openSync(file, 'r');
  const b = Buffer.alloc(8192);
  try { fs.readSync(fd, b, 0, b.length, 0); } finally { fs.closeSync(fd); }
  const cpu = n => ({ 0x01000007: 'x64', 0x0100000c: 'arm64', 0x8664: 'x64', 0xaa64: 'arm64', 62: 'x64', 183: 'arm64' })[n];
  if (b[0] === 0x4d && b[1] === 0x5a) {
    const offset = b.readUInt32LE(60);
    if (offset + 6 > b.length || b.toString('ascii', offset, offset + 4) !== 'PE\0\0') throw Error(`Invalid PE binary: ${file}`);
    return { platform: 'win32', arches: [cpu(b.readUInt16LE(offset + 4))] };
  }
  if (b.toString('hex', 0, 4) === '7f454c46') return { platform: 'linux', arches: [cpu(b[5] === 1 ? b.readUInt16LE(18) : b.readUInt16BE(18))] };
  const magic = b.readUInt32BE(0);
  if ([0xcafebabe, 0xcafebabf].includes(magic)) {
    const count = b.readUInt32BE(4), stride = magic === 0xcafebabf ? 32 : 20;
    if (count > 16) throw Error(`Invalid universal binary: ${file}`);
    return { platform: 'darwin', arches: Array.from({ length: count }, (_, i) => cpu(b.readUInt32BE(8 + i * stride))) };
  }
  if (magic === 0xcffaedfe) return { platform: 'darwin', arches: [cpu(b.readUInt32LE(4))] };
  if (magic === 0xfeedfacf) return { platform: 'darwin', arches: [cpu(b.readUInt32BE(4))] };
  throw Error(`Not a supported executable: ${file}`);
}
function assertArchitecture(file, expected) {
  const actual = binaryArchitectures(file);
  if (actual.platform !== expected.platform || !actual.arches.includes(expected.arch)) throw Error(`Wrong native architecture for ${file}: expected ${expected.id || expected.platform + '-' + expected.arch}`);
}
function filesUnder(dir, relative = '') {
  return fs.readdirSync(path.join(dir, relative), { withFileTypes: true }).flatMap(entry => {
    const rel = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw Error(`Unexpected asset symlink: ${rel}`);
    return entry.isDirectory() ? filesUnder(dir, rel) : [rel];
  });
}
function extract(archive, dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (archive.endsWith('.zip') && process.platform === 'win32') {
    const quote = s => `'${s.replace(/'/g, "''")}'`;
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath ${quote(archive)} -DestinationPath ${quote(dir)}`], { stdio: 'inherit' });
  } else if (archive.endsWith('.zip') && process.platform === 'linux') {
    execFileSync('unzip', ['-q', archive, '-d', dir], { stdio: 'inherit' });
  } else execFileSync('tar', ['-xf', archive, '-C', dir], { stdio: 'inherit' });
}
async function recordAsset(t, name, source, relativeFiles) {
  const manifestPath = path.join(t.dir, 'native-manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { target: t.id, assets: {} };
  const files = {};
  for (const file of relativeFiles) files[file.replace(/\\/g, '/')] = await digest(path.join(t.dir, file));
  manifest.assets[name] = { sourceSha256: source.sha256, layoutVersion: source.layoutVersion || 1, files };
  const temp = `${manifestPath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n');
  fs.renameSync(temp, manifestPath);
}
async function cacheValid(t, name, pin) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(t.dir, 'native-manifest.json'), 'utf8'));
    const record = manifest.assets[name];
    if (manifest.target !== t.id || record.sourceSha256 !== pin.sha256 || (record.layoutVersion || 1) !== (pin.layoutVersion || 1) || !Object.keys(record.files).length) return false;
    for (const [file, hash] of Object.entries(record.files)) if (await digest(path.join(t.dir, file)) !== hash) return false;
    return true;
  } catch { return false; }
}
async function bundleArchive(name, t, source, extension, install) {
  if (await cacheValid(t, name, source)) return;
  const archive = path.join(ROOT, '.cache/native-assets', `${name}-${t.id}-${source.sha256}.${extension}`);
  await downloadVerified(source, archive);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `mediscribe-${name}-`));
  try {
    extract(archive, temp);
    fs.mkdirSync(t.dir, { recursive: true });
    const installed = await install(temp);
    if (!installed.length) throw Error(`No files installed for ${name}`);
    await recordAsset(t, name, source, installed);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
function run(main) { main().catch(error => { console.error(error.message); process.exitCode = 1; }); }
module.exports = { ROOT, target, digest, asset, downloadVerified, copyRuntimeTree, binaryArchitectures, assertArchitecture, filesUnder, extract, recordAsset, cacheValid, bundleArchive, run };
