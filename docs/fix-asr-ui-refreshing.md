# Fix: UI Refreshing/Flickering in ASR Model Selector

## Issue
Users reported that the ASR (Whisper) model selector also "keeps refreshing," causing the UI to flicker or show a loading state every few seconds.

## Root Cause
The `ModelSelector` component (for ASR/Whisper models) uses a periodic polling mechanism (every 5 seconds) to check for downloading/active model status.
The `fetchModels` function was calling `setLoading(true)` at the start of every poll. This caused the component to transition to a `loading` state (triggering a re-render and potentially replacing the selector with a spinner) and then back to `loaded` state every 5 seconds.

## Solution Implemented

Modified `src/components/model-selector.tsx` to remove `setLoading(true)` from the polling function.
- **Initial Load**: `loading` state initializes to `true`. The first `fetchModels` call completes and sets it to `false`.
- **Subsequent Polls**: `fetchModels` runs silently in the background, updating the model list and status without toggling the `loading` flag, creating a seamless user experience.

## Testing Instructions
1. Open the ASR model selector (Whisper models).
2. Watch it for >10 seconds.
3. **Verify**: The UI remains stable and does not flicker, dim, or show a loading spinner periodically.

## Files Modified
- `src/components/model-selector.tsx`
