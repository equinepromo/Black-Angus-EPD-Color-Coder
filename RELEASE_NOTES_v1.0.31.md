# Release Notes - v1.0.31

Copy this into your GitHub release description:

---

## 🎉 Black Angus EPD Color Coder v1.0.31

### What's New

#### 📊 Excel Export Improvements
- **EPD Values as Numbers**: EPD values are now stored as proper numbers in Excel, eliminating "number stored as text" warnings
- **Date Formatting**: Birth Date (BD) column is now formatted as a date in Excel for proper chronological sorting
- **Cleaner Display**: Positive EPD values no longer show "+" prefix in Excel (still shown in UI table for clarity)

#### 🗂️ Table Sorting Improvements
- **Date Sorting**: BD (Birth Date) column now sorts chronologically instead of alphabetically in the UI table
- **Better Data Types**: Table sorting now properly handles dates, ensuring correct chronological ordering

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

## What's New in v1.0.31

- Excel export: EPD values stored as numbers (no more "number stored as text" warnings)
- Excel export: Birth Date column formatted as date for proper sorting
- Excel export: Removed "+" prefix from positive EPD values
- Table sorting: BD column now sorts chronologically instead of alphabetically
```
