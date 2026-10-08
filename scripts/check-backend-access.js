'use strict';
// Read-only access checks. Never prints tokens, API keys, or payment records.
const fs = require('node:fs');
const path = require('node:path');
const { OAuth2Client } = require('google-auth-library');
const env = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
async function main() {
  const project = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!project || !/^[a-z][a-z0-9-]+$/.test(project)) throw Error('Missing Firebase project ID');
  console.log('Project: ' + project);
  const configFile = path.join(require('node:os').homedir(), '.config/configstore/firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const api = require('/usr/local/lib/node_modules/firebase-tools/lib/api');
  const client = new OAuth2Client(api.clientId(), api.clientSecret());
  client.setCredentials({ refresh_token: config.tokens?.refresh_token });
  try {
    const {token} = await client.getAccessToken();
    for (const [name, url] of [
      ['functions', `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions`],
      ['secrets', `https://secretmanager.googleapis.com/v1/projects/${project}/secrets`],
      ['billing', `https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`],
    ]) {
      const response = await fetch(url, {headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
      const data = await response.json();
      console.log(JSON.stringify({check:name,status:response.status,errorCode:data.error?.status,
        ...(name==='functions'&&response.ok?{functions:(data.functions||[]).map(f=>({name:f.name,state:f.state,uri:f.serviceConfig?.uri}))}:{}),
        ...(name==='secrets'&&response.ok?{names:(data.secrets||[]).map(s=>s.name.split('/').pop())}:{}),
        ...(name==='billing'&&response.ok?{billingEnabled:data.billingEnabled}:{}),
        reasons:data.error?.details?.flatMap(d=>d.reason?[d.reason]:[])}));
    }
  } catch(error) { console.log(JSON.stringify({check:'firebase-login',status:'failed',code:error.response?.data?.error || error.code || error.cause?.code || 'unknown'})); }
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    try {
      const response=await fetch('https://api.razorpay.com/v1/orders?count=1',{headers:{Authorization:'Basic '+Buffer.from(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET).toString('base64')},signal:AbortSignal.timeout(20000)});
      // Discard the body: only authentication status is needed.
      await response.body?.cancel();
      console.log(JSON.stringify({check:'razorpay',mode:env.RAZORPAY_KEY_ID.startsWith('rzp_live_')?'live':'test',status:response.status}));
    } catch(error) { console.log(JSON.stringify({check:'razorpay',status:'failed',code:error.cause?.code || error.code || 'unknown'})); }
  }
}
main().catch(()=>{console.error('Access check could not read local configuration. No secret values were printed.');process.exitCode=1;});
