# MediScribe v0.1.0 Release Notes

## Summary
This release focuses on platform stability (macOS Apple Silicon & Windows), preventing AI hallucinations, and fixing critical runtime errors with the Whisper transcription server and Ollama downloads.

## 🚀 New Features
- **Download Cancellation**: Users can now pause/cancel Ollama model downloads.
- **Improved Windows Support**: Build process and runtime specifically optimized for Windows 10/11.

## 🐛 Bug Fixes

### 1. Whisper Server Unreachable / "Not Compiled"
- **Issue**: Users saw "Make sure whisper.cpp is compiled" error.
- **Fix**: 
  - Added robust checks for server binary permissions (macOS `chmod`).
  - Implemented model existence check before server start.
  - Fixed status reporting to correctly identify if the server is running.
- **Impact**: Server starts reliably on both Windows and macOS.

### 2. LLM Hallucinations (Llama 3.2)
- **Issue**: Llama 3 models added unwanted conversational text ("Here is the corrected text...").
- **Fix**: Enforced strict system prompts and low temperature (0.1) for deterministic, correction-only output.

### 3. UI Refreshing / Flickering
- **Issue**: Model selection lists would flicker or reset every 10 seconds.
- **Fix**: Optimized background polling to update state silently without triggering "loading" spinners.

### 4. Windows Keyword Expansion Loop
- **Issue**: Keyword expansion would enter an infinite delete/type loop.
- **Fix**: Added `isExpanding` flag to temporarily disable keyboard listener during expansion.

### 5. Ollama Download Issues
- **Issue**: Downloads failed/stalled or showed no progress.
- **Fix**: Fixed binary path detection and progress bar parsing regex.

### 6. Keyword Dialog & Library UI
- **Issue**: Expansion text was truncated in both the popup dialog and the library manager.
- **Fix**: 
  - **Popup Dialog**: Increased width to 600px, enabled wrapping, and fixed dynamic resizing.
  - **Windows Typing**: Fixed issue where text wasn't typing into external apps (Word, Notepad) by implementing robust window focus management.
  - **Library Manager**: 
    - **Smart Auto-Resize**: Text areas now natively expand to fit content (`field-sizing: content`).
    - **Enter Behavior**: Enter creates a new line; Ctrl+Enter saves.
    - Removed truncation in the list view to show full wrapped text.

### 7. Dictation & LLM Optimization
- **Real-time Speed**: Reduced transcription latency (1s chunks).
- **Anti-Hallucination**: 
  - **Default Mode**: Changed to "Strict Spell Check" (removes unrequested Clinical Assessment/Plan).
  - Added strict filter for "Subtitles by", "Thank you for watching".
  - Injected **Keyword Library** & **Dictionary** terms into LLM context.
  - LLM now "learns" your preferred spellings from your library.
The following artifacts have been generated with all fixes:
- **Windows**: `MediScribe Setup 0.1.0.exe` (x64)
- **macOS**: `MediScribe-0.1.0-arm64.dmg` (Apple Silicon)

## ⚠️ Important for Users
- **macOS**: After installing, if you see "Damaged and can't be opened", run the provided `fix-gatekeeper.sh` script or `xattr -cr /Applications/MediScribe.app`.
- **Windows**: Bypass SmartScreen warning by clicking "More info" -> "Run anyway".
