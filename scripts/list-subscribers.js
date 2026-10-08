'use strict';
// Read-only canonical payment export. Never infers plans or writes licenses.
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function paymentCSV(payments) {
  const fields = ['id','orderId','uid','billing','currency','amount','amountRefunded','netAmount','status','date','recordedAt','refundedAt'];
  return [fields, ...payments.map(p => {
    const amountRefunded = p.amountRefunded ?? (p.status === 'refunded' ? p.amount : 0);
    const row = { ...p, amountRefunded, netAmount: p.amount - amountRefunded };
    return fields.map(k => row[k]);
  })].map(row => row.map(csvCell).join(',')).join('\r\n');
}
async function fetchPayments(base, token, request = fetch) {
  if (!/^https:\/\//.test(base || '') || !token) throw Error('Set NEXT_PUBLIC_BACKEND_URL and FIREBASE_ADMIN_ID_TOKEN (a short-lived administrator ID token).');
  const payments = [], seen = new Set(); let cursor = null;
  do {
    const url = new URL(base.replace(/\/$/, '') + '/v1/admin/payments');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await request(url, { headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error('Payment export failed (HTTP ' + response.status + ').');
    const data = await response.json();
    if (!data.success || !Array.isArray(data.payments)) throw Error('Invalid payment response.');
    payments.push(...data.payments); cursor = data.nextCursor;
    if (cursor && seen.has(cursor)) throw Error('Repeated pagination cursor.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return payments;
}
async function main() {
  if (process.argv.includes('--sync')) throw Error('--sync has been removed. Use verified backend migration; reports never change access.');
  const payments = await fetchPayments(process.env.NEXT_PUBLIC_BACKEND_URL, process.env.FIREBASE_ADMIN_ID_TOKEN);
  if (process.argv.includes('--csv')) {
    fs.writeFileSync('payments_report.csv', paymentCSV(payments), { mode: 0o600 });
    console.log('Wrote payments_report.csv; monetary amounts are integer currency minor units.');
  } else console.log(JSON.stringify({ amountUnit: 'currency minor units', payments }, null, 2));
}
module.exports = { fetchPayments, paymentCSV };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
