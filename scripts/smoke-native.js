'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { ROOT, target, asset, downloadVerified, digest, assertArchitecture } = require('./native-assets');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();await new Promise((resolve,reject) => { server.once('error',reject);server.listen(0,'127.0.0.1',resolve); });
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
async function waitReady(url, child) {
  for(let i=0;i<120;i++) {
    if(child.exitCode!==null)throw Error('Native server exited during startup');
    try { const r=await fetch(url,{signal:AbortSignal.timeout(1000)});await r.body?.cancel();if(r.ok)return; } catch {}
    await delay(500);
  }
  throw Error('Native server did not become ready');
}
async function main() {
  const t=target();assert.ok(t && t.platform===process.platform && t.arch===process.arch,'Run native smoke tests on the target OS/architecture');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mediscribe-native-smoke-'));
  const children=[];
  try {
    const manifest=JSON.parse(fs.readFileSync(path.join(t.dir,'native-manifest.json')));
    for(const name of ['ffmpeg','whisper','ollama']) {
      assert.ok(manifest.assets[name]);
      for(const [file,hash] of Object.entries(manifest.assets[name].files))assert.equal(await digest(path.join(t.dir,file)),hash);
    }
    const bin=name=>path.join(t.dir,name+(t.platform==='win32'?'.exe':''));
    for(const name of ['ffmpeg','whisper-server','ollama'])assertArchitecture(bin(name),t);
    const build=execFileSync(bin('ffmpeg'),['-version'],{encoding:'utf8'});
    assert.ok(!/--enable-(nonfree|gpl)/.test(build),'Do not redistribute the old nonfree FFmpeg build');
    const pin=asset('whisper_source','all');const archive=path.join(ROOT,'.cache/native-assets',`whisper-sample-${pin.sha256}.tar.gz`);
    await downloadVerified(pin,archive);
    const sample=execFileSync('tar',['-xOf',archive,'whisper.cpp-1.8.2/samples/jfk.wav'],{maxBuffer:5*1024*1024});
    const original=path.join(dir,'sample.wav'),converted=path.join(dir,'converted.wav');fs.writeFileSync(original,sample);
    execFileSync(bin('ffmpeg'),['-y','-i',original,'-vn','-sn','-map_metadata','-1','-ar','16000','-ac','1','-c:a','pcm_s16le','-f','wav',converted],{stdio:'pipe',timeout:30000});
    assert.ok(fs.statSync(converted).size>1000);console.log('PASS: packaged audio converter processes the upstream speech sample');
    for(const extension of ['webm','m4a']) {
      const output=path.join(dir,'tone-'+extension+'.wav');
      execFileSync(bin('ffmpeg'),['-y','-i',path.join(__dirname,'fixtures','audio-tone.'+extension),'-vn','-sn','-map_metadata','-1','-ar','16000','-ac','1','-c:a','pcm_s16le','-f','wav',output],{stdio:'pipe',timeout:30000});
      assert.ok(fs.statSync(output).size>1000);console.log('PASS: browser audio conversion from '+extension);
    }
    const launch=(name,args,env={})=>{const fd=fs.openSync(path.join(dir,name+'.log'),'w');const child=spawn(bin(name),args,{env:{...process.env,...env},stdio:['ignore',fd,fd]});fs.closeSync(fd);children.push(child);return child;};
    const whisperPort=await freePort();
    const whisper=launch('whisper-server',['-m',path.join(ROOT,'resources/models/ggml-base.en.bin'),'--host','127.0.0.1','--port',String(whisperPort),'-ng']);
    await waitReady(`http://127.0.0.1:${whisperPort}/health`,whisper);
    const form=new FormData();form.append('file',new Blob([fs.readFileSync(converted)],{type:'audio/wav'}),'sample.wav');form.append('response_format','json');
    const response=await fetch(`http://127.0.0.1:${whisperPort}/inference`,{method:'POST',body:form,signal:AbortSignal.timeout(180000)});
    assert.equal(response.status,200);const result=await response.json();assert.match(result.text.toLowerCase(),/ask not/);assert.match(result.text.toLowerCase(),/country/);
    console.log('PASS: base.en performs real speech inference on the upstream sample');
    const ollamaPort=await freePort();const ollama=launch('ollama',['serve'],{OLLAMA_HOST:`127.0.0.1:${ollamaPort}`,OLLAMA_MODELS:path.join(dir,'models'),OLLAMA_NO_CLOUD:'1'});
    await waitReady(`http://127.0.0.1:${ollamaPort}/api/tags`,ollama);
    assert.ok(fs.existsSync(path.join(t.dir,t.platform==='darwin'?'llama-server':'lib')),'Ollama inference runtime missing');
    console.log('PASS: isolated Ollama server responds and inference runtime is packaged');
    console.log('Native smoke tests passed for '+t.id+'. These do not attest microphone permissions, signed installers, Google sign-in, or LLM generation.');
  } finally {
    for(const child of children) { child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(5000)]);if(child.exitCode===null)child.kill('SIGKILL'); }
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
