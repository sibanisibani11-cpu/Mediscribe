'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { ROOT, target, asset, downloadVerified, run } = require('./native-assets');
const MODELS = ['ggml-base.en.bin', 'ggml-tiny.bin'];
async function downloadModel(name) {
  const pin = asset(name.replace(/\.bin$/, ''), 'all', `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${name}`);
  const file = path.join(ROOT, 'resources/models', name);
  await downloadVerified(pin, file);
  return [name, pin.sha256];
}
async function main() {
  if (!target()) return;
  const hashes = {};
  for (const name of MODELS) { const [file, hash] = await downloadModel(name); hashes[file] = hash; }
  const file = path.join(ROOT, 'resources/models/model-manifest.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(hashes, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}
if (require.main === module) run(main);
module.exports = { downloadModel };
