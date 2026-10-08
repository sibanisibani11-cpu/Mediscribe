const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
const tree = ts.createSourceFile('main.js', main, ts.ScriptTarget.Latest, true);
const cleanupNode = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'cleanTranscriptionText');
const clean = vm.runInNewContext(`(${cleanupNode.getText(tree)})`);
for (const text of ['.5 mg', '-5 mm', '+2', 'Arm (left) pain.', '[left] arm', '≤5 mm', 'Thank you.', 'Copyright discussed.', '中文', 'Line 1\nLine 2']) {
  test(`cleanup preserves ${JSON.stringify(text)}`, () => assert.equal(clean(`  ${text}  `), text));
}
function setup(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediscribe-safety-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const local = path.join(dir, 'data.json');
  fs.writeFileSync(local, '["local"]');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'electron/google-drive-sync.js'), 'utf8'), {
    module, Buffer, require: name => name === './oauth-handler' ? {} : name === 'fs' ? { ...fs, ...overrides } : name === './library-store' ? require('../electron/library-store') : require(name),
    console: { log() {}, warn() {}, error() {} },
  });
  const sync = module.exports;
  sync.initialize = async () => true;
  sync.findFile = async () => ({ id: 'test' });
  sync.drive = { files: { get: async () => ({ data: ['remote'] }) } };
  sync.uploadFile = async () => true;
  return { sync, local, dir };
}
test('failed remote request preserves local file', async t => {
  const { sync, local } = setup(t);
  sync.drive.files.get = async () => { throw Error('offline'); };
  await assert.rejects(sync.downloadFile('user-dictionary.json', local), /offline/);
  assert.equal(fs.readFileSync(local, 'utf8'), '["local"]');
});
test('failed lookup aborts merge instead of uploading over unknown remote state', async t => {
  const { sync, local } = setup(t);
  delete sync.findFile;
  sync.drive.files.list = async () => { throw Error('offline'); };
  let uploaded = false;
  sync.uploadFile = async () => { uploaded = true; return true; };
  await assert.rejects(sync.sync('user-dictionary.json', local), /offline/);
  assert.equal(uploaded, false);
});
for (const data of ['invalid JSON', '{}', '[null]']) {
  test(`invalid remote data ${data} preserves local file`, async t => {
    const { sync, local } = setup(t);
    sync.drive.files.get = async () => ({ data });
    await assert.rejects(sync.sync('user-dictionary.json', local, 'pull'));
    assert.equal(fs.readFileSync(local, 'utf8'), '["local"]');
  });
}
test('failed atomic replacement preserves original and removes temporary file', async t => {
  const { sync, local, dir } = setup(t, { renameSync() { throw Error('write failed'); } });
  await assert.rejects(sync.downloadFile('user-dictionary.json', local), /write failed/);
  assert.equal(fs.readFileSync(local, 'utf8'), '["local"]');
  assert.deepEqual(fs.readdirSync(dir), ['data.json']);
});
test('successful pull writes complete valid JSON', async t => {
  const { sync, local, dir } = setup(t);
  assert.equal(await sync.sync('user-dictionary.json', local, 'pull'), true);
  assert.deepEqual(require('../electron/library-store').values(JSON.parse(fs.readFileSync(local))), ['remote']);
  assert.deepEqual(fs.readdirSync(dir), ['data.json']);
});
test('concurrent template edits reject merge without replacing local data', async t => {
  const { sync, local } = setup(t);
  const template = { id: 'same', name: 'Local', category: 'General', type: 'text', content: 'Example' };
  const original = JSON.stringify([template]);
  fs.writeFileSync(local, original);
  sync.drive.files.get = async () => ({ data: [{ ...template, name: 'Remote' }] });
  await assert.rejects(sync.sync('user-templates.json', local), /conflict/);
  assert.equal(fs.readFileSync(local, 'utf8'), original);
});
test('push reports failed upload', async t => {
  const { sync, local } = setup(t);
  sync.uploadFile = async () => false;
  await assert.rejects(sync.sync('user-dictionary.json', local, 'push'), /upload failed/);
});
test('corrupt local data aborts merge', async t => {
  const { sync, local } = setup(t);
  fs.writeFileSync(local, 'broken');
  await assert.rejects(sync.sync('user-dictionary.json', local));
  assert.equal(fs.readFileSync(local, 'utf8'), 'broken');
});
test('transcription diagnostics do not log transcript variables', () => {
  const logs = [];
  function visit(n) {
    if (ts.isCallExpression(n) && /^(console\.(log|warn|error)|logToFile|safeLog)$/.test(n.expression.getText(tree))) logs.push(n.getText(tree));
    ts.forEachChild(n, visit);
  }
  visit(tree);
  assert.equal(logs.some(line => /Raw Whisper Result|JSON.stringify\(flaggedErrors\)|\$\{(?:finalResult|formatted|result|text.substring|output.trim)\b/.test(line) && !line.includes('[Ollama stdout]') && !line.includes('[Ollama stderr]') && !line.includes('result.length') && !line.includes('finalResult.length')), false);
});
test('partial temporary write never replaces original', async t => {
  const { sync, local, dir } = setup(t, { writeFileSync(destination) {
    fs.writeFileSync(destination, '{partial');
    throw Error('disk full');
  } });
  await assert.rejects(sync.downloadFile('user-dictionary.json', local), /disk full/);
  assert.equal(fs.readFileSync(local, 'utf8'), '["local"]');
  assert.deepEqual(fs.readdirSync(dir), ['data.json']);
});
test('failed merge upload reports failure and retains merged local data for retry', async t => {
  const { sync, local } = setup(t);
  sync.uploadFile = async () => false;
  await assert.rejects(sync.sync('user-dictionary.json', local), /upload failed/);
  assert.deepEqual(require('../electron/library-store').values(JSON.parse(fs.readFileSync(local))), ['local', 'remote']);
});
test('file templates transfer attachments and restore a usable local path', async t => {
  const { sync, local, dir } = setup(t);
  const attachments=path.join(dir,'template-files');fs.mkdirSync(attachments);
  const file=path.join(attachments,'report.txt');fs.writeFileSync(file,'synthetic template');
  const packed=sync.packTemplates(local,[{id:'file1',name:'File',category:'General',type:'file',filePath:file,ext:'txt'}]);
  assert.equal(packed[0].filePath,undefined);
  fs.unlinkSync(file);
  sync.drive.files.get=async()=>({data:packed});
  await sync.sync('user-templates.json',local,'pull');
  const restored=require('../electron/library-store').values(JSON.parse(fs.readFileSync(local)));
  assert.equal(fs.readFileSync(restored[0].filePath,'utf8'),'synthetic template');
});
test('tampered attachments cannot replace local templates', async t => {
  const { sync, local }=setup(t);
  sync.drive.files.get=async()=>({data:[{id:'bad',name:'File',category:'General',type:'file',ext:'txt',attachment:{id:'a'.repeat(64),ext:'txt',base64:Buffer.from('bad').toString('base64')}}]});
  await assert.rejects(sync.sync('user-templates.json',local,'pull'),/checksum/);
  assert.equal(fs.readFileSync(local,'utf8'),'["local"]');
});
