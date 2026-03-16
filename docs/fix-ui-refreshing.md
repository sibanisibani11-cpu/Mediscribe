# Fix: UI Refreshing/Flickering in Ollama Selector

## Issue
Users reported that the selected LLM model "keeps refreshing every few seconds". This was causing the UI to briefly show a loading state or reset, disrupting interaction.

## Root Cause
The `OllamaSelector` component has a periodic polling mechanism (every 10 seconds) to check for installed models and Olllama status.
The `fetchModels` function was calling `setLoading(true)` at the start of every poll. This caused the component to transition to a `loading` state (triggering a re-render and potential UI layout shift) and then back to `loaded` state every 10 seconds.

## Solution Implemented

Modified `src/components/ollama-selector.tsx` to remove `setLoading(true)` from the polling function.
- **Initial Load**: `loading` state initializes to `true`. The first `fetchModels` call completes and sets it to `false`.
- **Subsequent Polls**: `fetchModels` runs silently in the background, updating the model list and status without toggling the `loading` flag, thus preventing any visual flicker or reset.

## Testing Instructions
1. Open the Ollama model selector.
2. Watch it for >10 seconds.
3. **Verify**: The UI remains stable and does not flicker, dim, or show a loading spinner periodically.

## Files Modified
- `src/components/ollama-selector.tsx`
