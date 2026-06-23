#!/usr/bin/env node

/**
 * Pre-download and bundle GGML Whisper models for offline distribution.
 * This ensures the app has ready-to-use models (base.en and tiny) out of the box.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');

const streamPipeline = promisify(pipeline);

const MODELS = [
  {
    name: 'ggml-base.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin'
  },
  {
    name: 'ggml-tiny.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin'
  }
];

const CACHE_DIR = path.join(__dirname, '../resources/models');

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function downloadFile(url, filePath, progressCallback, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    const request = https.get(url, (response) => {
      if (response.statusCode === 200) {
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (progressCallback && totalSize) {
            progressCallback(downloadedSize, totalSize);
          }
        });

        const writeStream = fs.createWriteStream(filePath);
        streamPipeline(response, writeStream)
          .then(resolve)
          .catch(reject);
      } else if ([301, 302, 307, 308].includes(response.statusCode)) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          const fullRedirectUrl = new URL(redirectUrl, url).toString();
          downloadFile(fullRedirectUrl, filePath, progressCallback, maxRedirects - 1)
            .then(resolve)
            .catch(reject);
        } else {
          reject(new Error(`Redirect without location header: ${response.statusCode}`));
        }
      } else {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
    }).on('error', reject);

    request.setTimeout(120000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function downloadModel(model) {
  console.log(`\n📦 Downloading model: ${model.name}`);
  const filePath = path.join(CACHE_DIR, model.name);

  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    // Basic verification: check if file is non-empty and at least 50MB
    if (stats.size > 50 * 1024 * 1024) {
      console.log(`   ✓ ${model.name} (cached and valid)`);
      return;
    } else {
      console.log(`   ⚠️  ${model.name} exists but is incomplete or invalid. Re-downloading...`);
      fs.unlinkSync(filePath);
    }
  }

  process.stdout.write(`   📥 ${model.name}... `);

  try {
    let lastProgress = 0;
    await downloadFile(model.url, filePath, (downloaded, total) => {
      if (total) {
        const progress = Math.floor((downloaded / total) * 100);
        if (progress !== lastProgress && progress % 10 === 0) {
          process.stdout.write(`${progress}% `);
          lastProgress = progress;
        }
      }
    });
    console.log('✓');
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw error;
  }
}

async function main() {
  console.log('🚀 MediScribe Model Bundler (whisper.cpp)');
  console.log('=========================================');
  console.log('Pre-downloading GGML models for offline use...\n');

  await ensureDir(CACHE_DIR);

  for (const model of MODELS) {
    try {
      await downloadModel(model);
    } catch (e) {
      console.error(`Failed to download ${model.name}: ${e.message}`);
      // Don't fail the build if download fails, but warn.
    }
  }

  console.log(`\n✅ Model bundling complete!`);
  console.log(`📁 Models cached in: ${CACHE_DIR}`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { downloadModel };
