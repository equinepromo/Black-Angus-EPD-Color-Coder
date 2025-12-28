# Release Notes - v1.1.6

Copy this into your GitHub release description:

---

## 🎉 Black Angus EPD Color Coder v1.1.6

### What's New

#### 💾 Backup & Restore Feature

New backup and restore functionality available to all users:

- **Create Backup**: Export all cached animals and categories to a local JSON file
  - Includes all animal data (EPD values, categories, timestamps)
  - Includes all categories
  - Save to any location on your computer
  - Perfect for creating snapshots before major changes

- **Restore from Backup**: Import a backup file to restore your data
  - Option to overwrite existing animals or skip them
  - Option to restore categories
  - Shows summary of restored/skipped/error counts
  - Automatically refreshes inventory after restore

- **Available to All Users**: No license restrictions - everyone can backup and restore their data

#### 🐛 Bug Fixes

- **Fixed "Delete Animals from Category" behavior**: 
  - Animals with multiple categories now keep their other categories when a category is removed
  - Only animals that are exclusively in the deleted category are actually deleted
  - Previously, all animals in a category were deleted regardless of other category memberships

#### 🔧 UI Improvements

- **Removed "Refresh Status" button**: Simplified bulk file management interface
  - Status automatically refreshes after operations
  - "Check for Updates" also refreshes the status display
  - Reduces UI clutter while maintaining functionality

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

