const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scrapeEPD: (registrationNumber, category) => ipcRenderer.invoke('scrape-epd', registrationNumber, category),
  scrapeBatch: (registrationNumbers, category) => ipcRenderer.invoke('scrape-batch', registrationNumbers, category),
  onScrapeProgress: (callback) => {
    ipcRenderer.on('scrape-progress', (event, data) => callback(data));
  },
  onMatingProgress: (callback) => {
    ipcRenderer.on('mating-progress', (event, data) => callback(data));
  },
  getColorCriteria: () => ipcRenderer.invoke('get-color-criteria'),
  exportToExcel: (data) => ipcRenderer.invoke('export-to-excel', data),
  calculateMating: (sireRegNum, damRegNum) => ipcRenderer.invoke('calculate-mating', { sireRegNum, damRegNum }),
  rankAllMatings: (config) => ipcRenderer.invoke('rank-all-matings', config),
  invalidateCache: () => ipcRenderer.invoke('invalidate-cache'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  validateLicense: () => ipcRenderer.invoke('validate-license'),
  activateLicense: (licenseKey) => ipcRenderer.invoke('activate-license', licenseKey),
  deactivateLicense: () => ipcRenderer.invoke('deactivate-license'),
  getCachedAnimals: () => ipcRenderer.invoke('get-cached-animals'),
  deleteCachedAnimal: (registrationNumber) => ipcRenderer.invoke('delete-cached-animal', registrationNumber),
  updateAnimalCategory: (registrationNumber, category) => ipcRenderer.invoke('update-animal-category', registrationNumber, category),
  deleteAnimalsByCategory: (category) => ipcRenderer.invoke('delete-animals-by-category', category),
  getAvailableCategories: () => ipcRenderer.invoke('get-available-categories'),
  loadCategories: () => ipcRenderer.invoke('load-categories'),
  saveCategories: (categories) => ipcRenderer.invoke('save-categories', categories),
  addCategory: (categoryName) => ipcRenderer.invoke('add-category', categoryName),
  deleteCategory: (categoryName) => ipcRenderer.invoke('delete-category', categoryName),
  getPercentileData: (animalType) => ipcRenderer.invoke('get-percentile-data', animalType),
  scoreAnimal: (epdValues, animalType, gateTraits) => ipcRenderer.invoke('score-animal', { epdValues, animalType, gateTraits }),
  calculatePercentileRanks: (epdValues, animalType, registrationNumber, saveToCache) => ipcRenderer.invoke('calculate-percentile-ranks', { epdValues, animalType, registrationNumber, saveToCache }),
  // Bulk file APIs
  checkBulkFileUpdates: () => ipcRenderer.invoke('check-bulk-file-updates'),
  getPendingUpdates: () => ipcRenderer.invoke('get-pending-updates'),
  getBulkFileStatus: () => ipcRenderer.invoke('get-bulk-file-status'),
  importBulkFile: (bulkFileId, url, options) => ipcRenderer.invoke('import-bulk-file', bulkFileId, url, options),
  processBulkFile: (filePath, options) => ipcRenderer.invoke('process-bulk-file', filePath, options),
  ignoreBulkFileUpdate: (bulkFileId, version, permanent) => ipcRenderer.invoke('ignore-bulk-file-update', bulkFileId, version, permanent),
  getIgnoredUpdates: () => ipcRenderer.invoke('get-ignored-updates'),
  updateAnimalCategories: (registrationNumber, categories, mode) => ipcRenderer.invoke('update-animal-categories', registrationNumber, categories, mode),
  onBulkFileProgress: (callback) => {
    ipcRenderer.on('bulk-file-progress', (event, data) => callback(data));
  },
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
  },
  onBulkFileUpdatesAvailable: (callback) => {
    ipcRenderer.on('bulk-file-updates-available', (event, data) => callback(data));
  },
  // Export animals to bulk file
  exportAnimalsToBulkFile: (animals, options) => ipcRenderer.invoke('export-animals-to-bulk-file', animals, options),
  // External data import APIs
  showExternalFilePicker: () => ipcRenderer.invoke('show-external-file-picker'),
  parseExternalFile: (filePath) => ipcRenderer.invoke('parse-external-file', filePath),
  detectColumnMappings: (headers, sampleRows) => ipcRenderer.invoke('detect-column-mappings', headers, sampleRows),
  convertExternalDataToBulkFile: (filePath, columnMappings, metadata) => ipcRenderer.invoke('convert-external-data-to-bulk-file', filePath, columnMappings, metadata)
});

