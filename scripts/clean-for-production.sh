#!/bin/bash

# Clean Installation Script for MediScribe
# This script removes all test/development data to ensure users get a fresh app

echo "🧹 Cleaning MediScribe for Fresh Installation..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Clean user data folder (development data)
echo -e "${YELLOW}[1/5]${NC} Removing development user data..."
if [ -d ~/Library/Application\ Support/mediscribe-app ]; then
    rm -rf ~/Library/Application\ Support/mediscribe-app
    echo -e "${GREEN}✓${NC} Removed development data folder"
else
    echo "  (No data folder found - already clean)"
fi

# 2. Clean cache and temp files
echo -e "${YELLOW}[2/5]${NC} Cleaning cache and temporary files..."
rm -rf dist-electron/.cache 2>/dev/null || true
rm -rf .next/cache 2>/dev/null || true
rm -rf out/.cache 2>/dev/null || true
echo -e "${GREEN}✓${NC} Cleaned cache files"

# 3. Clean node_modules user data (if any test data was bundled)
echo -e "${YELLOW}[3/5]${NC} Checking for test data in source..."
# Remove any test JSON files in resources (if they exist)
rm -f resources/test-*.json 2>/dev/null || true
echo -e "${GREEN}✓${NC} Source is clean"

# 4. Verify dictionary/keyword defaults are empty
echo -e "${YELLOW}[4/5]${NC} Verifying empty defaults..."
if grep -q 'let userDictionary = \[\];' electron/main.js && \
   grep -q 'let keywordLibrary = \[\];' electron/main.js; then
    echo -e "${GREEN}✓${NC} Dictionary and keyword defaults are empty"
else
    echo -e "${YELLOW}⚠${NC} Warning: Check electron/main.js for hardcoded data"
fi

# 5. Clean crash reports
echo -e "${YELLOW}[5/5]${NC} Cleaning crash reports..."
rm -f ~/Library/Application\ Support/CrashReporter/MediScribe*.plist 2>/dev/null || true
echo -e "${GREEN}✓${NC} Cleaned crash reports"

echo ""
echo -e "${GREEN}✅ Clean installation preparation complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Build the installer: npm run build:electron"
echo "  2. Test on a fresh user account (or new machine)"
echo "  3. Verify user gets empty dictionary and keyword library"
echo ""
echo "What users will see on first launch:"
echo "  • Empty dictionary (no words)"
echo "  • Empty keyword library (no shortcuts)"
echo "  • Clean preferences (no cached settings)"
echo "  • No authentication data"
echo ""
