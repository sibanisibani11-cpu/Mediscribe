const { test } = require('node:test');
const assert = require('node:assert/strict');
const { collectAcquisitions } = require('./sync-msstore-stats');
const env = { PC_TENANT_ID: 'tenant', PC_CLIENT_ID: 'client', PC_CLIENT_SECRET: 'secret', PC_STORE_ID: 'store', PC_START_DATE: '2025-01-01', PC_END_DATE: '2025-01-31' };
const ok = body => ({ ok: true, json: async () => body });

test('sums quantities across pages and produces a repeatable snapshot', async () => {
  const run = async () => {
    const responses = [ok({ access_token: 'token' }), ok({ Value: [{ applicationId: 'store', acquisitionQuantity: 4 }], '@nextLink': 'https://manage.devcenter.microsoft.com/v1.0/my/analytics/appacquisitions?skip=1' }), ok({ Value: [{ applicationId: 'store', acquisitionQuantity: 6 }] })];
    return collectAcquisitions(env, async () => responses.shift());
  };
  assert.equal((await run()).total, 10);
  assert.equal((await run()).total, 10);
});

test('rejects off-domain pagination before sending credentials', async () => {
  let calls = 0;
  await assert.rejects(collectAcquisitions(env, async () => ++calls === 1 ? ok({ access_token: 'token' }) : ok({ Value: [], '@nextLink': 'https://example.com/' })), /pagination/);
  assert.equal(calls, 2);
});

test('failed pages and malformed quantities cannot produce a snapshot', async () => {
  for (const response of [{ ok: false, status: 403 }, ok({ Value: [{ applicationId: 'store', acquisitionQuantity: '4' }] })]) {
    let calls = 0;
    await assert.rejects(collectAcquisitions(env, async () => ++calls === 1 ? ok({ access_token: 'token' }) : response));
  }
});

test('missing settings fail before making network requests', async () => {
  await assert.rejects(collectAcquisitions({}, async () => assert.fail('unexpected request')), /Missing PC_TENANT_ID/);
});
