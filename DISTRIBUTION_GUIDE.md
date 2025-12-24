# Distribution Guide

This guide explains how to distribute your application to users and how they get updates.

## Repository Setup

### Option 1: Public Repository (Recommended)

**Pros:**
- ✅ Releases are automatically public
- ✅ Easy for users to find and download
- ✅ No authentication needed for auto-updates
- ✅ Better discoverability

**Cons:**
- ⚠️ Source code is visible (if that's a concern)

### Option 2: Private Repository (Limited Auto-Update Support)

**Important GitHub Limitation:**
- ⚠️ **You CANNOT make individual releases public in a private repository**
- ⚠️ All releases in private repos are private by default
- ⚠️ electron-updater **cannot authenticate** to access private releases without a token

**Options for Private Repos:**

#### Option 2A: Use Direct Download Links (Manual Updates Only)
- Release assets are accessible via direct URLs (if you share them)
- Users can download manually from direct links
- ❌ **Auto-updates will NOT work** (electron-updater can't access private releases)
- ✅ Source code stays private

#### Option 2B: Use GitHub Personal Access Token (Complex)
This requires distributing a token to users, which is **not recommended** for security reasons.

#### Option 2C: Make Repository Public (Recommended)
- ✅ Auto-updates work perfectly
- ✅ Easy distribution
- ⚠️ Source code is visible (but you can use `.gitignore` to exclude sensitive files)

**Recommendation:** If you need auto-updates, make the repository public. You can still protect sensitive information using `.gitignore` and environment variables.

## Providing Downloads to Users

### Method 1: Direct GitHub Release Links (Easiest)

1. **Create a Release** on GitHub with your installer files
2. **Get the Direct Download Link:**
   - Go to your release page
   - Right-click on the installer file (`.dmg`, `.exe`, etc.)
   - Select "Copy link address"
   - Example: `https://github.com/equinepromo/Black-Angus-EPD-Color-Coder/releases/download/v1.0.1/Black-Angus-EPD-Color-Coder-1.0.1.dmg`

3. **Share the Link:**
   - Email it to users
   - Post it on your website
   - Include it in documentation
   - Share via any communication channel

### Method 2: GitHub Releases Page

1. **Share the Release URL:**
   ```
   https://github.com/equinepromo/Black-Angus-EPD-Color-Coder/releases
   ```
2. Users can browse releases and download the appropriate installer for their platform

### Method 3: Create a Simple Download Page

Create a simple HTML page that links to the latest release:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Download Black Angus EPD Color Coder</title>
</head>
<body>
    <h1>Download Black Angus EPD Color Coder</h1>
    <p>Version 1.0.1</p>
    
    <h2>Download for:</h2>
    <ul>
        <li><a href="https://github.com/equinepromo/Black-Angus-EPD-Color-Coder/releases/download/v1.0.1/Black-Angus-EPD-Color-Coder-1.0.1.dmg">macOS</a></li>
        <li><a href="https://github.com/equinepromo/Black-Angus-EPD-Color-Coder/releases/download/v1.0.1/Black-Angus-EPD-Color-Coder-Setup-1.0.1.exe">Windows</a></li>
    </ul>
    
    <p><small>After installation, the app will automatically check for updates.</small></p>
</body>
</html>
```

## User Installation Flow

### First Time Users

1. **Download** the installer from your GitHub release (or your download page)
2. **Install** the application:
   - **macOS**: Open the `.dmg` file, drag the app to Applications folder
   - **Windows**: Run the `.exe` installer and follow the prompts
   - **Linux**: Make the `.AppImage` executable and run it, or install the `.deb`/`.rpm` package
3. **Launch** the application
4. **Activate License** (if required by your license system)

### Existing Users (Updates)

1. **Automatic Check**: App checks for updates 10 seconds after startup and every 6 hours
2. **Update Notification**: If an update is available, a banner appears at the top of the app
3. **Download**: User clicks "Download Update" button
4. **Install**: After download completes, user clicks "Install & Restart"
5. **Done**: App restarts with the new version

**OR** users can manually check by clicking "Check for Updates" in the app header.

## What Users Need

### Initial Download
- ✅ Just the installer file for their platform (`.dmg`, `.exe`, or `.AppImage`)
- ❌ They don't need the YAML files (those are for auto-updates)
- ❌ They don't need the blockmap files (those are for incremental updates)
- ❌ They don't need the unpacked directories

### After Installation
- ✅ Nothing! The app handles updates automatically
- ✅ Users can manually check for updates using the "Check for Updates" button

## Best Practices

1. **Clear Instructions**: Provide clear download and installation instructions
2. **Platform-Specific**: Make it obvious which file to download for each platform
3. **Release Notes**: Include helpful release notes in GitHub releases
4. **Version Numbering**: Use consistent version numbers (semantic versioning)
5. **Testing**: Test the installer on clean systems before distributing

## Troubleshooting User Downloads

### macOS: "App can't be opened" or "Should be moved to trash" Error

**This is a macOS Gatekeeper security feature.** When users download the `.dmg` from GitHub, macOS applies a quarantine attribute that blocks unsigned apps.

**Solution for Users (Choose One):**

#### Method 1: Right-Click Open (Easiest)
1. **Don't double-click** the app after mounting the DMG
2. **Right-click** (or Control+Click) on the app
3. Select **"Open"** from the context menu
4. Click **"Open"** in the security dialog
5. macOS will remember this choice for future launches

#### Method 2: Remove Quarantine Attribute (Terminal)
Users can run this command in Terminal to remove the quarantine:
```bash
xattr -d com.apple.quarantine "/Applications/Black Angus EPD Color Coder.app"
```

Or for the DMG file before opening:
```bash
xattr -d com.apple.quarantine ~/Downloads/Black-Angus-EPD-Color-Coder-1.0.1.dmg
```

#### Method 3: System Settings
1. Go to **System Settings** → **Privacy & Security**
2. Scroll down to find the blocked app message
3. Click **"Open Anyway"** or **"Allow"**

**Permanent Solution**: Code sign your application with an Apple Developer certificate ($99/year). This eliminates the warning entirely.

### Windows: "Windows protected your PC" Warning

**Windows Defender**: This is normal for unsigned apps. Users need to:
- Click **"More info"**
- Click **"Run anyway"** (if Windows Defender allows)

**Solution**: Code sign your application with a code signing certificate to avoid these warnings.

### Users Can't Access Release

- Ensure the release is **published** (not draft)
- If repo is private, ensure the release assets are accessible
- Check that the direct download link works

### Auto-Updates Not Working

- Ensure YAML files (`latest-mac.yml`, `latest.yml`) are uploaded to the release
- Check that the release tag matches the version in `package.json`
- Verify the repository name in `package.json` matches your GitHub repo


