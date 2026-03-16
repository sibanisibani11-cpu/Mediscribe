# Bubble Button Fix - Complete Analysis

## Signal Flow
1. User clicks bubble → `mousedown` event in bubble HTML
2. Bubble calls `window.electron.triggerToggleRecording()`
3. Preload.js sends `trigger-toggle-recording` IPC to main process
4. Main process receives it and sends `toggle-recording` to renderer
5. MediScribeApp receives `toggle-recording` event
6. DictationView receives `toggle-recording` event (duplicate listener!)
7. Both try to call `stableTrigger()` which calls `currentToggleLogic.current()`
8. `currentToggleLogic` checks `stateRef.current` and calls `stopRecording()`
9. `stopRecording` checks if `stateRef.current === 'recording'`

## IDENTIFIED ISSUES

### Issue 1: Double Listener
Both MediScribeApp and DictationView are listening to 'toggle-recording'.
This causes the toggle to fire TWICE, canceling itself out.

### Issue 2: State Check Too Strict
The guard `if (stateRef.current !== 'recording')` prevents stopping during transcription.
But the MediaRecorder might already be stopped by one of the double triggers.

### Issue 3: Ref Update Timing
`stateRef.current = recordingState` happens synchronously, but React state updates are async.
If MediaRecorder triggers `onstop` → sets state to 'transcribing', the ref might not update fast enough.

## SOLUTION

**Remove ALL parent-child communication and make DictationView 100% self-contained:**

1. Remove `onRegisterTrigger` prop entirely
2. Remove `setRegisterToggleTrigger` from MediScribeApp
3. DictationView listens DIRECTLY to 'toggle-recording'
4. Fix the state guard to allow stopping from ANY state except 'idle'
5. Add a simple debounce (100ms) to prevent double-clicks
