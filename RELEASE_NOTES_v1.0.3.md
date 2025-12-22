# Release Notes - v1.0.3

Copy this into your GitHub release description:

---

## 🎉 Black Angus EPD Color Coder v1.0.3

### What's New

#### 📊 Enhanced Table Features
- **Improved Table Layout**: Name column is now positioned first for better readability
- **Sticky Name Column**: Name column stays visible when scrolling horizontally, so you always know which animal you're viewing
- **Sticky Header Row**: Table header row stays visible when scrolling vertically through large datasets
- **Column Sorting**: Click any column header to sort the table (ascending/descending). Works for all columns including EPD trait values, with intelligent numeric sorting for EPD values
- **Column Visibility Controls**: New "Columns" button allows you to show/hide any column in the table
- **Persistent Preferences**: Your column visibility choices are remembered across app restarts

#### 🐛 Bug Fixes
- **Fixed Color Coding Bug**: Corrected issue where black highlighting was incorrectly applied to 5% percentile values. Black highlighting now only appears for top 1% values that exceed the 1st percentile threshold

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

## What's New in v1.0.3

- Name column moved to first position and stays visible when scrolling
- Table header row stays visible when scrolling vertically
- Click column headers to sort (works for all columns including EPD values)
- Show/hide columns with new "Columns" button
- Column visibility preferences are saved and restored on app restart
- Fixed color coding bug where black was incorrectly applied to 5% values
```
