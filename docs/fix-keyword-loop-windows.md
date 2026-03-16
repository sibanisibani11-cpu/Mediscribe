# Fix: Infinite Keyword Expansion Loop on Windows

## Issue
On Windows, when a keyword was expanded, the application would enter an infinite loop:
1. Expansion types the text (e.g., "blood pressure").
2. The keyboard listener detects the typed keys.
3. It deletes the last word and re-types the expansion.
4. This repeats until the floating button is closed.

## Root Cause
The `uiohook-napi` library captures **all** keyboard events, including those generated programmatically by the application itself (via `SendKeys` or `PowerShell`).
When the application typed the expansion text, the listener treated these keystrokes as user input, leading to a feedback loop where the expansion itself triggered further processing or buffer manipulation.

## Solution Implemented

Introduced an `isExpanding` state flag to suppress keyboard event handling during the expansion process.

### Code Changes (`electron/main.js`)

1. **State Variable**:
   Declared `let isExpanding = false;` globally for the keyboard handler context.

2. **Event Suppression**:
   Modified `handleKeyboardEvent` to return immediately if `isExpanding` is true.
   ```javascript
   function handleKeyboardEvent(e) {
       if (!keyboardListenerActive || isExpanding) return;
       // ...
   }
   ```

3. **State Management**:
   Updated `confirmKeywordExpansion` to set the flag:
   ```javascript
   async function confirmKeywordExpansion(isTrigger = false) {
       // ...
       isExpanding = true; // Start suppression
       
       // ... delete characters ...
       // ... type text ...
       
       await typeText(keywordData.description);
       
       // Stop suppression after a safety delay
       setTimeout(() => {
           isExpanding = false;
           typedBuffer = ''; // Clear buffer to prevent re-triggering
       }, 100);
   }
   ```

## Why This Works
- **Prevents Self-Listening**: The application effectively "closes its ears" while it is "speaking" (typing).
- **Clears Buffer**: Resetting `typedBuffer` ensures that any residual state from the expansion doesn't trigger a new match immediately after the flag is reset.
- **Safety Delay**: The 100ms timeout ensures that all simulated keystrokes have finished processing before the listener becomes active again.

## Testing Instructions
1. Open MediScribe on Windows.
2. Enable Keyword Mode.
3. Add a keyword (e.g., `bp` -> `blood pressure`).
4. Type `bp` and press Enter in Notepad.
5. **Expected**: The text "bp" is replaced by "blood pressure" **once**.
6. **Failure Case**: The text would be deleted and retyped repeatedly.

## Files Modified
- `electron/main.js`

This fix ensures stable and reliable keyword expansion without feedback loops.
