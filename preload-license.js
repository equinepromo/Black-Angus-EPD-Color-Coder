const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('licenseAPI', {
  activate: (licenseKey) => {
    return new Promise((resolve) => {
      ipcRenderer.once('license-activate-result', (event, result) => {
        resolve(result);
      });
      ipcRenderer.send('license-activate', licenseKey);
    });
  },
  cancel: () => ipcRenderer.send('license-cancel'),
  close: () => ipcRenderer.send('license-close')
});

