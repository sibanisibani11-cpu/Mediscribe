# UI Improvement: Keyword Expansion Dialog

## Issue
Users reported that the keyword expansion dialog was too small and truncated long text descriptions, making it difficult to verify the full content before expansion. They requested a larger view with text wrapping.

## Solution Implemented

### 1. Larger Window Dimensions
- **Width**: Increased from 360px to **600px**.
- **Height**: Dynamic height calculation now assumes taller items (120px vs 54px) to accommodate wrapped text.
- **Max Height**: Increased to 600px.

### 2. Enhanced CSS Styling
- **Text Wrapping**: Removed `white-space: nowrap` and `text-overflow: ellipsis`. Added `white-space: pre-wrap` to preserve paragraphs and `word-wrap: break-word` to handle long words.
- **Scrolling**: Added `max-height: 300px` and `overflow-y: auto` to individual description blocks, allowing users to scroll through very long expansions.
- **Readability**:
  - Increased font size to 13px.
  - Added background color and padding to the description block to distinct it from the keyword.
  - Enabled `user-select: text` to allow copying parts of the text if needed.

## Files Modified
- `electron/main.js`: `createKeywordDialog` and `updateKeywordDialog` functions.

## Testing
1. Add a keyword with a long description (multiple paragraphs).
2. Type the keyword trigger.
3. The dialog should now be wider, show the full text wrapped, and allow scrolling if it exceeds 300px height.
