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
const updateManager = require('./update-manager');
const matingRanker = require('./mating-ranker');

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
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
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
  
  // Initialize update manager after window is created
  updateManager.initialize(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      // Re-initialize update manager if window was recreated
      updateManager.initialize(mainWindow);
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

// Delete a cached animal
ipcMain.handle('delete-cached-animal', async (event, registrationNumber) => {
  console.log('[MAIN] delete-cached-animal called for:', registrationNumber);
  return cacheUtil.deleteCachedAnimal(registrationNumber);
});

// Update animal category
ipcMain.handle('update-animal-category', async (event, registrationNumber, category) => {
  console.log('[MAIN] update-animal-category called for:', registrationNumber, 'to category:', category);
  return cacheUtil.updateAnimalCategory(registrationNumber, category);
});

// Delete animals by category
ipcMain.handle('delete-animals-by-category', async (event, category) => {
  console.log('[MAIN] delete-animals-by-category called for:', category);
  return cacheUtil.deleteAnimalsByCategory(category);
});

// Get available categories
ipcMain.handle('get-available-categories', async (event) => {
  console.log('[MAIN] get-available-categories called');
  return cacheUtil.loadCategories();
});

// Load categories
ipcMain.handle('load-categories', async (event) => {
  console.log('[MAIN] load-categories called');
  return cacheUtil.loadCategories();
});

// Save categories
ipcMain.handle('save-categories', async (event, categories) => {
  console.log('[MAIN] save-categories called with:', categories.length, 'categories');
  return cacheUtil.saveCategories(categories);
});

// Add category
ipcMain.handle('add-category', async (event, categoryName) => {
  console.log('[MAIN] add-category called for:', categoryName);
  return cacheUtil.addCategory(categoryName);
});

// Delete category
ipcMain.handle('delete-category', async (event, categoryName) => {
  console.log('[MAIN] delete-category called for:', categoryName);
  return cacheUtil.deleteCategory(categoryName);
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

// IPC Handlers for updates
ipcMain.handle('check-for-updates', async (event, showDialog = true) => {
  updateManager.checkForUpdates(showDialog);
  return { success: true };
});

ipcMain.handle('download-update', async (event) => {
  updateManager.downloadUpdate();
  return { success: true };
});

ipcMain.handle('install-update', async (event) => {
  updateManager.installUpdate();
  return { success: true };
});

ipcMain.handle('get-app-version', async (event) => {
  return { version: updateManager.getCurrentVersion() };
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

ipcMain.handle('scrape-epd', async (event, registrationNumber, category) => {
  // Check license before allowing operation
  const licenseStatus = await licenseManager.validateLicense();
  if (!licenseStatus.valid) {
    return { success: false, error: 'License invalid. Please activate the application.' };
  }

  console.log('[MAIN] scrape-epd IPC handler called with:', registrationNumber, 'category:', category || 'My Herd');
  try {
    const result = await scraper.scrapeEPD(registrationNumber, null, false, category || 'My Herd');
    console.log('[MAIN] Scrape completed successfully');
    return { success: true, data: result };
  } catch (error) {
    console.error('[MAIN] Scrape failed with error:', error.message);
    console.error('[MAIN] Error stack:', error.stack);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('scrape-batch', async (event, registrationNumbers, category) => {
  // Check license before allowing operation
  const licenseStatus = await licenseManager.validateLicense();
  if (!licenseStatus.valid) {
    return [{ success: false, error: 'License invalid. Please activate the application.' }];
  }

  const results = [];
  const puppeteer = require('puppeteer');
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const cacheUtil = require('./cache-util');
  
  // Use selected category or default to 'My Herd'
  const selectedCategory = category || 'My Herd';
  console.log('[MAIN] scrape-batch called with category:', selectedCategory);
  
  // Pre-check cache to determine which items need scraping (optimization: avoid launching browser if all cached)
  const needsScraping = [];
  const cachedResults = new Map();
  
  for (const regNum of registrationNumbers) {
    const cacheKey = `epd_${regNum}`;
    const cached = cacheUtil.loadCache(cacheKey);
    if (cached && cached.data) {
      cachedResults.set(regNum, cached.data);
    } else {
      needsScraping.push(regNum);
    }
  }
  
  console.log(`[MAIN] Batch processing: ${cachedResults.size} cached, ${needsScraping.length} need scraping`);
  
  // Process cached items first (instant, no delays)
  for (const regNum of Array.from(cachedResults.keys())) {
    const data = cachedResults.get(regNum);
    results.push({ registrationNumber: regNum, success: true, data: { ...data, _fromCache: true } });
    event.sender.send('scrape-progress', {
      completed: results.length,
      total: registrationNumbers.length,
      current: regNum
    });
  }
  
  // Process items that need scraping (only launch browser if needed)
  let browser = null;
  const scraper = require('./scraper-puppeteer');
  
  try {
    if (needsScraping.length > 0) {
      // Launch browser only if we have items to scrape
      console.log('[MAIN] Launching browser for batch processing...');
      const launchOptions = scraper.getPuppeteerLaunchOptions();
      browser = await puppeteer.launch(launchOptions);
      
      for (let i = 0; i < needsScraping.length; i++) {
        const regNum = needsScraping[i];
        try {
          const result = await scraper.scrapeEPD(regNum, browser, false, selectedCategory);
          results.push({ registrationNumber: regNum, success: true, data: result });
          
          // Add delay between scraping requests (not for cached items)
          if (i < needsScraping.length - 1) {
            const waitTime = 500 + Math.random() * 500; // 0.5-1 seconds
            await delay(waitTime);
          }
        } catch (error) {
          results.push({ registrationNumber: regNum, success: false, error: error.message });
        }
        
        // Send progress update
        event.sender.send('scrape-progress', {
          completed: results.length,
          total: registrationNumbers.length,
          current: regNum
        });
      }
    }
  } finally {
    // Close browser after all scrapes are done (if we launched it)
    if (browser) {
      console.log('[MAIN] Closing browser after batch processing...');
      await browser.close();
    }
  }
  
  // Sort results to match original registration number order
  const resultMap = new Map();
  results.forEach(r => resultMap.set(r.registrationNumber, r));
  const sortedResults = registrationNumbers.map(regNum => resultMap.get(regNum)).filter(r => r);
  
  return sortedResults.length > 0 ? sortedResults : results;

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

// Rank all matings
ipcMain.handle('rank-all-matings', async (event, config) => {
  console.log('[MAIN] rank-all-matings called with config:', config);
  
  // Check license before allowing operation
  const licenseStatus = await licenseManager.validateLicense();
  if (!licenseStatus.valid) {
    return { success: false, error: 'License invalid. Please activate the application.' };
  }
  
  try {
    // Emit progress updates
    const emitProgress = (step, total, message) => {
      event.sender.send('mating-progress', { step, total, message });
    };
    
    emitProgress(1, 6, 'Loading cached animals...');
    
    // Get all cached animals with full data
    const allAnimals = cacheUtil.getCachedAnimalsWithData();
    
    if (allAnimals.length === 0) {
      return { success: false, error: 'No cached animals found. Please scrape some animals first.' };
    }
    
    emitProgress(2, 6, 'Filtering cows and sires...');
    
    // Get category filters from config (null means "all")
    const sireCategory = config?.sireCategory || null;
    const cowCategory = config?.cowCategory || null;
    
    // Filter into cows and sires, with category filtering
    const cows = allAnimals.filter(animal => {
      // First filter by sex
      const sex = (animal.sex || '').toUpperCase();
      const isCow = sex === 'COW' || sex === 'FEMALE' || sex === 'HEIFER' || sex.includes('COW') || sex.includes('FEMALE');
      if (!isCow) return false;
      
      // Then filter by category if specified
      if (cowCategory !== null) {
        const animalCategory = animal.category || 'My Herd';
        return animalCategory === cowCategory;
      }
      return true; // "all" means no category filter
    });
    
    const sires = allAnimals.filter(animal => {
      // First filter by sex
      const sex = (animal.sex || '').toUpperCase();
      const isSire = sex === 'BULL' || sex === 'MALE' || sex === 'STEER' || sex.includes('BULL') || sex.includes('MALE');
      if (!isSire) return false;
      
      // Then filter by category if specified
      if (sireCategory !== null) {
        const animalCategory = animal.category || 'My Herd';
        return animalCategory === sireCategory;
      }
      return true; // "all" means no category filter
    });
    
    if (cows.length === 0) {
      return { success: false, error: 'No cows found in cache. Please scrape some cows first.' };
    }
    
    if (sires.length === 0) {
      return { success: false, error: 'No sires found in cache. Please scrape some sires first.' };
    }
    
    const categoryInfo = [];
    if (sireCategory) categoryInfo.push(`sires: ${sireCategory}`);
    if (cowCategory) categoryInfo.push(`cows: ${cowCategory}`);
    const categoryStr = categoryInfo.length > 0 ? ` (filtered by ${categoryInfo.join(', ')})` : ' (all categories)';
    console.log(`[MAIN] Found ${cows.length} cows and ${sires.length} sires${categoryStr} (${cows.length * sires.length} total matings)`);
    
    emitProgress(3, 6, 'Fetching percentile data...');
    
    // Fetch percentile data (use bull data for calves)
    let percentileData = null;
    try {
      percentileData = await percentileLookup.fetchPercentileBreakdowns();
    } catch (error) {
      console.error('[MAIN] Error fetching percentile data:', error);
      return { success: false, error: 'Failed to fetch percentile data: ' + error.message };
    }
    
    emitProgress(4, 6, 'Loading color criteria...');
    
    // Load color criteria
    const criteriaPath = path.join(__dirname, '../config/color-criteria.json');
    let colorCriteria = null;
    try {
      const criteriaData = fs.readFileSync(criteriaPath, 'utf8');
      colorCriteria = JSON.parse(criteriaData);
    } catch (error) {
      console.error('[MAIN] Error loading color criteria:', error);
      return { success: false, error: 'Failed to load color criteria: ' + error.message };
    }
    
    emitProgress(5, 6, 'Ranking all matings...');
    
    // Default configuration - emphasis-based system, no default gate traits
    const defaultConfig = {
      gateTraits: [], // No default gates - user must configure via UI
      topN: config?.topN || 50
    };
    
    // Merge with provided config
    const finalConfig = { ...defaultConfig, ...config };
    
    // Progress callback
    const progressCallback = (processed, total) => {
      const percentage = Math.floor((processed / total) * 100);
      // Map to step 5 of 6, with percentage as message
      emitProgress(5, 6, `Ranking matings... ${processed}/${total} (${percentage}%)`);
    };
    
    // Rank all matings
    const rankedMatings = matingRanker.rankAllMatings(
      cows,
      sires,
      percentileData,
      colorCriteria,
      finalConfig,
      progressCallback
    );
    
    // Add full animal data to each mating result for detail view
    const rankedMatingsWithData = rankedMatings.map(mating => {
      const cowData = cows.find(c => c.registrationNumber === mating.cowId);
      const sireData = sires.find(s => s.registrationNumber === mating.sireId);
      
      return {
        ...mating,
        cowData: cowData || null,
        sireData: sireData || null
      };
    });
    
    emitProgress(6, 6, 'Complete!');
    
    console.log(`[MAIN] Ranking complete. Found ${rankedMatings.length} ranked matings`);
    
    return {
      success: true,
      data: {
        rankedMatings: rankedMatingsWithData,
        totalCows: cows.length,
        totalSires: sires.length,
        totalMatings: cows.length * sires.length,
        config: finalConfig
      }
    };
  } catch (error) {
    console.error('[MAIN] Error ranking all matings:', error);
    console.error('[MAIN] Error stack:', error.stack);
    return { success: false, error: error.message || String(error) };
  }
});

// Invalidate cache (force refresh without deleting files)
ipcMain.handle('invalidate-cache', async (event) => {
  console.log('[MAIN] invalidate-cache IPC handler called');
  try {
    const result = cacheUtil.invalidateAllCache();
    return result;
  } catch (error) {
    console.error('[MAIN] Error invalidating cache:', error);
    return { success: false, error: error.message };
  }
});

// Clear cache (delete files) - kept for backward compatibility
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

// Get percentile data (bull or cow)
ipcMain.handle('get-percentile-data', async (event, animalType) => {
  try {
    if (animalType === 'cow') {
      return await percentileLookup.fetchCowPercentileBreakdowns();
    } else {
      return await percentileLookup.fetchPercentileBreakdowns();
    }
  } catch (error) {
    console.error('[MAIN] Error fetching percentile data:', error);
    return null;
  }
});

// Score an animal using EPD values
ipcMain.handle('score-animal', async (event, { epdValues, animalType, gateTraits = [] }) => {
  try {
    // Get percentile data
    let percentileData = null;
    if (animalType === 'cow') {
      percentileData = await percentileLookup.fetchCowPercentileBreakdowns();
    } else {
      percentileData = await percentileLookup.fetchPercentileBreakdowns();
    }
    
    // Get color criteria
    const criteriaPath = path.join(__dirname, '../config/color-criteria.json');
    const criteriaData = fs.readFileSync(criteriaPath, 'utf8');
    const colorCriteria = JSON.parse(criteriaData);
    
    // Score using shared function
    const score = matingRanker.scoreEpdValues(epdValues, percentileData, colorCriteria, gateTraits);
    
    return { success: true, score: score };
  } catch (error) {
    console.error('[MAIN] Error scoring animal:', error);
    return { success: false, error: error.message, score: 0 };
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

    // Traits that get enhanced color coding (black/white for better than top 1%)
    const enhancedColorTraits = ['CED', 'BW', 'WW', 'YW', 'RADG', 'DOC', 'CLAW', 'ANGLE', 'HS', 'HP', 'CEM', 'MARB', 'RE', '$M', '$B', '$C'];
    
    // Trait direction: true = higher is better, false = lower is better
    const traitDirection = {
      'CED': true, 'BW': false, 'WW': true, 'YW': true, 'RADG': true, 'DOC': true,
      'CLAW': false, 'ANGLE': false, 'HS': false, 'HP': true, 'CEM': true,
      'MARB': true, 'RE': true, '$M': true, '$B': true, '$C': true
    };

    // Fetch percentile data for bulls and cows
    let bullPercentileData = null;
    let cowPercentileData = null;
    try {
      [bullPercentileData, cowPercentileData] = await Promise.all([
        percentileLookup.fetchPercentileBreakdowns(),
        percentileLookup.fetchCowPercentileBreakdowns()
      ]);
    } catch (error) {
      console.error('[MAIN] Error fetching percentile data for Excel export:', error);
      // Continue without percentile data - will fall back to normal color coding
    }

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
    // Add headers for EPD columns and percent rank columns
    const epdHeaders = sortedTraits.map(trait => trait);
    const percentRankHeaders = sortedTraits.map(trait => `${trait} %Rank`);
    const headers = ['Registration Number', ...additionalInfoColumns, ...epdHeaders, ...percentRankHeaders];
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

      // Parse birth date for Excel (format: MM/DD/YYYY)
      let birthDateValue = '';
      let birthDateObj = null;
      const birthDateStr = animal.data.additionalInfo?.birthDate || '';
      if (birthDateStr) {
        // Parse MM/DD/YYYY format
        const dateMatch = birthDateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dateMatch) {
          const month = parseInt(dateMatch[1], 10) - 1; // JavaScript months are 0-indexed
          const day = parseInt(dateMatch[2], 10);
          const year = parseInt(dateMatch[3], 10);
          birthDateObj = new Date(year, month, day);
          if (!isNaN(birthDateObj.getTime())) {
            birthDateValue = birthDateObj;
          } else {
            birthDateValue = birthDateStr; // Fallback to string if invalid
          }
        } else {
          birthDateValue = birthDateStr; // Keep as string if format doesn't match
        }
      }

      // Build row with registration number and additional info
      const row = [
        animal.registrationNumber || '',
        animal.data.animalName || '', // Name
        animal.data.additionalInfo?.sire || '', // Sire
        animal.data.additionalInfo?.dam || '', // Dam
        animal.data.additionalInfo?.mgs || '', // MGS
        birthDateValue, // BD (Date object or string)
        animal.data.additionalInfo?.tattoo || '' // Tattoo
      ];

      // Add EPD values (without percent rank) - store as numbers for Excel
      sortedTraits.forEach(trait => {
        const traitData = animal.data.epdValues?.[trait];
        if (traitData && traitData.epd) {
          let epd = traitData.epd;
          // Parse EPD to number if possible
          if (typeof epd === 'string') {
            // Remove "I" prefix if present (inferred value)
            const cleanedEPD = epd.replace(/^I\s*/i, '').trim();
            const epdNum = parseFloat(cleanedEPD);
            if (!isNaN(epdNum)) {
              // Store as number (no + prefix, Excel will handle formatting)
              row.push(epdNum);
            } else {
              row.push('N/A');
            }
          } else if (typeof epd === 'number') {
            row.push(epd);
          } else {
            row.push('N/A');
          }
        } else {
          row.push('N/A');
        }
      });

      // Add percent rank values in decimal form (no colors)
      sortedTraits.forEach(trait => {
        const traitData = animal.data.epdValues?.[trait];
        if (traitData && traitData.percentRank && traitData.percentRank !== 'N/A') {
          // Convert percent rank to decimal (e.g., 75% -> 0.75)
          const rankNum = parseFloat(traitData.percentRank);
          if (!isNaN(rankNum)) {
            const decimalRank = (rankNum / 100).toFixed(4);
            row.push(decimalRank);
          } else {
            row.push('N/A');
          }
        } else {
          row.push('N/A');
        }
      });

      const dataRow = worksheet.addRow(row);

      // Format BD column (column 6, 1-based) as date
      const bdCell = dataRow.getCell(6); // BD is the 6th column (after Registration Number)
      if (bdCell.value instanceof Date) {
        bdCell.numFmt = 'mm/dd/yyyy';
      }

      // Format EPD cells as numbers with 2 decimal places
      sortedTraits.forEach((trait, traitIdx) => {
        // +8 for: reg num (1) + Name, Sire, Dam, MGS, BD, Tattoo (6) + trait index (1)
        const cell = dataRow.getCell(traitIdx + 8);
        // If cell contains a number, format it with 2 decimal places
        if (typeof cell.value === 'number') {
          cell.numFmt = '0.00';
        }
      });

      // Apply color coding to EPD trait cells (only for traits in the predefined list)
      sortedTraits.forEach((trait, traitIdx) => {
        // +8 for: reg num (1) + Name, Sire, Dam, MGS, BD, Tattoo (6) + trait index (1)
        const cell = dataRow.getCell(traitIdx + 8);
        const traitData = animal.data.epdValues?.[trait];
        
        // Only apply color coding if trait is in the predefined list
        if (traitOrder.includes(trait) && traitData && traitData.percentRank) {
          const rank = parseInt(traitData.percentRank, 10);
          
          // Determine animal type and get appropriate percentile data
          const sex = (animal.data.sex || '').toUpperCase();
          const isCow = sex === 'COW' || sex === 'FEMALE' || sex === 'HEIFER' || sex.includes('COW') || sex.includes('FEMALE');
          const percentileData = isCow ? cowPercentileData : bullPercentileData;
          
          // Check if this trait should get enhanced color coding and if value is better than top 1%
          let useEnhancedColor = false;
          if (enhancedColorTraits.includes(trait) && rank >= 1 && rank <= 10 && percentileData) {
            // Get the 1st percentile threshold
            const normalizedTrait = trait.toUpperCase();
            const traitPercentiles = percentileData[normalizedTrait];
            
            if (traitPercentiles && traitPercentiles.length > 0) {
              // Find the 1st percentile entry
              const firstPercentileEntry = traitPercentiles.find(entry => entry.percentile === 1);
              const threshold = firstPercentileEntry ? firstPercentileEntry.epdValue : traitPercentiles[0].epdValue;
              
              if (threshold !== null && threshold !== undefined && traitData.epd) {
                // Parse EPD value
                let epdValue = null;
                const epdStr = typeof traitData.epd === 'string' ? traitData.epd.replace(/^I\s*/i, '').trim() : traitData.epd;
                const epdNum = parseFloat(epdStr);
                if (!isNaN(epdNum)) {
                  epdValue = epdNum;
                }
                
                if (epdValue !== null) {
                  const isHigherBetter = traitDirection[trait] !== false; // Default to true if not specified
                  
                  // Check if EPD value is better than threshold
                  const isBetter = isHigherBetter ? (epdValue > threshold) : (epdValue < threshold);
                  
                  if (isBetter) {
                    useEnhancedColor = true;
                    // Use black background with white text for better-than-top-1%
                    cell.fill = {
                      type: 'pattern',
                      pattern: 'solid',
                      fgColor: { argb: 'FF000000' }
                    };
                    cell.font = { color: { argb: 'FFFFFFFF' } };
                  }
                }
              }
            }
          }
          
          // If not using enhanced color, use normal color coding
          if (!useEnhancedColor) {
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
            } else {
              // Traits not in the list get white background, black text
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFFFFF' }
              };
              cell.font = { color: { argb: 'FF000000' } };
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

      // Set percent rank columns to white background, black text (no colors)
      sortedTraits.forEach((trait, traitIdx) => {
        // Column index (1-based): reg num (1) + additional info (6) + EPD columns (sortedTraits.length) + percent rank index + 1
        // Column 1: Registration Number, Columns 2-7: Additional info, Columns 8+: EPD columns, then Percent rank columns
        const percentRankColIdx = 1 + 6 + sortedTraits.length + traitIdx + 1;
        const cell = dataRow.getCell(percentRankColIdx);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFFFF' }
        };
        cell.font = { color: { argb: 'FF000000' } };
      });
    });

    // Set column widths
    const numAdditionalInfoCols = 6; // Name, Sire, Dam, MGS, BD, Tattoo
    const numEPDCols = sortedTraits.length;
    worksheet.columns.forEach((column, index) => {
      if (index === 0) {
        column.width = 20; // Registration Number
      } else if (index >= 1 && index <= numAdditionalInfoCols) {
        // Additional info columns: Name, Sire, Dam, MGS, BD, Tattoo
        column.width = 25;
      } else if (index > numAdditionalInfoCols && index <= numAdditionalInfoCols + numEPDCols) {
        column.width = 15; // EPD columns
      } else {
        column.width = 12; // Percent rank columns (slightly narrower)
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
