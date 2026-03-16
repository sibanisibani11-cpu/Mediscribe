# Fix: Ollama Model Download Error (ENOENT)

## Issue
When trying to download LLM models (Ollama models) in the app, users got a JavaScript runtime error:

```
Uncaught Exception:
Error: spawn ollama ENOENT
at ChildProcess._handle.onexit (node:internal/child_process:285:19)
```

**Affected Platforms**: Both Windows and macOS

## Root Cause

The `download-ollama-model` handler was trying to spawn the `ollama` command directly:

```javascript
const pullProcess = spawn('ollama', ['pull', modelName]);
```

This assumes `ollama` is in the system PATH, which it isn't because:
1. **We bundle Ollama** in `resources/bin/ollama` (or `ollama.exe` on Windows)
2. **Bundled binaries aren't in PATH** - they're in the app's resource directory
3. **spawn() with just 'ollama'** looks in PATH, doesn't find it → ENOENT (Error NO ENTry)

## Solution Implemented

### Changed Code (line 2703-2727)

#### Before:
```javascript
const { spawn } = require('child_process');
console.log(`[Ollama] Starting download: ${modelName}`);

return new Promise((resolve, reject) => {
    const pullProcess = spawn('ollama', ['pull', modelName]);
    // ...
});
```

#### After:
```javascript
const { spawn } = require('child_process');
console.log(`[Ollama] Starting download: ${modelName}`);

// Get the bundled Ollama binary path
const bundledPath = isDev
    ? path.join(__dirname, '../resources/bin/ollama')
    : path.join(process.resourcesPath, 'bin/ollama');

const ollamaBinaryPath = process.platform === 'win32' 
    ? bundledPath + '.exe' 
    : bundledPath;

console.log(`[Ollama] Using binary: ${ollamaBinaryPath}`);
console.log(`[Ollama] Binary exists: ${fs.existsSync(ollamaBinaryPath)}`);

// Check if binary exists before spawning
if (!fs.existsSync(ollamaBinaryPath)) {
    const error = `Ollama binary not found at: ${ollamaBinaryPath}`;
    console.error(`[Ollama] ${error}`);
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('ollama-download-error', { modelName, error });
    }
    return { success: false, error };
}

return new Promise((resolve, reject) => {
    const pullProcess = spawn(ollamaBinaryPath, ['pull', modelName]);
    // ...
});
```

### Added Error Handler (line 2733-2741)

Also added a spawn error handler that was missing:

```javascript
pullProcess.on('error', (error) => {
    console.error(`[Ollama] Spawn error:`, error);
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('ollama-download-error', { 
            modelName, 
            error: error.message 
        });
    }
    reject(error);
});
```

## Key Improvements

### 1. **Uses Bundled Binary Path**
- Development: `../resources/bin/ollama`
- Production: `process.resourcesPath/bin/ollama`
- Windows: Adds `.exe` extension

### 2. **Pre-flight Check**
- Verifies binary exists before spawning
- Provides clear error message if not found
- Prevents ENOENT error

### 3. **Better Error Handling**
- Catches spawn errors explicitly
- Sends error to UI via IPC
- Logs detailed error information

### 4. **Logging**
- Logs binary path being used
- Logs whether binary exists
- Easier to debug path issues

## Binary Path Resolution

The bundled Ollama binary is located at:

| Environment | Platform | Path |
|-------------|----------|------|
| Development | macOS | `{__dirname}/../resources/bin/ollama` |
| Development | Windows | `{__dirname}/../resources/bin/ollama.exe` |
| Production | macOS | `{resourcesPath}/bin/ollama` |
| Production | Windows | `{resourcesPath}/bin/ollama.exe` |

Example production paths:
- **macOS**: `/Applications/MediScribe.app/Contents/Resources/bin/ollama`
- **Windows**: `C:\Program Files\MediScribe\resources\bin\ollama.exe`

## Testing Instructions

### Test on macOS:

1. **Open the app**
2. **Open DevTools** (Cmd+Option+I)
3. **Go to Dictation tab** → LLM selector
4. **Click on a model** that's not downloaded
5. **Click Download**
6. **Check Console**:
   ```
   [Ollama] Starting download: llama3.2:3b
   [Ollama] Using binary: /Applications/MediScribe.app/Contents/Resources/bin/ollama
   [Ollama] Binary exists: true
   [Ollama] Downloading...
   ```
7. **Expected**: Download starts, progress shows

### Test on Windows:

1. **Open the app**
2. **Open DevTools** (F12)
3. **Go to Dictation tab** → LLM selector
4. **Click on a model** that's not downloaded
5. **Click Download**
6. **Check Console**:
   ```
   [Ollama] Starting download: llama3.2:3b
   [Ollama] Using binary: C:\Program Files\MediScribe\resources\bin\ollama.exe
   [Ollama] Binary exists: true
   [Ollama] Downloading...
   ```
7. **Expected**: Download starts, progress shows

### If Binary Not Found:

Console will show:
```
[Ollama] Using binary: {path}
[Ollama] Binary exists: false
[Ollama] Ollama binary not found at: {path}
```

**Solution**: Binary wasn't bundled correctly during build. Check:
```bash
# macOS
ls -lh dist-electron/mac/MediScribe.app/Contents/Resources/bin/

# Windows
dir dist-electron\win-unpacked\resources\bin\
```

## Error Messages

### Before Fix:
```
Error: spawn ollama ENOENT
```
**Meaning**: Can't find the ollama command

### After Fix - If Binary Missing:
```
[Ollama] Ollama binary not found at: {path}
```
**Meaning**: Binary should be at this path but isn't

### After Fix - If Spawn Fails:
```
[Ollama] Spawn error: {error details}
```
**Meaning**: Binary exists but failed to start

## Common Issues & Solutions

### Issue 1: Binary Not Found
**Symptoms**: 
```
[Ollama] Binary exists: false
```

**Causes**:
- Build didn't include resources
- Binary not in resources/bin folder
- Wrong path resolution

**Solution**:
```bash
# Check if binary exists in source
ls -lh resources/bin/ollama

# Re-run bundling
npm run bundle-ollama

# Rebuild
npm run build
npx electron-builder --mac  # or --win
```

### Issue 2: Permission Denied
**Symptoms** (macOS):
```
[Ollama] Spawn error: Error: EACCES
```

**Solution**:
```bash
# Make binary executable
chmod +x dist-electron/mac/MediScribe.app/Contents/Resources/bin/ollama
```

### Issue 3: Download Starts But Fails
**Symptoms**:
```
[Ollama] Download failed with code 1
```

**Causes**:
- Network issue
- Model name invalid
- Ollama server not running

**Solution**:
- Check network connection
- Verify model name is correct
- Ensure Ollama server started successfully

## Files Modified

- **electron/main.js**
  - Lines 2703-2727: Added bundled binary path resolution
  - Lines 2733-2741: Added spawn error handler

## Build Process

After this fix, binaries are correctly located:

### macOS Build:
```bash
npx electron-builder --mac
# Binary bundled at: MediScribe.app/Contents/Resources/bin/ollama
```

### Windows Build:
```bash
npx electron-builder --win
# Binary bundled at: resources/bin/ollama.exe
```

## Summary

✅ **Issue**: spawn ollama ENOENT error when downloading models  
✅ **Cause**: Using 'ollama' command instead of bundled binary path  
✅ **Fix**: Resolve bundled binary path and use it for spawn  
✅ **Added**: Binary existence check + error handler  
✅ **Platforms**: Fixed for both macOS and Windows  
✅ **Logging**: Added detailed logging for debugging  

Model downloads should now work correctly on both platforms! 🚀
