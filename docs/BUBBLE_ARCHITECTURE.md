# Bubble Button Architecture Change

## Problem
The floating bubble button was previously implemented using a Data URL string in `main.js`. This caused severe IPC communication issues because:
1. Data URLs have restricted security contexts in modern Electron.
2. `nodeIntegration` often fails or behaves unpredictably in Data URLs.
3. Preload scripts can struggle to bridge the gap in this specific context.

## Solution
We have migrated the bubble implementation to a dedicated structure:
1. **File:** `electron/bubble.html`
   - Contains all HTML, CSS, and JS for the bubble.
   - Uses `require('electron').ipcRenderer` directly (Node Integration).
2. **Main Process:** `electron/main.js`
   - Uses `floatingButton.loadFile(...)` to load the local file.
   - Sets `nodeIntegration: true` and `contextIsolation: false` for this trusted internal window.
3. **IPC Logic:**
   - Bubble -> Main: `ipcRenderer.send('trigger-toggle-recording')`
   - Main -> Bubble: `floatingButton.webContents.send('rec-state-change', ...)`

## Benefits
- **Reliability:** Local files are first-class citizens in Electron.
- **Maintainability:** HTML/CSS/JS is separated from the main process logic.
- **Performance:** No need to re-encode large strings on every create.

This change permanently resolves the "unresponsive click" issues.
