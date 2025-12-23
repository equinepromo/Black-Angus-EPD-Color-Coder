const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CACHE_EXPIRY_DAYS = 30; // Cache expires after 30 days

let CACHE_DIR = null;

/**
 * Initialize cache directory using user data path
 */
function initializeCacheDir() {
  if (CACHE_DIR) return CACHE_DIR; // Already initialized
  
  try {
    // Use userData path - works in both dev and packaged apps
    // Use 'epd-cache' instead of 'cache' to avoid conflicts with Electron's cache management
    const userDataPath = app.getPath('userData');
    CACHE_DIR = path.join(userDataPath, 'epd-cache');
    
    // Ensure cache directory exists - mkdirSync with recursive: true only creates if missing
    // It does NOT delete existing files, so this is safe
    if (!fs.existsSync(CACHE_DIR)) {
      try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log('[CACHE] Created cache directory:', CACHE_DIR);
      } catch (mkdirError) {
        // Directory might have been created by another process between existsSync and mkdirSync
        if (!fs.existsSync(CACHE_DIR)) {
          throw mkdirError; // Re-throw if it still doesn't exist
        }
        console.log('[CACHE] Cache directory already exists (race condition handled):', CACHE_DIR);
      }
    } else {
      // Verify it's actually a directory and we can access it
      const stats = fs.statSync(CACHE_DIR);
      if (!stats.isDirectory()) {
        throw new Error(`Cache path exists but is not a directory: ${CACHE_DIR}`);
      }
      console.log('[CACHE] Using existing cache directory:', CACHE_DIR);
    }
  } catch (error) {
    console.error('[CACHE] Error initializing cache directory:', error);
    // Fallback to relative path if app.getPath fails (shouldn't happen in Electron)
    CACHE_DIR = path.join(__dirname, '../cache');
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }
  
  return CACHE_DIR;
}

// Ensure cache directory exists
function ensureCacheDir() {
  if (!CACHE_DIR) {
    initializeCacheDir();
  }
  return CACHE_DIR;
}

/**
 * Get cache file path for a given key
 */
function getCacheFilePath(key) {
  ensureCacheDir();
  // Sanitize key to be filesystem-safe
  const sanitizedKey = key.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(CACHE_DIR, `${sanitizedKey}.json`);
}

/**
 * Check if cached data exists and is still valid (less than 30 days old)
 */
function isCacheValid(cacheFilePath) {
  if (!fs.existsSync(cacheFilePath)) {
    return false;
  }

  try {
    const stats = fs.statSync(cacheFilePath);
    const now = Date.now();
    const cacheAge = now - stats.mtimeMs;
    const cacheAgeDays = cacheAge / (1000 * 60 * 60 * 24);
    
    return cacheAgeDays < CACHE_EXPIRY_DAYS;
  } catch (error) {
    console.error('[CACHE] Error checking cache validity:', error);
    return false;
  }
}

/**
 * Load cached data for a given key
 * @param {string} key - Cache key (e.g., registration number or 'percentile-breakdowns')
 * @returns {Object|null} Cached data with metadata, or null if not found/invalid
 */
function loadCache(key) {
  try {
    const cacheFilePath = getCacheFilePath(key);
    
    if (!fs.existsSync(cacheFilePath)) {
      console.log(`[CACHE] No cache file found for key: ${key} at: ${cacheFilePath}`);
      return null;
    }
    
    if (!isCacheValid(cacheFilePath)) {
      console.log(`[CACHE] Cache file expired for key: ${key}`);
      return null;
    }

    const cacheContent = fs.readFileSync(cacheFilePath, 'utf8');
    const cached = JSON.parse(cacheContent);
    console.log(`[CACHE] Loaded cached data for key: ${key} from: ${cacheFilePath}`);
    return cached;
  } catch (error) {
    console.error(`[CACHE] Error loading cache for key ${key}:`, error);
    console.error(`[CACHE] Error stack:`, error.stack);
    return null;
  }
}

/**
 * Save data to cache
 * @param {string} key - Cache key
 * @param {Object} data - Data to cache
 */
function saveCache(key, data) {
  try {
    const cacheFilePath = getCacheFilePath(key);
    
    const cacheData = {
      key,
      cachedAt: new Date().toISOString(),
      data
    };
    
    fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf8');
    console.log(`[CACHE] Saved cache for key: ${key} to: ${cacheFilePath}`);
    
    // Verify the file was written
    if (fs.existsSync(cacheFilePath)) {
      const stats = fs.statSync(cacheFilePath);
      console.log(`[CACHE] Cache file verified, size: ${stats.size} bytes`);
    } else {
      console.error(`[CACHE] WARNING: Cache file was not created at: ${cacheFilePath}`);
    }
  } catch (error) {
    console.error(`[CACHE] Error saving cache for key ${key}:`, error);
    console.error(`[CACHE] Error stack:`, error.stack);
  }
}

/**
 * Delete a single cached animal by registration number
 * @param {string} registrationNumber - Registration number of the animal to delete
 * @returns {Object} Result object with success status
 */
function deleteCachedAnimal(registrationNumber) {
  try {
    const cacheFilePath = getCacheFilePath(`epd_${registrationNumber}`);
    
    if (!fs.existsSync(cacheFilePath)) {
      console.log(`[CACHE] Cache file does not exist for registration number: ${registrationNumber}`);
      return { success: false, error: 'Cache file not found' };
    }
    
    fs.unlinkSync(cacheFilePath);
    console.log(`[CACHE] Deleted cache file for registration number: ${registrationNumber}`);
    return { success: true };
  } catch (error) {
    console.error(`[CACHE] Error deleting cache for registration number ${registrationNumber}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Clear all cache files
 */
function clearAllCache() {
  try {
    // Ensure cache directory is initialized
    const cacheDir = ensureCacheDir();
    
    console.log(`[CACHE] clearAllCache() called - clearing cache directory: ${cacheDir}`);
    console.trace('[CACHE] Stack trace for clearAllCache call');
    
    if (!fs.existsSync(cacheDir)) {
      console.log('[CACHE] Cache directory does not exist, nothing to clear');
      return { success: true, deletedCount: 0 };
    }
    
    const files = fs.readdirSync(cacheDir);
    console.log(`[CACHE] Found ${files.length} file(s) to potentially delete`);
    let deletedCount = 0;
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(cacheDir, file);
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`[CACHE] Deleted cache file: ${file}`);
        } catch (error) {
          console.error(`[CACHE] Error deleting cache file ${file}:`, error);
        }
      }
    });
    
    console.log(`[CACHE] clearAllCache() completed - cleared ${deletedCount} cache file(s) from: ${cacheDir}`);
    return { success: true, deletedCount };
  } catch (error) {
    console.error('[CACHE] Error clearing cache:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  try {
    // Ensure cache directory is initialized
    const cacheDir = ensureCacheDir();
    
    if (!fs.existsSync(cacheDir)) {
      return { totalFiles: 0, totalSize: 0, files: [] };
    }

    const files = fs.readdirSync(cacheDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    let totalSize = 0;
    const fileStats = [];

    jsonFiles.forEach(file => {
      const filePath = path.join(cacheDir, file);
      try {
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        fileStats.push({
          name: file,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          ageDays: Math.floor((Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24))
        });
      } catch (error) {
        console.error(`[CACHE] Error getting stats for ${file}:`, error);
      }
    });

    return {
      totalFiles: jsonFiles.length,
      totalSize,
      files: fileStats
    };
  } catch (error) {
    console.error('[CACHE] Error getting cache stats:', error);
    return { totalFiles: 0, totalSize: 0, files: [] };
  }
}

/**
 * Get list of all cached animals (registration numbers with names)
 * @returns {Array} Array of { registrationNumber, animalName } objects
 */
function getCachedAnimals() {
  try {
    // Ensure cache directory is initialized
    const cacheDir = ensureCacheDir();
    
    if (!fs.existsSync(cacheDir)) {
      console.log('[CACHE] Cache directory does not exist:', cacheDir);
      return [];
    }

    const files = fs.readdirSync(cacheDir);
    console.log(`[CACHE] All files in cache directory (${files.length} total):`, files);
    const epdFiles = files.filter(f => f.startsWith('epd_') && f.endsWith('.json'));
    console.log(`[CACHE] EPD cache files after filtering (${epdFiles.length} found):`, epdFiles);
    const animals = [];

    epdFiles.forEach(file => {
      try {
        const filePath = path.join(cacheDir, file);
        
        // Check if file is still valid (not expired)
        if (!isCacheValid(filePath)) {
          return; // Skip expired files
        }

        const cacheContent = fs.readFileSync(filePath, 'utf8');
        const cached = JSON.parse(cacheContent);
        
        if (cached && cached.data) {
          // Extract registration number from filename (epd_123456.json -> 123456)
          const registrationNumber = file.replace(/^epd_/, '').replace(/\.json$/, '');
          const animalName = cached.data.animalName || null;
          
          animals.push({
            registrationNumber: registrationNumber,
            animalName: animalName,
            sex: cached.data.sex || null,
            cachedAt: cached.cachedAt || null
          });
        }
      } catch (error) {
        // Skip files we can't read or parse
        console.error(`[CACHE] Error reading cached animal from ${file}:`, error.message);
      }
    });

    // Sort by animal name if available, otherwise by registration number
    animals.sort((a, b) => {
      if (a.animalName && b.animalName) {
        return a.animalName.localeCompare(b.animalName);
      }
      if (a.animalName) return -1;
      if (b.animalName) return 1;
      return a.registrationNumber.localeCompare(b.registrationNumber);
    });

    console.log(`[CACHE] Found ${animals.length} cached animals from ${epdFiles.length} cache files`);
    return animals;
  } catch (error) {
    console.error('[CACHE] Error getting cached animals:', error);
    console.error('[CACHE] Error stack:', error.stack);
    return [];
  }
}

/**
 * Get list of all cached animals with full EPD data
 * @returns {Array} Array of full animal data objects (with epdValues, etc.)
 */
function getCachedAnimalsWithData() {
  try {
    // Ensure cache directory is initialized
    const cacheDir = ensureCacheDir();
    
    if (!fs.existsSync(cacheDir)) {
      console.log('[CACHE] Cache directory does not exist:', cacheDir);
      return [];
    }

    const files = fs.readdirSync(cacheDir);
    const epdFiles = files.filter(f => f.startsWith('epd_') && f.endsWith('.json'));
    const animals = [];

    epdFiles.forEach(file => {
      try {
        const filePath = path.join(cacheDir, file);
        
        // Check if file is still valid (not expired)
        if (!isCacheValid(filePath)) {
          return; // Skip expired files
        }

        const cacheContent = fs.readFileSync(filePath, 'utf8');
        const cached = JSON.parse(cacheContent);
        
        if (cached && cached.data) {
          // Return full data object
          animals.push(cached.data);
        }
      } catch (error) {
        // Skip files we can't read or parse
        console.error(`[CACHE] Error reading cached animal from ${file}:`, error.message);
      }
    });

    console.log(`[CACHE] Found ${animals.length} cached animals with full data`);
    return animals;
  } catch (error) {
    console.error('[CACHE] Error getting cached animals with data:', error);
    console.error('[CACHE] Error stack:', error.stack);
    return [];
  }
}

module.exports = {
  loadCache,
  saveCache,
  deleteCachedAnimal,
  clearAllCache,
  getCacheStats,
  getCachedAnimals,
  getCachedAnimalsWithData,
  isCacheValid,
  initializeCacheDir,
  CACHE_EXPIRY_DAYS
};

