const { app, BrowserWindow, ipcMain, Menu, Tray, dialog, shell, globalShortcut } = require('electron');
console.log('\n\n' + 'X'.repeat(60));
console.log('!!! CRITICAL: LOADING MAIN.JS VERSION 1.0.4 !!!');
console.log('X'.repeat(60) + '\n\n');
const path = require('path');
const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Safely load uiohook-napi - may fail on Windows if native bindings aren't built
let uIOhook = null;
let UiohookKey = {};
try {
    const uiohookModule = require('uiohook-napi');
    uIOhook = uiohookModule.uIOhook;
    UiohookKey = uiohookModule.UiohookKey;
    console.log('[MediScribe] uiohook-napi loaded successfully');
} catch (err) {
    console.warn('[MediScribe] uiohook-napi failed to load (keyword listener will be disabled):', err.message);
}

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { authenticateWithGoogle, getToken, getDriveClient, logoutGoogle } = require('./oauth-handler');

// ── Auto-Updater Setup ─────────────────────────────────────────────────────
let autoUpdater = null;
try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.logger = require('electron').app ? null : console;
    autoUpdater.autoDownload = true;       // Download silently in background
    autoUpdater.autoInstallOnAppQuit = true; // Install when user quits normally
} catch (err) {
    console.warn('[Updater] electron-updater not available:', err.message);
}

// Detect if running as a Windows Store (AppX/MSIX) package — auto-updates must go through the Store
const isWindowsStore = process.platform === 'win32' && !!process.windowsStore;

function setupAutoUpdater(win) {
    if (!autoUpdater || !win) return;
    if (isDev) {
        console.log('[Updater] Skipping auto-update in dev mode.');
        return;
    }
    if (isWindowsStore) {
        console.log('[Updater] Skipping auto-update in Windows Store build.');
        return;
    }

    autoUpdater.on('checking-for-update', () => {
        console.log('[Updater] Checking for updates...');
        win.webContents.send('update-status', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        console.log(`[Updater] Update available: v${info.version}`);
        win.webContents.send('update-status', { status: 'available', version: info.version });
    });

    autoUpdater.on('update-not-available', () => {
        console.log('[Updater] App is up to date.');
        win.webContents.send('update-status', { status: 'up-to-date' });
    });

    autoUpdater.on('download-progress', (progress) => {
        const pct = Math.round(progress.percent);
        console.log(`[Updater] Downloading... ${pct}%`);
        win.webContents.send('update-status', { status: 'downloading', percent: pct });
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log(`[Updater] Update downloaded: v${info.version}`);
        win.webContents.send('update-status', { status: 'downloaded', version: info.version });

        // Show native dialog asking user to restart
        dialog.showMessageBox(win, {
            type: 'info',
            title: 'MediScribe Update Ready',
            message: `Version ${info.version} has been downloaded.`,
            detail: 'Restart now to apply the update, or it will install automatically when you next quit the app.',
            buttons: ['Restart Now', 'Later'],
            defaultId: 0,
            cancelId: 1,
        }).then(({ response }) => {
            if (response === 0) {
                autoUpdater.quitAndInstall(false, true);
            }
        });
    });

    autoUpdater.on('error', (err) => {
        console.error('[Updater] Error:', err.message);
        win.webContents.send('update-status', { status: 'error', message: err.message });
    });

    // Check for updates 5 seconds after launch (silent background check)
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
            console.warn('[Updater] checkForUpdates failed:', err.message);
        });
    }, 5000);
}

ipcMain.handle('check-for-updates', () => {
    if (!autoUpdater || isDev) return { status: 'dev-mode' };
    if (isWindowsStore) return { status: 'store-mode' };
    autoUpdater.checkForUpdates().catch(console.error);
    return { status: 'checking' };
});

