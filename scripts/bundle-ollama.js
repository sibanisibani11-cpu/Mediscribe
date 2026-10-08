'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { target, asset, bundleArchive, filesUnder, assertArchitecture, run } = require('./native-assets');
run(async () => {
  const t = target(); if (!t) return;
  const urls = { darwin: 'https://ollama.com/download/Ollama-darwin.zip', win32: 'https://ollama.com/download/ollama-windows-amd64.zip', linux: 'https://ollama.com/download/ollama-linux-amd64.tgz' };
  const pin = asset('ollama', t.id, urls[t.platform]);
  pin.layoutVersion = 2;
  const extension = new URL(pin.url).pathname.endsWith('.tar.zst') ? 'tar.zst' : t.platform === 'linux' ? 'tgz' : 'zip';
  await bundleArchive('ollama', t, pin, extension, async dir => {
    const source = t.platform === 'darwin' ? path.join(dir, 'Ollama.app/Contents/Resources') : dir;
    const executable = t.platform === 'win32' ? 'ollama.exe' : 'ollama';
    const from = t.platform === 'linux' ? path.join(source, 'bin/ollama') : path.join(source, executable);
    assertArchitecture(from, t);
    fs.copyFileSync(from, path.join(t.dir, executable));
    if (t.platform !== 'win32') fs.chmodSync(path.join(t.dir, executable), 0o755);
    const installed = [executable];
    // Preserve the upstream runtime libraries, including inference runners.
    for (const folder of fs.readdirSync(source).filter(name => fs.statSync(path.join(source, name)).isDirectory())) {
      fs.cpSync(path.join(source, folder), path.join(t.dir, folder), { recursive: true, dereference: true });
      installed.push(...filesUnder(path.join(t.dir, folder)).map(file => path.join(folder, file)));
    }
    for (const entry of fs.readdirSync(source)) if (/\.(dll|dylib|so(?:\.\d+)*)$/.test(entry) || /^llama-/.test(entry) || /LICENSE|NOTICE/.test(entry)) {
      fs.copyFileSync(path.join(source, entry), path.join(t.dir, entry)); installed.push(entry);
    }
    return installed;
  });
});
