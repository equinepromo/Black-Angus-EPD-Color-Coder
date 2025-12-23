# macOS "Damaged App" Troubleshooting Guide

## The Problem

When you download the app from GitHub and try to open it, you may see:
> "Black Angus EPD Color Coder.app" is damaged and can't be opened. You should move it to the Trash.

This happens because:
1. The app is **unsigned** (no Apple Developer certificate)
2. macOS Gatekeeper blocks unsigned apps downloaded from the internet
3. The quarantine attribute is applied to downloaded files

## Solutions (Try in Order)

### Solution 1: Remove Quarantine Attribute (Most Common Fix)

Open Terminal and run:
```bash
xattr -d com.apple.quarantine "/Applications/Black Angus EPD Color Coder.app"
```

If that doesn't work, remove ALL extended attributes:
```bash
xattr -cr "/Applications/Black Angus EPD Color Coder.app"
```

Then try opening the app again.

### Solution 2: Right-Click Open Method

1. **Don't double-click** the app
2. **Right-click** (or Control+Click) on the app
3. Select **"Open"**
4. Click **"Open"** in the security dialog
5. macOS will remember this choice

### Solution 3: System Settings Override

1. Go to **System Settings** → **Privacy & Security**
2. Scroll down to the bottom
3. Look for a message about the blocked app
4. Click **"Allow Anyway"** or **"Open Anyway"**

### Solution 4: Remove from Quarantine Before Installing

If you haven't installed yet, remove quarantine from the DMG:
```bash
xattr -d com.apple.quarantine ~/Downloads/Black-Angus-EPD-Color-Coder-*.dmg
```

Then mount and install normally.

### Solution 5: Disable Gatekeeper Temporarily (Not Recommended)

**Only use this if you completely trust the app:**

```bash
# Disable Gatekeeper (requires admin password)
sudo spctl --master-disable

# Install and open the app

# IMPORTANT: Re-enable Gatekeeper after
sudo spctl --master-enable
```

**Warning:** This disables macOS security features. Only do this if you're certain the app is safe.

### Solution 6: Check File Integrity

The file might be corrupted. Verify:
1. Check the file size matches what's shown on GitHub
2. Try downloading again
3. Use a different browser
4. Check your internet connection didn't drop during download

## Why This Happens

- **Unsigned Apps**: Without an Apple Developer certificate ($99/year), apps can't be properly signed
- **Gatekeeper**: macOS security feature that blocks unsigned apps from the internet
- **Quarantine**: macOS adds a quarantine attribute to files downloaded from the internet

## Permanent Solution

The only way to completely eliminate this warning is to:
1. Get an **Apple Developer account** ($99/year)
2. **Code sign** the application
3. **Notarize** the application with Apple

This requires:
- Apple Developer Program membership
- Code signing certificates
- Notarization process
- Additional build configuration

## For Developers: Building Without Warnings

If you're building the app yourself, you can:

1. **Remove quarantine before testing:**
   ```bash
   xattr -d com.apple.quarantine dist/*.dmg
   ```

2. **Build with specific flags:**
   ```bash
   npm run build:mac
   ```

3. **Test locally first** before uploading to GitHub

## Still Having Issues?

If none of these solutions work:

1. **Check macOS version**: Some older/newer versions have different Gatekeeper behavior
2. **Check System Integrity Protection (SIP)**: Run `csrutil status` in Terminal (should be enabled)
3. **Try on a different Mac**: Rule out machine-specific issues
4. **Check Console.app**: Look for detailed error messages
5. **Contact support**: Provide your macOS version and the exact error message

## Quick Reference Commands

```bash
# Remove quarantine from installed app
xattr -d com.apple.quarantine "/Applications/Black Angus EPD Color Coder.app"

# Remove all extended attributes
xattr -cr "/Applications/Black Angus EPD Color Coder.app"

# Remove quarantine from DMG before installing
xattr -d com.apple.quarantine ~/Downloads/Black-Angus-EPD-Color-Coder-*.dmg

# Check if app is signed
codesign -dv --verbose=4 "/Applications/Black Angus EPD Color Coder.app"

# Check Gatekeeper status
spctl --status
```