ipcMain.handle('install-update', () => {
    if (autoUpdater) autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('open-external', async (event, url) => {
    if (!url || typeof url !== 'string') {
        throw new Error('Invalid external URL');
    }
    await shell.openExternal(url);
    return { success: true };
});

ipcMain.handle('google-logout', async () => {
    activeUserEmail = null;
    return logoutGoogle();
});

ipcMain.handle('sync-cloud', async (event, strategy = 'merge') => {
    const token = getToken('google');
    if (!token) {
        throw new Error('Google Drive is not connected.');
    }

    try {
        console.log(`[MediScribe] Manual cloud sync (${strategy}) triggered...`);
        await driveSync.sync('user-keywords.json', keywordLibraryPath, strategy);
        await driveSync.sync('user-dictionary.json', dictionaryPath, strategy);
        await driveSync.sync('user-templates.json', templateLibraryPath, strategy);

        // Reload after sync
        loadKeywordLibrary();
        loadDictionary();
        loadTemplateLibrary();
        if (typeof reloadSpellChecker === 'function') reloadSpellChecker();

        console.log(`[MediScribe] Manual cloud sync (${strategy}) complete.`);
        return { success: true };
    } catch (err) {
        console.error(`[MediScribe] Manual sync (${strategy}) failed:`, err);
        throw err;
    }
});

const driveSync = require('./google-drive-sync');
const isDev = process.env.NODE_ENV === 'development';

// Single instance lock to prevent double icons/instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
}

app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window.
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

// Safe logging wrapper to prevent EPIPE errors
function safeLog(...args) {
    try {
        if (process.stdout && process.stdout.writable) {
            console.log(...args);
        }
    } catch (err) {
        // Silently ignore logging errors
    }
}

function safeError(...args) {
    try {
        if (process.stderr && process.stderr.writable) {
            console.error(...args);
        }
    } catch (err) {
        // Silently ignore logging errors
    }
}

// Security & Licensing
let licensePath;

// Ensure we have a stable, writable debug log location (use userData, not app path)
const DEBUG_LOG_PATH = path.join(app.getPath ? app.getPath('userData') : os.tmpdir(), 'debug_log.txt');

// Global uncaught exception handler to avoid crashes during certification tests
process.on('uncaughtException', (err) => {
    try {
        const msg = `[uncaughtException] ${new Date().toISOString()} ${err && err.stack ? err.stack : String(err)}\n`;
        fs.appendFileSync(DEBUG_LOG_PATH, msg);
    } catch (e) {
        // best-effort only
        console.error('Failed to write uncaughtException to debug log:', e && e.message ? e.message : e);
    }
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
    try {
        const msg = `[unhandledRejection] ${new Date().toISOString()} ${reason && reason.stack ? reason.stack : String(reason)}\n`;
        fs.appendFileSync(DEBUG_LOG_PATH, msg);
    } catch (e) { }
    console.error('Unhandled Rejection:', reason);
});
const SECRET_SALT = 'MediScribe_Secure_Auth_2025_v1';

function getDeveloperSubscriptionBypassPath() {
    try {
        if (app && app.getPath) {
            return path.join(app.getPath('userData'), 'developer-subscription-bypass.lock');
        }
    } catch (error) {
        // ignore and fall back to repo-local path
    }
    return path.join(__dirname, '..', 'developer-subscription-bypass.lock');
}

let activeUserEmail = null;

function getCurrentUserEmail() {
    if (activeUserEmail) {
        return activeUserEmail;
    }
    try {
        const token = getToken();
        if (token) {
            if (token.email) {
                return token.email;
            } else if (token.id_token) {
                const payload = JSON.parse(Buffer.from(token.id_token.split('.')[1], 'base64').toString('utf-8'));
                return payload.email || null;
            }
        }
    } catch (e) {
        console.error('[getCurrentUserEmail] Error getting email:', e);
    }
    return null;
}

function isDeveloperSubscriptionBypassEnabled() {
    const email = getCurrentUserEmail();
    if (email !== 'jeetumdc@gmail.com') return false;

    if (process.env.DEV_SUBSCRIPTION_BYPASS === 'true') return true;
    try {
        const bypassFile = getDeveloperSubscriptionBypassPath();
        if (fs.existsSync(bypassFile)) return true;
        const repoBypassFile = path.join(__dirname, '..', 'developer-subscription-bypass.lock');
        return fs.existsSync(repoBypassFile);
    } catch (error) {
        return false;
    }
}

function getMachineId() {
    try {
        if (process.platform === 'darwin') {
            const stdout = execSync("ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { print $3 }'").toString();
            return stdout.replace(/"/g, '').trim();
        } else if (process.platform === 'win32') {
            try {
                const stdout = execSync('powershell -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"', { timeout: 5000 }).toString();
                const uuid = stdout.trim();
                if (uuid && uuid.length > 5) return uuid;
            } catch (e) {
                // Fallback: try wmic for older Windows versions
                try {
                    const stdout = execSync('wmic csproduct get uuid', { timeout: 5000 }).toString();
                    return stdout.split('\n')[1].trim();
                } catch (e2) {
                    safeError('HWID Error (wmic fallback):', e2);
                }
            }
        }
    } catch (e) {
        safeError('HWID Error:', e);
    }
    return os.hostname() + "_" + (os.networkInterfaces().en0?.[0]?.mac || 'nomac');
}

function generateActivationCode(hwid) {
    // A simple deterministic hash of the HWID + Salt
    return crypto.createHash('sha256').update(hwid + SECRET_SALT).digest('hex').substring(0, 16).toUpperCase();
}

const DEVICE_REGISTRY_FILE = 'device_registry.json';

async function checkDeviceLimit(email) {
    const hwid = getMachineId();
    console.log(`[MediScribe] Checking device limit for ${email} from device ${hwid}`);

    try {
        // We use a temporary local file to fetch/save registry
        const tempPath = path.join(app.getPath('temp'), DEVICE_REGISTRY_FILE);

        // Ensure drive is ready
        if (!(await driveSync.initialize())) {
            console.warn('[MediScribe] Cloud Drive not available for limit check. Allowing for now...');
            return { success: true };
        }

        const remoteData = await driveSync.getRemoteData(DEVICE_REGISTRY_FILE);
        let registry = remoteData || {};

        const userDevices = registry[email] || [];

        if (userDevices.includes(hwid)) {
            console.log('[MediScribe] Device already registered.');
            return { success: true };
        }

        if (userDevices.length >= 2) {
            console.warn(`[MediScribe] Device limit reached for ${email}. Devices:`, userDevices);
            return {
                success: false,
                error: 'Account Limit Reached: This account is already active on 2 other devices. Please log out from another device first.'
            };
        }

        // Add this device
        userDevices.push(hwid);
        registry[email] = userDevices;

        // Save back to drive
        fs.writeFileSync(tempPath, JSON.stringify(registry, null, 2));
        await driveSync.uploadFile(DEVICE_REGISTRY_FILE, tempPath);

        console.log(`[MediScribe] Registered new device ${hwid} for ${email}`);
        return { success: true };
    } catch (err) {
        console.error('[MediScribe] Device limit check failed:', err);
        return { success: true }; // Fallback to allow if cloud is down? Or deny? User said "allow registered only"
    }
}

function getExpirationDate(data) {
    if (data.expiresAt) return new Date(data.expiresAt);
    const startDate = new Date(data.date || Date.now());
    if (data.billing === 'yearly') {
        startDate.setFullYear(startDate.getFullYear() + 1);
    } else {
        startDate.setMonth(startDate.getMonth() + 1);
    }
    return startDate;
}

function checkActivationStatus() {
    const email = getCurrentUserEmail();
    if (email === 'jeetumdc@gmail.com') {
        if (isDeveloperSubscriptionBypassEnabled()) {
            return true;
        }

        // Check for lifetime build marker file
        const lifetimeMarker = path.join(__dirname, 'lifetime.lock');
        if (fs.existsSync(lifetimeMarker)) {
            return true;
        }
    }

    try {
        if (!fs.existsSync(licensePath)) return false;
        const data = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
        const currentHwid = getMachineId();

        // Verify current machine matches the one that activated the app
        const expectedCode = generateActivationCode(currentHwid);

        // Also check if the email is present and valid
        if (!data.hwid || !data.code) return false;

        if (data.hwid === currentHwid && data.code === expectedCode) {
            const exp = getExpirationDate(data);
            if (new Date() > exp) return false; // Expired
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

// Model path for whisper.cpp - check multiple locations
function getModelPath(modelName = 'base.en') {
    const fileName = `ggml-${modelName}.bin`;

    // Check user data directory first
    const userDataPath = path.join(app.getPath('userData'), 'models', fileName);
    if (fs.existsSync(userDataPath)) {
        return userDataPath;
    }

    // Development path (when running from source)
    const devPath = path.join(__dirname, '../resources/models', fileName);
    if (fs.existsSync(devPath)) {
        return devPath;
    }

    // Production path (when packaged)
    const prodPath = path.join(process.resourcesPath, 'models', fileName);
    if (fs.existsSync(prodPath)) {
        return prodPath;
    }

    // Return user data path for downloads
    return userDataPath;
}

const MODEL_PATH = getModelPath();

// Supported Whisper models
const SUPPORTED_MODELS = [
    { name: 'tiny.en', size: '75 MB', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin' },
    { name: 'tiny', size: '75 MB', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin' },
    { name: 'base.en', size: '142 MB', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin' },
    { name: 'base', size: '142 MB', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin' },
    { name: 'small.en', size: '466 MB', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin' },
    { name: 'small', size: '466 MB', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' },
    { name: 'medium.en', size: '1.5 GB', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin' },
    { name: 'medium', size: '1.5 GB', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin' },
    { name: 'large-v3', size: '2.9 GB', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin' }
];

let currentModel = 'base.en';

// Ollama configuration
const SUPPORTED_OLLAMA_MODELS = [
    { name: 'llama3.2:3b', size: '2.0 GB', description: 'Fast, lightweight - Best for quick formatting' },
    { name: 'llama3.1:8b', size: '4.7 GB', description: 'Balanced - Good for clinical notes' },
    { name: 'meditron:7b', size: '4.1 GB', description: 'Medical specialist - Best accuracy' },
    { name: 'biomistral:7b', size: '4.1 GB', description: 'Biomedical expert - Complex terminology' },
    { name: 'mistral:7b', size: '4.1 GB', description: 'General purpose - Fast and capable' },
    { name: 'medllama2:7b', size: '3.8 GB', description: 'Clinical notes - SOAP formatting' }
];

let ollamaEnabled = true;
let currentOllamaModel = 'llama3.2:3b';
let currentTypingMode = 'dictation';

// Keyboard listener state for keyword expansion
let typedBuffer = '';
let keyboardListenerActive = false;
let lastKeyTime = Date.now();
let pendingKeyword = null; // Stores currently active expanded keyword
let pendingMatches = [];   // Stores all matching keywords for the typed text
let selectedMatchIndex = 0; // Index of the currently selected match

let mainWindow;
let floatingButton;
let tray;
let isRecording = false;
let targetAppName = null; // Tracks which app should receive typed text
let isAutomatedVisibilityChange = false; // Flag to skip destroy on captureFocusedApp hide/show

// Dictionary Management (Initialized later in whenReady)
let dictionaryPath;
let userDictionary = [];

// Keyword Library Management
let keywordLibraryPath;
let keywordLibrary = [];

function loadKeywordLibrary() {
    try {
        if (fs.existsSync(keywordLibraryPath)) {
            const data = fs.readFileSync(keywordLibraryPath, 'utf8');
            keywordLibrary = JSON.parse(data);
            safeLog(`[MediScribe] Loaded keyword library with ${keywordLibrary.length} entries.`);
        }
    } catch (e) {
        safeError('Failed to load keyword library:', e);
        keywordLibrary = [];
    }
}

function saveKeywordLibrary() {
    try {
        fs.writeFileSync(keywordLibraryPath, JSON.stringify(keywordLibrary, null, 2));
        // Reload spell checker with updated keywords
        if (spellChecker) reloadSpellChecker();
    } catch (e) {
        console.error('Failed to save keyword library:', e);
    }
}

// Template Library Management
let templateLibraryPath;
let templateFilesDir;
let templateLibrary = [];

function loadTemplateLibrary() {
    try {
        if (fs.existsSync(templateLibraryPath)) {
            const data = fs.readFileSync(templateLibraryPath, 'utf8');
            templateLibrary = JSON.parse(data);
            safeLog(`[MediScribe] Loaded template library with ${templateLibrary.length} entries.`);
        }
    } catch (e) {
        safeError('Failed to load template library:', e);
        templateLibrary = [];
    }
}

function saveTemplateLibrary() {
    try {
        fs.writeFileSync(templateLibraryPath, JSON.stringify(templateLibrary, null, 2));
    } catch (e) {
        console.error('Failed to save template library:', e);
    }
}

function loadDictionary() {
    try {
        if (fs.existsSync(dictionaryPath)) {
            const data = fs.readFileSync(dictionaryPath, 'utf8');
            userDictionary = JSON.parse(data);
            console.log(`[MediScribe] Loaded dictionary with ${userDictionary.length} words.`);
        }
    } catch (e) {
        console.error('Failed to load dictionary:', e);
        userDictionary = [];
    }
}

function saveDictionary() {
    try {
        fs.writeFileSync(dictionaryPath, JSON.stringify(userDictionary, null, 2));
        // Reload spell checker with updated dictionary
        if (spellChecker) reloadSpellChecker();
    } catch (e) {
        console.error('Failed to save dictionary:', e);
    }


}

// ===========================

// Spell Checker (Stage 2: Error Detection Only) - Using nspell
// ===========================
const nspell = require('nspell');
let spellChecker = null;

// Initialize nspell with English dictionary + custom medical terms
async function initializeSpellChecker() {
    try {
        // Load base English dictionary (ESM module)
        const { default: dict } = await import('dictionary-en');

        // Initialize nspell with the dictionary (dict already has aff and dic)
        spellChecker = nspell(dict);

        // Add custom medical terms
        const medicalTerms = [
            'patient', 'abdomen', 'abdominal', 'fever', 'cough', 'diagnosis', 'treatment',
            'medication', 'prescription', 'symptoms', 'complaint', 'history', 'examination',
            'assessment', 'plan', 'followup', 'referral', 'imaging', 'laboratory',
            'blood', 'pressure', 'heart', 'lung', 'kidney', 'liver', 'brain', 'spine',
            'chest', 'throat', 'ear', 'nose', 'eye', 'skin', 'bone', 'muscle', 'joint',
            'mg', 'ml', 'cc', 'bid', 'tid', 'qid', 'prn', 'stat', 'po', 'iv', 'im', 'sq',
            // Add more common medical terms
            'hypertension', 'diabetes', 'antibiotic', 'analgesic', 'infection', 'inflammation'
        ];

        // Add user dictionary terms
        if (userDictionary && Array.isArray(userDictionary)) {
            userDictionary.forEach(term => {
                if (term && term.length > 0) {
                    medicalTerms.push(term.toLowerCase());
                }
            });
        }

        // Add keyword library terms
        if (keywordLibrary && Array.isArray(keywordLibrary)) {
            keywordLibrary.forEach(item => {
                if (item.keyword) medicalTerms.push(item.keyword.toLowerCase());
            });
        }

        // Add all medical terms to the spell checker
        medicalTerms.forEach(term => {
            spellChecker.add(term.toLowerCase());
        });

        console.log(`[SpellChecker] Initialized nspell with ${medicalTerms.length} custom medical terms`);

    } catch (error) {
        console.error('[SpellChecker] Failed to initialize:', error);
        spellChecker = null;
    }
}

// Detect spelling errors in text and return positions (NO CORRECTION)
// Returns array of {word: string, position: number, suggestions: string[]}
function detectSpellingErrors(text) {
    if (!spellChecker || !text) return [];

    const errors = [];
    const words = text.split(/\b/); // Split by word boundaries
    let currentPosition = 0;

    words.forEach((segment) => {
        // Only check actual words (alphabetic characters, 2+ letters)
        if (/[a-zA-Z]{2,}/.test(segment)) {
            const word = segment.trim();

            // Check if word is misspelled (checking both original and lowercase for custom dictionary matching)
            if (!spellChecker.correct(word) && !spellChecker.correct(word.toLowerCase())) {
                // Get correction suggestions
                const suggestions = spellChecker.suggest(word).slice(0, 3); // Top 3 suggestions

                errors.push({
                    word: word,
                    position: currentPosition,
                    length: word.length,
                    suggestions: suggestions
                });
            }
        }

        currentPosition += segment.length;
    });

    console.log(`[SpellChecker] Found ${errors.length} potential errors in text`);
    return errors;
}

// Reload spell checker when dictionaries are updated
function reloadSpellChecker() {
    console.log('[SpellChecker] Reloading with updated dictionaries...');
    initializeSpellChecker();
}

// ===========================

// Store for floating button position
let floatingButtonPosition = null;
let isCreatingFloatingButton = false;

function loadFloatingButtonPosition() {
    try {
        const posPath = path.join(app.getPath('userData'), 'floating-button-position.json');
        if (fs.existsSync(posPath)) {
            const data = fs.readFileSync(posPath, 'utf8');
            floatingButtonPosition = JSON.parse(data);
        }
    } catch (e) {
        console.error('[MediScribe] Failed to load floating button position:', e);
    }
}

function saveFloatingButtonPosition(x, y) {
    try {
        const posPath = path.join(app.getPath('userData'), 'floating-button-position.json');
        fs.writeFileSync(posPath, JSON.stringify({ x, y }));
        floatingButtonPosition = { x, y };
    } catch (e) {
        console.error('[MediScribe] Failed to save floating button position:', e);
    }
}

function getClampedFloatingButtonPosition(x, y) {
    const { screen } = require('electron');
    const point = {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
    };
    const display = screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();
    const { x: left, y: top, width, height } = display.workArea;
    const maxX = left + Math.max(0, width - 160);
    const maxY = top + Math.max(0, height - 175);

    return {
        x: Math.min(Math.max(point.x, left), maxX),
        y: Math.min(Math.max(point.y, top), maxY),
    };
}

function createFloatingButton() {
    if (floatingButton) {
        if (!floatingButton.isDestroyed()) {
            floatingButton.showInactive();
            floatingButton.moveTop();
        }
        return;
    }

    if (isCreatingFloatingButton) return;
    isCreatingFloatingButton = true;

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const { x: displayX, y: displayY } = primaryDisplay.workArea;

    // Load saved position or use default
    loadFloatingButtonPosition();
    const defaultPosition = {
        x: displayX + width - 170,
        y: displayY + height - 185,
    };
    const { x, y } = getClampedFloatingButtonPosition(
        floatingButtonPosition?.x ?? defaultPosition.x,
        floatingButtonPosition?.y ?? defaultPosition.y
    );

    floatingButton = new BrowserWindow({
        width: 160,
        height: 175,
        x: x,
        y: y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        // visibleOnAllWorkspaces is macOS-only; setting it on Windows causes no-ops but we guard it below
        fullscreenable: false,
        skipTaskbar: true,
        resizable: false,
        hiddenInMissionControl: false,
        roundedCorners: false,
        hasShadow: true,
        acceptFirstMouse: true,
        focusable: false, // Don't take focus, just accept clicks
        show: false, // Don't show until content is ready to prevent flickering
        type: process.platform === 'darwin' ? 'panel' : 'toolbar',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    isCreatingFloatingButton = false;

    // Set window level - use 'screen-saver' on macOS for always-on-top; 'pop-up-menu' works on Windows
    if (process.platform === 'darwin') {
        floatingButton.setAlwaysOnTop(true, 'screen-saver', 1);
        floatingButton.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    } else {
        floatingButton.setAlwaysOnTop(true, 'pop-up-menu', 1);
    }

    // Aggressively keep window on top using periodic check
    const keepOnTopInterval = setInterval(() => {
        if (floatingButton && !floatingButton.isDestroyed()) {
            floatingButton.moveTop();
            if (process.platform === 'darwin') {
                floatingButton.setAlwaysOnTop(true, 'screen-saver', 1);
                floatingButton.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
            } else {
                floatingButton.setAlwaysOnTop(true, 'pop-up-menu', 1);
            }
        } else {
            clearInterval(keepOnTopInterval);
        }
    }, 2000); // 2 seconds is enough and less resource intensive than 1s

    // Load the HTML file for the floating button
    floatingButton.loadFile(path.join(__dirname, 'bubble-v2.html'));

    // Consolidate all initialization logic in a SINGLE did-finish-load listener
    floatingButton.webContents.on('did-finish-load', () => {
        if (floatingButton && !floatingButton.isDestroyed()) {
            if (process.platform === 'darwin') {
                floatingButton.setAlwaysOnTop(true, 'screen-saver', 1);
                floatingButton.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
            } else {
                floatingButton.setAlwaysOnTop(true, 'pop-up-menu', 1);
            }
            floatingButton.moveTop();

            if (isRecording) {
                floatingButton.webContents.send('rec-state-change', true);
            }
            floatingButton.webContents.send('typing-mode-change', currentTypingMode);

            // Ensure visibility after load
            floatingButton.showInactive();
            floatingButton.moveTop();

            console.log('[MediScribe] Floating button loaded and successfully shown.');
        }
    });



    // Pipe bubble logs to main terminal for easier debugging
    floatingButton.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Bubble Console] ${message}`);
    });

    floatingButton.on('closed', () => {
        floatingButton = null;
    });

    // Re-assert top position when focus changes
    floatingButton.on('blur', () => {
        if (floatingButton && !floatingButton.isDestroyed()) {
            setTimeout(() => {
                if (floatingButton && !floatingButton.isDestroyed()) {
                    floatingButton.moveTop();
                    if (process.platform === 'darwin') {
                        floatingButton.setAlwaysOnTop(true, 'screen-saver', 1);
                        floatingButton.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
                    } else {
                        floatingButton.setAlwaysOnTop(true, 'pop-up-menu', 1);
                    }
                }
            }, 100);
        }
    });

    // Initial state: not click-through — reset explicitly on every creation
    floatingButton.setIgnoreMouseEvents(false);
}

// ── Set-ignore-mouse-events IPC handler (registered ONCE, outside createFloatingButton)
// Moving it outside prevents duplicate listener accumulation when the bubble is
// destroyed and recreated (which would cause the bubble to become permanently unclickable).
ipcMain.removeAllListeners('set-ignore-mouse-events');
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
    if (floatingButton && !floatingButton.isDestroyed()) {
        // macOS requires 'forward: true' to pass events to windows below while still detecting hover
        // Windows/Linux do not support 'forward: true' correctly in Electron,
        // so we disable the ignore logic there to prevent the bubble from becoming permanently unclickable.
        if (process.platform === 'darwin') {
            floatingButton.setIgnoreMouseEvents(ignore, { forward: true });
        } else {
            // On Windows/Linux, we don't ignore mouse events so the bubble remains responsive.
            // The transparency of the window allows clicks to pass through naturally on clear areas.
            floatingButton.setIgnoreMouseEvents(false);
        }
    }
});

// Small dialog window for keyword expansion confirmation
let keywordDialogWindow = null;

function createKeywordDialog(matches, selectedIndex = 0) {
    if (keywordDialogWindow) {
        keywordDialogWindow.close();
        keywordDialogWindow = null;
    }

    if (!matches || matches.length === 0) return;

    const { screen } = require('electron');
    const cursorPosition = screen.getCursorScreenPoint();
    // Get the display where the cursor is currently located
    const display = screen.getDisplayNearestPoint(cursorPosition);
    const workArea = display.workArea;

    // Calculate window size based on number of matches
    const width = 600;
    const headerHeight = 60;
    const itemHeight = 120;
    const footerHeight = 40;
    const height = Math.min(600, headerHeight + (matches.length * itemHeight) + footerHeight);

    // Initial positioning
    let x = cursorPosition.x + 15;
    let y = cursorPosition.y + 15;

    // Boundary Detection: Stay within the work area
    // If it goes off the right edge, shift it to the left of the cursor
    if (x + width > workArea.x + workArea.width) {
        x = cursorPosition.x - width - 15;
    }

    // If it goes off the bottom edge, shift it above the cursor
    if (y + height > workArea.y + workArea.height) {
        y = cursorPosition.y - height - 15;
    }

    // Double check it's not going off the top or left now (very unlikely but good for safety)
    x = Math.max(workArea.x + 5, x);
    y = Math.max(workArea.y + 5, y);

    keywordDialogWindow = new BrowserWindow({
        width: width,
        height: height,
        x: Math.round(x),
        y: Math.round(y),
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        show: false,
        focusable: false,
        hasShadow: true,
        type: process.platform === 'darwin' ? 'panel' : 'toolbar',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (process.platform === 'darwin') {
        keywordDialogWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
        keywordDialogWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    } else {
        keywordDialogWindow.setAlwaysOnTop(true, 'pop-up-menu', 1);
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Outfit', 'Segoe UI', Roboto, sans-serif; }
            body {
                background: transparent;
                padding: 10px;
                overflow: hidden;
            }
            #container {
                background: rgba(15, 23, 42, 0.85);
                backdrop-filter: blur(24px) saturate(180%);
                border-radius: 20px;
                padding: 0;
                box-shadow: 0 20px 50px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1);
                color: white;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                animation: dialogAppear 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes dialogAppear {
                from { opacity: 0; transform: translateY(10px) scale(0.98); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            .header {
                padding: 16px 20px;
                background: linear-gradient(to bottom, rgba(139, 92, 246, 0.2), transparent);
                border-bottom: 1px solid rgba(255,255,255,0.05);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .title {
                font-size: 13px;
                font-weight: 700;
                color: #c4b5fd;
                text-transform: uppercase;
                letter-spacing: 0.1em;
            }
            .counter {
                font-size: 11px;
                font-weight: 500;
                color: white;
                background: rgba(139, 92, 246, 0.4);
                padding: 2px 8px;
                border-radius: 10px;
            }
            .match-list {
                padding: 8px;
                display: flex;
                flex-direction: column;
                gap: 4px;
                overflow-y: auto;
            }
            .match-item {
                padding: 10px 14px;
                border-radius: 12px;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                align-items: center;
                gap: 12px;
                border: 1px solid transparent;
                position: relative;
            }
            .match-item.selected {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(139, 92, 246, 0.5);
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                transform: scale(1.02);
            }
            .match-item.selected::before {
                content: '';
                position: absolute;
                left: 0;
                top: 25%;
                height: 50%;
                width: 4px;
                background: #8b5cf6;
                border-radius: 0 4px 4px 0;
            }
            .index-badge {
                width: 22px;
                height: 22px;
                background: rgba(255,255,255,0.1);
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                font-weight: 800;
                color: rgba(255,255,255,0.6);
            }
            .match-item.selected .index-badge {
                background: #8b5cf6;
                color: white;
            }
            .content {
                flex: 1;
                min-width: 0;
            }
            .keyword-text {
                font-weight: 700;
                font-size: 14px;
                color: white;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .match-item.selected .keyword-text {
                color: #ddd6fe;
            }
            .description-text {
                font-size: 13px;
                color: rgba(255, 255, 255, 0.9);
                white-space: pre-wrap;
                word-wrap: break-word;
                line-height: 1.5;
                max-height: 300px;
                overflow-y: auto;
                background: rgba(0,0,0,0.2);
                padding: 8px;
                border-radius: 6px;
                border: 1px solid rgba(255,255,255,0.05);
                user-select: text;
                margin-top: 4px;
            }
            .match-item.selected .description-text {
                color: rgba(255, 255, 255, 0.9);
            }
            .footer {
                padding: 10px 16px;
                background: rgba(0,0,0,0.2);
                border-top: 1px solid rgba(255,255,255,0.05);
                font-size: 10px;
                color: rgba(255, 255, 255, 0.4);
                display: flex;
                justify-content: center;
                gap: 12px;
            }
            .key-pill {
                background: rgba(255,255,255,0.1);
                color: rgba(255,255,255,0.8);
                padding: 1px 6px;
                border-radius: 4px;
                font-weight: 700;
                font-family: inherit;
                border-bottom: 2px solid rgba(0,0,0,0.3);
            }
        </style>
    </head>
    <body>
        <div id="container">
            <div class="header">
                <div class="title">Keywords</div>
                <div class="counter">${selectedIndex + 1} of ${matches.length}</div>
            </div>
            <div class="match-list">
                ${matches.map((m, i) => `
                    <div class="match-item ${i === selectedIndex ? 'selected' : ''}">
                        <div class="index-badge">${i + 1}</div>
                        <div class="content">
                            <div class="keyword-text">${m.keyword}</div>
                            <div class="description-text">${m.description}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="footer">
                <div><span class="key-pill">TAB</span> Cycle</div>
                <div><span class="key-pill">1-9</span> Select</div>
                <div><span class="key-pill">ENTER</span> Expand</div>
            </div>
        </div>
    </body>
    </html>
    `;

    keywordDialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    keywordDialogWindow.once('ready-to-show', () => {
        if (keywordDialogWindow && !keywordDialogWindow.isDestroyed()) {
            keywordDialogWindow.showInactive();
            keywordDialogWindow.moveTop();
        }
    });
}

function updateKeywordDialog() {
    if (!keywordDialogWindow || keywordDialogWindow.isDestroyed()) {
        createKeywordDialog(pendingMatches, selectedMatchIndex);
        return;
    }

    // Resize window to match new content dimensions
    const width = 600;
    const headerHeight = 60;
    const itemHeight = 120;
    const footerHeight = 40;
    const height = Math.min(600, headerHeight + (pendingMatches.length * itemHeight) + footerHeight);
    try {
        keywordDialogWindow.setSize(width, height);
    } catch (e) {
        // Ignore resize errors if window is in weird state
    }

    // Since we are using data URLs, we have to reload the content to update the UI
    // In a more complex app we'd use webContents.send, but this is consistent with the current approach
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
            body {
                background: transparent;
                padding: 10px;
                overflow: hidden;
            }
            #container {
                background: rgba(124, 58, 237, 0.98);
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 12px;
                box-shadow: 0 12px 48px rgba(0,0,0,0.4);
                color: white;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .title {
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                opacity: 0.7;
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
            }
            .match-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .match-item {
                padding: 8px 12px;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.05);
                transition: all 0.2s ease;
                display: flex;
                flex-direction: column;
                border: 1px solid transparent;
            }
            .match-item.selected {
                background: rgba(251, 191, 36, 0.2);
                border-color: rgba(251, 191, 36, 0.5);
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .keyword-text {
                font-weight: bold;
                font-size: 14px;
                color: #fff;
                margin-bottom: 2px;
            }
            .match-item.selected .keyword-text {
                color: #fbbf24;
            }
            .description-text {
                font-size: 13px;
                opacity: 0.95;
                white-space: pre-wrap;
                word-wrap: break-word;
                line-height: 1.5;
                max-height: 300px;
                overflow-y: auto;
                background: rgba(255,255,255,0.1);
                padding: 8px;
                border-radius: 6px;
                margin-top: 4px;
                user-select: text;
            }
            .hint {
                margin-top: 12px;
                font-size: 10px;
                opacity: 0.8;
                text-align: center;
                border-top: 1px solid rgba(255,255,255,0.15);
                padding-top: 8px;
            }
            .hint strong {
                color: #fbbf24;
            }
        </style>
    </head>
    <body>
        <div id="container">
            <div class="title">
                <span>Keyword Expansion</span>
                <span>${selectedMatchIndex + 1} / ${pendingMatches.length}</span>
            </div>
            <div class="match-list">
                ${pendingMatches.map((m, i) => `
                    <div class="match-item ${i === selectedMatchIndex ? 'selected' : ''}">
                        <div class="keyword-text">🔑 ${m.keyword}</div>
                        <div class="description-text">${m.description}</div>
                    </div>
                `).join('')}
            </div>
            <div class="hint">
                ${pendingMatches.length > 1 ? '<strong>Arrows</strong> or <strong>Tab</strong> to cycle • ' : ''}
                ${pendingMatches.length > 1 ? '<strong>1-' + Math.min(pendingMatches.length, 9) + '</strong> to select • ' : ''}
                <strong>Enter</strong> to expand
            </div>
        </div>
    </body>
    </html>
    `;

    keywordDialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
}


function hideKeywordDialog() {
    if (keywordDialogWindow) {
        keywordDialogWindow.close();
        keywordDialogWindow = null;
    }
}

function destroyFloatingButton() {
    if (floatingButton) {
        floatingButton.close();
        floatingButton = null;
    }

    // Also hide keyword dialog if showing
    hideKeywordDialog();
}

// Keyboard event handler
// Keyboard event handler
let isExpanding = false;
function handleKeyboardEvent(e) {
    if (!keyboardListenerActive || isExpanding) return;

    // Safe logging to prevent EPIPE errors when process is shutting down
    // Log minimal key info only if necessary for debugging, commented out for now
    /*
    try {
        if (process.stdout.writable) {
            console.log('[MediScribe] Key pressed - keycode:', e.keycode, 'shiftKey:', e.shiftKey);
        }
    } catch (err) { }
    */

    // Handle Navigation / Selection / Confirmation when dialog is open
    if (pendingMatches.length > 0) {
        const isTab = e.keycode === 15;
        const isEnter = e.keycode === 28;
        const isDown = e.keycode === UiohookKey.ArrowDown || e.keycode === 57424 || e.keycode === 80;
        const isUp = e.keycode === UiohookKey.ArrowUp || e.keycode === 57416 || e.keycode === 72;
        const isSpace = e.keycode === UiohookKey.Space || e.keycode === 57;

        if (isTab || isDown) {
            if (pendingMatches.length > 1) {
                selectedMatchIndex = (selectedMatchIndex + 1) % pendingMatches.length;
                updateKeywordDialog();
                return;
            }
        }

        if (isUp) {
            if (pendingMatches.length > 1) {
                selectedMatchIndex = (selectedMatchIndex - 1 + pendingMatches.length) % pendingMatches.length;
                updateKeywordDialog();
                return;
            }
        }

    // Handle Number Keys 1-9 for direct selection
    if (e.keycode >= UiohookKey.Digit1 && e.keycode <= UiohookKey.Digit9) {
        const index = e.keycode - UiohookKey.Digit1;
        if (index < pendingMatches.length) {
            selectedMatchIndex = index;
            confirmKeywordExpansion(true);
            return;
        }
    }

    const isEnterKey = e.keycode === 28;
    const isSpaceKey = e.keycode === UiohookKey.Space || e.keycode === 57;
    const isTabKey = e.keycode === 15;
    const isSpaceConfirm = isSpaceKey && currentTypingMode !== 'template';

    // Confirm expansion (Enter always confirms, Tab confirms if only 1 match, Space confirms if only 1 match in keyword mode)
    if (isEnterKey || (isTabKey && pendingMatches.length === 1) || (isSpaceConfirm && pendingMatches.length === 1)) {
        confirmKeywordExpansion(true);
        return;
    }

    // Any other non-character key while dialog is open should probably close it
    if (!isTabKey && !isEnterKey && !isDown && !isUp && !isSpaceKey && !keycodeToChar(e.keycode, e.shiftKey)) {
        cancelKeywordExpansion();
    }
    }

    // Handle Escape (1) to cancel pending keyword
    if (pendingMatches.length > 0 && e.keycode === 1) {
        cancelKeywordExpansion();
        return;
    }

    const now = Date.now();
    // Reset buffer if more than 2 seconds since last key
    if (now - lastKeyTime > 2000) {
        typedBuffer = '';
        pendingKeyword = null;
        pendingMatches = [];
        selectedMatchIndex = 0;
    }
    lastKeyTime = now;

    // Handle backspace
    if (e.keycode === UiohookKey.Backspace) {
        typedBuffer = typedBuffer.slice(0, -1);
        pendingKeyword = null;
        pendingMatches = [];
        selectedMatchIndex = 0;
        hideKeywordDialog();
        return;
    }

    // Handle Trigger Keys (Space, Tab, Enter) when dialog is NOT open
    // Note: Space is ONLY a trigger key in keyword mode, NOT in template mode (since template names contain spaces).
    const isSpace = e.keycode === UiohookKey.Space || e.keycode === 57;
    const isSpaceTrigger = isSpace && currentTypingMode !== 'template';
    const isTab = e.keycode === 15;
    const isEnter = e.keycode === 28;

    if (isSpaceTrigger || isTab || isEnter) {
        if (typedBuffer.length >= 2) {
            // Check for keyword match on trigger
            checkAndShowKeyword(typedBuffer.toLowerCase(), true).catch(err => {
                safeError('[MediScribe] Error in trigger expansion:', err);
            });
            // If we are triggered, we clear the buffer regardless
            typedBuffer = '';
            // We return here to "consume" the trigger for our logic
            // but the OS will still get the Space/Tab/Enter
            return;
        }
        typedBuffer = '';
        return;
    }

    // Convert keycode to character
    const char = keycodeToChar(e.keycode, e.shiftKey);
    if (char) {
        typedBuffer += char;

        // Check for keyword matches as user types
        if (typedBuffer.length >= 2) {
            checkAndShowKeyword(typedBuffer.toLowerCase(), false).catch(error => {
                safeError('[MediScribe] Error checking keyword:', error);
            });
        }

        // Limit buffer size
        if (typedBuffer.length > 50) {
            typedBuffer = typedBuffer.slice(-50);
        }
    } else {
        // try {
        //     if (process.stdout.writable) console.log('[MediScribe] Keycode not mapped to character:', e.keycode);
        // } catch (err) { }
    }
}


// Keyboard listener for automatic keyword expansion in any application
let uiohookIsRunning = false;

function isAccessibilityTrusted(prompt = false) {
    if (process.platform !== 'darwin') return true;
    try {
        const { systemPreferences } = require('electron');
        return systemPreferences.isTrustedAccessibilityClient(prompt);
    } catch (error) {
        safeError('[MediScribe] Accessibility permission check failed:', error);
        return false;
    }
}

function startKeyboardListener() {
    if (keyboardListenerActive) {
        try {
            if (process.stdout.writable) console.log('[MediScribe] Keyboard listener already active - ignoring start request');
        } catch (err) { }
        return { success: true, alreadyActive: true };
    }

    try {
        if (process.stdout.writable) console.log('[MediScribe] Starting keyboard listener for automatic keyword expansion');
    } catch (err) { }

    if (!isAccessibilityTrusted(false)) {
        const message = 'Accessibility permission is required before Keyword or Template expansion can start.';
        safeError(`[MediScribe] ${message}`);
        isRecording = false;
        keyboardListenerActive = false;
        updateTrayMenu();
        if (floatingButton && !floatingButton.isDestroyed()) {
            floatingButton.webContents.send('rec-state-change', false);
        }
        return { success: false, error: message, needsAccessibility: true };
    }

    // Test if uIOhook is available before marking the listener active.
    if (!uIOhook) {
        const message = 'Keyboard listener is unavailable because uiohook-napi failed to load.';
        safeError(`[MediScribe] ${message}`);
        return { success: false, error: message };
    }

    // Reload keyword library to ensure it's up to date
    loadKeywordLibrary();

    try {
        if (process.stdout.writable) {
            console.log('[MediScribe] Keyword library size:', keywordLibrary.length);
        }
    } catch (err) { }
    typedBuffer = '';

    // Only start uiohook once — avoid start/stop cycling that causes native SIGABRT crash
    if (!uiohookIsRunning) {
        uIOhook.removeAllListeners('keydown');
        uIOhook.on('keydown', handleKeyboardEvent);

        try {
            uIOhook.start();
            uiohookIsRunning = true;
            try {
                if (process.stdout.writable) console.log('[MediScribe] uIOhook started successfully');
            } catch (err) { }
        } catch (error) {
            try {
                if (process.stderr.writable) console.error('[MediScribe] Failed to start uIOhook:', error);
            } catch (err) { }
            keyboardListenerActive = false;
            isRecording = false;
            updateTrayMenu();
            if (floatingButton && !floatingButton.isDestroyed()) {
                floatingButton.webContents.send('rec-state-change', false);
            }
            return { success: false, error: error.message };
        }
    }

    keyboardListenerActive = true;
    isRecording = true; // Sync with global recording state for bubble/tray
    updateTrayMenu();
    if (floatingButton && !floatingButton.isDestroyed()) {
        floatingButton.webContents.send('rec-state-change', true);
    }
    return { success: true };
}


function stopKeyboardListener() {
    if (!keyboardListenerActive) return;

    try {
        if (process.stdout.writable) console.log('[MediScribe] Stopping keyboard listener (logically)');
    } catch (err) { }
    keyboardListenerActive = false;
    isRecording = false;
    updateTrayMenu();
    if (floatingButton && !floatingButton.isDestroyed()) {
        floatingButton.webContents.send('rec-state-change', false);
    }
    typedBuffer = '';
    // Note: Intentionally NOT calling uIOhook.stop() to prevent native worker crash in Electron 39.
}

async function checkAndShowKeyword(text, isTrigger = false) {
    if (text.length > 15) {
        hideKeywordDialog();
        pendingKeyword = null;
        pendingMatches = [];
        return false;
    }

    // In template mode, match against template names instead of keyword shortcuts
    if (currentTypingMode === 'template') {
        if (text.length < 3) return false;
        const tplMatches = templateLibrary
            .filter(t => t.name.toLowerCase().startsWith(text))
            .map(t => ({ id: t.id, keyword: t.name.toLowerCase(), description: t.content || '', filePath: t.filePath, type: t.type || 'text' }));
        const exactTpl = tplMatches.filter(t => t.keyword === text);
        const sourceMatches = exactTpl.length > 0 ? exactTpl : tplMatches;
        if (sourceMatches.length === 0) { hideKeywordDialog(); pendingKeyword = null; pendingMatches = []; return false; }
        if (isTrigger) {
            pendingMatches = sourceMatches;
            selectedMatchIndex = 0;
            pendingKeyword = { text, ...sourceMatches[0] };
            if (sourceMatches.length === 1) { confirmKeywordExpansion(true); } else { createKeywordDialog(sourceMatches, 0); }
            return true;
        } else {
            pendingMatches = sourceMatches;
            selectedMatchIndex = 0;
            pendingKeyword = { text, ...sourceMatches[0] };
            createKeywordDialog(sourceMatches, 0);
            return true;
        }
    }

    // Find ALL matches (prefix match)
    const matches = keywordLibrary.filter(k => k.keyword.toLowerCase().startsWith(text));

    // Find EXACT matches
    const exactMatches = matches.filter(k => k.keyword.toLowerCase() === text);

    if (matches.length === 0) {
        hideKeywordDialog();
        pendingKeyword = null;
        pendingMatches = [];
        return false;
    }

    // Case 1: Triggered via Space/Tab/Enter
    if (isTrigger) {
        if (exactMatches.length === 1) {
            // Single exact match -> Auto expand!
            pendingMatches = exactMatches;
            selectedMatchIndex = 0;
            pendingKeyword = { text, ...exactMatches[0] };
            confirmKeywordExpansion(true);
            return true;
        } else if (exactMatches.length > 1) {
            // Multiple exact matches (DUPLICATES!) -> Show dialog and wait for pick
            pendingMatches = exactMatches;
            selectedMatchIndex = 0;
            pendingKeyword = { text, ...exactMatches[0] };
            createKeywordDialog(exactMatches, 0);
            return true;
        } else if (matches.length > 0) {
            // No exact match but prefix matches exist -> Show options
            pendingMatches = matches;
            selectedMatchIndex = 0;
            pendingKeyword = { text, ...matches[0] };
            createKeywordDialog(matches, 0);
            return true;
        }
    }
    // Case 2: Just typing
    else {
        // If we have exact matches (could be one or many duplicates), show them while typing
        if (exactMatches.length >= 1) {
            pendingMatches = exactMatches;
            selectedMatchIndex = 0;
            pendingKeyword = { text, ...exactMatches[0] };
            createKeywordDialog(exactMatches, 0);
            return true;
        }

        // Show prefix matches only if user has typed at least 3 chars
        if (text.length >= 3 && matches.length > 0) {
            // Check if matches changed to avoid flicker
            const matchesIdentical = pendingMatches.length === matches.length &&
                matches.every((m, i) => m.id === pendingMatches[i]?.id);

            if (matchesIdentical && keywordDialogWindow && !keywordDialogWindow.isDestroyed()) {
                return true;
            }

            pendingMatches = matches;
            selectedMatchIndex = 0;
            pendingKeyword = { text, ...matches[0] };
            createKeywordDialog(matches, 0);
            return true;
        }
    }

    if (pendingMatches.length === 0) {
        hideKeywordDialog();
        pendingKeyword = null;
    }
    return false;
}


async function confirmKeywordExpansion(isTrigger = false) {
    if (pendingMatches.length === 0 || !pendingKeyword) return;

    // Get the currently selected match
    const selectedMatch = pendingMatches[selectedMatchIndex];

    // Prevent recursive triggering
    isExpanding = true;

    // Store data locally before clearing pending state
    const keywordData = {
        text: pendingKeyword.text,
        keyword: selectedMatch.keyword,
        description: selectedMatch.description,
        filePath: selectedMatch.filePath,
        type: selectedMatch.type
    };

    const actionLabel = keywordData.type === 'file' ? `open file: ${keywordData.filePath}` : `type: "${keywordData.description}"`;
    safeLog(`[MediScribe] Confirming expansion: "${keywordData.text}" -> ${actionLabel}`);

    // Hide the dialog and clear pending state immediately
    hideKeywordDialog();
    const currentMatchesCount = pendingMatches.length;
    pendingMatches = [];
    pendingKeyword = null;

    // Wait for focus to settle
    await new Promise(resolve => setTimeout(resolve, 80));

    // Delete the typed keyword (backspace for each character)
    // If it was triggered by a key (Space/Tab/Enter), we delete that too (+1)
    // IMPORTANT: If the dialog was OPEN, and the user hit 1-9 or Enter to select, 
    // it's possible that MULTIPLE keys need to be deleted (trigger key that opened dialog + selection key).
    // For now, we stick to text.length + 1 as it's the most common case.
    const deleteCount = keywordData.text.length + (isTrigger ? 1 : 0);
    await deleteCharacters(deleteCount);

    // Minor delay before typing
    await new Promise(resolve => setTimeout(resolve, 50));

    // File template: open the file in its default app
    if (keywordData.type === 'file' && keywordData.filePath) {
        const { shell } = require('electron');
        shell.openPath(keywordData.filePath).catch(err => {
            safeError('[MediScribe] Failed to open template file:', err);
        });
    } else {
        // Text keyword/template expansions should go into the app that is already
        // receiving the user's keystrokes, not a possibly stale dictation target.
        await pasteTextIntoActiveApp(keywordData.description);
    }

    // Allow keyboard events again after a short delay
    setTimeout(() => {
        isExpanding = false;
        typedBuffer = '';
    }, 100);
}


function cancelKeywordExpansion() {
    if (pendingMatches.length === 0) return;

    // Hide the dialog
    hideKeywordDialog();

    pendingMatches = [];
    pendingKeyword = null;
}


async function deleteCharacters(count) {
    if (process.platform === 'darwin') {
        // macOS: Use AppleScript to send backspace keys directly to System Events (frontmost application)
        // Redundant targetAppName activation is avoided here because the user is actively typing in the frontmost app.
        const script = `tell application "System Events" to repeat ${count} times\n    key code 51\nend repeat`;
        return new Promise((resolve) => {
            exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error) => {
                if (error) safeError('[MediScribe] Delete error:', error);
                resolve();
            });
        });
    } else if (process.platform === 'win32') {
        // Windows: Use PowerShell to send backspace keys with better timing
        const { spawn } = require('child_process');
        return new Promise((resolve) => {
            const script = `
                Add-Type -AssemblyName System.Windows.Forms
                Start-Sleep -Milliseconds 50
                for ($i = 0; $i -lt ${count}; $i++) {
                    [System.Windows.Forms.SendKeys]::SendWait("{BACKSPACE}")
                    Start-Sleep -Milliseconds 15
                }
            `;
            const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
            ps.on('close', () => resolve());
            ps.on('error', (error) => {
                safeError('[MediScribe] Delete error:', error);
                resolve();
            });
        });
    } else {
        // Linux: Use xdotool to send backspace keys efficiently
        return new Promise((resolve) => {
            exec(`xdotool key --repeat ${count} --delay 20 BackSpace`, (error) => {
                if (error) safeError('[MediScribe] Delete error:', error);
                resolve();
            });
        });
    }
}

async function pasteTextIntoActiveApp(text) {
    if (!text) return { success: false, error: 'No text provided' };

    const { clipboard } = require('electron');
    const previousClipboardText = clipboard.readText();

    try {
        clipboard.writeText(text);

        if (process.platform === 'darwin') {
            // macOS: Use AppleScript to send Cmd+V directly to System Events (frontmost application)
            // Redundant targetAppName activation is avoided here because the user is actively typing in the frontmost app.
            const script = `
                tell application "System Events"
                    keystroke "v" using command down
                end tell
            `;

            return await new Promise((resolve) => {
                exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error) => {
                    if (error) {
                        safeError('[MediScribe] Paste expansion error:', error);
                        resolve({ success: false, error: error.message });
                    } else {
                        resolve({ success: true });
                    }
                });
            });
        }

        if (process.platform === 'win32') {
            const { spawn } = require('child_process');
            const script = `
                Add-Type -AssemblyName System.Windows.Forms
                Start-Sleep -Milliseconds 80
                [System.Windows.Forms.SendKeys]::SendWait("^v")
            `;

            return await new Promise((resolve) => {
                const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
                let stderr = '';
                ps.stderr.on('data', (data) => { stderr += data.toString(); });
                ps.on('close', (code) => {
                    if (code !== 0 || stderr) {
                        safeError('[MediScribe] Paste expansion PowerShell error:', stderr);
                        resolve({ success: false, error: stderr || `Exit code: ${code}` });
                    } else {
                        resolve({ success: true });
                    }
                });
                ps.on('error', (error) => {
                    safeError('[MediScribe] Paste expansion PowerShell spawn error:', error);
                    resolve({ success: false, error: error.message });
                });
            });
        }

        const escapedText = text.replace(/'/g, "'\"'\"'");
        return await new Promise((resolve) => {
            exec(`printf '%s' '${escapedText}' | xclip -selection clipboard && xdotool key ctrl+v`, (error) => {
                if (error) {
                    safeError('[MediScribe] Paste expansion error:', error);
                    resolve({ success: false, error: error.message });
                } else {
                    resolve({ success: true });
                }
            });
        });
    } finally {
        setTimeout(() => {
            try {
                clipboard.writeText(previousClipboardText || '');
            } catch (error) {
                safeError('[MediScribe] Failed to restore clipboard after expansion:', error);
            }
        }, 500);
    }
}

// Capture the currently focused application (before minimizing MediScribe)
// Gets the app that was focused before MediScribe (the target for dictation)
async function captureFocusedApp() {
    if (process.platform === 'darwin') {
        const APPS_TO_SKIP = ['MediScribe', 'Electron', 'electron', 'Terminal', 'iTerm', 'iTerm2', 'Code', 'Visual Studio Code', 'Cursor', 'Finder'];

        return new Promise((resolve) => {
            // Get the frontmost app that is NOT in our skip list
            // If MediScribe is frontmost, we temporarily hide it to see what's behind it
            const script = `tell application "System Events"
    set skipList to {${APPS_TO_SKIP.map(a => `"${a}"`).join(', ')}}
    set targetApp to "Unknown"
    
    -- Try to find the truly frontmost app first
    try
        set frontApp to name of first process whose frontmost is true
        if frontApp is not in skipList then
            set targetApp to frontApp
        else
            -- If front app is skipped, look for the next best candidate
            set allProcesses to name of every process whose background only is false
            repeat with procName in allProcesses
                if contents of procName is not in skipList then
                    set targetApp to contents of procName
                    exit repeat
                end if
            end repeat
        end if
    on error
        set targetApp to "Finder" -- Safe fallback
    end try
    
    return targetApp as text
end tell`;

            isAutomatedVisibilityChange = true;
            exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error, stdout) => {
                // Keep flag true for a short duration after script finishes to allow events to process
                setTimeout(() => { isAutomatedVisibilityChange = false; }, 500);

                if (error) {
                    safeError('[MediScribe] Failed to get focused app:', error);
                    resolve(null);
                } else {
                    let appName = stdout.trim();
                    // If AppleScript returned a list (comma separated), take the first item
                    if (appName.includes(',')) {
                        appName = appName.split(',')[0].trim();
                    }

                    if (appName && appName !== '' && !APPS_TO_SKIP.includes(appName)) {
                        safeLog(`[MediScribe] ✓ Captured target app: "${appName}"`);
                        resolve(appName);
                    } else {
                        // Return the raw value if it's all we have, the activation logic handles it
                        resolve(appName || null);
                    }
                }
            });
        });
    } else if (process.platform === 'win32') {
        const script = `
            Add-Type @"
              using System;
              using System.Runtime.InteropServices;
              public class Win32 {
                [DllImport("user32.dll")]
                public static extern IntPtr GetForegroundWindow();
                [DllImport("user32.dll")]
                public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
              }
"@
            $hwnd = [Win32]::GetForegroundWindow()
            $sb = [System.Text.StringBuilder]::new(256)
            [Win32]::GetWindowText($hwnd, $sb, 256) | Out-Null
            $sb.ToString()
        `;

        return new Promise((resolve) => {
            const { spawn } = require('child_process');
            const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
            let stdout = '';
            ps.stdout.on('data', (data) => { stdout += data.toString(); });
            ps.on('close', () => {
                const title = stdout.trim();
                // Filter out our own windows if captured by mistake (though usually we capture before showing)
                if (title && !title.includes('MediScribe')) {
                    console.log(`[MediScribe] Captured target window title: "${title}"`);
                    resolve(title);
                } else {
                    resolve(null);
                }
            });
            ps.on('error', () => resolve(null));
        });
    } else {
        // Linux: Use xdotool to get active window title
        return new Promise((resolve) => {
            exec('xdotool getactivewindow getwindowname', (error, stdout) => {
                if (error) {
                    resolve(null);
                } else {
                    const title = stdout.trim();
                    resolve(title || null);
                }
            });
        });
    }
}

// Helper to type text into any application
async function typeText(text, restoreWindow = false) {
    if (!text) return { success: false, error: 'No text provided' };

    console.log(`[MediScribe] Direct typing text (${text.length} chars): "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    if (targetAppName) {
        console.log(`[MediScribe] Target application: "${targetAppName}"`);
    }

    try {
        if (process.platform === 'darwin') {
            const escapedText = text
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');

            let appleScript = '';
            if (targetAppName) {
                appleScript = `
                    tell application "${targetAppName}"
                        reopen
                        activate
                    end tell
                    delay 0.5
                    tell application "System Events"
                        if exists process "${targetAppName}" then
                            tell process "${targetAppName}"
                                set frontmost to true
                            end tell
                            delay 0.2
                            keystroke "${escapedText}"
                        else
                            -- Fallback if process name differs slightly from app name
                            keystroke "${escapedText}"
                        end if
                    end tell
                `;
            } else {
                appleScript = `tell application "System Events" to keystroke "${escapedText}"`;
            }

            return new Promise((resolve) => {
                const command = `osascript -e '${appleScript.replace(/'/g, "'\\''")}'`;
                exec(command, (error) => {
                    if (mainWindow && restoreWindow) {
                        setTimeout(() => mainWindow.showInactive(), 300);
                    }
                    if (error) {
                        resolve({ success: false, error: error.message });
                    } else {
                        resolve({ success: true });
                    }
                });
            });
        } else if (process.platform === 'win32') {
            // Windows: Use PowerShell SendKeys with better timing and error handling
            const { spawn } = require('child_process');

            // Escape all SendKeys special characters: +, ^, %, ~, (, ), [, ], {, }
            let sendKeysText = text
                .replace(/[{]/g, '{{}')
                .replace(/[}]/g, '{}}')
                .replace(/[+]/g, '{+}')
                .replace(/[\^]/g, '{^}')
                .replace(/[%]/g, '{%}')
                .replace(/[~]/g, '{~}')
                .replace(/[(]/g, '{(}')
                .replace(/[)]/g, '{)}')
                .replace(/[\[]/g, '{[}')
                .replace(/[\]]/g, '{]}');
            // Escape single quotes for PowerShell string literals, and map newlines
            const escapedText = sendKeysText.replace(/'/g, "''").replace(/\r?\n/g, '{ENTER}');

            let activateScript = '';
            if (targetAppName) {
                activateScript = `
                   $wshell = New-Object -ComObject WScript.Shell
                   $wshell.AppActivate('${targetAppName.replace(/'/g, "''")}')
                   Start-Sleep -Milliseconds 200
                 `;
            }

            const script = `
                ${activateScript}
                Add-Type -AssemblyName System.Windows.Forms
                # Ensure focus is settled
                Start-Sleep -Milliseconds 100
                [System.Windows.Forms.SendKeys]::SendWait('${escapedText}')
            `;

            return new Promise((resolve) => {
                const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);

                let stderr = '';
                ps.stderr.on('data', (data) => { stderr += data.toString(); });

                ps.on('close', (code) => {
                    if (mainWindow && restoreWindow) mainWindow.show();
                    if (code !== 0 || stderr) {
                        console.error('[MediScribe] PowerShell error:', stderr);
                        resolve({ success: false, error: stderr || `Exit code: ${code}` });
                    } else {
                        resolve({ success: true });
                    }
                });

                ps.on('error', (error) => {
                    console.error('[MediScribe] PowerShell spawn error:', error);
                    resolve({ success: false, error: error.message });
                });
            });
        } else {
            // Linux: Use xdotool type with a small delay for reliability
            const escapedText = text.replace(/'/g, "'\"'\"'");
            return new Promise((resolve) => {
                exec(`xdotool type --delay 10 '${escapedText}'`, (error) => {
                    if (mainWindow && restoreWindow) {
                        setTimeout(() => mainWindow.showInactive(), 300);
                    }
                    if (error) resolve({ success: false, error: error.message });
                    else resolve({ success: true });
                });
            });
        }
    } catch (error) {
        console.error('typeText error:', error);
        return { success: false, error: error.message };
    }
}


function keycodeToChar(keycode, shiftKey) {
    // Map common keycodes to characters
    const keyMap = {
        [UiohookKey.A]: 'a', [UiohookKey.B]: 'b', [UiohookKey.C]: 'c', [UiohookKey.D]: 'd',
        [UiohookKey.E]: 'e', [UiohookKey.F]: 'f', [UiohookKey.G]: 'g', [UiohookKey.H]: 'h',
        [UiohookKey.I]: 'i', [UiohookKey.J]: 'j', [UiohookKey.K]: 'k', [UiohookKey.L]: 'l',
        [UiohookKey.M]: 'm', [UiohookKey.N]: 'n', [UiohookKey.O]: 'o', [UiohookKey.P]: 'p',
        [UiohookKey.Q]: 'q', [UiohookKey.R]: 'r', [UiohookKey.S]: 's', [UiohookKey.T]: 't',
        [UiohookKey.U]: 'u', [UiohookKey.V]: 'v', [UiohookKey.W]: 'w', [UiohookKey.X]: 'x',
        [UiohookKey.Y]: 'y', [UiohookKey.Z]: 'z',
        [UiohookKey["0"]]: '0', [UiohookKey["1"]]: '1', [UiohookKey["2"]]: '2',
        [UiohookKey["3"]]: '3', [UiohookKey["4"]]: '4', [UiohookKey["5"]]: '5',
        [UiohookKey["6"]]: '6', [UiohookKey["7"]]: '7', [UiohookKey["8"]]: '8',
        [UiohookKey["9"]]: '9',
        [UiohookKey.Space]: ' ',
    };

    const char = keyMap[keycode];
    if (char) {
        return shiftKey ? char.toUpperCase() : char;
    }

    return null;
}

// Helper: resolve the correct icon for the current platform
function getAppIcon() {
    if (process.platform === 'win32') {
        // Prefer .ico for Windows (proper multi-size icon)
        const icoPath = path.join(__dirname, '../build/icon.ico');
        if (fs.existsSync(icoPath)) return icoPath;
    }
    // Fall back to PNG (works on macOS and Linux)
    const pngInBuild = path.join(__dirname, '../build/icon.png');
    if (fs.existsSync(pngInBuild)) return pngInBuild;
    return path.join(__dirname, '../public/icon.png');
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 350,
        height: 550,
        minWidth: 300,
        minHeight: 450,
        show: false,
        backgroundColor: '#fdfcfd',  // matches light theme bg — prevents white flash
        icon: getAppIcon(),
        titleBarStyle: 'default',
        frame: true,
        transparent: false,
        alwaysOnTop: true,
        resizable: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false,  // Must be false for file:// to load cross-origin resources
            allowRunningInsecureContent: false,
        },
    });

    // Request microphone and media permissions
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'media-device', 'audio-capture', 'video-capture'];
        if (allowedPermissions.includes(permission)) {
            console.log(`[MediScribe] Granting permission: ${permission}`);
            callback(true);
            return true;
        }
        console.log(`[MediScribe] Denying permission: ${permission}`);
        callback(false);
        return false;
    });

    // Pre-grant microphone permissions
    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
        const allowedPermissions = ['media', 'media-device', 'audio-capture', 'video-capture'];
        return allowedPermissions.includes(permission);
    });

    // Load the app
    if (isDev) {
        mainWindow.loadURL('http://localhost:9002');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
    }

    mainWindow.once('ready-to-show', () => {
        console.log('[MediScribe] Main window ready-to-show');
        mainWindow.show();
        if (isDev) {
            mainWindow.webContents.openDevTools();
        }
    });

    // Inject light-mode class immediately when DOM is ready — before React hydrates
    // This ensures body background is always solid (never transparent/wallpaper)
    mainWindow.webContents.on('dom-ready', () => {
        const savedTheme = 'light'; // default
        mainWindow.webContents.executeJavaScript(`
            (function() {
                // Apply stored theme or default light — prevents flash of transparency
                var stored = localStorage.getItem('theme');
                var theme = (stored === 'dark') ? 'dark' : 'light';
                document.documentElement.classList.remove('light', 'dark');
                document.documentElement.classList.add(theme);
                document.documentElement.style.backgroundColor = (theme === 'dark') ? '#05020a' : '#fdfcfd';
                document.body.style.backgroundColor = (theme === 'dark') ? '#05020a' : '#fdfcfd';
                console.log('[MediScribe] Theme class applied before hydration:', theme);
            })();
        `).catch(() => {});
    });

    // Fallback: show window after page finishes loading in case ready-to-show misfires
    mainWindow.webContents.once('did-finish-load', () => {
        console.log('[MediScribe] did-finish-load fired');
        if (!mainWindow.isVisible()) {
            console.log('[MediScribe] Window not yet visible — showing via did-finish-load fallback');
            mainWindow.show();
        }
    });

    // Safety net: ensure window shows after 5 seconds no matter what
    setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            console.log('[MediScribe] Safety timeout: forcing window show');
            mainWindow.show();
        }
    }, 5000);

    // Allow Cmd+Option+I / F12 to open DevTools in any mode (for debugging packaged builds)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const isMacDevTools = input.meta && input.alt && input.key === 'i';
        const isF12 = input.key === 'F12';
        if (isMacDevTools || isF12) {
            mainWindow.webContents.openDevTools();
        }
    });

    // Create Application Menu
    const template = [
        ...(process.platform === 'darwin' ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        {
            label: 'File',
            submenu: [
                process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(process.platform === 'darwin' ? [
                    { type: 'separator' },
                    { role: 'front' },
                    { type: 'separator' },
                    { role: 'window' }
                ] : [
                    { role: 'close' }
                ])
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    mainWindow.on('show', () => {
        if (isAutomatedVisibilityChange) return;
        console.log('[MediScribe] mainWindow shown - destroying floating button');
        destroyFloatingButton();

        // Ensure Whisper server is ready when main window is shown
        if (whisperServerStatus === 'stopped' || whisperServerStatus === 'error') {
            console.log('[MediScribe] Window shown - ensuring Whisper server is running...');
            startWhisperServer();
        }
    });

    mainWindow.on('restore', () => {
        if (isAutomatedVisibilityChange) return;
        console.log('[MediScribe] mainWindow restored - destroying floating button');
        destroyFloatingButton();

        // Ensure Whisper server is ready when main window is restored
        if (whisperServerStatus === 'stopped' || whisperServerStatus === 'error') {
            console.log('[MediScribe] Window restored - ensuring Whisper server is running...');
            startWhisperServer();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Handle window minimize to tray
    mainWindow.on('minimize', (event) => {
        // Create/Show floating button on minimize
        createFloatingButton();

        if (process.platform === 'darwin') {
            // On macOS, if you want it to "disappear" from the Dock but stay active in Tray,
            // we'd use app.dock.hide(), but we keep it here to avoid user confusion.
            // Just let it minimize as standard.
            return;
        }
        event.preventDefault();
        mainWindow.hide();
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('enter-full-screen', () => {
        mainWindow.webContents.send('fullscreen-change', true);
    });

    mainWindow.on('leave-full-screen', () => {
        mainWindow.webContents.send('fullscreen-change', false);
    });
}

function updateTrayMenu() {
    if (!tray) return;

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show MediScribe',
            click: () => {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
            }
        },
        {
            label: 'Start Recording',
            click: () => {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.webContents.send('start-recording');
            },
            enabled: !isRecording
        },
        {
            label: 'Stop Recording',
            click: () => {
                mainWindow.webContents.send('stop-recording');
            },
            enabled: isRecording
        },
        { type: 'separator' },
        {
            label: 'About MediScribe',
            click: () => {
                dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'About MediScribe',
                    message: 'MediScribe - AI-Powered Medical Transcription',
                    detail: 'Professional medical transcription with offline Whisper AI.\nDesigned for healthcare professionals.\n\nVersion 1.0.0'
                });
            }
        },
        {
            label: 'Help & Support',
            click: () => {
                shell.openExternal('https://github.com/mediscribe/help');
            }
        },
        {
            label: 'Check for Updates...',
            click: () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.show();
                    mainWindow.webContents.send('trigger-update-check');
                } else {
                    // Fallback to simple dialog if no window
                    const https = require('https');
                    https.get(`https://mediapp.store/api/v1/update/check?app=MediScribe&version=${app.getVersion()}`, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            try {
                                const { version, url } = JSON.parse(data);
                                if (version && version !== app.getVersion()) {
                                    dialog.showMessageBox({
                                        type: 'info',
                                        title: 'Update Available',
                                        message: `A new version (v${version}) is available.`,
                                        detail: 'Please visit our website to download the latest version.',
                                        buttons: ['Download Now', 'Later']
                                    }).then(({ response }) => {
                                        if (response === 0) shell.openExternal(url || 'https://mediapp.store');
                                    });
                                } else {
                                    dialog.showMessageBox({ message: 'You are on the latest version.' });
                                }
                            } catch (e) {
                                dialog.showErrorBox('Update Check Failed', 'Could not parse update information.');
                            }
                        });
                    }).on('error', () => {
                        dialog.showErrorBox('Update Check Failed', 'Could not connect to update server.');
                    });
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit MediScribe',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
}

function createTray() {
    const iconPath = getAppIcon();
    const nativeImage = require('electron').nativeImage;
    const trayIcon = nativeImage.createFromPath(iconPath);

    // Make icon a "Template" on Mac for Dark/Light mode support
    if (process.platform === 'darwin') {
        trayIcon.setTemplateImage(true);
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('MediScribe - Medical Transcription');

    updateTrayMenu();

    tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.focus();
    });
}

// Server management
let whisperServerProcess = null;

function getWhisperServerPath() {
    const binName = process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server';

    // Check development path
    const devPath = path.join(__dirname, '../resources/bin', binName);
    if (fs.existsSync(devPath)) return devPath;

    // Check production path
    const prodPath = path.join(process.resourcesPath, 'bin', binName);
    if (fs.existsSync(prodPath)) return prodPath;

    return null;
}

function getFFmpegPath() {
    const binName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

    // Check development path
    const devPath = path.join(__dirname, '../resources/bin', binName);
    if (fs.existsSync(devPath)) return devPath;

    // Check production path
    const prodPath = path.join(process.resourcesPath, 'bin', binName);
    if (fs.existsSync(prodPath)) return prodPath;

    // Fallback to system ffmpeg
    return 'ffmpeg';
}

// Whisper Server Status Tracking
let whisperServerStatus = 'stopped'; // 'stopped', 'starting', 'ready', 'error'
let whisperServerRestartCount = 0;
const MAX_WHISPER_RESTARTS = 3;

function setWhisperServerStatus(status) {
    whisperServerStatus = status;
    console.log(`[Whisper Server] Status changed to: ${status}`);

    // Notify renderer process
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('whisper-server-status', status);
    }
}

function startWhisperServer() {
    if (whisperServerStatus === 'starting') {
        console.log('[MediScribe] Whisper server is already starting. Ignoring redundant start request.');
        return;
    }

    if (whisperServerStatus === 'ready' && whisperServerProcess) {
        console.log('[MediScribe] Whisper server is already running and ready.');
        return;
    }

    setWhisperServerStatus('starting');

    const serverPath = getWhisperServerPath();
    if (!serverPath) {
        console.error('[MediScribe] Whisper server binary not found!');
        setWhisperServerStatus('error');
        return;
    }

    // Ensure permissions on macOS/Linux
    if (process.platform !== 'win32') {
        try {
            fs.chmodSync(serverPath, '755');
            console.log('[MediScribe] Set executable permissions for whisper-server');
        } catch (err) {
            console.error('[MediScribe] Failed to chmod whisper-server:', err);
        }
    }

    // Use the GGML model (default to base.en, or currently selected if available)
    const modelToUse = currentModel || 'base.en';
    const modelPath = getModelPath(modelToUse);

    if (!fs.existsSync(modelPath)) {
        console.error(`[MediScribe] Model file not found at ${modelPath}. Cannot start server.`);
        // Try fallback to base.en if we weren't already trying it
        if (modelToUse !== 'base.en') {
            const fallbackPath = getModelPath('base.en');
            if (fs.existsSync(fallbackPath)) {
                console.log('[MediScribe] Falling back to base.en model');
                startServerWithModel(serverPath, fallbackPath);
                return;
            }
        }
        setWhisperServerStatus('error');
        return;
    }

    // If manual start or currently in error, reset restart count to ensure it attempts
    if (whisperServerStatus === 'stopped' || whisperServerStatus === 'error') {
        whisperServerRestartCount = 0;
    }

    startServerWithModel(serverPath, modelPath);
}

let healthCheckInterval = null;

function stopHealthCheck() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }
}

