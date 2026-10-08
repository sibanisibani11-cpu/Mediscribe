'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { target, asset, bundleArchive, assertArchitecture, filesUnder, run } = require('./native-assets');
run(async () => {
  const t = target(); if (!t) return;
  if (t.platform === 'win32') {
    const pin = asset('whisper', t.id, 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.2/whisper-bin-x64.zip');
    await bundleArchive('whisper', t, pin, 'zip', async dir => {
      const source = path.join(dir, 'Release');
      const files = ['whisper-server.exe', 'ggml.dll', 'ggml-base.dll', 'ggml-cpu.dll', 'whisper.dll'];
      for (const file of files) {
        assertArchitecture(path.join(source, file), t);
        fs.copyFileSync(path.join(source, file), path.join(t.dir, file));
      }
      if (fs.existsSync(path.join(source, 'SDL2.dll'))) { fs.copyFileSync(path.join(source, 'SDL2.dll'), path.join(t.dir, 'SDL2.dll')); files.push('SDL2.dll'); }
      return files;
    });
  } else {
    if (process.platform !== t.platform) throw Error('Whisper source builds require the target OS');
    const pin = asset('whisper_source', 'all', 'https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.8.2.tar.gz');
    await bundleArchive('whisper', t, pin, 'tar.gz', async dir => {
      const source = path.join(dir, 'whisper.cpp-1.8.2');
      const build = path.join(source, 'build');
      const args = ['-B', build, '-S', source, '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DGGML_NATIVE=OFF', '-DWHISPER_BUILD_TESTS=OFF'];
      if (t.platform === 'darwin') args.push(`-DCMAKE_OSX_ARCHITECTURES=${t.arch === 'x64' ? 'x86_64' : 'arm64'}`, '-DGGML_METAL_EMBED_LIBRARY=ON');
      execFileSync('cmake', args, { stdio: 'inherit' });
      execFileSync('cmake', ['--build', build, '--config', 'Release', '--target', 'whisper-server', '-j', '4'], { stdio: 'inherit' });
      const found = filesUnder(build).find(file => path.basename(file) === 'whisper-server');
      if (!found) throw Error('Compiled whisper-server was not found');
      assertArchitecture(path.join(build, found), t);
      fs.copyFileSync(path.join(build, found), path.join(t.dir, 'whisper-server'));
      fs.chmodSync(path.join(t.dir, 'whisper-server'), 0o755);
      return ['whisper-server'];
    });
  }
});
