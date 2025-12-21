# Installation Instructions for Users

## macOS Installation

### Step 1: Download
1. Download the `.dmg` file from the GitHub release
2. The file will appear in your Downloads folder

### Step 2: Open the DMG
1. Double-click the `.dmg` file to mount it
2. A window will open showing the application

### Step 3: Install (Important - Read This!)

**⚠️ macOS Security Warning:** When you download from the internet, macOS may block the app. Here's how to install:

#### Option A: Right-Click Method (Recommended)
1. **Don't double-click** the app icon in the DMG window
2. **Right-click** (or Control+Click) on "Black Angus EPD Color Coder"
3. Select **"Open"** from the menu
4. Click **"Open"** in the security dialog that appears
5. Drag the app to your Applications folder

#### Option B: System Settings Method
1. Try to open the app normally (double-click)
2. If you see "App can't be opened" or "Should be moved to trash":
   - Go to **System Settings** → **Privacy & Security**
   - Scroll down to find the message about the blocked app
   - Click **"Open Anyway"** or **"Allow"**
3. Then drag the app to your Applications folder

#### Option C: Terminal Method (Advanced)
If you're comfortable with Terminal, you can remove the quarantine attribute:
```bash
# After downloading, before opening:
xattr -d com.apple.quarantine ~/Downloads/Black-Angus-EPD-Color-Coder-1.0.1.dmg

# Or after installing, if the app is blocked:
xattr -d com.apple.quarantine "/Applications/Black Angus EPD Color Coder.app"
```

### Step 4: First Launch
1. Open the app from Applications (or Launchpad)
2. If you see a security warning, right-click → Open, then click "Open" in the dialog
3. After the first launch, macOS will remember your choice

## Windows Installation

### Step 1: Download
1. Download the `.exe` installer from the GitHub release
2. The file will appear in your Downloads folder

### Step 2: Install
1. Double-click the `.exe` file
2. If Windows shows "Windows protected your PC":
   - Click **"More info"**
   - Click **"Run anyway"**
3. Follow the installation wizard
4. The app will be installed and ready to use

## Linux Installation

### AppImage
1. Download the `.AppImage` file
2. Make it executable:
   ```bash
   chmod +x Black-Angus-EPD-Color-Coder-*.AppImage
   ```
3. Run it:
   ```bash
   ./Black-Angus-EPD-Color-Coder-*.AppImage
   ```

### Debian/Ubuntu (.deb)
```bash
sudo dpkg -i Black-Angus-EPD-Color-Coder-*.deb
```

### Red Hat/Fedora (.rpm)
```bash
sudo rpm -i Black-Angus-EPD-Color-Coder-*.rpm
```

## Troubleshooting

### macOS: "App is damaged and can't be opened"

This error can occur with unsigned apps. Try these solutions in order:

#### Solution 1: Remove Quarantine and Clear Extended Attributes
```bash
# Remove quarantine attribute
xattr -d com.apple.quarantine "/Applications/Black Angus EPD Color Coder.app"

# Remove ALL extended attributes (more thorough)
xattr -cr "/Applications/Black Angus EPD Color Coder.app"
```

#### Solution 2: Disable Gatekeeper Temporarily (Advanced)
**Warning:** Only do this if you trust the app. Re-enable Gatekeeper after:
```bash
# Disable Gatekeeper (requires admin password)
sudo spctl --master-disable

# Install the app, then re-enable Gatekeeper
sudo spctl --master-enable
```

#### Solution 3: Allow App in System Settings
1. Go to **System Settings** → **Privacy & Security**
2. Scroll to the bottom
3. Look for any messages about the blocked app
4. Click **"Allow Anyway"** or **"Open Anyway"**

#### Solution 4: Re-download the DMG
Sometimes the file gets corrupted during download. Try:
1. Delete the downloaded DMG
2. Clear your browser cache
3. Download again from GitHub
4. Try installing again

### macOS: App opens but immediately closes

Check the Console app for error messages, or try running from Terminal:
```bash
/Applications/Black\ Angus\ EPD\ Color\ Coder.app/Contents/MacOS/Black\ Angus\ EPD\ Color\ Coder
```

### Windows: Installer won't run

1. Right-click the installer
2. Select "Run as administrator"
3. If still blocked, check Windows Defender settings

### General: App won't start

1. Make sure you have the latest version of your operating system
2. Check that you downloaded the correct version for your platform (macOS/Windows/Linux)
3. Try downloading again in case the file was corrupted

## After Installation

Once installed, the app will:
- ✅ Automatically check for updates
- ✅ Notify you when new versions are available
- ✅ Allow you to update directly from within the app

You can also manually check for updates by clicking "Check for Updates" in the app header.

## Need Help?

If you continue to have installation issues:
1. Check the release notes for known issues
2. Verify you downloaded the correct file for your operating system
3. Try downloading the file again
4. Contact support with details about your operating system and the error message
