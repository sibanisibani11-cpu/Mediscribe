'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function buildAndroid({ syncOnly = false, env = process.env, platform = process.platform, run = spawnSync } = {}) {
  if (!env.npm_execpath) throw new Error('Run this command through npm run build:android or npm run cap:sync');
  const root = path.resolve(__dirname, '..');
  const androidEnv = { ...env, TARGET_PLATFORM: 'none', SKIP_ICON_GENERATION: 'true' };
  if (androidEnv.ANDROID_KEYSTORE_PATH) androidEnv.ANDROID_KEYSTORE_PATH = path.resolve(root, androidEnv.ANDROID_KEYSTORE_PATH);
  function step(command, args, cwd = root) {
    const result = run(command, args, { cwd, env: androidEnv, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Android build step failed (${result.signal || result.status}): ${path.basename(command)}`);
  }
  if (!syncOnly) step(process.execPath, [path.join(__dirname, 'check-release-readiness.js'), '--android']);
  step(process.execPath, [env.npm_execpath, 'run', 'build']);
  step(process.execPath, [require.resolve('@capacitor/cli/bin/capacitor'), 'sync', 'android']);
  if (!syncOnly) {
    const cwd = path.join(root, 'android');
    if (platform === 'win32') step('cmd.exe', ['/d', '/s', '/c', 'gradlew.bat bundleRelease assembleRelease --no-daemon'], cwd);
    else step('sh', ['gradlew', 'bundleRelease', 'assembleRelease', '--no-daemon'], cwd);
  }
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  try { buildAndroid({ syncOnly: process.argv.includes('--sync-only') }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildAndroid };
