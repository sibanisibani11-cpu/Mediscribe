# macOS "Damaged App" Error - Solutions

## The Problem

When opening MediScribe on macOS, you may see this error:

> **"MediScribe is damaged and can't be opened. You should move it to the Trash."**

This is **NOT** because the app is actually damaged. It's macOS Gatekeeper protecting your system from unsigned applications.

## Why This Happens

1. **No Code Signing**: MediScribe is not signed with an Apple Developer certificate ($99/year)
2. **Gatekeeper Protection**: macOS blocks unsigned apps by default
3. **Quarantine Attribute**: Downloaded files are marked as potentially unsafe

## Solutions (Choose One)

### ✅ Solution 1: Remove Quarantine (Recommended)

This is the easiest and safest method:

#### **Option A: Use the Fix Script**
1. Download the `fix-gatekeeper.sh` script
2. Open Terminal
3. Navigate to the folder containing the script:
   ```bash
   cd ~/Downloads
   ```
4. Make it executable:
   ```bash
   chmod +x fix-gatekeeper.sh
   ```
5. Run the script:
   ```bash
   ./fix-gatekeeper.sh
   ```

#### **Option B: Manual Terminal Command**
Open Terminal and run:

```bash
sudo xattr -cr /Applications/MediScribe.app
```

Enter your password when prompted.

### ✅ Solution 2: Right-Click Method

If the quarantine is removed but you still get warnings:

1. **Don't** double-click the app
2. **Right-click** (or Control+click) on MediScribe.app
3. Select **"Open"** from the menu
4. Click **"Open"** in the security dialog
5. The app will now open and remember this permission

### ✅ Solution 3: System Settings Override

For macOS Ventura (13.0) and later:

1. Try to open MediScribe (it will be blocked)
2. Open **System Settings**
3. Go to **Privacy & Security**
4. Scroll down to find the security message about MediScribe
5. Click **"Open Anyway"**
6. Enter your password
7. Try opening MediScribe again
8. Click **"Open"** in the final dialog

### ⚠️ Solution 4: Disable Gatekeeper (Not Recommended)

**Only use this if nothing else works**, and re-enable afterwards:

```bash
# Disable Gatekeeper
sudo spctl --master-disable

# Open MediScribe

# Re-enable Gatekeeper (IMPORTANT!)
sudo spctl --master-enable
```

## For Developers Building the App

### Temporary Fix (Local Testing)

After building, remove quarantine from the built app:

```bash
# Intel build
xattr -cr dist-electron/mac/MediScribe.app

# ARM64 build
xattr -cr dist-electron/mac-arm64/MediScribe.app
```

### Permanent Fix (Production)

Get an Apple Developer account and code sign your app:

#### Step 1: Get Apple Developer Certificate
1. Join [Apple Developer Program](https://developer.apple.com) ($99/year)
2. Create a **Developer ID Application** certificate
3. Download and install in Keychain Access

#### Step 2: Update package.json

```json
{
  "build": {
    "mac": {
      "identity": "Developer ID Application: Your Name (TEAM_ID)",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    }
  }
}
```

#### Step 3: Create Entitlements File

Create `build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.device.audio-input</key>
    <true/>
    <key>com.apple.security.automation.apple-events</key>
    <true/>
</dict>
</plist>
```

#### Step 4: Build and Sign

```bash
# Build will now be automatically signed
npm run build:electron

# Verify signing
codesign -dv --verbose=4 dist-electron/mac-arm64/MediScribe.app
```

#### Step 5: Notarize (Optional but Recommended)

```bash
# Submit for notarization
xcrun notarytool submit dist-electron/MediScribe-0.1.0-arm64.dmg \
  --apple-id "your-email@example.com" \
  --password "app-specific-password" \
  --team-id "YOUR_TEAM_ID" \
  --wait

# Staple the notarization ticket
xcrun stapler staple dist-electron/MediScribe-0.1.0-arm64.dmg
```

## Common Questions

### Q: Is it safe to remove the quarantine?
**A:** Yes, if you built the app yourself or trust the source. The quarantine attribute is just macOS being cautious about files from the internet.

### Q: Will this affect future updates?
**A:** Each new version will need the same fix unless you code sign the app.

### Q: Can I automate this for users?
**A:** 
- Provide the `fix-gatekeeper.sh` script
- Include instructions in README
- Consider code signing for production releases

### Q: Why not just code sign?
**A:** Code signing requires:
- $99/year Apple Developer account
- Certificate setup and management
- Potential notarization requirements
- Not necessary for personal/internal use

## Error Messages & Solutions

| Error Message | Solution |
|---------------|----------|
| "MediScribe is damaged" | Remove quarantine: `xattr -cr /Applications/MediScribe.app` |
| "MediScribe can't be opened" | Right-click → Open |
| "Unidentified developer" | Right-click → Open, then click "Open" |
| "App not from App Store" | System Settings → Privacy & Security → Open Anyway |

## Distribution Best Practices

When distributing to end users:

### Option 1: Include Instructions
Provide clear documentation on handling Gatekeeper warnings.

### Option 2: Provide Fix Script
Include `fix-gatekeeper.sh` with download instructions.

### Option 3: Code Sign
Best user experience - no warnings or extra steps needed.

### Option 4: Disk Image Note
Add a README file in the DMG with instructions:

```
📋 INSTALLATION INSTRUCTIONS

1. Drag MediScribe to Applications folder
2. Right-click MediScribe in Applications
3. Select "Open"
4. Click "Open" in the security dialog

If you see "damaged" error:
- Open Terminal
- Run: sudo xattr -cr /Applications/MediScribe.app
- Enter your password
```

## Testing

After applying any fix, verify:

```bash
# Check if quarantine is removed
xattr /Applications/MediScribe.app
# Should return nothing or not include "com.apple.quarantine"

# Try opening
open /Applications/MediScribe.app
```

## Summary

✅ **Quick Fix**: `sudo xattr -cr /Applications/MediScribe.app`  
✅ **User-Friendly**: Right-click → Open  
✅ **Production**: Get code signing certificate  

The "damaged" error is just macOS Gatekeeper being protective. The app is perfectly safe to use!
