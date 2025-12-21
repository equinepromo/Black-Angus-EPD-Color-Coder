const { autoUpdater } = require('electron-updater');
const { dialog, app } = require('electron');
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
    console.error('[UPDATE] Error checking for updates:', error);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: error.message || 'Unknown error occurred while checking for updates.'
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
  autoUpdater.downloadUpdate().catch(error => {
    console.error('[UPDATE] Error downloading update:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        'Download Failed',
        `Failed to download update: ${error.message}`
      );
    }
  });
}

/**
 * Install the downloaded update and restart the app
 */
function installUpdate() {
  console.log('[UPDATE] Installing update and restarting...');
  autoUpdater.quitAndInstall(false, true); // Don't force quit, but do restart
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
