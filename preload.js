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
  getCachedAnimals: () => ipcRenderer.invoke('get-cached-animals')
});

