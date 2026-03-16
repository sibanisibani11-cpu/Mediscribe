const { google } = require('googleapis');
const { safeStorage, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const app = require('electron').app;
const http = require('http');
const url = require('url');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  'http://localhost:11435/callback' // A port unlikely to be used
);

const SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/userinfo.email'
];

function getTokenFilePath() {
  return path.join(app.getPath('userData'), 'google-token.json');
}

function saveToken(token) {
  try {
    const tokenPath = getTokenFilePath();
    const encryptedToken = safeStorage.encryptString(JSON.stringify(token));
    fs.writeFileSync(tokenPath, encryptedToken);
    oauth2Client.setCredentials(token);
  } catch (e) {
    console.error('Failed to save token:', e);
  }
}

function getToken() {
  try {
    const tokenPath = getTokenFilePath();
    if (fs.existsSync(tokenPath)) {
      const encryptedToken = fs.readFileSync(tokenPath);
      const tokenString = safeStorage.decryptString(encryptedToken);
      const token = JSON.parse(tokenString);
      oauth2Client.setCredentials(token);
      return token;
    }
  } catch (e) {
    console.error('Failed to get token:', e);
  }
  return null;
}

/**
 * Handle OAuth flow by starting a temporary local server
 */
async function authenticateWithGoogle() {
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('YOUR_CLIENT_ID') || !GOOGLE_CLIENT_SECRET || GOOGLE_CLIENT_SECRET.includes('YOUR_CLIENT_SECRET')) {
    throw new Error('Google Cloud Sync credentials (Client ID/Secret) are missing or not configured in your .env file.');
  }

  return new Promise((resolve, reject) => {
    let authWindow = null;
    let resolved = false;

    const server = http.createServer(async (req, res) => {
      try {
        if (req.url.indexOf('/callback') > -1) {
          const qs = new url.URL(req.url, 'http://localhost:11435').searchParams;
          const code = qs.get('code');

          res.setHeader('Content-Type', 'text/html');
          res.end('<html><body style="font-family: sans-serif; text-align: center; padding-top: 50px;"><h1>Authentication successful!</h1><p>You have successfully logged in to MediScribe.</p><p>This window will close automatically.</p><script>setTimeout(() => window.close(), 1000);</script></body></html>');

          server.close();

          const { tokens } = await oauth2Client.getToken(code);
          saveToken(tokens);

          // Fetch user email
          const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
          const userInfo = await oauth2.userinfo.get();

          resolved = true;
          resolve({ success: true, tokens, email: userInfo.data.email });
        }
      } catch (e) {
        res.end('Authentication failed.');
        server.close();
        if (authWindow && !authWindow.isDestroyed()) authWindow.close();
        reject(e);
      }
    }).listen(11435, () => {
      const authorizeUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
      });

      authWindow = new BrowserWindow({
        width: 600,
        height: 800,
        alwaysOnTop: true,
        title: 'Sign in with Google',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      // Use a standard Chrome user agent to avoid "browser not secure" blocks by Google
      const userAgent = process.platform === 'win32'
        ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

      authWindow.loadURL(authorizeUrl, { userAgent });

      authWindow.on('closed', () => {
        server.close();
        if (!resolved) {
          reject(new Error('Authentication window was closed.'));
        }
      });
    });
  });
}

// Flag to ensure token listener is only added once
let isTokenListenerSet = false;

/**
 * Get an authorized drive client
 */
async function getDriveClient() {
  const token = getToken();
  if (!token) return null;

  // Refresh token if needed - only set listener once
  if (!isTokenListenerSet) {
    oauth2Client.on('tokens', (tokens) => {
      console.log('[OAuth] Token refreshed automatically');
      const currentToken = getToken() || {};
      saveToken(Object.assign({}, currentToken, tokens));
    });
    isTokenListenerSet = true;
  }

  return google.drive({ version: 'v3', auth: oauth2Client });
}

function logoutGoogle() {
  try {
    const tokenPath = getTokenFilePath();
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
    oauth2Client.setCredentials(null);
    return true;
  } catch (e) {
    console.error('Failed to logout Google:', e);
    return false;
  }
}

module.exports = {
  authenticateWithGoogle,
  getDriveClient,
  oauth2Client,
  getToken,
  saveToken,
  logoutGoogle
};
