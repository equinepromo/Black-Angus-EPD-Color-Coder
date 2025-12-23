const { autoUpdater } = require('electron-updater');
const { dialog, app, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Get app version from package.json
let appVersion = '1.0.0';
try {
  const packagePath = path.join(__dirname, '../package.json');
  if (fs.existsSync(packagePath)) {
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    appVersion = packageData.version || '1.0.0';
  }
} catch (error) {
  console.error('[UPDATE] Error reading package.json:', error);
}

let mainWindow = null;
let updateCheckInterval = null;

/**
 * Initialize the update manager
 * @param {BrowserWindow} window - The main window instance
 */
function initialize(window) {
  mainWindow = window;
  
  // Configure auto-updater
  autoUpdater.autoDownload = false; // Don't auto-download, let user choose
  autoUpdater.autoInstallOnAppQuit = true; // Auto-install on quit after download
  
  // For unsigned apps, disable signature verification
  // This is necessary when the app is not code-signed with an Apple Developer certificate
  if (process.platform === 'darwin') {
    // Disable signature verification for unsigned macOS apps
    // This allows electron-updater to work with unsigned applications
    // Set this BEFORE any update operations
    autoUpdater.isVerifySignatures = false;
    console.log('[UPDATE] Signature verification disabled for unsigned macOS app');
    
    // Try to set it on various updater properties to ensure it's applied
    try {
      if (autoUpdater.updater) {
        autoUpdater.updater.isVerifySignatures = false;
      }
      // Try accessing internal updater instance
      if (autoUpdater._updater) {
        autoUpdater._updater.isVerifySignatures = false;
      }
      // Try setting on the updater service
      if (autoUpdater.updaterService) {
        autoUpdater.updaterService.isVerifySignatures = false;
      }
    } catch (e) {
      console.log('[UPDATE] Could not set isVerifySignatures on internal updater:', e.message);
    }
    
    // Skip signature verification for unsigned apps
    // Note: This is safe for unsigned apps, but users will still need to remove quarantine
    autoUpdater.requestHeaders = {
      'Cache-Control': 'no-cache'
    };
  }
  
  // Delta updates (incremental) are automatically enabled if blockmap files are present in the release
  // electron-updater will automatically use delta updates when blockmap files are available
  // This means users only download changed parts, not the full installer
  
  // Set update check interval (check every 6 hours)
  const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
  
  // Check for updates on startup (after a delay to not interfere with app startup)
  setTimeout(() => {
    checkForUpdates(false); // Silent check on startup
  }, 10000); // Wait 10 seconds after app starts
  
  // Set up periodic checks
  updateCheckInterval = setInterval(() => {
    checkForUpdates(false); // Silent periodic checks
  }, CHECK_INTERVAL);
  
  // Set up event handlers
  setupEventHandlers();
  
  console.log('[UPDATE] Update manager initialized. Current version:', appVersion);
}

/**
 * Set up auto-updater event handlers
 */
function setupEventHandlers() {
  // Update available
  autoUpdater.on('update-available', (info) => {
    console.log('[UPDATE] Update available:', info.version);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes || 'No release notes available.'
      });
    }
  });
  
  // Update not available
  autoUpdater.on('update-not-available', (info) => {
    console.log('[UPDATE] No update available. Current version is latest.');
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available', {
        version: info.version
      });
    }
  });
  
  // Error checking for updates
  autoUpdater.on('error', (error) => {
    console.error('[UPDATE] Error in update process:', error);
    console.error('[UPDATE] Error stack:', error.stack);
    
    // Handle code signature errors for unsigned apps
    const errorMessage = error.message || '';
    const errorStack = error.stack || '';
    let userMessage = errorMessage;
    
    // Check if this is a signature verification error
    if (errorMessage.includes('code signature') || 
        errorMessage.includes('signature') ||
        errorMessage.includes('did not pass validation') ||
        errorStack.includes('signature')) {
      // For unsigned apps, signature verification will fail
      // This is expected and can be worked around by rebuilding without signing
      console.log('[UPDATE] Code signature error detected - app may be unsigned');
      
      // Check if download completed (error might be during verification after download)
      if (errorMessage.includes('did not pass validation') || errorStack.includes('verifyUpdateCodeSignature')) {
        userMessage = 'Update verification failed due to code signature validation. This occurs with unsigned apps. The update was downloaded but cannot be automatically installed.\n\nPlease download and install the update manually from GitHub releases.';
        
        // Show dialog with option to open GitHub releases
        if (mainWindow && !mainWindow.isDestroyed()) {
          dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Update Installation Failed',
            message: 'Automatic update installation failed',
            detail: userMessage,
            buttons: ['Open GitHub Releases', 'OK'],
            defaultId: 0,
            cancelId: 1
          }).then(result => {
            if (result.response === 0) {
              // Open GitHub releases page
              shell.openExternal('https://github.com/equinepromo/Black-Angus-EPD-Color-Coder/releases');
            }
          });
        }
      } else {
        userMessage = 'Update failed due to code signature verification. This may occur with unsigned apps. Please download the update manually from GitHub releases.';
        
        // Show dialog with option to open GitHub releases
        if (mainWindow && !mainWindow.isDestroyed()) {
          dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Update Failed',
            message: 'Update check failed',
            detail: userMessage,
            buttons: ['Open GitHub Releases', 'OK'],
            defaultId: 0,
            cancelId: 1
          }).then(result => {
            if (result.response === 0) {
              // Open GitHub releases page
              shell.openExternal('https://github.com/equinepromo/Black-Angus-EPD-Color-Coder/releases');
            }
          });
        }
      }
    }
    
    // Also send to renderer for UI updates
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: userMessage,
        isSignatureError: true
      });
    }
  });
  
  // Download progress
  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    console.log('[UPDATE] Download progress:', percent + '%');
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', {
        percent: percent,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    }
  });
  
  // Update downloaded and ready to install
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[UPDATE] Update downloaded and ready to install:', info.version);
    
    // Ensure signature verification is disabled before installation
    if (process.platform === 'darwin') {
      autoUpdater.isVerifySignatures = false;
      console.log('[UPDATE] Signature verification disabled before installation');
    }
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version
      });
    }
  });
}

