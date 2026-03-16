#!/usr/bin/env node

/**
 * Pre-download and bundle Whisper models for offline distribution
 * This ensures doctors get a ready-to-use app without needing to download models
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');

const streamPipeline = promisify(pipeline);

// Models to pre-download
const MODELS = [
  {
    name: 'faster-whisper-base.en',
    base_url: 'https://huggingface.co/Systran/faster-whisper-base.en/resolve/main/',
    files: [
      'config.json',
      'model.bin',
      'tokenizer.json'
    ],
    dir: 'faster-whisper-base.en'
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
          // Resolve relative redirect URLs against the base URL
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

  const modelDir = path.join(CACHE_DIR, model.dir);
  await ensureDir(modelDir);

  for (const file of model.files) {
    const url = model.base_url + file;
    const filePath = path.join(modelDir, file);

    if (fs.existsSync(filePath)) {
      console.log(`   ✓ ${file} (cached)`);
      continue;
    }

    process.stdout.write(`   📥 ${file}... `);

    try {
      let lastProgress = 0;
      await downloadFile(url, filePath, (downloaded, total) => {
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
      // Clean up partial file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw error;
    }
  }
}

async function createModelIndex() {
  // Not needed for simple file check
}

async function main() {
  console.log('🚀 MediScribe Model Bundler (whisper.cpp)');
  console.log('=========================================');
  console.log('Pre-downloading GGML models for offline use...\n');

  await ensureDir(CACHE_DIR);

  for (const model of MODELS) {
    await downloadModel(model);
  }

  console.log(`\n✅ Model bundling complete!`);
  console.log(`📁 Models cached in: ${CACHE_DIR}`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { downloadModel, createModelIndex };
