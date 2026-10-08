'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { digest, assertArchitecture } = require('./native-assets');
module.exports = async context => {
  const arch = ({0:'ia32',1:'x64',3:'arm64'})[context.arch];
  const platform = context.electronPlatformName;
  if (!arch) throw Error('Unsupported package architecture');
  const root = platform === 'darwin' ? path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app/Contents/Resources') : path.join(context.appOutDir, 'resources');
  execFileSync(process.execPath, [path.join(__dirname,'check-packaged-app.js'),root], {stdio:'inherit'});
  const id = `${platform}-${arch}`, bin = path.join(root,'bin',id);
  const manifest = JSON.parse(fs.readFileSync(path.join(bin,'native-manifest.json'),'utf8'));
  if (manifest.target !== id) throw Error('Native manifest target mismatch');
  for (const name of ['ffmpeg','whisper','ollama']) {
    const entry=manifest.assets[name];
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.sourceSha256) || !Object.keys(entry.files).length) throw Error('Missing native asset manifest: '+name);
    for (const [relative, hash] of Object.entries(entry.files)) {
      const file=path.resolve(bin,relative);
      if (!file.startsWith(bin+path.sep) || await digest(file)!==hash) throw Error('Invalid packaged native asset: '+relative);
    }
    const binary=path.join(bin,name==='ollama'?'ollama-runtime':'.',(name==='whisper'?'whisper-server':name)+(platform==='win32'?'.exe':''));
    assertArchitecture(binary,{platform,arch,id});
    if (platform === process.platform && arch === process.arch) execFileSync(binary,[name==='ffmpeg'?'-version':'--help'],{timeout:30000,stdio:'pipe'});
  }
  const models=path.join(root,'models');
  const modelManifest=JSON.parse(fs.readFileSync(path.join(models,'model-manifest.json'),'utf8'));
  for(const model of ['ggml-base.en.bin','ggml-tiny.bin']) {
    if (!/^[a-f0-9]{64}$/.test(modelManifest[model] || '') || await digest(path.join(models,model))!==modelManifest[model]) throw Error('Invalid packaged model: '+model);
  }
};
