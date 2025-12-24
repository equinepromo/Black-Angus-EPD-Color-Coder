# Code Signing and Notarization Guide for macOS

This guide will walk you through the process of code signing and notarizing your macOS application, which will:
- ✅ Eliminate Gatekeeper warnings
- ✅ Enable automatic updates via electron-updater
- ✅ Build user trust
- ✅ Comply with macOS security requirements

## Prerequisites

1. **Apple Developer Account** ($99/year)
   - Sign up at: https://developer.apple.com/programs/
   - You'll need an Apple ID and payment method

2. **Xcode Command Line Tools** (usually already installed)
   ```bash
   xcode-select --install
   ```

## Step 1: Enroll in Apple Developer Program

1. Go to https://developer.apple.com/programs/
2. Click "Enroll"
3. Sign in with your Apple ID
4. Complete enrollment (takes 24-48 hours for approval)
5. Pay the $99 annual fee

## Step 2: Create Certificates

### Option A: Using Xcode (Easiest)

1. Open Xcode
2. Go to **Xcode → Settings → Accounts**
3. Add your Apple ID
4. Click **"Manage Certificates"**
5. Click **"+"** and select **"Developer ID Application"**
6. Xcode will automatically create and download the certificate

### Option B: Using Apple Developer Portal

1. Go to https://developer.apple.com/account/resources/certificates/list
2. Click **"+"** to create a new certificate
3. Select **"Developer ID Application"** (for distribution outside App Store)
4. Follow the wizard to create a Certificate Signing Request (CSR):
   ```bash
   # On your Mac, open Keychain Access
   # Go to Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority
   # Enter your email and name, select "Saved to disk"
   ```
5. Upload the CSR and download the certificate
6. Double-click the certificate to install it in Keychain

## Step 3: Configure electron-builder

Update your `package.json` to use code signing:

```json
{
  "build": {
    "mac": {
      "icon": "assets/icon.icns",
      "category": "public.app-category.utilities",
      "identity": "Developer ID Application: Your Name (TEAM_ID)",
      "hardenedRuntime": true,
      "gatekeeperAssess": true,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    }
  }
}
```

**Important:**
- Replace `"Your Name (TEAM_ID)"` with your actual Developer ID
- Find your Team ID at: https://developer.apple.com/account/
- The identity should match exactly what's in your Keychain

### Finding Your Developer ID

```bash
# List all code signing identities
security find-identity -v -p codesigning

# Look for "Developer ID Application: Your Name (TEAM_ID)"
```

## Step 4: Create Entitlements File

Create or update `build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
</dict>
</plist>
```

**Note:** Adjust entitlements based on your app's needs. The above are common for Electron apps.

## Step 5: Configure Notarization

### Get App-Specific Password

1. Go to https://appleid.apple.com/
2. Sign in and go to **"App-Specific Passwords"**
3. Generate a new password for "electron-builder notarization"
4. Save this password securely

### Set Environment Variables

Add to your `~/.zshrc` or `~/.bash_profile`:

```bash
export APPLE_ID="your-email@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
```

Then reload:
```bash
source ~/.zshrc  # or source ~/.bash_profile
```

### Update package.json for Notarization

```json
{
  "build": {
    "mac": {
      "notarize": {
        "teamId": "YOUR_TEAM_ID"
      }
    }
  }
}
```

**Note:** electron-builder will automatically use `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` environment variables.

## Step 6: Update Build Scripts

Remove the `CSC_IDENTITY_AUTO_DISCOVERY=false` from your build scripts since you now want to sign:

```json
{
  "scripts": {
    "build": "electron-builder --publish never",
    "build:mac": "electron-builder --mac --publish never",
    "build:win": "electron-builder --win --publish never",
    "build:linux": "electron-builder --linux --publish never",
    "build:all": "electron-builder --mac --win --linux --publish never",
    "build:publish": "electron-builder --publish always"
  }
}
```

## Step 7: Build and Test

1. **Build the signed app:**
   ```bash
   npm run build:mac
   ```

2. **Verify the signature:**
   ```bash
   codesign -dv --verbose=4 "dist/mac-arm64/Black Angus EPD Color Coder.app"
   ```
   
   You should see:
   - `Authority=Developer ID Application: Your Name (TEAM_ID)`
   - `Signature=adhoc` should be replaced with your actual signature

3. **Verify notarization (after first build):**
   ```bash
   spctl -a -vv "dist/mac-arm64/Black Angus EPD Color Coder.app"
   ```
   
   Should show: `source=Developer ID` and `origin=Developer ID Application: ...`

## Step 8: Test Auto-Updates

Once signed and notarized:
1. Upload the signed build to GitHub releases
2. Test the auto-update mechanism
3. It should now work without signature verification errors!

## Troubleshooting

### "No identity found"
- Make sure the certificate is installed in Keychain
- Verify the identity name matches exactly (case-sensitive)
- Check: `security find-identity -v -p codesigning`

### "Notarization failed"
- Check your App-Specific Password is correct
- Verify Team ID matches your Apple Developer account
- Check notarization status: `xcrun altool --notarization-history 0 -u YOUR_APPLE_ID -p YOUR_APP_SPECIFIC_PASSWORD`

### "Hardened Runtime violations"
- Update your entitlements file to include required permissions
- Some Electron features may need specific entitlements

### Build takes too long
- Notarization can take 5-30 minutes
- First build is slower, subsequent builds are faster
- You can skip notarization during development: `electron-builder --mac --publish never --config.mac.notarize=null`

## Cost Summary

- **Apple Developer Program:** $99/year
- **Code Signing Certificate:** Included (free with membership)
- **Notarization:** Free (included with membership)
- **Total:** $99/year

## Benefits

✅ **No Gatekeeper warnings** - Users can install without workarounds  
✅ **Automatic updates work** - electron-updater will function properly  
✅ **User trust** - Signed apps are more trusted by users  
✅ **macOS compliance** - Meets Apple's security requirements  
✅ **Better user experience** - No manual steps required  

## Additional Resources

- [Apple Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/)
- [electron-builder Code Signing](https://www.electron.build/code-signing)
- [Notarization Documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)


