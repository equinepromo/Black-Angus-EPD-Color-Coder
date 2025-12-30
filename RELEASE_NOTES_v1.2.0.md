# Release Notes - v1.2.0

Copy this into your GitHub release description:

---

## 🎉 Black Angus EPD Color Coder v1.2.0

### What's New

#### 🔍 Find/Search Functionality (Command+F / Ctrl+F)

New built-in search feature for finding text throughout the application:

- **Keyboard Shortcut**: Press `Cmd+F` (Mac) or `Ctrl+F` (Windows/Linux) to open the find bar
- **Search Anywhere**: Search across all tabs and content (Animal Entry, Herd Inventory, Mating Calculator, Bulk Files)
- **Navigate Matches**: Use arrow buttons or keyboard shortcuts to jump between matches
  - `Enter` - Next match
  - `Shift+Enter` - Previous match
  - `Cmd+G` / `Ctrl+G` - Find next (when find bar is open)
  - `Cmd+Shift+G` / `Ctrl+Shift+G` - Find previous
- **Match Counter**: See how many matches were found (e.g., "3/15")
- **Auto-scroll**: Automatically scrolls to the current match
- **Smart Highlighting**: Current match highlighted in orange, other matches in yellow
- **Escape to Close**: Press `Escape` to close the find bar

#### 🛡️ Improved Scraping Rate Limiting

Enhanced scraping system to prevent getting blocked by angus.org:

- **Adaptive Delay System**: Automatically adjusts delays based on batch size and request count
  - Small batches (≤20 animals): Fast processing with 0.5-1 second delays
  - Large batches (>20 animals): More conservative with 2-4 second delays
- **Incremental Backoff**: Delays gradually increase as you process more animals
- **Aggressive Slowdown**: After 100 requests, delays increase more aggressively to prevent blocks
- **Error Handling**: Automatically increases delays when errors occur, reduces when successful
- **Smart Caching**: Cached animals are processed instantly with no delays

**Benefits:**
- Process small batches quickly without unnecessary delays
- Handle large batches (150+ animals) without getting blocked
- Automatically adapts to prevent rate limiting issues

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
## What's New in v1.2.0

- **Find/Search**: Press Cmd+F (Mac) or Ctrl+F (Windows) to search anywhere in the app
- **Improved Scraping**: Adaptive rate limiting prevents getting blocked, especially for large batches

## Installation

**macOS:** Download the .dmg, drag to Applications. If you see "app is damaged" error, run in Terminal: `xattr -cr "/Applications/Black Angus EPD Color Coder.app"`

**Windows:** Download the .exe and run the installer.

**Linux:** Make AppImage executable: `chmod +x *.AppImage && ./Black-Angus-EPD-Color-Coder-*.AppImage`

The app will automatically check for updates after installation.
```