/**
 * Check for updates
 * @param {boolean} showDialog - Whether to show a dialog if no update is available
 */
function checkForUpdates(showDialog = true) {
  if (!app.isPackaged) {
    console.log('[UPDATE] Skipping update check in development mode');
    if (showDialog && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Check',
        message: 'Update checking is disabled in development mode.',
        buttons: ['OK']
      });
    }
    return;
  }
  
  console.log('[UPDATE] Checking for updates...');
  
  // Ensure signature verification is disabled before checking (for unsigned apps)
  if (process.platform === 'darwin') {
    autoUpdater.isVerifySignatures = false;
  }
  
  autoUpdater.checkForUpdates().catch(error => {
    console.error('[UPDATE] Error checking for updates:', error);
    if (showDialog && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        'Update Check Failed',
        `Failed to check for updates: ${error.message}`
      );
    }
  });
}

/**
 * Download the available update
 */
function downloadUpdate() {
  console.log('[UPDATE] Starting download...');
  
  // Ensure signature verification is disabled before downloading
  if (process.platform === 'darwin') {
    autoUpdater.isVerifySignatures = false;
  }
  
  autoUpdater.downloadUpdate().catch(error => {
    console.error('[UPDATE] Error downloading update:', error);
    
    // Check if it's a signature error and provide better guidance
    const errorMessage = error.message || '';
    if (errorMessage.includes('code signature') || errorMessage.includes('signature')) {
      console.log('[UPDATE] Signature verification error during download - this may be expected for unsigned apps');
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox(
          'Download Failed',
          'Update download failed due to signature verification. For unsigned apps, please download the update manually from GitHub releases.'
        );
      }
    } else {
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox(
          'Download Failed',
          `Failed to download update: ${error.message}`
        );
      }
    }
  });
}

/**
 * Install the downloaded update and restart the app
 */
function installUpdate() {
  console.log('[UPDATE] Installing update and restarting...');
  
  // Ensure signature verification is disabled before installation
  if (process.platform === 'darwin') {
    autoUpdater.isVerifySignatures = false;
    console.log('[UPDATE] Signature verification disabled before quitAndInstall');
  }
  
  try {
    autoUpdater.quitAndInstall(false, true); // Don't force quit, but do restart
  } catch (error) {
    console.error('[UPDATE] Error during installation:', error);
    const errorMessage = error.message || '';
    if (errorMessage.includes('code signature') || errorMessage.includes('signature')) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox(
          'Installation Failed',
          'Update installation failed due to signature verification. For unsigned apps, please download and install the update manually from GitHub releases.'
        );
      }
    } else {
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox(
          'Installation Failed',
          `Failed to install update: ${error.message}`
        );
      }
    }
  }
}

/**
 * Get current app version
 */
function getCurrentVersion() {
  return appVersion;
}

/**
 * Cleanup - stop update checks
 */
function cleanup() {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
}

module.exports = {
  initialize,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  getCurrentVersion,
  cleanup
};

