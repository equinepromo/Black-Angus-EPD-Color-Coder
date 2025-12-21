const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
// Use Puppeteer scraper instead of BrowserWindow scraper
const scraper = require('./scraper-puppeteer');
const testScraper = require('./test-scraper');
const percentileLookup = require('./percentile-lookup');
const cacheUtil = require('./cache-util');
const cacheCleanup = require('./cache-cleanup');
const licenseManager = require('./license-manager');

let mainWindow;
let scrapingQueue = [];
let isProcessing = false;

/**
 * Get icon path for window
 */
function getIconPath() {
  let iconPath = null;
  
  // Check for .icns first on macOS (better quality)
  if (process.platform === 'darwin') {
    const icnsPath = path.join(__dirname, '../assets/icon.icns');
    if (fs.existsSync(icnsPath)) {
      iconPath = icnsPath;
      console.log('[ICON] Using .icns icon:', iconPath);
    }
  }
  
  // Fall back to .ico on Windows
  if (!iconPath && process.platform === 'win32') {
    const icoPath = path.join(__dirname, '../assets/icon.ico');
    if (fs.existsSync(icoPath)) {
      iconPath = icoPath;
      console.log('[ICON] Using .ico icon:', iconPath);
    }
  }
  
  // Fall back to .png for Linux or if others not found
  if (!iconPath) {
    const pngPath = path.join(__dirname, '../assets/icon.png');
    if (fs.existsSync(pngPath)) {
      iconPath = pngPath;
      console.log('[ICON] Using .png icon:', iconPath);
    }
  }
  
  if (!iconPath) {
    console.log('[ICON] No icon file found, using default');
    return undefined;
  }
  
  // For .icns files on macOS, Electron's nativeImage doesn't work well
  // Return the path directly - BrowserWindow.setIcon() can handle .icns paths
  if (iconPath.endsWith('.icns')) {
    console.log('[ICON] Returning .icns path directly (nativeImage not supported for .icns)');
    return iconPath;
  }
  
  // For .png and .ico files, try to create a NativeImage first
  let iconImage = null;
  try {
    iconImage = nativeImage.createFromPath(iconPath);
    if (iconImage.isEmpty()) {
      console.log('[ICON] Warning: Icon image is empty, falling back to path');
      return iconPath;
    } else {
      console.log('[ICON] Icon image loaded successfully, size:', iconImage.getSize());
      return iconImage;
    }
  } catch (error) {
    console.log('[ICON] Error creating native image, using path:', error.message);
    return iconPath;
  }
}

function createWindow() {
  const mainIcon = getIconPath();
  console.log('[MAIN] Creating main window with icon:', mainIcon ? 'found' : 'using default');
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Black Angus EPD Color Coder',
    icon: mainIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools only in development mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

/**
 * Get icon for modal dialogs (prefer PNG for better compatibility)
 */
function getModalDialogIcon() {
  // For modal dialogs, use PNG if available (more reliable than .icns)
  const pngPath = path.join(__dirname, '../assets/icon.png');
  if (fs.existsSync(pngPath)) {
    try {
      const iconImage = nativeImage.createFromPath(pngPath);
      if (!iconImage.isEmpty()) {
        console.log('[ICON] Using PNG for modal dialog');
        return iconImage;
      }
    } catch (error) {
      console.log('[ICON] Error loading PNG for modal, falling back:', error.message);
    }
  }
  // Fall back to regular icon path
  return getIconPath();
}

/**
 * Show license activation dialog
 */
function showLicenseDialog() {
  return new Promise((resolve) => {
    // Use PNG for modal dialogs (more reliable than .icns with setIcon)
    const icon = getModalDialogIcon();
    console.log('[LICENSE] License dialog icon:', icon ? 'found' : 'using default');
    
    const licenseWindow = new BrowserWindow({
      width: 500,
      height: 400,
      resizable: false,
      modal: true,
      parent: mainWindow || undefined,
      icon: icon,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload-license.js')
      }
    });
    
    licenseWindow.loadFile(path.join(__dirname, '../renderer/license-dialog.html'));
    
    // Note: Modal dialogs on macOS inherit icon from parent/app
    // The icon property in constructor should be sufficient

    let resolved = false;
    
    // Handle license activation
    ipcMain.once('license-activate', async (event, licenseKey) => {
      const result = await licenseManager.activateLicense(licenseKey);
      event.reply('license-activate-result', result);
      
      if (result.success) {
        // Don't close immediately - let dialog show success message first
        // Dialog will call license-close when ready
      } else {
        // On error, keep dialog open - don't resolve or close
        // User needs to read the error and either try again or cancel
      }
    });

    // Handle explicit close request from dialog (after successful activation)
    ipcMain.once('license-close', () => {
      if (!resolved) {
        resolved = true;
        licenseWindow.close();
        resolve('activated');
      }
    });

    ipcMain.once('license-cancel', () => {
      if (!resolved) {
        resolved = true;
        licenseWindow.close();
        resolve('cancelled');
      }
    });

    licenseWindow.on('closed', () => {
      // Only resolve if not already resolved
      if (!resolved) {
        resolved = true;
        resolve('cancelled');
      }
    });
  });
}

