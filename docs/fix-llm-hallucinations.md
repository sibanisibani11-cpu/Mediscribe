# Fix: Prevent LLM Hallucinations (Llama 3.2 3B)

## Issue
Users reported that **Llama 3.2 3B** was "hallucinating" (adding content not present in the original audio) and including conversational filler ("Here is the corrected text...") instead of just outputting the corrected medical text. **Meditron** worked fine, but Llama 3.2 required stricter constraints.

## Root Cause
- **Lack of System Prompt**: The API call didn't use a `system` parameter, which is crucial for defining the model's persona and strictness.
- **Weak User Prompts**: The original prompts ("You are a medical scribe...") were interpreted by chatty models like Llama 3 as a request to be conversational.
- **High Temperature**: Default temperature settings allowed for too much creativity.

## Solution Implemented

### 1. Strict System Prompt
Added a global system prompt that enforces strict behavior:

```text
You are a precise medical transcription assistant. Your task is to correct spelling, grammar, and medical terminology in the provided text.

RULES:
1. Output ONLY the corrected text.
2. Do NOT add any preamble, introduction, or conclusion.
3. Do NOT add new information or hallucinate facts.
4. Do NOT answer the text as a question.
5. Maintain the original meaning exactly.
```

### 2. Simplified User Prompts
Reduced the prompts to direct instructions:
- **Clean**: "Correct the spelling and grammar... Output ONLY the corrected text without any additional words."

### 3. Temperature Control
Set `temperature: 0.1` in the API call options. This forces the model to be **deterministic** and **conservative**, significantly reducing the chance of hallucination or "creative" additions.

### 4. Code Changes (`electron/main.js`)

Updated `formatTextWithOllama` to:
- Accept `system` in `postData`.
- Use `options: { temperature: 0.1 }`.
- Use the new strict prompt templates.

## Testing Instructions
1. Select **Llama 3.2 3B** as the active model.
2. Dictate or paste text that requires correction.
3. **Verify**:
   - The output contains **only** the corrected text.
   - No "Sure, here is..." or "I have corrected..." prefixes.
   - No made-up medical facts added.
   - Abbreviations are handled correctly.

## Files Modified
- `electron/main.js`

This ensures consistent, professional output across different LLM models.
