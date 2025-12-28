# Release Notes - v1.1.5

Copy this into your GitHub release description:

---

## 🎉 Black Angus EPD Color Coder v1.1.5

### What's New

#### 🗄️ Database-Driven Bulk File Management

Complete overhaul of the bulk file system for better management and control:

- **Database Manifest**: Bulk files are now managed through a MySQL database instead of static JSON files
- **Admin Controls**: Admin users can upload, activate/deactivate, and delete bulk files directly from the app
- **File Status Management**: Files can be marked as active (visible to users) or inactive (hidden but retained)
- **Simplified Tracking**: Removed version numbers in favor of filename-based tracking with timestamps
- **Direct Upload**: Upload JSON files directly to the server with metadata (name, category, description, active status)

#### 🔐 Enhanced License Features

Improved license system with feature-based access control:

- **License Types**: Support for `admin` and `standard` license types
- **Feature Flags**: License features control access to advanced functionality
- **UI Gating**: Features like "Import External Data" and "Upload JSON File" are automatically hidden from non-admin users
- **Admin Mode**: Admin users see all bulk files (active and inactive) for complete control

#### 🎯 Gate Traits Integration

Gate traits now work seamlessly across all features:

- **Shared Configuration**: Gate traits selected on the All Matings page are automatically used when scoring animals on the Animal Entry tab
- **Immediate Effect**: Changes to gate traits are saved instantly - no need to run calculations first
- **Persistent Storage**: Gate trait selections are saved and restored across app restarts
- **Consistent Scoring**: Same gate logic applies to both All Matings rankings and individual animal scoring

#### 🐛 Bug Fixes

- Fixed bulk import category handling - "use file's category" now correctly uses the category from the database manifest
- Fixed missing percentile rank calculation when viewing animal details
- Fixed "Make this file active" checkbox not working in the upload JSON file dialog
- Fixed animal sex detection for proper percentile data selection (bulls vs cows)
- Improved category counting in "Manage Categories" to correctly handle animals in multiple categories
- Fixed export functions to remove version number requirements

#### 🔧 Improvements

- Better error handling for bulk file operations
- Improved UI feedback for inactive bulk files
- Enhanced admin controls with visual indicators for file status
- More robust file upload detection (handles both file paths and JSON content)

### Installation Instructions

#### macOS

1. **Download** the `.dmg` file
2. **Open** the downloaded `.dmg` file
3. **Drag** "Black Angus EPD Color Coder" to your Applications folder

**⚠️ Important - macOS Security:**

If you see **"App is damaged and can't be opened"** error:

1. Open **Terminal** (Applications → Utilities → Terminal)
2. Run this command:
   ```bash
   xattr -cr "/Applications/Black Angus EPD Color Coder.app"
   ```
3. Try opening the app again

**Alternative:** Right-click the app → Select "Open" → Click "Open" in the security dialog

#### Windows

1. **Download** the `.exe` installer
2. **Run** the installer
3. If Windows shows a security warning, click "More info" → "Run anyway"
4. Follow the installation wizard

#### Linux

**AppImage:**
```bash
chmod +x Black-Angus-EPD-Color-Coder-*.AppImage
./Black-Angus-EPD-Color-Coder-*.AppImage
```

**Debian/Ubuntu (.deb):**
```bash
sudo dpkg -i Black-Angus-EPD-Color-Coder-*.deb
```

### After Installation

- The app will automatically check for updates
- You can manually check by clicking "Check for Updates" in the app
- Updates are downloaded and installed directly from the app

### Need Help?

If you encounter any issues:
1. Check the [Installation Instructions](https://github.com/equinepromo/Black-Angus-EPD-Color-Coder/blob/main/INSTALLATION_INSTRUCTIONS.md)
2. See [Troubleshooting Guide](https://github.com/equinepromo/Black-Angus-EPD-Color-Coder/blob/main/TROUBLESHOOTING_MACOS.md) for macOS issues
3. Open an issue on GitHub

---

## Quick Copy-Paste Version (Shorter)

```
## Installation

**macOS:** Download the .dmg, drag to Applications. If you see "app is damaged" error, run in Terminal: `xattr -cr "/Applications/Black Angus EPD Color Coder.app"`

**Windows:** Download the .exe and run the installer.

**Linux:** Make AppImage executable: `chmod +x *.AppImage && ./Black-Angus-EPD-Color-Coder-*.AppImage`

The app will automatically check for updates after installation.
```

