# Release Notes - v1.1.0

Copy this into your GitHub release description:

---

## 🎉 Black Angus EPD Color Coder v1.1.0

### Major Features

#### 🎯 Emphasis-Based Scoring Algorithm

A complete rewrite of the All Matings ranking system for more balanced and accurate results:

- **Emphasis-Based Weighting**: Replaced the old "weakness traits" system with a flexible emphasis-based approach where all traits contribute to scoring
- **Normalized Weights**: Traits are weighted between 1.0-1.7 based on emphasis values, preventing any single trait from dominating the score
- **Balanced Scoring**: Rewards uniform, well-rounded animals over extreme outliers in single traits
- **All Traits Count**: Every trait contributes to the score - nothing is ignored

#### ⚙️ Configurable Gate Traits

New flexible gate trait system with improved UI:

- **Checkbox Interface**: Easy-to-use checkbox grid for selecting gate traits (replaces dropdown)
- **No Default Gates**: Start with no gate traits selected - configure as needed for your herd
- **Persistent Selection**: Gate trait selections are saved and restored across app restarts
- **Easy Toggle**: Simply check/uncheck traits to enable/disable gates - no gates means all matings pass

#### 📈 Trait Improvement Metrics

New columns in All Matings results showing trait changes:

- **Improved Traits Count**: Shows how many traits are improved from the cow's EPD values
- **Worsened Traits Count**: Shows how many traits are worsened from the cow's EPD values
- **Color-Coded Display**: Green background for improved count, red for worsened count
- **Better Decision Making**: Quickly identify matings that improve your herd's weaknesses

#### ⚡ Performance Improvements

Major speed improvements for cached data:

- **Instant Cached Loading**: Cached animals now load almost instantly (no unnecessary delays)
- **Smart Browser Management**: Browser only launches when actually needed for scraping
- **Optimized Batch Processing**: Batch scraping checks cache first, processes cached items immediately, and only delays between items that need fresh scraping
- **Faster Workflow**: Reloading cached animals is now nearly instantaneous

#### 🔄 UI Enhancements

- **Auto Tab Switch**: "Compare Selected" from Herd Inventory now automatically switches to Animal Entry tab to show results
- **Better Navigation**: Seamless workflow between inventory management and animal comparison

### Technical Details

For those interested in the scoring algorithm details:

- The emphasis system uses trait-specific emphasis values (0-8) that normalize to weights between 1.0-1.7
- Gate traits are optional and fully user-configurable (default: none)
- All traits contribute to base score calculation
- Penalties apply for traits worse than Gray (baseline), with extra penalties for gate trait failures
- Scoring algorithm documented in `ALL_MATINGS_SCORING.md`

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

## What's New in v1.1.0

### Major Features
- **Emphasis-Based Scoring**: Complete rewrite of All Matings algorithm - all traits contribute with balanced weighting
- **Configurable Gate Traits**: Checkbox interface with persistent selection - configure gates for your specific needs
- **Trait Improvement Metrics**: See how many traits improve/worsen from cow EPD in mating results
- **Performance Boost**: Cached animals load almost instantly - no unnecessary delays
- **UI Improvements**: "Compare Selected" auto-switches to Animal Entry tab

### Scoring Algorithm
- Emphasis values (0-8) normalize to weights 1.0-1.7
- All traits contribute - nothing is ignored
- Rewards balanced animals over extreme outliers
- Gate traits optional and user-configurable
- Detailed algorithm documentation included

### Performance
- Cached data loads instantly (no delays)
- Browser only launches when needed
- Smart batch processing - cached items processed immediately
```
