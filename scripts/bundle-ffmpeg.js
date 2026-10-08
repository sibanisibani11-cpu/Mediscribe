'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT, target, asset, bundleArchive, assertArchitecture, run } = require('./native-assets');
run(async () => {
  const t = target(); if (!t) return;
  if (process.platform !== t.platform) throw Error('FFmpeg source builds require the target OS');
  const pin = asset('ffmpeg_source', 'all');
  pin.layoutVersion = 3;
  await bundleArchive('ffmpeg', t, pin, 'tar.xz', async dir => {
    const source = path.join(dir, fs.readdirSync(dir).find(name => name.startsWith('ffmpeg-')));
    const args = ['configure', '--disable-autodetect', '--disable-everything', '--disable-doc', '--disable-debug',
      '--disable-network', '--disable-ffplay', '--disable-ffprobe', '--disable-shared', '--enable-static', '--disable-iconv',
      '--disable-x86asm', '--enable-small', '--enable-ffmpeg', '--enable-protocol=file,pipe',
      '--enable-demuxer=matroska,mov,wav,mp3,ogg,flac,aac,aiff',
      '--enable-decoder=opus,vorbis,mp3,mp3float,aac,flac,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,pcm_f64le,pcm_s16be,pcm_s24be,pcm_s32be',
      '--enable-encoder=pcm_s16le', '--enable-muxer=wav', '--enable-filter=aresample,aformat,anull'];
    const env = { ...process.env };
    let shell = 'sh', make = 'make';
    if (t.platform === 'darwin') {
      args.push('--target-os=darwin', '--arch=' + (t.arch === 'arm64' ? 'aarch64' : 'x86_64'), '--cc=clang');
      const arch = t.arch === 'arm64' ? 'arm64' : 'x86_64';
      args.push('--extra-cflags=-arch ' + arch, '--extra-ldflags=-arch ' + arch);
      if (process.arch !== t.arch) args.push('--enable-cross-compile');
    }
    if (t.platform === 'win32') {
      const msys = process.env.MSYS2_ROOT || 'C:\\msys64';
      shell = path.join(msys, 'usr/bin/bash.exe'); make = path.join(msys, 'usr/bin/make.exe');
      const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
      env[pathKey] = path.join(msys, 'mingw64/bin') + ';' + path.join(msys, 'usr/bin') + ';' + (env[pathKey] || '');
      env.MSYSTEM = 'MINGW64';
      args.push('--target-os=mingw32', '--arch=x86_64', '--cc=gcc', '--extra-ldflags=-static');
    }
    execFileSync(shell, args, { cwd: source, env, stdio: 'inherit' });
    execFileSync(make, ['-j', '4', 'ffmpeg' + (t.platform === 'win32' ? '.exe' : '')], { cwd: source, env, stdio: 'inherit' });
    const name = 'ffmpeg' + (t.platform === 'win32' ? '.exe' : '');
    assertArchitecture(path.join(source, name), t);
    fs.copyFileSync(path.join(source, name), path.join(t.dir, name));
    if (t.platform !== 'win32') fs.chmodSync(path.join(t.dir, name), 0o755);
    const licenseDir = path.join(t.dir, 'licenses/ffmpeg');fs.mkdirSync(licenseDir, { recursive: true });
    fs.copyFileSync(path.join(source, 'COPYING.LGPLv2.1'), path.join(licenseDir, 'COPYING.LGPLv2.1'));
    fs.copyFileSync(path.join(ROOT, '.cache/native-assets', `ffmpeg-${t.id}-${pin.sha256}.tar.xz`), path.join(licenseDir, 'source.tar.xz'));
    fs.writeFileSync(path.join(licenseDir, 'BUILD.txt'), 'Unmodified FFmpeg source from ' + pin.url + '\nSHA-256: ' + pin.sha256 + '\nConfigure arguments: ' + JSON.stringify(args.slice(1)) + '\nBuilt with make -j 4. Invoked as a separate audio-conversion executable.\n');
    return [name, 'licenses/ffmpeg/COPYING.LGPLv2.1', 'licenses/ffmpeg/source.tar.xz', 'licenses/ffmpeg/BUILD.txt'];
  });
});
