'use strict';
const path = require('node:path');
const { ROOT, target, asset, downloadVerified, run } = require('./native-assets');
run(async () => {
  const t = target(); if (!t || t.platform !== 'win32') return;
  const file = path.join(ROOT, 'build/vc_redist.x64.exe');
  const pin = asset('vcredist', t.id, 'https://aka.ms/vs/17/release/vc_redist.x64.exe');
  await downloadVerified(pin, file);
  // The Microsoft x64 redistributable uses an x86 bootstrapper. Integrity is
  // checked against the reviewed vendor package pin, not its bootstrapper CPU.
});
