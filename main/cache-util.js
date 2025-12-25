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
 * Check if cached data exists and is still valid (less than 30 days old, or never expires for Researching)
 */
function isCacheValid(cacheFilePath) {
  if (!fs.existsSync(cacheFilePath)) {
    return false;
  }

  try {
    // Read categories from cache file to determine expiration policy
    let categories = ['My Herd']; // Default for backward compatibility
    try {
      const cacheContent = fs.readFileSync(cacheFilePath, 'utf8');
      const cached = JSON.parse(cacheContent);
      categories = getCategoriesFromCached(cached);
    } catch (readError) {
      // If we can't read the categories, use default
      console.log(`[CACHE] Could not read categories from cache file, using default: ${cacheFilePath}`);
      categories = ['My Herd'];
    }
    
    const stats = fs.statSync(cacheFilePath);
    const now = Date.now();
    const cacheAge = now - stats.mtimeMs;
    const cacheAgeDays = cacheAge / (1000 * 60 * 60 * 24);
    
    // Apply expiration based on categories
    // If "Researching" is in any category: Never expires automatically (365+ days)
    // All other categories: 30-day expiration
    const hasResearching = categories.includes('Researching');
    const expiryDays = hasResearching ? 365 : CACHE_EXPIRY_DAYS;
    
    return cacheAgeDays < expiryDays;
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
 * Normalize category/categories to always return an array
 * Supports backward compatibility with single category (string) and new multi-category (array)
 * @param {string|Array} categoryOrArray - Category string or array of categories
 * @returns {Array} Array of categories
 */
function normalizeCategories(categoryOrArray) {
  if (!categoryOrArray) {
    return ['My Herd'];
  }
  if (Array.isArray(categoryOrArray)) {
    // Filter out empty strings and null/undefined
    const filtered = categoryOrArray.filter(cat => cat && typeof cat === 'string' && cat.trim().length > 0);
    return filtered.length > 0 ? filtered : ['My Herd'];
  }
  if (typeof categoryOrArray === 'string') {
    return [categoryOrArray.trim() || 'My Herd'];
  }
  return ['My Herd'];
}

/**
 * Get categories from cached data (supports both old and new format)
 * @param {Object} cached - Cached data object
 * @returns {Array} Array of categories
 */
function getCategoriesFromCached(cached) {
  if (!cached) {
    return ['My Herd'];
  }
  // New format: categories array
  if (cached.categories && Array.isArray(cached.categories)) {
    const filtered = cached.categories.filter(cat => cat && typeof cat === 'string');
    return filtered.length > 0 ? filtered : ['My Herd'];
  }
  // Old format: single category string (backward compatibility)
  if (cached.category && typeof cached.category === 'string') {
    return [cached.category];
  }
  return ['My Herd'];
}

/**
 * Save data to cache
 * @param {string} key - Cache key
 * @param {Object} data - Data to cache
 * @param {string|Array} categoryOrCategories - Optional category (string) or categories (array), default: "My Herd"
 */
function saveCache(key, data, categoryOrCategories = 'My Herd') {
  try {
    const cacheFilePath = getCacheFilePath(key);
    
    // Normalize categories to array (support both old string and new array format)
    const categories = normalizeCategories(categoryOrCategories);
    
    // Read existing cache file if it exists to preserve other metadata
    let existingCached = null;
    if (fs.existsSync(cacheFilePath)) {
      try {
        const existingContent = fs.readFileSync(cacheFilePath, 'utf8');
        existingCached = JSON.parse(existingContent);
      } catch (error) {
        // If we can't read existing, continue with new data
        console.log(`[CACHE] Could not read existing cache file, creating new: ${cacheFilePath}`);
      }
    }
    
    const cacheData = {
      key,
      cachedAt: existingCached?.cachedAt || new Date().toISOString(),
      categories: categories, // Always use array format
      data
    };
    
    // Remove old category field if it exists (migration to new format)
    if (cacheData.category) {
      delete cacheData.category;
    }
    
    fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf8');
    console.log(`[CACHE] Saved cache for key: ${key} with categories: ${categories.join(', ')} to: ${cacheFilePath}`);
    
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
 * Invalidate all cache files (force refresh by making them appear expired)
 * This updates file modification times to force re-fetching on next scrape
 */
function invalidateAllCache() {
  try {
    const cacheDir = ensureCacheDir();
    
    if (!fs.existsSync(cacheDir)) {
      return { success: true, invalidatedCount: 0 };
    }
    
    const files = fs.readdirSync(cacheDir);
    const epdFiles = files.filter(f => f.startsWith('epd_') && f.endsWith('.json'));
    let invalidatedCount = 0;
    
    // Set modification time to a date far in the past to make cache appear expired
    const expiredDate = new Date(2000, 0, 1); // January 1, 2000
    
    epdFiles.forEach(file => {
      try {
        const filePath = path.join(cacheDir, file);
        fs.utimesSync(filePath, expiredDate, expiredDate);
        invalidatedCount++;
        console.log(`[CACHE] Invalidated cache file: ${file}`);
      } catch (error) {
        console.error(`[CACHE] Error invalidating cache file ${file}:`, error);
      }
    });
    
    // Also invalidate percentile breakdowns cache if it exists
    const percentileCachePath = getCacheFilePath('percentile-breakdowns');
    if (fs.existsSync(percentileCachePath)) {
      try {
        fs.utimesSync(percentileCachePath, expiredDate, expiredDate);
        console.log(`[CACHE] Invalidated percentile breakdowns cache`);
      } catch (error) {
        console.error(`[CACHE] Error invalidating percentile cache:`, error);
      }
    }
    
    console.log(`[CACHE] invalidateAllCache() completed - invalidated ${invalidatedCount} cache file(s)`);
    return { success: true, invalidatedCount };
  } catch (error) {
    console.error('[CACHE] Error invalidating cache:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clear all cache files (delete them)
 * NOTE: This function is kept for backward compatibility but should not be used for "Clear Cache" button
 * Use invalidateAllCache() instead to force refresh without losing data
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
        
        // Check if file exists and can be read
        if (!fs.existsSync(filePath)) {
          return; // Skip missing files
        }

        const cacheContent = fs.readFileSync(filePath, 'utf8');
        const cached = JSON.parse(cacheContent);
        
        if (cached && cached.data) {
          // For herd inventory, show ALL animals regardless of expiration
          // Expiration only matters when deciding whether to re-scrape (handled in loadCache)
          
          // Extract registration number from filename (epd_123456.json -> 123456)
          const registrationNumber = file.replace(/^epd_/, '').replace(/\.json$/, '');
          const animalName = cached.data.animalName || null;
          
          // Get categories (supports both old and new format)
          const categories = getCategoriesFromCached(cached);
          
          animals.push({
            registrationNumber: registrationNumber,
            animalName: animalName,
            sex: cached.data.sex || null,
            cachedAt: cached.cachedAt || null,
            categories: categories, // Always use array format
            category: categories[0] || 'My Herd' // Keep single category for backward compatibility in UI
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
        
        // For herd inventory, show ALL animals regardless of expiration
        // Expiration only matters when deciding whether to re-scrape
        if (!fs.existsSync(filePath)) {
          return; // Skip missing files
        }

        const cacheContent = fs.readFileSync(filePath, 'utf8');
        const cached = JSON.parse(cacheContent);
        
        if (cached && cached.data) {
          // Return full data object with categories included
          const animalData = { ...cached.data };
          // Get categories (supports both old and new format)
          const categories = getCategoriesFromCached(cached);
          animalData.categories = categories; // Always use array format
          animalData.category = categories[0] || 'My Herd'; // Keep single category for backward compatibility
          animals.push(animalData);
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

/**
 * Update categories for an existing cached animal
 * @param {string} registrationNumber - Registration number of the animal
 * @param {Array|string} categories - Array of category names, or single category string
 * @param {string} mode - "add", "remove", or "replace" (default: "replace")
 * @returns {Object} Result object with success status
 */
function updateAnimalCategories(registrationNumber, categories, mode = 'replace') {
  try {
    const cacheFilePath = getCacheFilePath(`epd_${registrationNumber}`);
    
    if (!fs.existsSync(cacheFilePath)) {
      return { success: false, error: 'Cache file not found' };
    }
    
    const cacheContent = fs.readFileSync(cacheFilePath, 'utf8');
    const cached = JSON.parse(cacheContent);
    
    // Get existing categories (supports both old and new format)
    let existingCategories = getCategoriesFromCached(cached);
    
    // Normalize input categories
    const newCategories = normalizeCategories(categories);
    
    // Apply mode
    let updatedCategories;
    if (mode === 'add') {
      // Add new categories, avoiding duplicates
      updatedCategories = [...new Set([...existingCategories, ...newCategories])];
    } else if (mode === 'remove') {
      // Remove specified categories
      updatedCategories = existingCategories.filter(cat => !newCategories.includes(cat));
      // Ensure at least one category remains
      if (updatedCategories.length === 0) {
        updatedCategories = ['My Herd'];
      }
    } else { // mode === 'replace'
      updatedCategories = newCategories;
    }
    
    // Update cache data
    cached.categories = updatedCategories;
    // Remove old category field if it exists (migration)
    if (cached.category) {
      delete cached.category;
    }
    
    // Save updated cache
    fs.writeFileSync(cacheFilePath, JSON.stringify(cached, null, 2), 'utf8');
    console.log(`[CACHE] Updated categories for ${registrationNumber} to: ${updatedCategories.join(', ')} (mode: ${mode})`);
    return { success: true, categories: updatedCategories };
  } catch (error) {
    console.error(`[CACHE] Error updating categories for ${registrationNumber}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Update category for an existing cached animal (backward compatibility)
 * @param {string} registrationNumber - Registration number of the animal
 * @param {string} category - New category name (replaces all categories)
 * @returns {Object} Result object with success status
 */
function updateAnimalCategory(registrationNumber, category) {
  // Use updateAnimalCategories with replace mode for backward compatibility
  return updateAnimalCategories(registrationNumber, category, 'replace');
}

/**
 * Remove a category from all animals that have it (does not delete animals, just removes the category)
 * @param {string} category - Category to remove from animals
 * @returns {Object} Result object with success status and updated count
 */
function removeCategoryFromAnimals(category) {
  try {
    const cacheDir = ensureCacheDir();
    if (!fs.existsSync(cacheDir)) {
      return { success: true, updatedCount: 0 };
    }
    
    const files = fs.readdirSync(cacheDir);
    const epdFiles = files.filter(f => f.startsWith('epd_') && f.endsWith('.json'));
    let updatedCount = 0;
    
    epdFiles.forEach(file => {
      try {
        const filePath = path.join(cacheDir, file);
        
        // Check if file is still valid (not expired)
        if (!isCacheValid(filePath)) {
          return; // Skip expired files
        }
        
        const cacheContent = fs.readFileSync(filePath, 'utf8');
        const cached = JSON.parse(cacheContent);
        
        // Get existing categories
        const existingCategories = getCategoriesFromCached(cached);
        
        // Check if this animal has the category to remove
        if (existingCategories.includes(category)) {
          // Remove the category
          const updatedCategories = existingCategories.filter(cat => cat !== category);
          
          // Ensure at least one category remains
          if (updatedCategories.length === 0) {
            updatedCategories.push('My Herd');
          }
          
          // Update cache
          cached.categories = updatedCategories;
          if (cached.category) {
            delete cached.category; // Remove old format
          }
          
          fs.writeFileSync(filePath, JSON.stringify(cached, null, 2), 'utf8');
          updatedCount++;
          console.log(`[CACHE] Removed category ${category} from animal: ${file}`);
        }
      } catch (error) {
        console.error(`[CACHE] Error processing file ${file}:`, error);
      }
    });
    
    console.log(`[CACHE] Removed category ${category} from ${updatedCount} animals`);
    return { success: true, updatedCount };
  } catch (error) {
    console.error(`[CACHE] Error removing category ${category} from animals:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete all animals that have a specific category (actually deletes cache files)
 * @param {string} category - Category to delete animals from
 * @returns {Object} Result object with success status and deleted count
 */
function deleteAnimalsByCategory(category) {
  try {
    const cacheDir = ensureCacheDir();
    if (!fs.existsSync(cacheDir)) {
      return { success: true, deletedCount: 0 };
    }
    
    const files = fs.readdirSync(cacheDir);
    const epdFiles = files.filter(f => f.startsWith('epd_') && f.endsWith('.json'));
    let deletedCount = 0;
    
    epdFiles.forEach(file => {
      try {
        const filePath = path.join(cacheDir, file);
        
        // Check if file is still valid (not expired)
        if (!isCacheValid(filePath)) {
          return; // Skip expired files
        }
        
        const cacheContent = fs.readFileSync(filePath, 'utf8');
        const cached = JSON.parse(cacheContent);
        
        // Get existing categories
        const existingCategories = getCategoriesFromCached(cached);
        
        // Check if this animal has the category to delete
        if (existingCategories.includes(category)) {
          // Actually delete the cache file
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`[CACHE] Deleted animal with category ${category}: ${file}`);
        }
      } catch (error) {
        console.error(`[CACHE] Error processing file ${file}:`, error);
      }
    });
    
    console.log(`[CACHE] Deleted ${deletedCount} animals with category: ${category}`);
    return { success: true, deletedCount };
  } catch (error) {
    console.error(`[CACHE] Error deleting animals by category ${category}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Get animals by category (works with multi-category support)
 * @param {string} category - Category to filter by
 * @returns {Array} Array of animal objects that have this category
 */
function getAnimalsByCategory(category) {
  const allAnimals = getCachedAnimals();
  return allAnimals.filter(animal => {
    const animalCategories = normalizeCategories(animal.categories || animal.category);
    return animalCategories.includes(category);
  });
}

/**
 * Get animals by multiple categories (AND/OR logic)
 * @param {Array} categories - Array of category names to filter by
 * @param {string} logic - "AND" (animal must have all categories) or "OR" (animal must have any category), default: "OR"
 * @returns {Array} Array of animal objects
 */
function getAnimalsByCategories(categories, logic = 'OR') {
  const allAnimals = getCachedAnimals();
  if (!Array.isArray(categories) || categories.length === 0) {
    return allAnimals;
  }
  
  return allAnimals.filter(animal => {
    const animalCategories = normalizeCategories(animal.categories || animal.category);
    if (logic === 'AND') {
      // Animal must have ALL specified categories
      return categories.every(cat => animalCategories.includes(cat));
    } else {
      // Animal must have ANY of the specified categories
      return categories.some(cat => animalCategories.includes(cat));
    }
  });
}

/**
 * Get categories config file path (writable location)
 * Uses userData path for packaged apps, falls back to relative path for dev
 * @returns {string} Path to categories.json file
 */
function getCategoriesPath() {
  try {
    // Use userData path - works in both dev and packaged apps
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'categories.json');
  } catch (error) {
    console.error('[CACHE] Error getting userData path, using fallback:', error);
    // Fallback to relative path if app.getPath fails (dev mode)
    return path.join(__dirname, '../config/categories.json');
  }
}

/**
 * Load categories from config file
 * @returns {Array} Array of category names
 */
function loadCategories() {
  try {
    const categoriesPath = getCategoriesPath();
    
    // First, try to load from userData (packaged app location)
    if (fs.existsSync(categoriesPath)) {
      const categoriesData = fs.readFileSync(categoriesPath, 'utf8');
      const parsed = JSON.parse(categoriesData);
      if (parsed.categories && Array.isArray(parsed.categories)) {
        return parsed.categories;
      }
    }
    
    // Fallback: try to load from config directory (dev mode or migration)
    const legacyPath = path.join(__dirname, '../config/categories.json');
    if (fs.existsSync(legacyPath)) {
      try {
        const categoriesData = fs.readFileSync(legacyPath, 'utf8');
        const parsed = JSON.parse(categoriesData);
        if (parsed.categories && Array.isArray(parsed.categories)) {
          // Migrate to userData location
          saveCategories(parsed.categories);
          console.log('[CACHE] Migrated categories.json to userData location');
          return parsed.categories;
        }
      } catch (migrationError) {
        console.error('[CACHE] Error migrating categories file:', migrationError);
      }
    }
    
    // Initialize with default categories if file doesn't exist
    const defaultCategories = ['My Herd'];
    saveCategories(defaultCategories);
    return defaultCategories;
  } catch (error) {
    console.error('[CACHE] Error loading categories:', error);
    // Return default categories on error - only "My Herd" is predefined
    return ['My Herd'];
  }
}

/**
 * Save categories to config file
 * @param {Array} categories - Array of category names
 * @returns {Object} Result object with success status
 */
function saveCategories(categories) {
  try {
    const categoriesPath = getCategoriesPath();
    const categoriesDir = path.dirname(categoriesPath);
    
    // Ensure directory exists
    if (!fs.existsSync(categoriesDir)) {
      fs.mkdirSync(categoriesDir, { recursive: true });
    }
    
    const data = { categories: categories };
    fs.writeFileSync(categoriesPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[CACHE] Saved ${categories.length} categories to: ${categoriesPath}`);
    return { success: true };
  } catch (error) {
    console.error('[CACHE] Error saving categories:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add a new category
 * @param {string} categoryName - Name of the category to add
 * @returns {Object} Result object with success status
 */
function addCategory(categoryName) {
  try {
    const categories = loadCategories();
    
    // Validate category name
    if (!categoryName || typeof categoryName !== 'string' || categoryName.trim().length === 0) {
      return { success: false, error: 'Category name cannot be empty' };
    }
    
    const trimmedName = categoryName.trim();
    
    // Check for duplicates (case-insensitive)
    const lowerCaseCategories = categories.map(c => c.toLowerCase());
    if (lowerCaseCategories.includes(trimmedName.toLowerCase())) {
      return { success: false, error: 'Category already exists' };
    }
    
    // Validate characters (alphanumeric, spaces, dashes, underscores)
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmedName)) {
      return { success: false, error: 'Category name contains invalid characters. Use only letters, numbers, spaces, dashes, and underscores.' };
    }
    
    // Add category
    categories.push(trimmedName);
    const result = saveCategories(categories);
    
    if (result.success) {
      console.log(`[CACHE] Added category: ${trimmedName}`);
    }
    
    return result;
  } catch (error) {
    console.error('[CACHE] Error adding category:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a category
 * @param {string} categoryName - Name of the category to delete
 * @returns {Object} Result object with success status and animal count
 */
function deleteCategory(categoryName) {
  try {
    const predefinedCategories = ['My Herd'];
    
    // Cannot delete predefined categories
    if (predefinedCategories.includes(categoryName)) {
      return { success: false, error: 'Cannot delete predefined category' };
    }
    
    // Check if any animals use this category
    const animalsInCategory = getAnimalsByCategory(categoryName);
    if (animalsInCategory.length > 0) {
      return { 
        success: false, 
        error: `Cannot delete category with ${animalsInCategory.length} animals. Reassign them first.`,
        animalCount: animalsInCategory.length
      };
    }
    
    // Remove category from list
    const categories = loadCategories();
    const filtered = categories.filter(c => c !== categoryName);
    
    if (filtered.length === categories.length) {
      return { success: false, error: 'Category not found' };
    }
    
    const result = saveCategories(filtered);
    
    if (result.success) {
      console.log(`[CACHE] Deleted category: ${categoryName}`);
    }
    
    return result;
  } catch (error) {
    console.error('[CACHE] Error deleting category:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  loadCache,
  saveCache,
  deleteCachedAnimal,
  updateAnimalCategory,
  updateAnimalCategories,
  removeCategoryFromAnimals,
  deleteAnimalsByCategory, // Deprecated but kept for backward compatibility
  getAnimalsByCategory,
  getAnimalsByCategories,
  normalizeCategories,
  getCategoriesFromCached,
  loadCategories,
  saveCategories,
  addCategory,
  deleteCategory,
  invalidateAllCache,
  clearAllCache,
  getCacheStats,
  getCachedAnimals,
  getCachedAnimalsWithData,
  isCacheValid,
  initializeCacheDir,
  CACHE_EXPIRY_DAYS
};

