# Feature: Pause/Cancel LLM Model Downloads

## New Functionality
Users can now cancel (stop/delete) an ongoing LLM model download. Since Ollama supports resuming partial downloads, this effectively acts as a "Pause" feature (resuming happens automatically when retrying the download).

## Implementation Details

### Backend (`electron/main.js`)

1. **Process Tracking**: 
   - Introduced `activeDownloads` object to store references to spawned `ollama pull` child processes.
   - Key: `modelName`, Value: `ChildProcess` instance.

2. **Clean Up Logic**:
   - When a process closes (success or error), it is removed from `activeDownloads`.
   - Specific exit codes (SIGTERM, etc.) are handled as "cancelled" events rather than errors.

3. **Cancellation Handler**:
   - New IPC handler `cancel-ollama-download`.
   - Looks up the process by `modelName` and sends `SIGTERM` (`process.kill()`).

### Frontend (`src/components/ollama-selector.tsx`)

1. **Cancel Button**:
   - The download button now serves dual purposes.
   - **State: Idle**: Shows 'Download' icon. Click -> Starts download.
   - **State: Downloading**: Shows a spinner (Loader).
   - **Hover State (Downloading)**: The spinner is replaced by a red 'X' icon.
   - **Action**: Clicking the 'X' triggers the cancellation flow.

2. **Optimistic UI Updates**:
   - Immediately removes the progress bar and resets download state upon cancellation to provide instant feedback.

## User Experience
1. User clicks download -> Progress bar appears, spinner icon spins.
2. User hovers over spinner -> Icon changes to 'X'.
3. User clicks 'X' -> Download stops, progress bar disappears, "Download Cancelled" toast appears.

## Testing Instructions
1. Start downloading a large model (e.g., Llama 3).
2. Wait for progress bar to appear.
3. Hover over the spinning loader button.
4. Click the 'X'.
5. **Verify**:
   - Download stops immediately.
   - Progress bar vanishes.
   - Toast notification confirms cancellation.
   - You can start downloading again later (it should resume progress if Ollama cached the chunks).

## Files Modified
- `electron/main.js`: Active download tracking and cancel handler.
- `electron/preload.js`: Expose cancel API.
- `src/components/ollama-selector.tsx`: UI updates for cancel button.