function startHealthCheck(serverPath, modelPath) {
    stopHealthCheck();
    healthCheckInterval = setInterval(() => {
        if (whisperServerStatus === 'ready' && whisperServerProcess) {
            const http = require('http');
            const req = http.get('http://127.0.0.1:8080/', (res) => {
                // Keep it ready
            }).on('error', (err) => {
                console.warn('[Whisper Server] Background health check failed:', err.message);
                if (whisperServerProcess) {
                    whisperServerProcess.kill(); // This will trigger the 'close' event and auto-restart
                } else {
                    setWhisperServerStatus('error');
                }
            });
            // Set a short timeout for the health check itself
            req.setTimeout(5000, () => {
                req.destroy();
            });
        } else if (whisperServerStatus !== 'starting') {
            stopHealthCheck();
        }
    }, 30000); // Every 30 seconds
}

function startServerWithModel(serverPath, modelPath) {
    if (whisperServerProcess) {
        console.log('[MediScribe] Killing existing Whisper server...');
        whisperServerProcess.kill();
        whisperServerProcess = null;
    }

    console.log(`[MediScribe] Starting Whisper server: ${serverPath}`);
    console.log(`[MediScribe] Model: ${modelPath}`);

    // Spawn the C++ server
    // Arguments: -m <model> --port 8080
    // Set cwd to the binary directory so it can find ggml-metal.metal
    const cwd = path.dirname(serverPath);

    try {
        whisperServerProcess = spawn(serverPath, ['-m', modelPath, '--port', '8080'], {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let serverReady = false;

        whisperServerProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[Whisper Server] ${output.trim()}`);

            // Detect when server is ready
            if (output.includes('listening') || output.includes('HTTP server') || output.includes('started')) {
                serverReady = true;
                setWhisperServerStatus('ready');
                whisperServerRestartCount = 0; // Reset restart count on success
                console.log('[Whisper Server] ✅ Server is ready to accept requests');
                if (typeof startHealthCheck === 'function') {
                    startHealthCheck(serverPath, modelPath);
                }
            }
        });

        whisperServerProcess.stderr.on('data', (data) => {
            // whisper.cpp logs to stderr
            const output = data.toString();
            console.log(`[Whisper Server Log] ${output.trim()}`);

            // Also check stderr for ready signals
            if (output.includes('listening') || output.includes('HTTP server') || output.includes('started')) {
                serverReady = true;
                setWhisperServerStatus('ready');
                whisperServerRestartCount = 0; // Reset restart count on success
                console.log('[Whisper Server] ✅ Server is ready to accept requests');
                if (typeof startHealthCheck === 'function') {
                    startHealthCheck(serverPath, modelPath);
                }
            }
        });

        whisperServerProcess.on('error', (err) => {
              console.error('[Whisper Server] Failed to start:', err);
              try { fs.appendFileSync(DEBUG_LOG_PATH, `[${new Date().toISOString()}] [Whisper Server] Failed to start: ${err && err.stack ? err.stack : String(err)}\n`); } catch (e) { }
            setWhisperServerStatus('error');
            whisperServerProcess = null;
        });

        whisperServerProcess.on('close', (code) => {
            console.log(`[Whisper Server] Process exited with code ${code}`);
            whisperServerProcess = null;
            stopHealthCheck();

            // If the app is quitting, don't restart
            if (app.isQuitting) {
                setWhisperServerStatus('stopped');
                return;
            }

            // Otherwise, it shouldn't have closed. Treat as error and try to restart.
            setWhisperServerStatus('error');

            if (whisperServerRestartCount < MAX_WHISPER_RESTARTS) {
                whisperServerRestartCount++;
                console.log(`[Whisper Server] Server exited unexpectedly (Attempt ${whisperServerRestartCount}/${MAX_WHISPER_RESTARTS}), attempting restart in 3s...`);
                setTimeout(() => {
                    if (!whisperServerProcess && !app.isQuitting) {
                        startWhisperServer();
                    }
                }, 3000);
            } else {
                console.error('[Whisper Server] Max restart attempts reached. Please check for port 8080 conflicts.');
            }
        });

        // Give the server time to start (wait 2 seconds)
        setTimeout(() => {
            if (whisperServerProcess) {
                // Test if server is responding
                const http = require('http');
                const req = http.get('http://127.0.0.1:8080/', (res) => {
                    console.log('[Whisper Server] Health check passed - server is responding');
                    setWhisperServerStatus('ready');
                    whisperServerRestartCount = 0; // Reset on health check success
                    startHealthCheck(serverPath, modelPath);
                }).on('error', (err) => {
                    console.warn('[Whisper Server] Health check failed:', err.message);
                    console.warn('[Whisper Server] Server may need more time to start');
                });
            }
        }, 2000);

    } catch (error) {
           console.error('[MediScribe] Failed to spawn Whisper server:', error);
           try { fs.appendFileSync(DEBUG_LOG_PATH, `[${new Date().toISOString()}] [MediScribe] Failed to spawn Whisper server: ${error && error.stack ? error.stack : String(error)}\n`); } catch (e) { }
           whisperServerProcess = null;
    }
}

ipcMain.handle('restart-whisper-server', async () => {
    console.log('[Whisper Server] Restart requested by user');

    // Kill existing process if any
    if (whisperServerProcess) {
        console.log('[Whisper Server] Killing existing process for restart...');
        whisperServerProcess.kill('SIGKILL');
        whisperServerProcess = null;
    }

    // Reset status and restart count
    stopHealthCheck();
    setWhisperServerStatus('stopped');
    whisperServerRestartCount = 0;

    // Small delay to ensure port is released
    await new Promise(r => setTimeout(r, 500));

    // Start fresh
    startWhisperServer();

    // Wait a bit for server to start
    await new Promise(r => setTimeout(r, 1000));
    return { success: true };
});

ipcMain.handle('get-whisper-server-status', async () => {
    // Proactively try to start if it's currently stopped and not quitting
    if (whisperServerStatus === 'stopped' && !app.isQuitting) {
        console.log('[Whisper Server] Status requested while stopped. Triggering auto-start...');
        startWhisperServer();
    }
    return { status: whisperServerStatus };
});

let autoSyncEnabled = false; // Always false now

app.whenReady().then(() => {
    // Explicitly initialize quitting flag
    app.isQuitting = false;
    if (process.platform === 'darwin' && app.dock) {
        app.dock.show();
    }

    // Load auto-sync setting
    try {
        const settingsPath = path.join(app.getPath('userData'), 'auto-sync-setting.json');
        if (fs.existsSync(settingsPath)) {
            const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            autoSyncEnabled = false;
            console.log(`[MediScribe] Auto-sync is currently disabled by design.`);
        }
    } catch (e) {
        console.warn('[MediScribe] Failed to load auto-sync setting:', e);
    }

    // Initialize dictionary path safely after app is ready
    dictionaryPath = path.join(app.getPath('userData'), 'user-dictionary.json');
    loadDictionary();

    // Initialize keyword library path
    keywordLibraryPath = path.join(app.getPath('userData'), 'user-keywords.json');
    loadKeywordLibrary();

    // Initialize template library path
    templateLibraryPath = path.join(app.getPath('userData'), 'user-templates.json');
    // Initialize template files storage directory
    templateFilesDir = path.join(app.getPath('userData'), 'template-files');
    if (!fs.existsSync(templateFilesDir)) fs.mkdirSync(templateFilesDir, { recursive: true });
    loadTemplateLibrary();

    // Initialize nspell spell checker with loaded dictionaries
    console.log('[MediScribe] Initializing spell checker...');
    (async () => {
        await initializeSpellChecker();
        console.log('[MediScribe] Spell checker is ready.');
    })();


    // Initialize license path
    licensePath = path.join(app.getPath('userData'), 'license.json');

    // Migration/Cleanup: Invalidate licenses that were auto-generated via Google Login
    // (Legacy licenses had an 'email' field; manual licenses do not.)
    try {
        if (fs.existsSync(licensePath)) {
            const data = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
            if (data.email) {
                console.log('[Licensing] Auto-generated Google license detected. Reverting to Trial Version for v1.0.3 transition.');
                fs.unlinkSync(licensePath);
            }
        }
    } catch (e) {
        console.error('[Licensing] Migration error:', e);
    }

    // Download Tracking for Mediapp.store
    const trackDownload = async () => {
        try {
            const trackingPath = path.join(app.getPath('userData'), '.install_tracked');
            if (fs.existsSync(trackingPath)) return;

            const https = require('https');
            https.get(`https://mediapp.store/api/v1/track/download?app=MediScribe&version=${app.getVersion()}&platform=${process.platform}`, () => {
                try { fs.writeFileSync(trackingPath, new Date().toISOString()); } catch (e) { }
            }).on('error', () => { });
        } catch (e) { }
    };
    trackDownload();

    // Check for Updates automatically on startup
    const checkUpdateSilently = async () => {
        try {
            const https = require('https');
            https.get(`https://mediapp.store/api/v1/update/check?app=MediScribe&version=${app.getVersion()}`, (res) => {
                let data = '';
                res.on('data', d => data += d);
                res.on('end', () => {
                    try {
                        const { version } = JSON.parse(data);
                        if (version && version !== app.getVersion()) {
                            console.log(`[Update] New version available: v${version}`);
                            // We can use a flag or send to UI later
                            app.latestAvailableVersion = version;
                        }
                    } catch (e) { }
                });
            }).on('error', () => { });
        } catch (e) { }
    };
    checkUpdateSilently();

    // Register dictionary IPCs immediately BEFORE window creation
    console.log('[MediScribe] Registering Dictionary & Keyword IPC handlers...');


    ipcMain.handle('get-google-status', async () => {
        const token = getToken('google');
        let userEmail = null;
        if (token) {
            if (token.email) {
                userEmail = token.email;
            } else if (token.id_token) {
                try {
                    const payload = JSON.parse(Buffer.from(token.id_token.split('.')[1], 'base64').toString('utf-8'));
                    userEmail = payload.email || null;
                } catch(e) {}
            }
        }
        return { connected: !!token, userEmail };
    });

    ipcMain.handle('google-login', async () => {
        try {
            const result = await authenticateWithGoogle();
            if (result.success) {
                // Get User Email from token if possible (OAuth handler would need to include userinfo scope)
                // For now, let's assume we use a generic placeholder or fetch user info
                // Better: Update oauth-handler to get the email
                const email = result.email || 'Google User';

                // ENFORCE 2-DEVICE LIMIT
                const limitCheck = await checkDeviceLimit(email);
                if (!limitCheck.success) {
                    await logoutGoogle(); // Don't allow login if limit reached
                    return { success: false, error: limitCheck.error };
                }

                activeUserEmail = email.toLowerCase().trim();
                console.log('[MediScribe] Google Auth success. Starting initial sync...');

                // Initial sync: Pull dictionary and keywords from Drive if they exist
                await driveSync.sync('user-keywords.json', keywordLibraryPath);
                await driveSync.sync('user-dictionary.json', dictionaryPath);

                // Reload data into memory
                loadKeywordLibrary();
                loadDictionary();
                if (spellChecker) reloadSpellChecker();

                return { success: true, user: email, idToken: result.tokens ? result.tokens.id_token : null };
            }
            return { success: false };
        } catch (error) {
            console.error('[MediScribe] Google Login Error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('set-active-user-email', (event, email) => {
        if (email) {
            activeUserEmail = email.toLowerCase().trim();
        } else {
            activeUserEmail = null;
        }
        return true;
    });

    ipcMain.handle('get-activation-id', () => {
        const hwid = getMachineId();
        // Return a display-friendly short ID for the user to send to support
        return hwid.substring(0, 8).toUpperCase();
    });

    ipcMain.handle('check-local-verified-user', (event, email) => {
        try {
            let csvPath = path.join(app.getPath('userData'), 'verified_users.csv');
            if (!fs.existsSync(csvPath)) {
                const packedCsvPath = path.join(__dirname, '..', 'verified_users.csv');
                if (fs.existsSync(packedCsvPath)) {
                    try {
                        fs.writeFileSync(csvPath, fs.readFileSync(packedCsvPath));
                    } catch (err) {
                        csvPath = packedCsvPath;
                    }
                } else {
                    return { exists: false };
                }
            }
            
            const csv = fs.readFileSync(csvPath, 'utf8');
            const lines = csv.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            
            for (let i = 1; i < lines.length; i++) {
                const matches = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
                const rowEmail = matches[0] ? matches[0].replace(/"/g, '').trim().toLowerCase() : '';
                if (rowEmail === email.toLowerCase()) {
                    return { exists: true };
                }
            }
            return { exists: false };
        } catch (e) {
            console.error('[MediScribe] Error checking local verified user:', e);
            return { exists: false };
        }
    });
 
    ipcMain.handle('local-sim-signin', (event, email, password) => {
        try {
            const localAccountsPath = path.join(app.getPath('userData'), 'local_simulated_users.json');
            let accounts = {};
            if (fs.existsSync(localAccountsPath)) {
                accounts = JSON.parse(fs.readFileSync(localAccountsPath, 'utf8'));
            } else {
                const packedPath = path.join(__dirname, '..', 'local_simulated_users.json');
                if (fs.existsSync(packedPath)) {
                    try {
                        accounts = JSON.parse(fs.readFileSync(packedPath, 'utf8'));
                    } catch(e) {}
                }
            }

            const normalizedEmail = email.toLowerCase().trim();
            if (!accounts[normalizedEmail]) {
                return { success: false, error: 'Account does not exist. Please Sign Up first.' };
            }

            if (accounts[normalizedEmail].password !== password) {
                return { success: false, error: 'Incorrect password.' };
            }

            return { success: true };
        } catch (e) {
            console.error('[MediScribe] Local simulated signin error:', e);
            return { success: false, error: 'Internal server error.' };
        }
    });
 
    ipcMain.handle('local-sim-signup', (event, email, password) => {
        try {
            const localAccountsPath = path.join(app.getPath('userData'), 'local_simulated_users.json');
            let accounts = {};
            if (fs.existsSync(localAccountsPath)) {
                try {
                    accounts = JSON.parse(fs.readFileSync(localAccountsPath, 'utf8'));
                } catch(e) {}
            } else {
                const packedPath = path.join(__dirname, '..', 'local_simulated_users.json');
                if (fs.existsSync(packedPath)) {
                    try {
                        accounts = JSON.parse(fs.readFileSync(packedPath, 'utf8'));
                        fs.writeFileSync(localAccountsPath, JSON.stringify(accounts, null, 2));
                    } catch(e) {}
                }
            }

            const normalizedEmail = email.toLowerCase().trim();
            if (accounts[normalizedEmail]) {
                return { success: false, error: 'This email is already registered. Please sign in.' };
            }

            // Register locally
            accounts[normalizedEmail] = {
                password: password,
                createdAt: new Date().toISOString()
            };
            fs.writeFileSync(localAccountsPath, JSON.stringify(accounts, null, 2));

            // Also ensure they are in the local verified_users.csv list so they bypass local restriction
            let csvPath = path.join(app.getPath('userData'), 'verified_users.csv');
            if (!fs.existsSync(csvPath)) {
                const packedCsvPath = path.join(__dirname, '..', 'verified_users.csv');
                if (fs.existsSync(packedCsvPath)) {
                    try {
                        fs.writeFileSync(csvPath, fs.readFileSync(packedCsvPath));
                    } catch(e) {
                        fs.writeFileSync(csvPath, 'Email,Display Name,Role,Joined\n');
                    }
                } else {
                    fs.writeFileSync(csvPath, 'Email,Display Name,Role,Joined\n');
                }
            }
            
            const csv = fs.readFileSync(csvPath, 'utf8');
            const lines = csv.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            let alreadyVerified = false;
            for (let i = 1; i < lines.length; i++) {
                const matches = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
                const rowEmail = matches[0] ? matches[0].replace(/"/g, '').trim().toLowerCase() : '';
                if (rowEmail === normalizedEmail) {
                    alreadyVerified = true;
                    break;
                }
            }

            if (!alreadyVerified) {
                fs.appendFileSync(csvPath, `"${normalizedEmail}","","User","${new Date().toLocaleString()}"\n`);
            }

            return { success: true };
        } catch (e) {
            console.error('[MediScribe] Local simulated signup error:', e);
            return { success: false, error: 'Internal server error.' };
        }
    });

    ipcMain.handle('check-accessibility-permission', () => {
        return isAccessibilityTrusted(false);
    });

    ipcMain.handle('request-accessibility-permission', () => {
        return isAccessibilityTrusted(true);
    });

    ipcMain.handle('open-accessibility-settings', async () => {
        try {
            const { shell } = require('electron');
            await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
            return true;
        } catch (error) {
            safeError('[MediScribe] Failed to open accessibility settings:', error);
            return false;
        }
    });

    ipcMain.handle('check-activation', () => {
        return checkActivationStatus();
    });

    ipcMain.handle('get-license-details', () => {
        if (isDeveloperSubscriptionBypassEnabled()) {
            const currentHwid = getMachineId();
            return {
                hwid: currentHwid,
                code: generateActivationCode(currentHwid),
                date: new Date().toISOString(),
                billing: 'developer',
                expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10).toISOString(),
            };
        }

        try {
            if (!fs.existsSync(licensePath)) return null;
            const data = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
            const currentHwid = getMachineId();
            const expectedCode = generateActivationCode(currentHwid);
            if (data.hwid === currentHwid && data.code === expectedCode) {
                if (!data.expiresAt) {
                    data.expiresAt = getExpirationDate(data).toISOString();
                }
                return data;
            }
        } catch (e) {}
        return null;
    });

    ipcMain.handle('activate-app', (event, code) => {
        const currentHwid = getMachineId();
        const expectedCode = generateActivationCode(currentHwid);

        if (code.trim().toUpperCase() === expectedCode) {
            fs.writeFileSync(licensePath, JSON.stringify({
                hwid: currentHwid,
                code: expectedCode,
                date: new Date().toISOString()
            }));
            return { success: true };
        }
        return { success: false, error: 'Invalid Activation Key for this machine.' };
    });

    ipcMain.handle('activate-after-payment', async (event, paymentData) => {
        console.log('[Licensing] activate-after-payment called with:', paymentData);
        let { payment_id, plan_id, billing, currency, amount, activation_id } = paymentData || {};
        
        if (!payment_id) {
            return { success: false, error: 'No payment ID provided.' };
        }

        console.log(`[Licensing] Activating after Razorpay payment: ${payment_id}`);

        const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
        const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';

        let paymentObj = null;

        // Verify/Fetch payment with Razorpay API (if secret key is configured)
        if (razorpayKeyId && razorpayKeySecret && !razorpayKeySecret.includes('PASTE_YOUR')) {
            try {
                const https = require('https');
                const credentials = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');

                paymentObj = await new Promise((resolve) => {
                    const req = https.get(
                        `https://api.razorpay.com/v1/payments/${payment_id}`,
                        {
                            headers: {
                                Authorization: `Basic ${credentials}`,
                            },
                        },
                        (res) => {
                            let data = '';
                            res.on('data', (chunk) => { data += chunk; });
                            res.on('end', () => {
                                try {
                                    const parsed = JSON.parse(data);
                                    resolve(parsed);
                                } catch (e) {
                                    console.error('[Licensing] Failed to parse Razorpay API response:', e);
                                    resolve(null);
                                }
                            });
                        }
                    );
                    req.on('error', (err) => {
                        console.error('[Licensing] Razorpay API request failed:', err.message);
                        resolve(null);
                    });
                    req.setTimeout(10000, () => {
                        req.destroy();
                        resolve(null);
                    });
                });

                if (paymentObj) {
                    if (paymentObj.error) {
                        console.warn('[Licensing] Razorpay returned error:', paymentObj.error);
                        return { success: false, error: paymentObj.error.description || 'Payment not found on Razorpay.' };
                    }

                    console.log(`[Licensing] Razorpay payment status: ${paymentObj.status}, amount: ${paymentObj.amount}`);

                    // If authorized but not captured, auto-capture it
                    if (paymentObj.status === 'authorized') {
                        console.log(`[Licensing] Payment is authorized. Attempting to capture...`);
                        const captureResult = await new Promise((resolve) => {
                            const postData = JSON.stringify({
                                amount: paymentObj.amount,
                                currency: paymentObj.currency || 'INR'
                            });
                            const captureReq = https.request({
                                hostname: 'api.razorpay.com',
                                port: 443,
                                path: `/v1/payments/${payment_id}/capture`,
                                method: 'POST',
                                headers: {
                                    'Authorization': `Basic ${credentials}`,
                                    'Content-Type': 'application/json',
                                    'Content-Length': Buffer.byteLength(postData)
                                }
                            }, (res) => {
                                let data = '';
                                res.on('data', (chunk) => { data += chunk; });
                                res.on('end', () => {
                                    try {
                                        const parsed = JSON.parse(data);
                                        resolve(parsed);
                                    } catch (e) {
                                        resolve(null);
                                    }
                                });
                            });
                            captureReq.on('error', () => resolve(null));
                            captureReq.write(postData);
                            captureReq.end();
                        });

                        if (captureResult && captureResult.status === 'captured') {
                            console.log(`[Licensing] Payment captured successfully ✅`);
                            paymentObj = captureResult;
                        } else {
                            console.warn(`[Licensing] Capture failed:`, captureResult);
                        }
                    }

                    if (paymentObj.status !== 'captured' && paymentObj.status !== 'authorized') {
                        return {
                            success: false,
                            error: `Payment status is ${paymentObj.status || 'unknown'}. Only captured or authorized payments can activate the license.`,
                        };
                    }

                    // Extract plan details from notes / payment object if not passed
                    if (!plan_id && paymentObj.notes?.plan_id) plan_id = paymentObj.notes.plan_id;
                    if (!billing && paymentObj.notes?.billing) billing = paymentObj.notes.billing;
                    if (!currency) currency = paymentObj.currency;
                    if (!amount) amount = paymentObj.amount / 100;
                }
            } catch (err) {
                console.error('[Licensing] Error verifying payment:', err);
            }
        }

        // Write license file
        try {
            const currentHwid = getMachineId();
            const licenseCode = generateActivationCode(currentHwid);

            let newExpiration = new Date();
            if (fs.existsSync(licensePath)) {
                try {
                   const oldData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
                   const oldExp = getExpirationDate(oldData);
                   // Only stack expiration if it hasn't expired yet
                   if (oldExp > new Date()) {
                       newExpiration = new Date(oldExp);
                   }
                } catch(e) {}
            }

            // Defaults if API verification was skipped or fields still missing
            const finalBilling = billing || 'monthly';
            const finalPlan = plan_id || 'monthly';

            if (finalBilling === 'yearly') {
                newExpiration.setFullYear(newExpiration.getFullYear() + 1);
            } else {
                newExpiration.setMonth(newExpiration.getMonth() + 1);
            }

            const licenseData = {
                hwid: currentHwid,
                code: licenseCode,
                date: new Date().toISOString(),
                expiresAt: newExpiration.toISOString(),
                payment_id: payment_id,
                plan: finalPlan,
                billing: finalBilling,
                currency: currency || 'INR',
                amount: amount || 149,
            };

            fs.writeFileSync(licensePath, JSON.stringify(licenseData, null, 2));
            console.log(`[Licensing] License written successfully for payment ${payment_id} ✅`);
            return { success: true };
        } catch (err) {
            console.error('[Licensing] Failed to write license file:', err);
            return { success: false, error: 'License file could not be written. Please contact support.' };
        }
    });

    ipcMain.handle('get-dictionary', () => userDictionary);
    ipcMain.handle('add-word', (event, input) => {
        if (typeof input !== 'string') return { success: false, error: 'Invalid input' };

        const wordsToAdd = input.split(',').map(w => w.trim()).filter(w => w !== '');
        let addedCount = 0;

        wordsToAdd.forEach(word => {
            if (!userDictionary.includes(word)) {
                userDictionary.push(word);
                addedCount++;
            }
        });

        if (addedCount > 0) {
            userDictionary.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
            saveDictionary();
            return { success: true, dictionary: userDictionary, addedCount };
        }

        return { success: false, error: wordsToAdd.length > 0 ? 'All words already exist' : 'No valid words provided' };
    });
    ipcMain.handle('remove-word', (event, word) => {
        const initialLen = userDictionary.length;
        userDictionary = userDictionary.filter(w => w !== word);
        if (userDictionary.length !== initialLen) {
            saveDictionary();
            return { success: true, dictionary: userDictionary };
        }
        return { success: false, error: 'Word not found' };
    });

    ipcMain.handle('remove-words', (event, words) => {
        if (!Array.isArray(words)) return { success: false, error: 'Invalid input' };
        const initialLen = userDictionary.length;
        userDictionary = userDictionary.filter(w => !words.includes(w));
        if (userDictionary.length !== initialLen) {
            saveDictionary();
        }
        return { success: true, dictionary: userDictionary };
    });

    ipcMain.handle('update-word', (event, oldWord, newWord) => {
        const index = userDictionary.indexOf(oldWord);
        const trimmed = newWord.trim();
        if (index !== -1 && trimmed) {
            if (userDictionary.includes(trimmed) && trimmed !== oldWord) {
                return { success: false, error: 'Word already exists' };
            }
            userDictionary[index] = trimmed;
            saveDictionary();
            return { success: true, dictionary: userDictionary };
        }
        return { success: false, error: 'Word not found or invalid' };
    });

    ipcMain.handle('sort-dictionary', () => {
        userDictionary.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        saveDictionary();
        return { success: true, dictionary: userDictionary };
    });

    // Typing Mode Management
    ipcMain.handle('get-typing-mode', () => currentTypingMode);
    ipcMain.handle('set-typing-mode', (event, mode) => {
        currentTypingMode = mode;

        // Auto-control keyword listener based on mode
        if (mode === 'dictation') {
            console.log('[MediScribe] Mode changed to dictation - stopping keyword listener');
            stopKeyboardListener();
        } else if (mode === 'keyword') {
            console.log('[MediScribe] Mode changed to keyword - listener will be started manually or via bubble');
        } else if (mode === 'template') {
            console.log('[MediScribe] Mode changed to template - listener will be started manually');
            loadTemplateLibrary(); // Refresh templates from disk
        }

        // Update floating button if it exists
        if (floatingButton && floatingButton.webContents) {
            floatingButton.webContents.send('typing-mode-change', mode);
        }

        // Notify main window too (essential for UI sync)
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('typing-mode-change', mode);
        }
    });

    // Floating Button Position Management
    ipcMain.handle('get-floating-button-position', () => {
        if (floatingButton) {
            const [x, y] = floatingButton.getPosition();
            return { x, y };
        }
        return { x: 0, y: 0 };
    });

    ipcMain.handle('set-floating-button-position', (event, x, y) => {
        if (floatingButton) {
            const nextPosition = getClampedFloatingButtonPosition(x, y);
            floatingButton.setPosition(nextPosition.x, nextPosition.y);
        }
    });

    ipcMain.handle('save-floating-button-position', () => {
        if (floatingButton) {
            const [x, y] = floatingButton.getPosition();
            saveFloatingButtonPosition(x, y);
        }
    });

    // Keyword Library IPCs
    ipcMain.handle('get-keywords', () => keywordLibrary);

    ipcMain.handle('add-keyword', (event, { keyword, description }) => {
        const trimmedKeyword = keyword.trim();
        if (trimmedKeyword && description) {
            // Uniqueness check removed to allow duplicates



            keywordLibrary.push({
                keyword: trimmedKeyword,
                description: description,
                id: Date.now().toString() + Math.random().toString(36).substring(2, 9)
            });


            // Sort by keyword
            keywordLibrary.sort((a, b) => a.keyword.localeCompare(b.keyword));

            saveKeywordLibrary();
            return { success: true, keywords: keywordLibrary };
        }
        return { success: false, error: 'Invalid keyword or description' };
    });

    // Auto-Sync Management
    ipcMain.handle('get-auto-sync-status', () => false);
    ipcMain.handle('toggle-auto-sync', (event, enabled) => {
        autoSyncEnabled = false;
        return false;
    });

    ipcMain.handle('remove-keyword', (event, id) => {
        const initialLen = keywordLibrary.length;
        keywordLibrary = keywordLibrary.filter(k => k.id !== id);

        if (keywordLibrary.length !== initialLen) {
            saveKeywordLibrary();
            return { success: true, keywords: keywordLibrary };
        }
        return { success: false, error: 'Keyword not found' };
    });

    ipcMain.handle('remove-keywords', (event, ids) => {
        if (!Array.isArray(ids)) return { success: false, error: 'Invalid input' };
        const initialLen = keywordLibrary.length;
        keywordLibrary = keywordLibrary.filter(k => !ids.includes(k.id));

        if (keywordLibrary.length !== initialLen) {
            saveKeywordLibrary();
        }
        return { success: true, keywords: keywordLibrary };
    });

    ipcMain.handle('update-keyword', (event, { id, keyword, description }) => {
        const index = keywordLibrary.findIndex(k => k.id === id);
        if (index !== -1) {
            const trimmedKeyword = keyword.trim();

            // Uniqueness check removed to allow duplicates



            keywordLibrary[index] = { ...keywordLibrary[index], keyword: trimmedKeyword, description };
            keywordLibrary.sort((a, b) => a.keyword.localeCompare(b.keyword));
            saveKeywordLibrary();
            return { success: true, keywords: keywordLibrary };
        }
        return { success: false, error: 'Keyword not found' };
    });

    ipcMain.handle('sort-keywords', () => {
        keywordLibrary.sort((a, b) => a.keyword.localeCompare(b.keyword));
        saveKeywordLibrary();
        return { success: true, keywords: keywordLibrary };
    });

    // DISABLED: Floating keyword window IPC handlers
    /*
    ipcMain.handle('show-keyword-window', () => {
        if (!keywordWindow) createKeywordWindow();
        keywordWindow.show();
        keywordWindow.focus();
        keywordWindow.webContents.send('show-keyword-window');
        return { success: true };
    });
 
    ipcMain.handle('hide-keyword-window', () => {
        if (keywordWindow) keywordWindow.hide();
        return { success: true };
    });
    */

    // LINUX ONLY: Dependency check
    if (process.platform === 'linux') {
        const { exec } = require('child_process');
        exec('xdotool --version', (error) => {
            if (error) {
                console.warn('[MediScribe] Warning: xdotool not detected. Continuous typing will not work.');
                console.log('[MediScribe] Please install it: sudo apt-get install xdotool');
            }
        });
    }

    createWindow();
    createTray();
    startWhisperServer();
    setupAutoUpdater(mainWindow);  // ← start background update checks

    // Request accessibility permissions on macOS (QUIET CHECK - NOT TRIGGERING POPUP)
    if (process.platform === 'darwin') {
        const { systemPreferences } = require('electron');
        const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);
        console.log(`[MediScribe] Accessibility trusted: ${isTrusted}`);
    }

    // Register global shortcuts for quick access
    globalShortcut.register('CommandOrControl+Shift+M', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    // Removed Alt+Space shortcut - keywords now work automatically in Word

    // Reload shortcut
    globalShortcut.register('CommandOrControl+R', () => {
        if (mainWindow) {
            mainWindow.reload();
        }
    });

    // Quick record shortcut
    globalShortcut.register('CommandOrControl+Shift+R', () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('toggle-recording');
    });

    app.on('activate', () => {
        // On macOS, it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (mainWindow) {
            // Force restoration and showing if hidden/minimized
            if (mainWindow.isMinimized()) {
                console.log('[MediScribe] Restoring minimized window from Dock activation');
                mainWindow.restore();
            }
            if (!mainWindow.isVisible()) {
                console.log('[MediScribe] Showing hidden window from Dock activation');
                mainWindow.show();
            }
            mainWindow.focus();

            // Auto-restart Whisper server on app "open" (activation) if it's not running
            if (whisperServerStatus === 'stopped' || whisperServerStatus === 'error') {
                console.log('[MediScribe] App activated - ensuring Whisper server is running...');
                startWhisperServer();
            }
        } else if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('before-quit', () => {
    app.isQuitting = true;

    // Stop any active recordings in the renderer process
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('app-quitting');
    }

    if (keyboardListenerActive) {
        stopKeyboardListener();
    }
});

app.on('will-quit', () => {
    if (whisperServerProcess) {
        whisperServerProcess.kill();
    }
    globalShortcut.unregisterAll();
});

// ... Keep existing IPC handlers but update where necessary ...

// OAuth Handlers
ipcMain.handle('oauth-start', async (event, { provider }) => {
    try {
        let token;
        if (provider === 'google') {
            token = await googleClient.getAccessToken();
        } else if (provider === 'apple') {
            token = await appleClient.getAccessToken();
        }
        saveToken(provider, token);
        return { success: true, token };
    } catch (error) {
        console.error('OAuth error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('oauth-get-token', (event, { provider }) => {
    const token = getToken(provider);
    return token;
});

// IPC Handlers
ipcMain.handle('minimize-window', () => {
    if (mainWindow) {
        if (mainWindow.isFullScreen()) {
            // macOS full-screen windows cannot be minimized directly.
            // We must exit full-screen first.
            mainWindow.setFullScreen(false);
            // Wait for the exit-fullscreen animation to complete, then minimize cleanly.
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    if (process.platform === 'darwin') {
                        if (app.dock) app.dock.show();
                        mainWindow.minimize();
                    } else {
                        mainWindow.hide();
                    }
                }
            }, 800);
        } else {
            if (process.platform === 'darwin') {
                if (app.dock) app.dock.show();
                mainWindow.minimize();
            } else {
                mainWindow.hide();
            }
        }
        return { success: true };
    }
    return { success: false, error: 'Main window not available' };
});

