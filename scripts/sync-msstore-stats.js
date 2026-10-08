// Developer/server utility only. Never bundle Partner Center credentials in the app.
const path = require('node:path');
const admin = require('firebase-admin');

async function collectAcquisitions(env, request = fetch) {
  for (const key of ['PC_TENANT_ID', 'PC_CLIENT_ID', 'PC_CLIENT_SECRET', 'PC_STORE_ID', 'PC_START_DATE']) {
    if (!env[key]) throw new Error(`Missing ${key}; see docs/microsoft-store-analytics-setup.md`);
  }
  const startDate = env.PC_START_DATE;
  const endDate = env.PC_END_DATE || new Date().toISOString().slice(0, 10);
  for (const date of [startDate, endDate]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      throw new Error('Reporting dates must be valid YYYY-MM-DD dates');
    }
  }
  if (startDate > endDate) throw new Error('Start date must not follow end date');
  const tokenResponse = await request(`https://login.microsoftonline.com/${encodeURIComponent(env.PC_TENANT_ID)}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.PC_CLIENT_ID,
      client_secret: env.PC_CLIENT_SECRET, resource: 'https://manage.devcenter.microsoft.com' }),
    signal: AbortSignal.timeout(30000),
  });
  if (!tokenResponse.ok) throw new Error(`Microsoft authentication failed (HTTP ${tokenResponse.status})`);
  const token = await tokenResponse.json();
  if (!token.access_token) throw new Error('Microsoft did not return an access token');
  const endpoint = 'https://manage.devcenter.microsoft.com/v1.0/my/analytics/appacquisitions';
  let url = new URL(endpoint);
  url.search = new URLSearchParams({ applicationId: env.PC_STORE_ID, startDate, endDate,
    top: '10000', groupby: 'date', aggregationLevel: 'day',
    filter: "acquisitionType ne 'Iap' and acquisitionType ne 'Subscription Iap'" }).toString();
  let total = 0;
  let dataFreshnessTimestamp = null;
  const visited = new Set();
  while (url) {
    if (url.origin !== new URL(endpoint).origin || url.pathname !== new URL(endpoint).pathname || visited.has(url.href)) {
      throw new Error('Invalid Microsoft pagination link');
    }
    visited.add(url.href);
    const response = await request(url.href, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Microsoft acquisitions request failed (HTTP ${response.status})`);
    const page = await response.json();
    if (!Array.isArray(page.Value)) throw new Error('Invalid Microsoft acquisitions response');
    for (const row of page.Value) {
      if (row.applicationId !== env.PC_STORE_ID || !Number.isSafeInteger(row.acquisitionQuantity) || row.acquisitionQuantity < 0) {
        throw new Error('Invalid acquisition record');
      }
      total += row.acquisitionQuantity;
    }
    if (page.DataFreshnessTimestamp) dataFreshnessTimestamp = page.DataFreshnessTimestamp;
    url = page['@nextLink'] ? new URL(page['@nextLink'], endpoint) : null;
  }
  return { total, storeId: env.PC_STORE_ID, startDate, endDate, dataFreshnessTimestamp, syncedAt: new Date().toISOString() };
}

async function main() {
  // Kept outside the project because the desktop build includes the project's .env.
  require('dotenv').config({ path: process.env.PC_ENV_FILE || path.join(require('node:os').homedir(), '.config/mediscribe/partner-center.env') });
  const stats = await collectAcquisitions(process.env);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault() });
  // Replace the snapshot only after all pages succeed. Re-running never adds duplicates.
  await admin.firestore().collection('app_stats').doc('microsoft_store').set({ ...stats, acquisitions: stats.total });
  console.log(`Synced ${stats.total} Store acquisitions (${stats.startDate} to ${stats.endDate}). Refresh the app Admin page.`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { collectAcquisitions };
