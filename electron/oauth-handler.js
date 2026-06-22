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
          res.end(`
            <html>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding-top: 50px; background-color: #0f172a; color: #f8fafc;">
                <div style="max-width: 400px; margin: 0 auto; padding: 30px; background: rgba(30, 41, 59, 0.5); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
                  <h1 style="color: #a78bfa; font-size: 24px; margin-bottom: 10px;">Authentication Successful!</h1>
                  <p style="color: #94a3b8; font-size: 15px; line-height: 1.5;">You have successfully logged in to MediScribe.</p>
                  <p style="color: #64748b; font-size: 13px; margin-top: 20px;">You can close this tab and return to the application.</p>
                </div>
                <script>
                  setTimeout(() => {
                    try { window.close(); } catch (e) {}
                  }, 1500);
                </script>
              </body>
            </html>
          `);

          server.close();

          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);

          // Fetch user email
          const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
          const userInfo = await oauth2.userinfo.get();

          tokens.email = userInfo.data.email;
          saveToken(tokens);

          resolved = true;
          if (authWindow && !authWindow.isDestroyed()) {
            authWindow.close();
          }
          resolve({ success: true, tokens, email: userInfo.data.email });
        }
      } catch (e) {
        res.setHeader('Content-Type', 'text/html');
        res.end(`
          <html>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding-top: 50px; background-color: #0f172a; color: #f8fafc;">
              <div style="max-width: 400px; margin: 0 auto; padding: 30px; background: rgba(30, 41, 59, 0.5); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
                <h1 style="color: #ef4444; font-size: 24px; margin-bottom: 10px;">Authentication Failed</h1>
                <p style="color: #94a3b8; font-size: 15px; line-height: 1.5;">An error occurred during authentication. Please try again.</p>
              </div>
            </body>
          </html>
        `);
        server.close();
        if (authWindow && !authWindow.isDestroyed()) {
          authWindow.close();
        }
        reject(e);
      }
    }).listen(11435, async () => {
      const authorizeUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
      });

      // Open standard system browser
      try {
        await shell.openExternal(authorizeUrl);
      } catch (err) {
        console.error('Failed to open external browser:', err);
      }

      // Create a status/fallback window
      authWindow = new BrowserWindow({
        width: 450,
        height: 420,
        resizable: false,
        minimizable: false,
        maximizable: false,
        alwaysOnTop: true,
        title: 'MediScribe Secure Sign-In',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Sign-In</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
              color: #f8fafc;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              overflow: hidden;
              text-align: center;
            }
            .card {
              background: rgba(15, 23, 42, 0.6);
              backdrop-filter: blur(12px);
              border: 1px solid rgba(255, 255, 255, 0.15);
              border-radius: 24px;
              padding: 32px;
              max-width: 360px;
              width: 85%;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.5);
              animation: fadeIn 0.5s ease-out;
            }
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(15px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .logo {
              font-size: 26px;
              font-weight: 800;
              background: linear-gradient(135deg, #a78bfa 0%, #c084fc 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              margin-bottom: 24px;
              letter-spacing: -0.5px;
            }
            h2 {
              font-size: 18px;
              margin: 0 0 12px 0;
              font-weight: 600;
              color: #f1f5f9;
            }
            p {
              font-size: 13px;
              color: #94a3b8;
              line-height: 1.6;
              margin: 0 0 20px 0;
            }
            .spinner {
              border: 3px solid rgba(255, 255, 255, 0.08);
              width: 32px;
              height: 32px;
              border-radius: 50%;
              border-left-color: #c084fc;
              animation: spin 1s linear infinite;
              margin: 0 auto 20px auto;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .btn {
              display: inline-block;
              background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
              color: white;
              border: none;
              padding: 11px 22px;
              font-size: 13px;
              font-weight: 600;
              border-radius: 12px;
              cursor: pointer;
              transition: all 0.2s ease;
              text-decoration: none;
              box-shadow: 0 4px 12px rgba(124, 58, 237, 0.25);
            }
            .btn:hover {
              transform: translateY(-1px);
              box-shadow: 0 8px 16px rgba(124, 58, 237, 0.35);
              background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            }
            .btn:active {
              transform: translateY(0);
            }
            .footer {
              margin-top: 24px;
              font-size: 11px;
              color: #64748b;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="logo">MediScribe</div>
            <div class="spinner"></div>
            <h2>Secure Authentication</h2>
            <p>We have opened Google Sign-In in your system web browser to complete authentication securely.</p>
            <p style="font-size: 12px; margin-bottom: 16px; color: #64748b;">If the page did not load, please click the button below:</p>
            <a href="https://open-browser/" class="btn">Open in Browser</a>
            <div class="footer">
              You can close this window to cancel the login.
            </div>
          </div>
        </body>
        </html>
      `;

      authWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

      authWindow.webContents.on('will-navigate', (event, url) => {
        event.preventDefault();
        shell.openExternal(authorizeUrl);
      });

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