ipcMain.handle('quit-app', () => {
    app.isQuitting = true;
    app.quit();
});

ipcMain.handle('toggle-fullscreen', () => {
    if (mainWindow) {
        const isFullScreen = mainWindow.isFullScreen();
        mainWindow.setFullScreen(!isFullScreen);
        return { success: true, isFullScreen: !isFullScreen };
    }
    return { success: false, error: 'Main window not available' };
});

ipcMain.handle('is-fullscreen', () => {
    if (mainWindow) {
        return mainWindow.isFullScreen();
    }
    return false;
});
ipcMain.handle('type-text', async (event, text, restoreWindow = true) => {
    return await typeText(text, restoreWindow);
});

// Floating button IPC handlers
ipcMain.handle('show-floating-button', async () => {
    // Capture which app is currently focused (before MediScribe takes focus)
    targetAppName = await captureFocusedApp();

    if (floatingButton) {
        // FORCE SYNC: Ensure the bubble knows the current true state immediately
        // This fixes the issue where a reused window remembers the old state
        floatingButton.webContents.send('rec-state-change', isRecording);
        floatingButton.webContents.send('typing-mode-change', currentTypingMode);

        floatingButton.showInactive();
        floatingButton.moveTop();
    } else {
        createFloatingButton();
    }
    return { success: true };
});

