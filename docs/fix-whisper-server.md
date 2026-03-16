# Fix: Whisper Server Not Reachable

## Issue
Users reported "Transcription failed: whisper server was not reachable. Make sure whisper.cpp is compiled."

## Root Causes
1. **Permissions**: The `whisper-server` binary on macOS/Linux might not have executable permissions (`chmod +x`) after being packaged or unzipped.
2. **Model Missing**: The server startup logic hardcoded `base.en`. If that model wasn't downloaded, the server would fail to start silently.
3. **Status Check**: The `check-whisper-status` IPC handler was checking for a legacy `whisper-node` binary path instead of the actual `whisper-server` executable, leading to false "Offline" reports in the UI.

## Solution Implemented

### 1. Robust Server Startup (`electron/main.js`)
- Added `fs.chmodSync(serverPath, '755')` to ensure the binary is executable on macOS/Linux before spawning.
- Added a check for model existence.
- Implemented fallback logic: if the currently selected model is missing, try `base.en` before failing.
- Improved logging for server startup arguments.

### 2. Correct Status Reporting
- Updated `check-whisper-status` to:
  - Use `getWhisperServerPath()` (the bundled binary).
  - Check `whisperServerProcess !== null` to confirm the process is actually running.
  - Return `serverRunning` status to frontend.

### 3. Frontend Updates
- The UI will now accurately reflect if the server is running.
- If the server isn't running, the transcription request will fail fast, but now the backend tries harder to keep it running.

## Troubleshooting
If this error persists:
1. **Check Logs**: Open developer console (Cmd+Option+I / F12) and look for `[MediScribe] Starting Whisper server`.
2. **Download Model**: Ensure at least one model (e.g., `base.en`) is downloaded via the Model Selector.
4. **Windows Users**: 
   - Ensure you allow the application through Windows Firewall if prompted (it listens on port 8080).
   - If "Windows protected your PC" appears on install, click "More info" > "Run anyway".
   - `whisper-server.exe` requires the model file to be present to start.

## Files Modified
- `electron/main.js`
