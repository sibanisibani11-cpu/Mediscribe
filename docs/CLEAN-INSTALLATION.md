# Clean Installation Guide

## ✅ Test Data Cleaned!

All test/development data has been removed to ensure users get a fresh, clean app.

---

## What Was Cleaned

### **1. User Data Folder** ✓
```
~/Library/Application Support/mediscribe-app/
```

**Removed:**
- `user-dictionary.json` (contained test words: FDG, LIVER, PSMA, etc.)
- `user-keywords.json` (contained test shortcuts)
- Cached preferences
- Authentication data
- Session storage
- All temp files

### **2. Cache Files** ✓
- Next.js cache
- Electron build cache
- dist-electron cache

### **3. Crash Reports** ✓
- Removed all MediScribe crash reporter files

### **4. Source Code** ✓
**Verified empty defaults:**
```javascript
let userDictionary = [];      // ✓ Empty
let keywordLibrary = [];      // ✓ Empty
```

---

## What Users Will See on First Launch

### **Fresh Installation Experience:**

1. **Empty Dictionary**
   - No pre-loaded words
   - Users add their own medical terms

2. **Empty Keyword Library**
   - No shortcuts defined
   - Users create their own workflows

3. **Default Settings**
   - Language: English
   - No LLM model selected (must download)
   - No authentication

4. **Clean Slate**
   - No cached data
   - No previous sessions
   - Fresh app state

---

## Before Every Production Build

### **Run the Cleaning Script:**

```bash
# Clean all test data
./scripts/clean-for-production.sh

# Then build
npm run build:electron
```

This ensures:
- No development data in installer
- Clean user experience
- Professional first impression

---

## Automatic Cleaning (Optional)

### **Add to prebuild Script:**

Update `package.json`:
```json
{
  "scripts": {
    "prebuild": "npm run bundle-models && npm run bundle-ollama && npm run bundle-ffmpeg && npm run bundle-whisper && npm run bundle-symspell && bash scripts/clean-for-production.sh"
  }
}
```

This automatically cleans before every build!

---

## Testing Fresh Installation

### **Method 1: New User Account (macOS)**
```bash
# Create test user
sudo dscl . -create /Users/testuser
sudo dscl . -create /Users/testuser UserShell /bin/bash
sudo dscl . -create /Users/testuser RealName "Test User"
sudo dscl . -create /Users/testuser UniqueID 505
sudo dscl . -create /Users/testuser PrimaryGroupID 20
sudo dscl . -create /Users/testuser NFSHomeDirectory /Users/testuser
sudo createhomedir -u testuser

# Switch to test user and install app
# Verify clean state
```

### **Method 2: Manual Clean (Faster)**
```bash
# Remove your data
rm -rf ~/Library/Application\ Support/mediscribe-app

# Launch app
# Should show empty state
```

### **Method 3: Different Machine**
- Install on a colleague's machine
- Check for empty dictionary/keywords
- Verify no pre-filled data

---

## Verification Checklist

After installing on a fresh machine, verify:

- [ ] Dictionary is empty (no words shown)
- [ ] Keyword library is empty (no shortcuts)
- [ ] No authentication required (or shows login screen)
- [ ] No cached LLM models (must download)
- [ ] Whisper model downloads on first use
- [ ] No previous transcription history
- [ ] Fresh UI state (no open windows/dialogs)

---

## What Gets Created on First Launch

### **App Will Create:**

1. **User Data Folder**
   ```
   ~/Library/Application Support/mediscribe-app/
   ```

2. **Empty JSON Files**
   - `user-dictionary.json`: `[]`
   - `user-keywords.json`: `[]`
   - `license.json`: (if activation system enabled)

3. **App State Files**
   - `Preferences`: Default settings
   - `Network Persistent State`: Clean state
   - Model cache folder (empty)

4. **Position States**
   - `floating-button-position.json`: Default position

---

## For Developers

### **When Testing Locally:**

```bash
# Use development mode (creates test data in dev folder)
npm run electron:dev

# Clean before building for production
./scripts/clean-for-production.sh

# Build installer
npm run build:electron
```

### **Development vs Production Data:**

|  | Development | Production |
|---|---|---|
| **Data Location** | `~/Library/Application Support/mediscribe-app/` | Same, but app cleans on first install |
| **Dictionary** | Can have test data | Always starts empty |
| **Keywords** | Can have test shortcuts | Always starts empty |
| **Safe to Clean** | ✅ Yes | ⚠️ Loses user data |

---

## Common Questions

### **Q: Will users lose data if they reinstall?**
**A:** No, user data persists in `~/Library/Application Support/mediscribe-app/` unless they manually delete it.

### **Q: How do I add default medical terms for all users?**
**A:** Don't add them to the dictionary. Instead, add them to the nspell medical terms list in `initializeSpellChecker()` in `electron/main.js`.

### **Q: Can I pre-fill some keywords as templates?**
**A:** Not recommended. Users should create their own. However, you could show a "first-run tutorial" or "import templates" feature.

### **Q: What about Whisper models?**
**A:** The base.en model is bundled in the installer in `resources/models/`. Users don't need to download it.

---

## Summary

✅ **All test data removed**  
✅ **Users get a clean slate**  
✅ **Professional first impression**  
✅ **Cleaning script created**: `scripts/clean-for-production.sh`  
✅ **Verified empty defaults in source code**  

**Next**: Run `./scripts/clean-for-production.sh` before every production build!