// Initialize license manager with app user data path
licenseManager.initialize(app.getPath('userData'));

// Check license before app is ready
let licenseValid = false;

app.whenReady().then(async () => {
  // Validate license on startup
  console.log('[MAIN] Validating license on startup...');
  const licenseStatus = await licenseManager.validateLicense();
  licenseValid = licenseStatus.valid === true;

  if (!licenseValid) {
    console.log('[MAIN] License invalid:', licenseStatus.error);
    // Show license activation dialog
    const activationResult = await showLicenseDialog();
    if (activationResult === 'cancelled' || activationResult === 'error') {
      app.quit();
      return;
    }
    // Re-validate after activation
    const revalidation = await licenseManager.validateLicense(true);
    licenseValid = revalidation.valid === true;
    if (!licenseValid) {
      dialog.showErrorBox('License Invalid', 'The license key you entered is invalid. The application will now close.');
      app.quit();
      return;
    }
  }

  // Set dock icon on macOS (must be done before creating window)
  // Modal dialogs on macOS use the dock icon, so this is important
  if (process.platform === 'darwin' && app.dock) {
    // Try .icns first (native macOS format)
    const icnsPath = path.join(__dirname, '../assets/icon.icns');
    const pngPath = path.join(__dirname, '../assets/icon.png');
    
    if (fs.existsSync(icnsPath)) {
      try {
        // app.dock.setIcon() can accept .icns path directly
        app.dock.setIcon(icnsPath);
        console.log('[MAIN] Dock icon set from .icns:', icnsPath);
      } catch (error) {
        console.log('[MAIN] Error setting dock icon from .icns, trying PNG:', error.message);
        // Fall back to PNG
        if (fs.existsSync(pngPath)) {
          try {
            const icon = nativeImage.createFromPath(pngPath);
            if (!icon.isEmpty()) {
              app.dock.setIcon(icon);
              console.log('[MAIN] Dock icon set from PNG');
            }
          } catch (pngError) {
            console.log('[MAIN] Error setting dock icon from PNG:', pngError.message);
          }
        }
      }
    } else if (fs.existsSync(pngPath)) {
      try {
        const icon = nativeImage.createFromPath(pngPath);
        if (!icon.isEmpty()) {
          app.dock.setIcon(icon);
          console.log('[MAIN] Dock icon set from PNG (no .icns found)');
        } else {
          console.log('[MAIN] ✗ Icon image is empty');
        }
      } catch (error) {
        console.error('[MAIN] Error setting dock icon:', error);
      }
    } else {
      console.log('[MAIN] ✗ Icon file not found at:', pngPath);
    }
  }
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Cleanup expired cache files on startup and then weekly
  cacheCleanup.cleanupExpiredCache();
  setInterval(() => {
    cacheCleanup.cleanupExpiredCache();
  }, 7 * 24 * 60 * 60 * 1000); // Weekly cleanup

  // Periodic license validation (every 24 hours)
  setInterval(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const status = await licenseManager.validateLicense();
      if (!status.valid) {
        console.log('[MAIN] License validation failed, blocking app access');
        // Show error and quit
        dialog.showErrorBox(
          'License Invalid', 
          'Your license is no longer valid. Please contact support.\n\nThe application will now close.'
        );
        app.quit();
      }
    }
  }, 24 * 60 * 60 * 1000); // Check every 24 hours
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers for license
ipcMain.handle('get-license-status', async (event) => {
  return licenseManager.getLicenseStatus();
});

// Get cached animals list
ipcMain.handle('get-cached-animals', async (event) => {
  return cacheUtil.getCachedAnimals();
});

