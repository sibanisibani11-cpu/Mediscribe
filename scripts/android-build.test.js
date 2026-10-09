'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { buildAndroid } = require('./build-android');

test('Android sync skips desktop downloads and release signing on every host', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const calls = [];
    buildAndroid({ syncOnly: true, platform, env: { npm_execpath: '/npm-cli.js', TARGET_PLATFORM: platform }, run: (...args) => { calls.push(args); return { status: 0 }; } });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0][1], ['/npm-cli.js', 'run', 'build']);
    assert.deepEqual(calls[1][1].slice(1), ['sync', 'android']);
    for (const call of calls) assert.equal(call[2].env.TARGET_PLATFORM, 'none');
  }
});

test('Android release fails before building when preflight fails', () => {
  const calls = [];
  assert.throws(() => buildAndroid({ env: { npm_execpath: '/npm-cli.js' }, run: (...args) => { calls.push(args); return { status: 1 }; } }), /step failed/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1][1], '--android');
});

test('Android release invokes the host Gradle wrapper with a stable keystore path', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const calls = [];
    buildAndroid({ platform, env: { npm_execpath: '/npm-cli.js', ANDROID_KEYSTORE_PATH: 'android-release.keystore' }, run: (...args) => { calls.push(args); return { status: 0 }; } });
    assert.equal(calls.length, 4);
    const gradle = calls.at(-1);
    assert.equal(gradle[0], platform === 'win32' ? 'cmd.exe' : 'sh');
    assert.match(gradle[1].join(' '), /bundleRelease assembleRelease --no-daemon/);
    assert.equal(gradle[2].cwd, path.resolve(__dirname, '../android'));
    assert.equal(gradle[2].env.ANDROID_KEYSTORE_PATH, path.resolve(__dirname, '../android-release.keystore'));
  }
});

test('Android preflight requires signing and a strictly increasing valid version code without desktop credentials', t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mediscribe-android-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const keystore = path.join(cwd, 'upload.keystore');
  fs.writeFileSync(keystore, 'fixture'); // Preflight checks availability; Gradle verifies the actual signing material.
  const publicKey = crypto.generateKeyPairSync('ed25519').publicKey.export({ format: 'pem', type: 'spki' });
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot || '',
    NEXT_PUBLIC_BACKEND_URL: 'https://example.invalid', ENTITLEMENT_PUBLIC_KEY: publicKey,
    NEXT_PUBLIC_FIREBASE_API_KEY: 'fixture', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'fixture', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'example.invalid',
    ANDROID_KEYSTORE_PATH: keystore, ANDROID_KEYSTORE_PASSWORD: 'fixture', ANDROID_KEY_ALIAS: 'fixture', ANDROID_KEY_PASSWORD: 'fixture',
    ANDROID_VERSION_NAME: '1.2.1', ANDROID_VERSION_CODE: '3', ANDROID_PREVIOUS_VERSION_CODE: '2',
  };
  const check = overrides => spawnSync(process.execPath, [path.join(__dirname, 'check-release-readiness.js'), '--android'], { cwd, env: { ...env, ...overrides }, encoding: 'utf8' });
  const valid = check({});
  assert.equal(valid.status, 0, valid.stderr);
  assert.doesNotMatch(valid.stdout, /desktop Google|macOS signing|Windows signing/);
  for (const overrides of [
    { ANDROID_KEYSTORE_PATH: path.join(cwd, 'missing') }, { ANDROID_KEY_PASSWORD: '' },
    { ANDROID_VERSION_CODE: '2' }, { ANDROID_VERSION_CODE: '0' }, { ANDROID_VERSION_CODE: '2100000001' },
    { ANDROID_PREVIOUS_VERSION_CODE: '' }, { ANDROID_PREVIOUS_VERSION_CODE: '-1' },
  ]) assert.equal(check(overrides).status, 1, JSON.stringify(overrides));
});
