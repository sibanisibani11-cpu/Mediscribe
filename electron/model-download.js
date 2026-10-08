'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
async function downloadModel({ url, destination, minimumSize, fetch, onProgress = () => {} }) {
  if (new URL(url).protocol !== 'https:') throw new Error('Model downloads require HTTPS');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temp = destination + '.' + crypto.randomUUID() + '.partial';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error('Model download failed');
    const total = Number(response.headers.get('content-length') || 0);
    let received = 0, header = Buffer.alloc(0), lastProgress = 0;
    await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (header.length < 4) header = Buffer.concat([header, chunk]).subarray(0, 4);
      if (Date.now() - lastProgress > 500) { onProgress({ downloadedSize: received, totalSize: total, progress: total ? Math.floor(received / total * 100) : 0 }); lastProgress = Date.now(); }
      callback(null, chunk);
    } }), fs.createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
    if (received < minimumSize || (total && received !== total) || header.length !== 4 || header.readUInt32LE(0) !== 0x67676d6c) throw new Error('Incomplete or invalid Whisper model');
    fs.renameSync(temp, destination);
    return { success: true };
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
module.exports = { downloadModel };