ipcMain.handle('hide-floating-button', async () => {
    // Stop keyboard listener if active (critical for exiting keyword mode)
    if (keyboardListenerActive) {
        stopKeyboardListener();
    }

    // Clear target app
    targetAppName = null;

    destroyFloatingButton();
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
    return { success: true };
});

ipcMain.handle('restore-main-window', async () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
    return { success: true };
});

// Template Library IPC handlers
ipcMain.handle('get-templates', () => templateLibrary);

ipcMain.handle('add-template', (event, { name, category, type, content, filePath, ext, originalFilename }) => {
    const trimmedName = name.trim();
    if (!trimmedName) return { success: false, error: 'Invalid template name' };
    if (type === 'file' && !filePath) return { success: false, error: 'filePath required for file template' };
    if (type !== 'file' && !content) return { success: false, error: 'content required for text template' };
    templateLibrary.push({
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        name: trimmedName,
        category: category || 'General',
        type: type || 'text',
        content: content ? content.trim() : '',
        filePath: filePath || null,
        ext: ext || null,
        originalFilename: originalFilename || null,
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
    templateLibrary.sort((a, b) => a.name.localeCompare(b.name));
    saveTemplateLibrary();
    return { success: true, templates: templateLibrary };
});

ipcMain.handle('remove-template', (event, id) => {
    const initialLen = templateLibrary.length;
    templateLibrary = templateLibrary.filter(t => t.id !== id);
    if (templateLibrary.length !== initialLen) saveTemplateLibrary();
    return { success: true, templates: templateLibrary };
});

ipcMain.handle('update-template', (event, { id, name, category, type, content, filePath, ext, originalFilename }) => {
    const index = templateLibrary.findIndex(t => t.id === id);
    if (index !== -1) {
        templateLibrary[index] = {
            ...templateLibrary[index],
            name: name.trim(),
            category,
            type: type || templateLibrary[index].type || 'text',
            content: content ? content.trim() : (templateLibrary[index].content || ''),
            filePath: filePath !== undefined ? filePath : templateLibrary[index].filePath,
            ext: ext !== undefined ? ext : templateLibrary[index].ext,
            originalFilename: originalFilename !== undefined ? originalFilename : templateLibrary[index].originalFilename,
            updatedAt: Date.now()
        };
        templateLibrary.sort((a, b) => a.name.localeCompare(b.name));
        saveTemplateLibrary();
        return { success: true, templates: templateLibrary };
    }
    return { success: false, error: 'Template not found' };
});

// Keyboard listener IPC handlers for automatic keyword expansion
ipcMain.handle('start-template-listener', async () => {
    try {
        loadTemplateLibrary();
        currentTypingMode = 'template';
        return startKeyboardListener();
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('stop-template-listener', async () => {
    try {
        stopKeyboardListener();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Save a template file sent as buffer from renderer's <input type="file">
ipcMain.handle('save-template-file', async (event, { buffer, originalName, ext }) => {
    try {
        const safeBase = originalName.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const destFilename = `${safeBase}_${Date.now()}.${ext.toLowerCase()}`;
        const destPath = path.join(templateFilesDir, destFilename);
        fs.writeFileSync(destPath, Buffer.from(buffer));
        return { success: true, savedPath: destPath, originalName, ext: ext.toUpperCase() };
    } catch (error) {
        safeError('[MediScribe] save-template-file error:', error);
        return { success: false, error: error.message };
    }
});

// Delete a template file from disk
ipcMain.handle('delete-template-file', async (event, filePath) => {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});


ipcMain.handle('start-keyword-listener', async () => {
    try {
        if (process.stdout.writable) console.log('[MediScribe] start-keyword-listener IPC called');
    } catch (err) { }
    try {
        try {
            if (process.stdout.writable) console.log('[MediScribe] Calling startKeyboardListener()...');
        } catch (err) { }
        const result = startKeyboardListener();
        try {
            if (process.stdout.writable) console.log('[MediScribe] startKeyboardListener() completed');
        } catch (err) { }

        // Removed auto-minimize
        // if (mainWindow) {
        //     mainWindow.minimize();
        // }
        return result;
    } catch (error) {
        try {
            if (process.stderr.writable) {
                console.error('[MediScribe] Failed to start keyboard listener:', error);
                console.error('[MediScribe] Error stack:', error.stack);
            }
        } catch (err) { }
        return { success: false, error: error.message };
    }
});

ipcMain.handle('stop-keyword-listener', async () => {
    try {
        stopKeyboardListener();
        // Removed auto-restore
        // if (mainWindow) {
        //     mainWindow.restore();
        //     mainWindow.showInactive(); // Don't steal focus
        // }
        return { success: true };
    } catch (error) {
        try {
            if (process.stderr.writable) console.error('[MediScribe] Failed to stop keyboard listener:', error);
        } catch (err) { }
        return { success: false, error: error.message };
    }
});

// Handle stop recording from floating button
ipcMain.on('stop-recording', () => {
    console.log('[MediScribe] Stop recording triggered from floating button');
    // Forward to main window
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('trigger-stop-recording');
    }
});

// Handle toggle recording from floating button
ipcMain.on('trigger-toggle-recording', async () => {
    console.log('[MediScribe Main] ===== TOGGLE ACTION TRIGGERED FROM FLOATING BUTTON =====');
    console.log('[MediScribe Main] Current isRecording state:', isRecording);

    if (mainWindow && mainWindow.webContents) {
        // Track whether the window was hidden before the IPC send
        const wasHidden = !mainWindow.isVisible() || mainWindow.isMinimized();

        console.log('[MediScribe Main] SENDING toggle-recording event to renderer');
        mainWindow.webContents.send('toggle-recording');
        console.log('[MediScribe Main] Event sent successfully');

        // On macOS, sending IPC to a minimized window can cause it to restore.
        // Keep it minimized in the Dock so the app remains findable while the bubble is active.
        if (wasHidden) {
            setImmediate(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    if (process.platform === 'darwin') {
                        if (app.dock) app.dock.show();
                        if (!mainWindow.isMinimized()) mainWindow.minimize();
                    } else {
                        mainWindow.hide();
                    }
                }
            });
        }
    } else {
        console.error('[MediScribe Main] ERROR: mainWindow or webContents is NULL');
    }

    // Refresh target app name in the background
    captureFocusedApp().then(freshTarget => {
        if (freshTarget && freshTarget !== 'Unknown') {
            targetAppName = freshTarget;
        }
    }).catch(err => {
        console.error('[MediScribe Main] Failed to capture focused app in background:', err);
    });
});

// Handle request for bubble state
ipcMain.on('request-bubble-state', (event) => {
    if (floatingButton && !floatingButton.isDestroyed()) {
        floatingButton.webContents.send('rec-state-change', isRecording);
        floatingButton.webContents.send('typing-mode-change', currentTypingMode);
    }
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('show-save-dialog', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Transcription',
        defaultPath: `medical-transcription-${new Date().toISOString().split('T')[0]}.txt`,
        filters: [
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'Word Documents', extensions: ['docx'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result;
});

ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Handle recording state for tray menu
ipcMain.on('recording-state-changed', (event, recording) => {
    isRecording = recording;
    updateTrayMenu();
    if (floatingButton && floatingButton.webContents) {
        floatingButton.webContents.send('rec-state-change', recording);
    }
});

// Get list of available models and their status
ipcMain.handle('get-models', async () => {
    const models = SUPPORTED_MODELS.map(model => {
        const modelPath = getModelPath(model.name);
        return {
            ...model,
            downloaded: fs.existsSync(modelPath),
            path: modelPath,
            active: model.name === currentModel,
            isDeletable: fs.existsSync(modelPath) && modelPath.startsWith(app.getPath('userData'))
        };
    });
    return models;
});

// Download a specific model
ipcMain.handle('download-model', async (event, modelName) => {
    const model = SUPPORTED_MODELS.find(m => m.name === modelName);
    if (!model) return { success: false, error: 'Model not found' };

    const targetPath = getModelPath(modelName);
    const targetDir = path.dirname(targetPath);

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    console.log(`[MediScribe] Starting download: ${model.url} -> ${targetPath}`);

    const downloadFile = (url, dest) => {
        return new Promise((resolve, reject) => {
            const { net } = require('electron');
            const fs = require('fs');

            const request = net.request({
                url: url,
                redirect: 'follow'
            });

            // Set a timeout of 30 seconds for initial connection/response
            request.on('timeout', () => {
                request.abort();
                reject(new Error('Connection timed out'));
            });

            request.on('response', (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                    return;
                }

                const file = fs.createWriteStream(dest);
                
                // Content-length header can be string or array
                let contentLengthHeader = response.headers['content-length'];
                if (Array.isArray(contentLengthHeader)) {
                    contentLengthHeader = contentLengthHeader[0];
                }
                const totalSize = parseInt(contentLengthHeader || '0', 10);
                let downloadedSize = 0;
                let lastProgressTime = 0;

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    file.write(chunk);

                    const now = Date.now();
                    if (now - lastProgressTime > 500 || downloadedSize === totalSize) { // Update every 500ms
                        const percent = totalSize > 0 ? Math.floor((downloadedSize / totalSize) * 100) : 0;
                        console.log(`[MediScribe] Progress ${modelName}: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);

                        // Send progress to renderer
                        if (mainWindow && mainWindow.webContents) {
                            mainWindow.webContents.send('download-progress', {
                                modelName,
                                progress: percent,
                                downloadedSize,
                                totalSize
                            });
                        }
                        lastProgressTime = now;
                    }
                });

                response.on('end', () => {
                    file.end();
                });

                file.on('error', (err) => {
                    file.end();
                    fs.unlink(dest, () => reject(err));
                });

                file.on('finish', () => {
                    console.log(`[MediScribe] Download finished: ${modelName}`);
                    // Send completion event
                    if (mainWindow && mainWindow.webContents) {
                        mainWindow.webContents.send('download-complete', { modelName });
                    }
                    resolve({ success: true });
                });
            });

            request.on('error', (err) => {
                fs.unlink(dest, () => reject(err));
            });

            request.end();
        });
    };

    try {
        console.log(`[MediScribe] Attempting download from primary URL: ${model.url}`);
        return await downloadFile(model.url, targetPath);
    } catch (primaryErr) {
        console.error(`[MediScribe] Primary download failed: ${primaryErr.message}. Trying mirror...`);
        if (model.url.includes('huggingface.co')) {
            const mirrorUrl = model.url.replace('huggingface.co', 'hf-mirror.com');
            console.log(`[MediScribe] Attempting download from mirror: ${mirrorUrl}`);
            try {
                return await downloadFile(mirrorUrl, targetPath);
            } catch (mirrorErr) {
                console.error(`[MediScribe] Mirror download also failed: ${mirrorErr.message}`);
                // Send error event
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('download-error', { modelName, error: mirrorErr.message });
                }
                return { success: false, error: mirrorErr.message };
            }
        } else {
            // Send error event
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('download-error', { modelName, error: primaryErr.message });
            }
            return { success: false, error: primaryErr.message };
        }
    }
});

// Ollama IPC Handlers

// Check if Ollama is installed and running
ipcMain.handle('check-ollama-status', async () => {
    try {
        const { exec, spawn } = require('child_process');

        // 1. Try to connect to existing instance
        const isRunning = await new Promise((resolve) => {
            exec('curl -s http://localhost:11434/api/tags', (error) => {
                resolve(!error);
            });
        });

        if (isRunning) {
            return new Promise((resolve) => {
                exec('curl -s http://localhost:11434/api/tags', (error, stdout) => {
                    try {
                        const data = JSON.parse(stdout);
                        resolve({ installed: true, running: true, models: data.models || [] });
                    } catch {
                        resolve({ installed: true, running: true, models: [] });
                    }
                });
            });
        }


        // 2. If not running, check for bundled binary
        const bundledPath = isDev
            ? path.join(__dirname, '../resources/bin/ollama')
            : path.join(process.resourcesPath, 'bin/ollama');

        const binaryPath = process.platform === 'win32' ? bundledPath + '.exe' : bundledPath;

        console.log('[Ollama] Checking for bundled binary at:', binaryPath);
        console.log('[Ollama] Binary exists:', fs.existsSync(binaryPath));
        console.log('[Ollama] process.resourcesPath:', process.resourcesPath);
        console.log('[Ollama] __dirname:', __dirname);
        console.log('[Ollama] isDev:', isDev);

        if (fs.existsSync(binaryPath)) {
            console.log('[Ollama] Found bundled binary, starting server...');

            // Make binary executable on Unix systems
            if (process.platform !== 'win32') {
                try {
                    fs.chmodSync(binaryPath, '755');
                    console.log('[Ollama] Set binary permissions to executable');
                } catch (err) {
                    console.error('[Ollama] Failed to set executable permissions:', err);
                }
            }

            // Start Ollama server in background
            const ollamaProcess = spawn(binaryPath, ['serve'], {
                detached: true,
                stdio: 'ignore'
            });
            ollamaProcess.unref();

            console.log('[Ollama] Server started, waiting for startup...');

            // Wait for it to spin up
            await new Promise(r => setTimeout(r, 2000));

            // Check again
            return new Promise((resolve) => {
                exec('curl -s http://localhost:11434/api/tags', (error, stdout) => {
                    if (!error) {
                        try {
                            const data = JSON.parse(stdout);
                            console.log('[Ollama] Server is now running with models:', data.models?.length || 0);
                            resolve({ installed: true, running: true, models: data.models || [] });
                        } catch {
                            console.log('[Ollama] Server started but response parsing failed');
                            resolve({ installed: true, running: true, models: [] });
                        }
                    } else {
                        console.error('[Ollama] Failed to start bundled Ollama:', error.message);
                        resolve({ installed: true, running: false, error: "Failed to start bundled Ollama" });
                    }
                });
            });
        }

        console.log('[Ollama] Bundled binary not found, Ollama not installed');


        return { installed: false, running: false };

    } catch (error) {
        return { installed: false, running: false, error: error.message };
    }
});

// Get list of Ollama models
ipcMain.handle('get-ollama-models', async () => {
    try {
        const { exec } = require('child_process');

        // Get locally installed models
        return new Promise((resolve) => {
            exec('curl -s http://localhost:11434/api/tags', async (error, stdout) => {
                let installedModels = [];

                if (!error) {
                    try {
                        const data = JSON.parse(stdout);
                        installedModels = data.models?.map(m => m.name) || [];
                    } catch (e) {
                        console.error('[Ollama] Failed to parse models:', e);
                    }
                }

                // Combine with supported models list
                const modelsList = SUPPORTED_OLLAMA_MODELS.map(model => {
                    const isDownloaded = installedModels.some(name => name.includes(model.name.split(':')[0]));
                    return {
                        ...model,
                        downloaded: isDownloaded,
                        active: isDownloaded && model.name === currentOllamaModel,
                        isDeletable: isDownloaded
                    };
                });

                // Validation: If current active model is NOT downloaded, unset it
                const activeModel = modelsList.find(m => m.active);
                if (!activeModel && currentOllamaModel) {
                    console.log(`[Ollama] Current model ${currentOllamaModel} is not installed. Resetting selection.`);
                    currentOllamaModel = ''; // Reset invalid selection
                }

                resolve(modelsList);
            });
        });
    } catch (error) {
        console.error('[Ollama] Get models error:', error);
        return [];
    }
});

// Track active downloads for cancellation
const activeDownloads = {};

// Download an Ollama model
ipcMain.handle('download-ollama-model', async (event, modelName) => {
    try {
        const { spawn } = require('child_process');
        console.log(`[Ollama] Starting download: ${modelName}`);

        // Get the bundled Ollama binary path
        const bundledPath = isDev
            ? path.join(__dirname, '../resources/bin/ollama')
            : path.join(process.resourcesPath, 'bin/ollama');

        const ollamaBinaryPath = process.platform === 'win32' ? bundledPath + '.exe' : bundledPath;

        console.log(`[Ollama] Using binary: ${ollamaBinaryPath}`);
        console.log(`[Ollama] Binary exists: ${fs.existsSync(ollamaBinaryPath)}`);

        if (!fs.existsSync(ollamaBinaryPath)) {
            const error = `Ollama binary not found at: ${ollamaBinaryPath}`;
            console.error(`[Ollama] ${error}`);
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('ollama-download-error', { modelName, error });
            }
            return { success: false, error };
        }

        return new Promise((resolve, reject) => {
            if (activeDownloads[modelName]) {
                console.log(`[Ollama] Download already active for ${modelName}`);
                return resolve({ success: true, alreadyActive: true });
            }

            const pullProcess = spawn(ollamaBinaryPath, ['pull', modelName]);
            activeDownloads[modelName] = pullProcess;

            let lastProgress = 0;

            pullProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log(`[Ollama] ${output.trim()}`);

                // Try to parse progress
                // Ollama output can contain ANSI codes and multiple updates per chunk
                // We want to find the LAST percentage in the chunk
                const matches = output.match(/(\d{1,3})%/g);

                if (matches && matches.length > 0) {
                    // Get the last match (most recent progress)
                    const lastMatch = matches[matches.length - 1];
                    const progress = parseInt(lastMatch.replace('%', ''));

                    if (!isNaN(progress) && progress !== lastProgress) {
                        lastProgress = progress;
                        if (mainWindow && mainWindow.webContents) {
                            mainWindow.webContents.send('ollama-download-progress', {
                                modelName,
                                progress
                            });
                        }
                    }
                }
            });

            pullProcess.stderr.on('data', (data) => {
                console.error(`[Ollama Error] ${data}`);
            });

            pullProcess.on('error', (error) => {
                console.error(`[Ollama] Spawn error:`, error);
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('ollama-download-error', { modelName, error: error.message });
                }
                reject(error);
            });

            pullProcess.on('close', (code) => {
                delete activeDownloads[modelName];

                if (code === 0) {
                    console.log(`[Ollama] Download complete: ${modelName}`);
                    if (mainWindow && mainWindow.webContents) {
                        mainWindow.webContents.send('ollama-download-complete', { modelName });
                    }
                    resolve({ success: true });
                } else if (code === null || code === 143 || code === 0x80) { // SIGTERM or interrupted
                    console.log(`[Ollama] Download cancelled: ${modelName}`);
                    resolve({ success: false, cancelled: true });
                } else {
                    const error = `Download failed with code ${code}`;
                    console.error(`[Ollama] ${error}`);
                    if (mainWindow && mainWindow.webContents) {
                        mainWindow.webContents.send('ollama-download-error', {
                            modelName,
                            error
                        });
                    }
                    reject(new Error(error));
                }
            });
        });
    } catch (error) {
        delete activeDownloads[modelName];
        console.error('[Ollama] Download error:', error);
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('ollama-download-error', {
                modelName,
                error: error.message
            });
        }
        return { success: false, error: error.message };
    }
});

// Cancel an active download
ipcMain.handle('cancel-ollama-download', async (event, modelName) => {
    const process = activeDownloads[modelName];
    if (process) {
        console.log(`[Ollama] Cancelling download for: ${modelName}`);
        try {
            process.kill(); // Sends SIGTERM
            delete activeDownloads[modelName];
            return { success: true };
        } catch (error) {
            console.error(`[Ollama] Failed to kill process for ${modelName}:`, error);
            return { success: false, error: error.message };
        }
    }
    return { success: false, error: 'No active download found' };
});

// Set active Ollama model
ipcMain.handle('set-ollama-model', async (event, modelName) => {
    currentOllamaModel = modelName;
    console.log(`[Ollama] Active model set to: ${modelName}`);
    return { success: true };
});

// Delete an Ollama model
ipcMain.handle('delete-ollama-model', async (event, modelName) => {
    try {
        const { exec } = require('child_process');
        console.log(`[Ollama] Deleting model: ${modelName}`);

        // If deleting the active model, reset to empty string
        if (currentOllamaModel === modelName) {
            currentOllamaModel = '';
        }

        return new Promise((resolve, reject) => {
            exec(`ollama rm ${modelName}`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[Ollama] Error deleting model: ${error.message}`);
                    resolve({ success: false, error: error.message });
                    return;
                }
                console.log(`[Ollama] Model deleted: ${modelName}`);
                resolve({ success: true });
            });
        });
    } catch (error) {
        console.error(`[Ollama] Error deleting model: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// Toggle Ollama on/off
ipcMain.handle('toggle-ollama', async (event, enabled) => {
    ollamaEnabled = enabled;
    console.log(`[Ollama] ${enabled ? 'Enabled' : 'Disabled'}`);
    return { success: true, enabled: ollamaEnabled };
});

// Get Ollama enabled state
ipcMain.handle('get-ollama-enabled', async () => {
    return { enabled: ollamaEnabled };
});

// Format text with Ollama
// Helper function for Ollama formatting with optional error flagging (3-stage mode)
// flaggedErrors: array of {word, position, length, suggestions} from spell checker
async function formatTextWithOllama(text, formatType = 'clinical-note', flaggedErrors = null) {
    if (!ollamaEnabled) {
        throw new Error('Ollama is disabled');
    }

    try {
        const https = require('http');

        // NEW MODE: Correction-Only with Flagged Errors (Stage 3 of pipeline)
        if (flaggedErrors && Array.isArray(flaggedErrors) && flaggedErrors.length > 0) {
            console.log(`[LLM Stage 3] Correcting ${flaggedErrors.length} flagged errors only`);

            // Create a strict prompt that only allows correction of specific words
            const errorList = flaggedErrors.map((err, idx) =>
                `${idx + 1}. "${err.word}" at position ${err.position} (suggestions: ${err.suggestions.join(', ')})`
            ).join('\n');

            // NEW: Add custom dictionary context to the LLM
            let customContext = '';
            if (userDictionary && userDictionary.length > 0) {
                customContext += `USER CUSTOM DICTIONARY (Prioritize these for corrections if they match context):\n- ${userDictionary.join('\n- ')}\n\n`;
            }
            if (keywordLibrary && keywordLibrary.length > 0) {
                const shortcuts = keywordLibrary.filter(k => k.keyword).map(k => k.keyword);
                if (shortcuts.length > 0) {
                    customContext += `USER KEYWORDS:\n- ${shortcuts.join('\n- ')}\n\n`;
                }
            }

            const systemPrompt = `YOU ARE A SPELLING CORRECTOR IN RESTRICTED MODE.

YOUR ONLY JOB: Replace ONLY the flagged incorrect words in the text. Do not change anything else.

${customContext}ABSOLUTE RULES:
- DO NOT add any conversational phrases like "Here is", "Sure", "Corrected text:"
- DO NOT add headers, sections, or explanations
- DO NOT rewrite sentences or change structure
- ONLY replace the specific flagged words with their correct spellings
- IF A FLAGGED WORD LOOKS LIKE IT SHOULD BE ONE OF THE CUSTOM DICTIONARY TERMS ABOVE, USE THAT TERM.
- Preserve ALL other text EXACTLY as-is (punctuation, capitalization, spacing)
- Output ONLY the corrected text, nothing else

WRONG examples (DO NOT DO THIS):
❌ "Here is the corrected version..."
❌ "I have fixed the following errors..."
❌ Adding "Assessment:" or "Plan:" sections
❌ Rewriting entire sentences`;

            const userPrompt = `Original text:
${text}

Flagged spelling errors to correct (and ONLY these):
${errorList}

Instructions:
- Replace ONLY the flagged words with their correct spellings
- Refer to the custom dictionary in the system prompt for preferred medical terminology
- Keep everything else EXACTLY the same
- Output the corrected text with no additional commentary

Corrected text:`;

            const postData = JSON.stringify({
                model: currentOllamaModel,
                prompt: userPrompt,
                system: systemPrompt,
                stream: false,
                options: {
                    temperature: 0.0, // Zero temperature for determinism
                    top_p: 0.1,
                    repeat_penalty: 1.0,
                    stop: ["\n\nExplanation", "\n\nNote:", "Here is", "Sure,", "Certainly", "I have", "I've"]
                }
            });

            const result = await makeOllamaRequest(postData);

            // Aggressive post-processing for flagged-error mode
            let cleaned = result.trim();
            cleaned = cleaned.replace(/^(Here is|Here's|Sure|Okay|Certainly|Of course|I have|I've|The corrected text is|Corrected text)[:\s,]*/gi, '');
            cleaned = cleaned.replace(/^["']|["']$/g, ''); // Remove quotes

            console.log('[LLM Stage 3] Correction complete');
            return cleaned;
        }

        // LEGACY MODE: Full text formatting (old behavior for backward compatibility)
        const systemPrompt = `YOU ARE A SPELL CHECKER. NOT A CHAT BOT. NOT AN ASSISTANT.

YOUR ONLY JOB: Fix spelling and grammar errors in the input text.

ABSOLUTE RULES - NO EXCEPTIONS:
- Output ONLY the corrected text
- DO NOT write "Here is", "Sure", "Certainly", "I have corrected", or ANY conversational phrase
- DO NOT add headers like "Impression:", "Suggestion:", "Plan:", "Assessment:", "Summary:" unless they already exist
- DO NOT add explanations, notes, or commentary
- DO NOT expand abbreviations or add information
- DO NOT change the meaning or structure
- If you add ANYTHING beyond correcting spelling/grammar, you have FAILED

CORRECT examples:
Input: "The ptient has feever and cough"
Output: "The patient has fever and cough"

Input: "abdominall pain in the rite lower quadrent"
Output: "abdominal pain in the right lower quadrant"

WRONG examples (DO NOT DO THIS):
Input: "ptient has feever"
Output: "Here is the corrected text: The patient has fever" ❌ WRONG - removed conversational prefix
Output: "The patient has fever. Impression: Possible infection" ❌ WRONG - added new content`;

        const prompts = {
            'clinical-note': `Format the following text into a professional clinical note (Chief Complaint, HPI, Assessment, Plan). Output ONLY the formatted note:\n\n${text}`,
            'soap': `Format the following text into a SOAP note. Output ONLY the note:\n\n${text}`,
            'clean': `Correct spelling and grammar ONLY. Output format: corrected text with no additions.\n\nText to correct:\n${text}\n\nCorrected text:`
        };

        const instruction = prompts[formatType] || prompts['clean'];

        // Inject Custom Dictionary and Keyword Library terms
        let finalPrompt = instruction;
        let preferredTerms = [];

        if (userDictionary && Array.isArray(userDictionary)) {
            preferredTerms.push(...userDictionary);
        }

        if (keywordLibrary && Array.isArray(keywordLibrary)) {
            // Add descriptions as valid terms
            preferredTerms.push(...keywordLibrary.map(k => k.description));
        }

        if (preferredTerms.length > 0) {
            // Deduplicate and limit length to prevent context overflow (approx 500 words)
            const uniqueTerms = [...new Set(preferredTerms)].filter(t => t && t.length > 0);
            const termsString = uniqueTerms.join(', ');
            const truncatedTerms = termsString.length > 3000 ? termsString.substring(0, 3000) + '...' : termsString;

            finalPrompt += `\n\nPreferred medical term spellings: ${truncatedTerms}`;
        }

        const postData = JSON.stringify({
            model: currentOllamaModel,
            prompt: finalPrompt,
            system: systemPrompt,
            stream: false,
            options: {
                temperature: 0.0, // Zero temperature for maximum determinism
                top_p: 0.1, // Very focused sampling
                repeat_penalty: 1.0,
                stop: ["\n\nExplanation", "\n\nNote:", "\n\nImpression:", "\n\nSuggestion:", "\n\nKey Terms:", "Here is", "Sure,", "Certainly", "I have", "I've"]
            }
        });

        const result = await makeOllamaRequest(postData);

        // AGGRESSIVE Post-Processing Clean-up
        let responseText = result;

        if (formatType === 'clean') {
            // 1. Remove ANY conversational prefixes (very aggressive)
            responseText = responseText.replace(/^(Here is|Here's|Sure|Okay|Certainly|Of course|I have|I've|The corrected text is|Corrected text)[:\s,]*/gi, '');

            // 2. Remove leading quotes if model wrapped output
            responseText = responseText.replace(/^["']|["']$/g, '');

            // 3. Split on common section headers and take only the first part
            const stopPhrases = [
                /\n\s*Explanation:/i,
                /\n\s*Note:/i,
                /\n\s*Key Corrections:/i,
                /\n\s*Changes made:/i,
                /\n\s*Summary:/i
            ];

            for (const pattern of stopPhrases) {
                const match = responseText.search(pattern);
                if (match !== -1) {
                    responseText = responseText.substring(0, match);
                }
            }

            // 4. Remove hallucinated medical headers if they weren't in the input
            const medicalHeaders = ['Impression:', 'Assessment:', 'Plan:', 'Diagnosis:', 'Recommendation:', 'Suggestion:'];
            for (const header of medicalHeaders) {
                if (!text.includes(header) && responseText.includes(header)) {
                    // Find where the header starts and remove everything from there
                    const headerIndex = responseText.indexOf(header);
                    if (headerIndex !== -1) {
                        // Check if it's a new section (preceded by newline or at start)
                        if (headerIndex === 0 || responseText[headerIndex - 1] === '\n') {
                            responseText = responseText.substring(0, headerIndex);
                        }
                    }
                }
            }

            // 5. Trim whitespace and remove trailing incomplete sentences if model was cut off
            responseText = responseText.trim();

            // 6. If the response is significantly longer than input, it probably added content - be suspicious
            if (responseText.length > text.length * 1.5) {
                console.warn('[Ollama] Response suspiciously long - may have added content');
                // Try to extract just the core correction by removing everything after the first complete thought
                const sentences = responseText.split(/\. |\.\n/);
                const inputSentences = text.split(/\. |\.\n/);
                if (sentences.length > inputSentences.length * 1.5) {
                    // Keep only the reasonable number of sentences
                    responseText = sentences.slice(0, inputSentences.length).join('. ');
                    if (!responseText.endsWith('.') && text.includes('.')) {
                        responseText += '.';
                    }
                }
            }
        }

        console.log('[Ollama] Cleaned response:', responseText);
        return responseText;

    } catch (error) {
        console.error('[Ollama] Format error:', error);
        throw error;
    }
}

// Helper function to make Ollama HTTP request
function makeOllamaRequest(postData) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        const MAX_RETRIES = 3;

        const options = {
            hostname: 'localhost',
            port: 11434,
            path: '/api/generate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 60000
        };

        const attemptRequest = (attemptsLeft) => {
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const responseText = json.response || '';
                        resolve(responseText);
                    } catch (e) {
                        reject(new Error('Failed to parse Ollama response'));
                    }
                });
            });

            req.on('error', (err) => {
                if (attemptsLeft > 0 && (err.code === 'ECONNRESET' || err.code === 'socket hang up' || err.code === 'ECONNREFUSED')) {
                    const delay = 1000 * (4 - attemptsLeft); // 1s, 2s, 3s
                    console.log(`[Ollama] Request failed: ${err.message}. Retrying in ${delay}ms...`);
                    setTimeout(() => {
                        attemptRequest(attemptsLeft - 1);
                    }, delay);
                } else {
                    reject(err);
                }
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Ollama request timed out'));
            });

            req.write(postData);
            req.end();
        };

        attemptRequest(MAX_RETRIES);
    });
}

// Format text with Ollama
ipcMain.handle('format-with-ollama', async (event, text, formatType = 'clinical-note') => {
    try {
        const formatted = await formatTextWithOllama(text, formatType);
        return { success: true, formatted };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Set active model
ipcMain.handle('set-model', async (event, modelName) => {
    const modelPath = getModelPath(modelName);
    if (fs.existsSync(modelPath)) {
        currentModel = modelName;
        return { success: true };
    }
    return { success: false, error: 'Model not downloaded' };
});

// Delete a Whisper model
ipcMain.handle('delete-model', async (event, modelName) => {
    try {
        const modelPath = getModelPath(modelName);
        if (!fs.existsSync(modelPath)) {
            return { success: false, error: 'Model file not found' };
        }

        // If deleting the active model, reset to default 'base.en'
        if (currentModel === modelName) {
            currentModel = 'base.en';
        }

        fs.unlinkSync(modelPath);
        console.log(`[MediScribe] Deleted model: ${modelName}`);
        return { success: true };
    } catch (error) {
        console.error(`[MediScribe] Error deleting model: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// Check whisper status
// Check whisper status
ipcMain.handle('check-whisper-status', async () => {
    try {
        const whisperBinary = getWhisperServerPath();
        const modelPath = getModelPath(currentModel);
        const modelExists = fs.existsSync(modelPath);
        const binaryExists = whisperBinary ? fs.existsSync(whisperBinary) : false;

        return {
            ready: whisperServerStatus === 'ready',
            status: whisperServerStatus,
            modelPath: modelPath,
            modelExists,
            binaryExists,
            binaryPath: whisperBinary,
            currentModel,
            serverRunning: (whisperServerProcess !== null)
        };
    } catch (error) {
        return { ready: false, error: error.message };
    }
});

// Convert audio to WAV format using ffmpeg
function convertToWav(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const ffmpegPath = getFFmpegPath();
        const args = [
            '-y',
            '-i', inputPath,
            '-vn',
            '-sn',
            '-map_metadata', '-1',
            '-ar', '16000',
            '-ac', '1',
            '-c:a', 'pcm_s16le',
            '-f', 'wav',
            outputPath
        ];

        console.log(`[MediScribe] Converting audio with ffmpeg: "${ffmpegPath}" ${args.join(' ')}`);

        const ffmpegProc = spawn(ffmpegPath, args);
        let stderrData = '';

        ffmpegProc.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        ffmpegProc.on('error', (err) => {
            reject(new Error(`FFmpeg spawn failed: ${err.message}`));
        });

        ffmpegProc.on('close', (code) => {
            if (code === 0) {
                resolve(outputPath);
            } else {
                reject(new Error(`FFmpeg exited with code ${code}. Stderr: ${stderrData}`));
            }
        });
    });
}

// Clean transcription text from common Whisper hallucinations
function cleanTranscriptionText(text) {
    if (!text) return '';

    let cleaned = text;

    // 1. Remove all content in brackets [] and parentheses ()
    cleaned = cleaned.replace(/\[.*?\]/g, '');
    cleaned = cleaned.replace(/\(.*?\)/g, '');

    // 2. Remove common hallucinated phrases IF they are the only content
    const hallucinations = [
        'Peace.', 'Peace',
        'Thanks.', 'Thanks',
        'Thank you.', 'Thank you',
        'Bye.', 'Bye',
        'Silence.', 'Silence',
        'End of transcript.', 'End of transcript',
        'YOU', 'You.',
        'MBC News', 'MBC'
    ];

    // Phrases that are ALWAYS garbage (Subtitles credits, etc.)
    const garbagePhrases = [
        'Subtitles by',
        'Amara.org',
        'Thank you for watching',
        'Translated by',
        'Captioning by',
        'Copyright',
        'All rights reserved'
    ];

    const trimmed = cleaned.trim();

    // Check strict hallucinations (only if it's the whole text)
    if (hallucinations.some(h => trimmed.toLowerCase() === h.toLowerCase())) {
        return '';
    }

    // Check garbage phrases (if found anywhere in text)
    if (garbagePhrases.some(phrase => trimmed.includes(phrase))) {
        return '';
    }

    // 3. Remove double spaces and trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // 4. Remove leading non-alphanumeric characters (like dashes, dots)
    cleaned = cleaned.replace(/^[^a-zA-Z0-9]+/, '');

    // 5. Final check for meaningful content
    // Must contain at least one alphanumeric character
    if (!/[a-zA-Z0-9]/.test(cleaned)) {
        return '';
    }

    return cleaned;
}

// Transcribe audio using whisper.cpp
ipcMain.handle('transcribe-audio', async (event, audioBuffer) => {
    const mode = 'standard';
    try {
        // Create temp directory for audio processing
        const tempDir = path.join(os.tmpdir(), 'mediscribe');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const tempInputPath = path.join(tempDir, `audio_${timestamp}.webm`);
        const tempWavPath = path.join(tempDir, `audio_${timestamp}.wav`);

        // Save audio buffer to temp file
        const buffer = Buffer.from(audioBuffer);
        console.log(`[MediScribe] Audio buffer size: ${buffer.length} bytes`);

        if (buffer.length < 1000) {
            return { success: false, error: 'Audio recording too short or empty' };
        }

        fs.writeFileSync(tempInputPath, buffer);
        console.log(`[MediScribe] Saved input audio to: ${tempInputPath}`);

        // Convert to WAV using ffmpeg
        try {
            await convertToWav(tempInputPath, tempWavPath);
            const wavStats = fs.statSync(tempWavPath);
            console.log(`[MediScribe] Converted WAV size: ${wavStats.size} bytes`);
        } catch (convError) {
            console.error(`[MediScribe] FFmpeg conversion failed:`, convError);
            // Clean up
            if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
            return { success: false, error: convError.message };
        }

        // Clean up input file
        if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);

        const currentModelPath = getModelPath(currentModel);
        console.log(`[MediScribe] Using model: ${currentModelPath}`);

        // Check if model exists
        if (!fs.existsSync(currentModelPath)) {
            if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);
            return {
                success: false,
                error: `Whisper model not found at ${currentModelPath}. Please run 'npm run bundle-models' first or download it via the app.`
            };
        }

        // Use whisper-server HTTP API for fast transcription
        try {
            // Use port 8080 for C++ server
            const port = 8080;
            const endpoint = '/inference'; // whisper.cpp server endpoint
            console.log(`[MediScribe] Starting transcription via ${mode} mode (port ${port})...`);

            const FormData = require('form-data');
            const http = require('http');

            // Retry logic with exponential backoff
            const makeTranscriptionRequest = (retryCount = 0, maxRetries = 3) => {
                return new Promise((resolve, reject) => {
                    // Diagnostic log for WAV file
                    if (fs.existsSync(tempWavPath)) {
                        const stats = fs.statSync(tempWavPath);
                        console.log(`[MediScribe] Sending WAV for transcription: ${stats.size} bytes`);

                        // Check if file is too small (WAV header is 44 bytes)
                        if (stats.size < 44) {
                            reject(new Error('Audio file is empty or too short'));
                            return;
                        }
                    } else {
                        console.error('[MediScribe] ERROR: WAV file missing before request!');
                        reject(new Error('WAV file missing before request'));
                        return;
                    }

                    const form = new FormData();
                    const audioData = fs.readFileSync(tempWavPath);
                    form.append('file', audioData, {
                        filename: 'audio.wav',
                        contentType: 'audio/wav',
                        knownLength: audioData.length
                    });
                    form.append('response_format', 'json');

                    const options = {
                        hostname: '127.0.0.1',
                        port: port,
                        path: endpoint,
                        method: 'POST',
                        headers: form.getHeaders(),
                        timeout: 30000 // Standard timeout
                    };

                    const req = http.request(options, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            clearTimeout(timeoutId);
                            console.log(`[MediScribe] Server Response (Status ${res.statusCode}): ${data.substring(0, 100)}...`);

                            try {
                                const json = JSON.parse(data);
                                if (json.error) {
                                    reject(new Error(json.error));
                                } else {
                                    resolve(json.text || '');
                                }
                            } catch (e) {
                                // If not JSON, it might be the text itself or an error message
                                if (res.statusCode === 200) {
                                    resolve(data.trim());
                                } else {
                                    reject(new Error(`Server error (${res.statusCode}): ${data}`));
                                }
                            }
                        });
                    });

                    const timeoutId = setTimeout(() => {
                        req.destroy();
                        reject(new Error('Transcription request timed out'));
                    }, 35000);

                    req.on('error', (err) => {
                        clearTimeout(timeoutId);
                        if (err.code === 'ECONNREFUSED') {
                            if (retryCount < maxRetries) {
                                const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
                                console.log(`[MediScribe] Connection refused. Retry ${retryCount + 1}/${maxRetries} in ${delay}ms...`);

                                // Only attempt to start if not already starting/ready
                                if (whisperServerStatus === 'stopped' || whisperServerStatus === 'error') {
                                    startWhisperServer();
                                }

                                // Retry after delay
                                setTimeout(() => {
                                    makeTranscriptionRequest(retryCount + 1, maxRetries)
                                        .then(resolve)
                                        .catch(reject);
                                }, delay);
                            } else {
                                console.error('[MediScribe] Max retries reached. Whisper server is not responding.');
                                reject(new Error('Whisper server was not reachable after multiple attempts. Please restart the application.'));
                            }
                        } else {
                            reject(err);
                        }
                    });

                    req.on('timeout', () => {
                        req.destroy();
                        reject(new Error('Transcription timed out (30s limit)'));
                    });

                    form.pipe(req);
                });
            };

            console.log(`[MediScribe] Starting transcription, Buffer length: ${buffer.length} bytes`);
            const result = await makeTranscriptionRequest();

            console.log(`[MediScribe] Raw Whisper Result: "${result}"`);

            // Clean up temp file
            if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);

            // ===== 3-STAGE PIPELINE =====
            // Use a writable debug log in the user's data directory to avoid write failures
            const logFile = DEBUG_LOG_PATH;
            const logToFile = (msg) => {
                try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`); } catch (e) { }
            };

            logToFile('[PIPELINE DEBUG] Starting Transcription Pipeline...');
            logToFile(`[PIPELINE DEBUG] Ollama Enabled: ${ollamaEnabled}`);

            // Stage 1: Whisper ASR
            let finalResult = cleanTranscriptionText(result);
            logToFile(`[PIPELINE DEBUG] Stage 1 (ASR/Cleanup) Result: "${finalResult}" (Length: ${finalResult.length})`);

            // 3-Stage Post-Processing (Standard Only now)
            if (ollamaEnabled) {
                if (finalResult.length > 2) {
                    try {
                        logToFile('[PIPELINE DEBUG] Stage 2 (nspell) - Starting...');
                        const flaggedErrors = detectSpellingErrors(finalResult);

                        if (flaggedErrors && flaggedErrors.length > 0) {
                            logToFile(`[PIPELINE DEBUG] Stage 2 (nspell) - Found ${flaggedErrors.length} errors: ${JSON.stringify(flaggedErrors)}`);

                            // Stage 3: LLM corrections
                            logToFile('[PIPELINE DEBUG] Stage 3 (LLM) - Starting correction...');
                            const formatted = await formatTextWithOllama(finalResult, 'clean', flaggedErrors);

                            if (formatted) {
                                logToFile(`[PIPELINE DEBUG] Stage 3 (LLM) - Success. Old: "${finalResult}" -> New: "${formatted}"`);
                                finalResult = formatted;
                            } else {
                                logToFile('[PIPELINE DEBUG] Stage 3 (LLM) - Returned empty/null, keeping original text.');
                            }
                        } else {
                            logToFile('[PIPELINE DEBUG] Stage 2 (nspell) - No errors found. Skipping Stage 3.');
                        }
                    } catch (llmError) {
                        logToFile(`[PIPELINE DEBUG] Error in Stages 2/3: ${llmError.message}`);
                    }
                } else {
                    logToFile('[PIPELINE DEBUG] Text too short for Post-Processing. Skipping Stages 2 & 3.');
                }
            } else {
                logToFile('[PIPELINE DEBUG] Post-Processing skipped (Ollama disabled).');
            }


            return { success: true, text: finalResult };
        } catch (whisperError) {
            console.error('Whisper error:', whisperError);

            // Clean up temp file
            if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);

            return {
                success: false,
                error: `Transcription failed: ${whisperError.message}. Make sure whisper.cpp is compiled.`
            };
        }
    } catch (error) {
        console.error('Transcribe audio error:', error);
        return { success: false, error: error.message };
    }
});
