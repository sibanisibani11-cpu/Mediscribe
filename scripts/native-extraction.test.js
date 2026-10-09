'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function extractionFor(platform, env = {}) {
  const calls = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'native-assets.js'), 'utf8'), {
    module, __dirname, process: { platform, env }, fetch,
    require: name => name === 'node:child_process'
      ? { execFileSync: (...args) => calls.push(args) }
      : name === 'node:fs' ? { mkdirSync() {} } : require(name),
  });
  return { extract: module.exports.extract, calls };
}

test('Windows tar archives use system tar with literal drive paths, independent of PATH', () => {
  for (const extension of ['tar.xz', 'tar.gz', 'tgz']) {
    const { extract, calls } = extractionFor('win32', { SystemRoot: 'C:\\Windows', PATH: 'C:\\Git\\usr\\bin' });
    const archive = `D:\\build files\\source.${extension}`;
    const destination = 'C:\\Temp\\unpacked files';
    extract(archive, destination);
    assert.equal(calls[0][0], 'C:\\Windows\\System32\\tar.exe');
    assert.deepEqual(Array.from(calls[0][1]), ['-xf', archive, '-C', destination]);
  }
});

test('Unix tar archives continue to use platform tar', () => {
  for (const platform of ['darwin', 'linux']) {
    const { extract, calls } = extractionFor(platform);
    extract('/tmp/source.tar.gz', '/tmp/output');
    assert.equal(calls[0][0], 'tar');
  }
});
