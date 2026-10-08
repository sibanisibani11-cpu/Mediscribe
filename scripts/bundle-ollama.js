'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { target, asset, bundleArchive, copyRuntimeTree, filesUnder, assertArchitecture, run } = require('./native-assets');
run(async () => {
  const t = target(); if (!t) return;
  const urls = { darwin: 'https://ollama.com/download/Ollama-darwin.zip', win32: 'https://ollama.com/download/ollama-windows-amd64.zip', linux: 'https://ollama.com/download/ollama-linux-amd64.tgz' };
  const pin = asset('ollama', t.id, urls[t.platform]);
  pin.layoutVersion = 4;
  const extension = new URL(pin.url).pathname.endsWith('.tar.zst') ? 'tar.zst' : t.platform === 'linux' ? 'tgz' : 'zip';
  await bundleArchive('ollama', t, pin, extension, async dir => {
    const manifestFile = path.join(t.dir, 'native-manifest.json');
    if (fs.existsSync(manifestFile)) {
      const old = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      if ((old.assets.ollama?.layoutVersion || 1) < 4) {
        const shared = new Set(Object.entries(old.assets).filter(([name]) => name !== 'ollama').flatMap(([, entry]) => Object.keys(entry.files)));
        for (const relative of Object.keys(old.assets.ollama?.files || {})) {
          const file = path.resolve(t.dir, relative);
          if (!file.startsWith(t.dir + path.sep)) throw Error('Invalid legacy Ollama manifest path');
          if (!shared.has(relative)) fs.rmSync(file, { force: true });
        }
      }
    }
    // Whisper searches its executable directory for GGML backends. Ollama uses
    // another GGML ABI, so its executable and libraries must live separately.
    const runtime = path.join(t.dir, 'ollama-runtime');
    fs.mkdirSync(runtime, { recursive: true });
    const source = t.platform === 'darwin' ? path.join(dir, 'Ollama.app/Contents/Resources') : dir;
    const executable = t.platform === 'win32' ? 'ollama.exe' : 'ollama';
    const from = t.platform === 'linux' ? path.join(source, 'bin/ollama') : path.join(source, executable);
    assertArchitecture(from, t);
    fs.copyFileSync(from, path.join(runtime, executable));
    if (t.platform !== 'win32') fs.chmodSync(path.join(runtime, executable), 0o755);
    const installed = [executable];
    // Preserve the upstream runtime libraries, including inference runners.
    for (const folder of fs.readdirSync(source).filter(name => fs.statSync(path.join(source, name)).isDirectory())) {
      copyRuntimeTree(path.join(source, folder), path.join(runtime, folder), source);
      installed.push(...filesUnder(path.join(runtime, folder)).map(file => path.join(folder, file)));
    }
    for (const entry of fs.readdirSync(source)) if (/\.(dll|dylib|so(?:\.\d+)*)$/.test(entry) || /^llama-/.test(entry) || /LICENSE|NOTICE/.test(entry)) {
      fs.copyFileSync(path.join(source, entry), path.join(runtime, entry)); installed.push(entry);
    }
    return installed.map(file => path.join('ollama-runtime', file));
  });
});
