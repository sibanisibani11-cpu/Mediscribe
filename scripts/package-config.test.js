'use strict';
const test = require('node:test');
const { validateConfiguration } = require('app-builder-lib/out/util/config/config');
const { DebugLogger } = require('builder-util');

test('release configuration matches the installed Electron Builder schema', async () => {
  await validateConfiguration(require('../package.json').build, new DebugLogger());
});
