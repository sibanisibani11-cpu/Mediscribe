# Fix: Ollama Download Progress Bar Not Showing

## Issue
Users reported that when downloading an LLM model, the UI indicated "downloading" (spinner in button) but the progress bar was missing or not updating.

## Root Causes

1. **Robustness of Output Parsing**: 
   - The `ollama pull` command output can vary (ANSI codes, multiple progress updates per line, different formats on Windows vs macOS).
   - The previous regex `(\d+)%` was too simple and could fail on ANSI-colored output.

2. **UI State Logic**:
   - The progress bar visibility relied solely on `downloadProgress[model.name]` being defined.
   - If the start of the download took time (e.g., "pulling manifest"), `downloadProgress` would be undefined, so the progress bar wouldn't render, even though the user had clicked download.

## Solutions Implemented

### 1. Enhanced Output Parsing (`electron/main.js`)

Updated the parsing logic to:
- Regex: `/(\d{1,3})%/g` to find all percentage-like numbers.
- ANSI Handling: The regex extraction now ignores surrounding ANSI codes effectively by targeting the number pattern.
- Logic: Takes the **last** match in a chunk to ensure the most recent progress is sent.

```javascript
// New Parsing Logic
const matches = output.match(/(\d{1,3})%/g);
if (matches && matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const progress = parseInt(lastMatch.replace('%', ''));
    // check isNaN and send...
}
```

### 2. Improved UI Feedback (`src/components/ollama-selector.tsx`)

Updated the rendering logic to show the progress bar immediately upon clicking download:

```javascript
// Before
const isDownloading = progress !== undefined;

// After
const isDownloading = progress !== undefined || downloading === model.name;
const displayProgress = progress ?? 0;
```

And updated the JSX to use `displayProgress`:
```tsx
<div style={{ width: `${displayProgress}%` }} />
<span>{displayProgress}%</span>
```

## Result

- **Immediate Feedback**: As soon as the user clicks "Download", the progress bar appears at 0%.
- **Robust Updates**: The progress bar updates reliably even with complex terminal output from Ollama.
- **Better UX**: No "invisible" downloading state.

## Testing Instructions

1. Open Ollama Selector.
2. Click "Download" on a model.
3. **Observation**: 
   - Spinner appears in the button.
   - Progress bar appears properly below the model description (starts at 0%).
   - Progress bar fills up as download proceeds.

## Files Modified
- `electron/main.js`
- `src/components/ollama-selector.tsx`