ipcMain.handle('validate-license', async (event) => {
  return await licenseManager.validateLicense(true);
});

ipcMain.handle('activate-license', async (event, licenseKey) => {
  return await licenseManager.activateLicense(licenseKey);
});

ipcMain.handle('deactivate-license', async (event) => {
  return licenseManager.deactivateLicense();
});

// IPC Handlers
ipcMain.handle('test-scrape', async (event, registrationNumber) => {
  try {
    const result = await testScraper.testScrape(registrationNumber);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('scrape-epd', async (event, registrationNumber) => {
  // Check license before allowing operation
  const licenseStatus = await licenseManager.validateLicense();
  if (!licenseStatus.valid) {
    return { success: false, error: 'License invalid. Please activate the application.' };
  }

  console.log('[MAIN] scrape-epd IPC handler called with:', registrationNumber);
  try {
    const result = await scraper.scrapeEPD(registrationNumber);
    console.log('[MAIN] Scrape completed successfully');
    return { success: true, data: result };
  } catch (error) {
    console.error('[MAIN] Scrape failed with error:', error.message);
    console.error('[MAIN] Error stack:', error.stack);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('scrape-batch', async (event, registrationNumbers) => {
  // Check license before allowing operation
  const licenseStatus = await licenseManager.validateLicense();
  if (!licenseStatus.valid) {
    return [{ success: false, error: 'License invalid. Please activate the application.' }];
  }

  const results = [];
  const puppeteer = require('puppeteer');
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Reuse browser instance for all scrapes (major performance improvement)
  let browser = null;
  
  try {
    // Launch browser once for the entire batch
    console.log('[MAIN] Launching browser for batch processing...');
    // Use the same helper function as the scraper
    const scraper = require('./scraper-puppeteer');
    const launchOptions = scraper.getPuppeteerLaunchOptions();
    browser = await puppeteer.launch(launchOptions);

    for (let i = 0; i < registrationNumbers.length; i++) {
      const regNum = registrationNumbers[i];
      try {
        // Pass browser instance to reuse it
        const result = await scraper.scrapeEPD(regNum, browser);
        results.push({ registrationNumber: regNum, success: true, data: result });
        
        // Reduced rate limiting: wait 0.5-1 second between requests (was 2-3 seconds)
        if (i < registrationNumbers.length - 1) {
          const waitTime = 500 + Math.random() * 500; // 0.5-1 seconds
          await delay(waitTime);
        }
      } catch (error) {
        results.push({ registrationNumber: regNum, success: false, error: error.message });
      }
      
      // Send progress update
      event.sender.send('scrape-progress', {
        completed: i + 1,
        total: registrationNumbers.length,
        current: regNum
      });
    }
  } finally {
    // Close browser after all scrapes are done
    if (browser) {
      console.log('[MAIN] Closing browser after batch processing...');
      await browser.close();
    }
  }

  return results;
});

// Calculate mating (expected EPDs from sire and dam)
ipcMain.handle('calculate-mating', async (event, { sireRegNum, damRegNum }) => {
  // Check license before allowing operation
  const licenseStatus = await licenseManager.validateLicense();
  if (!licenseStatus.valid) {
    return { success: false, error: 'License invalid. Please activate the application.' };
  }

  console.log('[MAIN] calculate-mating called with sire:', sireRegNum, 'dam:', damRegNum);
  
  try {
    if (!sireRegNum || !damRegNum) {
      return { success: false, error: 'Both sire and dam registration numbers are required' };
    }

    // Emit progress updates
    const emitProgress = (step, total, message) => {
      event.sender.send('mating-progress', { step, total, message });
    };

    // Scrape both animals' EPDs
    emitProgress(1, 5, 'Scraping sire EPDs...');
    console.log('[MAIN] Scraping sire EPDs...');
    const sireResult = await scraper.scrapeEPD(sireRegNum);
    
    emitProgress(2, 5, 'Scraping dam EPDs...');
    console.log('[MAIN] Scraping dam EPDs...');
    const damResult = await scraper.scrapeEPD(damRegNum);

    if (!sireResult.epdValues || Object.keys(sireResult.epdValues).length === 0) {
      return { success: false, error: `Failed to extract EPD data for sire (${sireRegNum})` };
    }

    if (!damResult.epdValues || Object.keys(damResult.epdValues).length === 0) {
      return { success: false, error: `Failed to extract EPD data for dam (${damRegNum})` };
    }

    // Calculate expected EPDs: (sire + dam) / 2
    emitProgress(3, 5, 'Calculating expected EPDs...');
    const calculatedEPDs = {};
    const allTraits = new Set([
      ...Object.keys(sireResult.epdValues),
      ...Object.keys(damResult.epdValues)
    ]);

    for (const trait of allTraits) {
      const sireEPD = sireResult.epdValues[trait]?.epd;
      const damEPD = damResult.epdValues[trait]?.epd;

      if (sireEPD && damEPD) {
        // Parse EPD values (handle strings like "+1.5", "-.5", etc.)
        const sireValue = parseFloat(sireEPD);
        const damValue = parseFloat(damEPD);

        if (!isNaN(sireValue) && !isNaN(damValue)) {
          const calculatedValue = (sireValue + damValue) / 2;
          // Format back to string with + sign if positive
          const formattedValue = calculatedValue >= 0 ? `+${calculatedValue}` : `${calculatedValue}`;
          calculatedEPDs[trait] = {
            epd: formattedValue,
            sireEPD: sireEPD,
            damEPD: damEPD
          };
        }
      }
    }

    // Map calculated EPDs to percentile ranks
    emitProgress(4, 5, 'Calculating percentile ranks...');
    console.log('[MAIN] Mapping calculated EPDs to percentile ranks...');
    const epdValuesForLookup = {};
    for (const trait in calculatedEPDs) {
      epdValuesForLookup[trait] = calculatedEPDs[trait].epd;
    }

    let percentileRanks = {};
    try {
      percentileRanks = await percentileLookup.mapEPDsToPercentiles(epdValuesForLookup);
    } catch (error) {
      console.error('[MAIN] Error mapping EPDs to percentiles, continuing without percentile ranks:', error.message);
      // Set all to null so they show as N/A
      for (const trait in calculatedEPDs) {
        percentileRanks[trait] = null;
      }
    }

    // Add percentile ranks to calculated EPDs
    for (const trait in calculatedEPDs) {
      calculatedEPDs[trait].estimatedPercentileRank = percentileRanks[trait] !== undefined ? percentileRanks[trait] : null;
    }

    emitProgress(5, 5, 'Complete!');
    console.log('[MAIN] Mating calculation completed successfully');
    return {
      success: true,
      data: {
        sire: {
          registrationNumber: sireRegNum,
          animalName: sireResult.animalName,
          epdValues: sireResult.epdValues
        },
        dam: {
          registrationNumber: damRegNum,
          animalName: damResult.animalName,
          epdValues: damResult.epdValues
        },
        calculatedEPDs: calculatedEPDs
      }
    };
  } catch (error) {
    console.error('[MAIN] Mating calculation failed:', error);
    return { success: false, error: error.message };
  }
});

// Clear cache
ipcMain.handle('clear-cache', async (event) => {
  console.log('[MAIN] clear-cache IPC handler called');
  try {
    const result = cacheUtil.clearAllCache();
    return result;
  } catch (error) {
    console.error('[MAIN] Error clearing cache:', error);
    return { success: false, error: error.message };
  }
});

// Get color criteria from config file
ipcMain.handle('get-color-criteria', async (event) => {
  try {
    const criteriaPath = path.join(__dirname, '../config/color-criteria.json');
    const criteriaData = fs.readFileSync(criteriaPath, 'utf8');
    return JSON.parse(criteriaData);
  } catch (error) {
    console.error('[MAIN] Error loading color criteria:', error);
    return {};
  }
});

// Export to Excel
ipcMain.handle('export-to-excel', async (event, data) => {
  console.log('[MAIN] Excel export called with', data?.length || 0, 'animals');
  try {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { success: false, error: 'No data to export' };
    }

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Excel File',
      defaultPath: `angus-epd-data-${Date.now()}.xlsx`,
      filters: [
        { name: 'Excel Files', extensions: ['xlsx'] }
      ]
    });

    if (canceled || !filePath) {
      console.log('[MAIN] User cancelled save dialog');
      return { success: false, error: 'Save cancelled' };
    }

    console.log('[MAIN] Saving to:', filePath);

    // Load color criteria
    const criteriaPath = path.join(__dirname, '../config/color-criteria.json');
    const criteriaData = fs.readFileSync(criteriaPath, 'utf8');
    const colorCriteria = JSON.parse(criteriaData);

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('EPD Data');

    // Get all unique traits from all animals
    const allTraits = new Set();
    data.forEach(animal => {
      if (animal.success && animal.data && animal.data.epdValues) {
        Object.keys(animal.data.epdValues).forEach(trait => allTraits.add(trait));
      }
    });

    // Define the desired trait order - only traits in this list will be color coded
    const traitOrder = [
      'CED', 'BW', 'WW', 'YW', 'RADG', 'DMI', 'YH', 'SC', 'DOC', 'CLAW',
      'ANGLE', 'PAP', 'HS', 'HP', 'CEM', 'MILK', 'TEAT', 'UDDR', 'FL',
      'MW', 'MH', '$EN', 'CW', 'MARB', 'RE', 'FAT', '$M', '$B', '$C'
    ];

    // Sort traits according to the predefined order
    const sortedTraits = Array.from(allTraits).sort((a, b) => {
      const indexA = traitOrder.indexOf(a);
      const indexB = traitOrder.indexOf(b);
      
      // If both are in the order, sort by their position
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      // If only A is in the order, A comes first
      if (indexA !== -1) return -1;
      // If only B is in the order, B comes first
      if (indexB !== -1) return 1;
      // If neither is in the order, sort alphabetically
      return a.localeCompare(b);
    });

    // Create header row with additional info columns
    const additionalInfoColumns = ['Name', 'Sire', 'Dam', 'MGS', 'BD', 'Tattoo'];
    const headers = ['Registration Number', ...additionalInfoColumns, ...sortedTraits];
    worksheet.addRow(headers);

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    // Add data rows
    data.forEach(animal => {
      if (!animal.success || !animal.data) return;

      // Build row with registration number and additional info
      const row = [
        animal.registrationNumber || '',
        animal.data.animalName || '', // Name
        animal.data.additionalInfo?.sire || '', // Sire
        animal.data.additionalInfo?.dam || '', // Dam
        animal.data.additionalInfo?.mgs || '', // MGS
        animal.data.additionalInfo?.birthDate || '', // BD
        animal.data.additionalInfo?.tattoo || '' // Tattoo
      ];

      // Add trait values
      sortedTraits.forEach(trait => {
        const traitData = animal.data.epdValues?.[trait];
        if (traitData) {
          const epd = traitData.epd || 'N/A';
          const rank = traitData.percentRank || 'N/A';
          row.push(`${epd} (${rank}%)`);
        } else {
          row.push('N/A');
        }
      });

      const dataRow = worksheet.addRow(row);

      // Apply color coding to trait cells (only for traits in the predefined list)
      sortedTraits.forEach((trait, traitIdx) => {
        // +8 for: reg num (1) + Name, Sire, Dam, MGS, BD, Tattoo (6) + trait index (1)
        const cell = dataRow.getCell(traitIdx + 8);
        const traitData = animal.data.epdValues?.[trait];
        
        // Only apply color coding if trait is in the predefined list
        if (traitOrder.includes(trait) && traitData && traitData.percentRank) {
          const rank = parseInt(traitData.percentRank, 10);
          const traitCriteria = colorCriteria[trait];
          
          if (traitCriteria && traitCriteria.ranges) {
            for (const range of traitCriteria.ranges) {
              if (rank >= range.min && rank <= range.max) {
                // Convert hex to ARGB format
                const bgColor = range.bgColor.replace('#', 'FF');
                const textColor = range.textColor.replace('#', 'FF');
                
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: bgColor }
                };
                cell.font = { color: { argb: textColor } };
                break;
              }
            }
          }
        } else {
          // Traits not in the list get white background, black text
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFFFF' }
          };
          cell.font = { color: { argb: 'FF000000' } };
        }
      });
    });

    // Set column widths
    worksheet.columns.forEach((column, index) => {
      if (index === 0) {
        column.width = 20; // Registration Number
      } else if (index >= 1 && index <= 7) {
        // Additional info columns: Name, Sire, Dam, MGS, BD, Tattoo
        column.width = 25;
      } else {
        column.width = 15; // Trait columns
      }
    });

    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    // Freeze header row
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }
    ];

    // Save workbook
    console.log('[MAIN] Writing Excel file...');
    await workbook.xlsx.writeFile(filePath);
    console.log('[MAIN] Excel file saved successfully');
    
    return { success: true, path: filePath };
  } catch (error) {
    console.error('[MAIN] Error exporting to Excel:', error);
    console.error('[MAIN] Error stack:', error.stack);
    return { success: false, error: error.message || String(error) };
  }
});
