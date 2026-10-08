// Regression tests for repaired audit findings.
// All app dependencies are stubbed; no customer files, networks, or payments are used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');

function namedFunction(name) {
  const tree = ts.createSourceFile('main.js', source, ts.ScriptTarget.Latest, true);
  const node = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node);
  return vm.runInNewContext(`(${node.getText(tree)})`);
}

function handler(name, globals) {
  const tree = ts.createSourceFile('main.js', source, ts.ScriptTarget.Latest, true);
  let found;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'ipcMain.handle' &&
        node.arguments[0]?.text === name) found = node.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(found, `Handler ${name} exists`);
  let fn;
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} },
    ipcMain: { handle: (name, callback) => { fn = callback; } }, ...globals });
  vm.runInContext(found, context);
  return { fn, context };
}

test('deleting active base model selects an installed alternative', async () => {
  const files = new Set(['base.en', 'tiny']);
  const { fn, context } = handler('delete-model', {
    fs: { existsSync: name => files.has(name), unlinkSync: name => files.delete(name) },
    getModelPath: name => name, path: { ...path, resolve: (...args) => args.length === 1 ? '/test/models/' + args[0] : '/test/models' }, app: { getPath: () => '/test' }, saveModelSelection() {}, currentModel: 'base.en', SUPPORTED_MODELS: [{ name: 'base.en' }, { name: 'tiny' }],
    whisperServerProcess: null, stopHealthCheck() {}, setWhisperServerStatus() {},
    whisperServerRestartCount: 0, setTimeout() {},
  });
  assert.equal((await fn(null, 'base.en')).success, true);
  assert.equal(context.currentModel, 'tiny');
  assert.equal(files.has(context.currentModel), true);
});

for (const name of ['sync-admin-subscriber', 'get-admin-subscribers', 'activate-after-payment', 'activate-app', 'local-sim-signin', 'local-sim-signup']) {
  test(name + ' rejects client-only privilege claims', async () => {
    const { fn } = handler(name, {});
    assert.equal((await fn({}, { email: 'admin@mediapp.store', isActivated: true })).success, false);
  });
}
test('offline cache refuses unsigned claims', async () => {
  const { fn } = handler('save-subscription-cache', { decodeEnvelope: require('../electron/entitlement').decodeEnvelope, publicConfig: { entitlementPublicKey: '' } });
  assert.equal((await fn({}, { email:'test@example.invalid', isActivated:true, expiresAt:'2099-01-01' })).success,false);
});

test('password reset waits for provider acceptance and reports transport failure', async () => {
  const text = fs.readFileSync(path.join(root, 'src/components/auth-page.tsx'), 'utf8');
  const tree = ts.createSourceFile('auth.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleForgotPassword') expression = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  expression = ts.transpileModule('const reset = ' + expression, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nreset();';
  const messages = [];
  let called = false;
  await vm.runInNewContext(expression, { email: 'audit@example.invalid', toast: x => messages.push(x), setIsLoading() {}, requireAuth: () => ({}), sendPasswordResetEmail: async () => { called=true; throw new Error('offline'); } });
  assert.equal(called, true);
  assert.equal(messages[0].title, 'Reset Failed');
});

test('model listeners return exact cleanup functions', () => {
  const ipcRenderer = new EventEmitter();
  let api;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_, value) => { api = value; } }, ipcRenderer }),
    process: { platform: 'darwin' },
  });
  const removeA = api.onDownloadProgress(() => {});
  const removeB = api.onDownloadProgress(() => {});
  assert.equal(ipcRenderer.listenerCount('download-progress'), 2);
  removeA(); assert.equal(ipcRenderer.listenerCount('download-progress'), 1);
  removeB(); assert.equal(ipcRenderer.listenerCount('download-progress'), 0);
});
