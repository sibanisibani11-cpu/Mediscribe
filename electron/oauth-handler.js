'use strict';
const { google } = require('googleapis');
const { BrowserWindow, shell, app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const config = require('./public-config.json');
let client;
let activeFlow = false;
function getOAuth2Client() {
  if (!client) {
    client = new google.auth.OAuth2(config.googleClientId, config.googleDesktopClientSecret);
    client.on('tokens', tokens => {
      try { saveToken({ ...(getToken() || {}), ...tokens }); } catch { console.error('[OAuth] Could not persist refreshed session'); }
    });
  }
  return client;
}
const oauth2Client = new Proxy({}, { get(_, prop) { const target = getOAuth2Client(); const value = target[prop]; return typeof value === 'function' ? value.bind(target) : value; } });
const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.appdata'];
function tokenFile() { return path.join(app.getPath('userData'), 'google-token.encrypted'); }
function canEncrypt() { return safeStorage.isEncryptionAvailable() && (!safeStorage.getSelectedStorageBackend || safeStorage.getSelectedStorageBackend() !== 'basic_text'); }
function saveToken(token) {
  if (!canEncrypt()) throw new Error('Secure credential storage is unavailable. Configure your operating system keyring.');
  fs.writeFileSync(tokenFile(), safeStorage.encryptString(JSON.stringify(token)), { mode: 0o600 });
  getOAuth2Client().setCredentials(token);
  const old = path.join(app.getPath('userData'), 'google-token.json');
  if (fs.existsSync(old)) fs.unlinkSync(old);
}
function getToken() {
  try {
    if (!canEncrypt() || !fs.existsSync(tokenFile())) return null;
    const token = JSON.parse(safeStorage.decryptString(fs.readFileSync(tokenFile())));
    getOAuth2Client().setCredentials(token);
    return token;
  } catch { return null; }
}
async function authenticateWithGoogle() {
  if (!config.googleClientId) throw new Error('Google desktop sign-in is not configured. Use email sign-in or contact support.');
  if (!canEncrypt()) throw new Error('Secure credential storage is unavailable.');
  if (activeFlow) throw new Error('A Google sign-in is already in progress.');
  activeFlow = true;
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return new Promise((resolve, reject) => {
    let settled = false, exchanging = false, authWindow, redirectUri;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; activeFlow = false; clearTimeout(timer); server.close();
      if (authWindow && !authWindow.isDestroyed()) authWindow.close();
      error ? reject(error) : resolve(result);
    };
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET' || url.pathname !== '/callback') { res.writeHead(404); return res.end('Not found'); }
      if (url.searchParams.get('state') !== state) { res.writeHead(400); return res.end('Invalid sign-in state'); }
      if (settled || exchanging) { res.writeHead(409); return res.end('Sign-in already handled'); }
      if (url.searchParams.has('error')) { res.writeHead(400); res.end('Sign-in cancelled'); return finish(new Error('Google sign-in was cancelled.')); }
      const code = url.searchParams.get('code');
      if (!code) { res.writeHead(400); return res.end('Missing authorization code'); }
      exchanging = true;
      try {
        const oauth = getOAuth2Client();
        const { tokens } = await oauth.getToken({ code, codeVerifier: verifier, redirect_uri: redirectUri });
        const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: config.googleClientId });
        const identity = ticket.getPayload();
        if (!identity?.email || !identity.email_verified) throw new Error('Google account email could not be verified.');
        if (settled) { res.writeHead(408); return res.end('Sign-in expired'); }
        tokens.email = identity.email;
        saveToken(tokens);
        res.end('Sign-in completed. Return to MediScribe.');
        finish(null, { success: true, tokens: { id_token: tokens.id_token }, email: identity.email });
      } catch {
        if (!res.writableEnded) { res.writeHead(400); res.end('Sign-in failed. Return to MediScribe and try again.'); }
        finish(new Error('Google sign-in failed. Please retry.'));
      }
    });
    const timer = setTimeout(() => finish(new Error('Google sign-in timed out. Please retry.')), 180000);
    server.on('error', () => finish(new Error('Could not start the local sign-in callback.')));
    server.listen(0, '127.0.0.1', async () => {
      redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
      const authorizeUrl = getOAuth2Client().generateAuthUrl({ redirect_uri: redirectUri, access_type: 'offline', scope: SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'consent' });
      try {
        authWindow = new BrowserWindow({ width: 440, height: 220, title: 'Google sign-in', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
        authWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        authWindow.webContents.on('will-navigate', event => event.preventDefault());
        await authWindow.loadURL('data:text/html,' + encodeURIComponent('<h2>Complete sign-in in your browser</h2><p>Close this window to cancel.</p>'));
        authWindow.on('closed', () => finish(new Error('Google sign-in cancelled.')));
        await shell.openExternal(authorizeUrl);
      } catch { finish(new Error('Could not open Google sign-in.')); }
    });
  });
}
async function getDriveClient() {
  if (!getToken()) return null;
  return google.drive({ version: 'v3', auth: getOAuth2Client() });
}
function logoutGoogle() {
  for (const file of [tokenFile(), path.join(app.getPath('userData'), 'google-token.json')]) if (fs.existsSync(file)) fs.unlinkSync(file);
  getOAuth2Client().setCredentials({});
  return true;
}
module.exports = { authenticateWithGoogle, getDriveClient, oauth2Client, getToken, saveToken, logoutGoogle };
