#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

async function main() {
  const appxPath = process.argv[2];
  if (!appxPath) {
    console.error('Usage: node publish-msstore.js <path-to-appx>');
    process.exit(2);
  }

  const tenant = process.env.PC_TENANT_ID;
  const clientId = process.env.PC_CLIENT_ID;
  const clientSecret = process.env.PC_CLIENT_SECRET;
  const appId = process.env.PC_STORE_ID;

  if (!tenant || !clientId || !clientSecret || !appId) {
    console.error('Missing Partner Center credentials in environment variables.');
    process.exit(2);
  }

  const fetch = global.fetch || (await import('node-fetch')).default;

  console.log('Requesting access token...');
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://manage.devcenter.microsoft.com/.default'
    })
  });

  if (!tokenRes.ok) {
    console.error('Failed to obtain token', await tokenRes.text());
    process.exit(3);
  }

  const tokenJson = await tokenRes.json();
  const token = tokenJson.access_token;
  if (!token) {
    console.error('No access_token in token response:', tokenJson);
    process.exit(3);
  }

  const baseUrl = 'https://manage.devcenter.microsoft.com/v1.0';

  console.log('Creating new submission...');
  const createRes = await fetch(`${baseUrl}/my/applications/${appId}/submissions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  if (!createRes.ok) {
    console.error('Failed to create submission', await createRes.text());
    process.exit(4);
  }

  const submission = await createRes.json();
  console.log('Submission created:', submission.id || submission.submissionId || submission);

  const submissionId = submission.id || submission.submissionId || submission.submissionId;
  const files = submission.fileUploadUrl || submission.files || submission.packageUploadUrl || submission.filesToUpload || submission.fileUploadUrls || submission['files'] || submission['packageFiles'];

  // Try to locate file upload entries in various shapes
  let uploadEntries = [];
  if (Array.isArray(files)) uploadEntries = files;
  else if (submission.files && Array.isArray(submission.files)) uploadEntries = submission.files;
  else if (submission.fileUploadUrl && typeof submission.fileUploadUrl === 'string') uploadEntries = [{ fileName: path.basename(appxPath), uploadUrl: submission.fileUploadUrl }];

  if (!uploadEntries.length) {
    console.warn('No file upload entries detected in submission response; dumping submission object');
    console.log(JSON.stringify(submission, null, 2));
    console.warn('Attempting to upload directly if an uploadUrl field exists...');
  }

  const appxBuffer = fs.readFileSync(appxPath);

  // If uploadEntries found, match by fileName or upload the first entry
  if (uploadEntries.length) {
    // find entry matching file name
    const fileName = path.basename(appxPath);
    let entry = uploadEntries.find(e => e.fileName === fileName || (e.file && e.file.name === fileName) || (e.name === fileName));
    if (!entry) entry = uploadEntries[0];

    const uploadUrl = entry.uploadUrl || entry.upload_url || entry.url || entry.uploadUri || entry.uploadUri || entry.packageUploadUrl || entry.uploadUrlRaw;
    if (!uploadUrl) {
      console.error('Could not determine upload URL for entry:', entry);
      process.exit(5);
    }

    console.log('Uploading package to uploadUrl...');
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: appxBuffer
    });

    if (!putRes.ok) {
      console.error('Failed to upload package', await putRes.text());
      process.exit(6);
    }

    console.log('Upload completed. Committing submission...');
    const commitRes = await fetch(`${baseUrl}/my/applications/${appId}/submissions/${submissionId}/commit`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!commitRes.ok) {
      console.error('Failed to commit submission', await commitRes.text());
      process.exit(7);
    }

    console.log('Submission committed. Response:', await commitRes.text());
    console.log('Publish request submitted — check Partner Center for processing status.');
    process.exit(0);
  }

  console.error('No known upload path for submission — please inspect the submission object above.');
  process.exit(8);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(99);
});
