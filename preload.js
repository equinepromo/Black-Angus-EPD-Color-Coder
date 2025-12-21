const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scrapeEPD: (registrationNumber) => ipcRenderer.invoke('scrape-epd', registrationNumber),
  scrapeBatch: (registrationNumbers) => ipcRenderer.invoke('scrape-batch', registrationNumbers),
  onScrapeProgress: (callback) => {
    ipcRenderer.on('scrape-progress', (event, data) => callback(data));
  },
  onMatingProgress: (callback) => {
    ipcRenderer.on('mating-progress', (event, data) => callback(data));
  },
  getColorCriteria: () => ipcRenderer.invoke('get-color-criteria'),
  exportToExcel: (data) => ipcRenderer.invoke('export-to-excel', data),
  calculateMating: (sireRegNum, damRegNum) => ipcRenderer.invoke('calculate-mating', { sireRegNum, damRegNum }),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  validateLicense: () => ipcRenderer.invoke('validate-license'),
  activateLicense: (licenseKey) => ipcRenderer.invoke('activate-license', licenseKey),
  deactivateLicense: () => ipcRenderer.invoke('deactivate-license'),
  getCachedAnimals: () => ipcRenderer.invoke('get-cached-animals'),
  // Update APIs
  checkForUpdates: (showDialog) => ipcRenderer.invoke('check-for-updates', showDialog),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, data) => callback(data));
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on('update-not-available', (event, data) => callback(data));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (event, data) => callback(data));
  },
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (event, data) => callback(data));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, data) => callback(data));
  }
});

