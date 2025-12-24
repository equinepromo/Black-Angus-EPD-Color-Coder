const fs = require('fs');
const path = require('path');
const cacheUtil = require('./cache-util');

/**
 * Validate bulk file structure
 * @param {Object} data - Parsed bulk file data
 * @returns {Object} { valid: boolean, error: string }
 */
function validateBulkFile(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Bulk file is not a valid object' };
  }

  if (!data.version || typeof data.version !== 'string') {
    return { valid: false, error: 'Bulk file missing version field' };
  }

  if (!data.metadata || typeof data.metadata !== 'object') {
    return { valid: false, error: 'Bulk file missing metadata field' };
  }

  if (!Array.isArray(data.animals)) {
    return { valid: false, error: 'Bulk file animals field must be an array' };
  }

  // Validate each animal has required fields
  for (let i = 0; i < data.animals.length; i++) {
    const animal = data.animals[i];
    if (!animal.registrationNumber || typeof animal.registrationNumber !== 'string') {
      return { valid: false, error: `Animal at index ${i} missing registrationNumber` };
    }
    if (!animal.data || typeof animal.data !== 'object') {
      return { valid: false, error: `Animal at index ${i} missing data field` };
    }
  }

  return { valid: true };
}

/**
 * Get path to processed bulk files tracking file
 * @returns {string} Path to tracking file
 */
function getProcessedFilesPath() {
  const { app } = require('electron');
  try {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'bulk-files-processed.json');
  } catch (error) {
    // Fallback for testing
    return path.join(__dirname, '../bulk-files-processed.json');
  }
}

/**
 * Get processed bulk files tracking data
 * @returns {Object} Processed files data
 */
function getProcessedBulkFiles() {
  try {
    const trackingPath = getProcessedFilesPath();
    if (fs.existsSync(trackingPath)) {
      const content = fs.readFileSync(trackingPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('[BULK-PROCESSOR] Error reading processed files:', error);
  }
  return { processedFiles: {} };
}

/**
 * Save processed bulk files tracking data
 * @param {Object} data - Processed files data
 */
function saveProcessedBulkFiles(data) {
  try {
    const trackingPath = getProcessedFilesPath();
    const trackingDir = path.dirname(trackingPath);
    if (!fs.existsSync(trackingDir)) {
      fs.mkdirSync(trackingDir, { recursive: true });
    }
    fs.writeFileSync(trackingPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('[BULK-PROCESSOR] Error saving processed files:', error);
  }
}

/**
 * Check if animal should be updated based on strategy
 * @param {Object} existingCache - Existing cached data
 * @param {Object} newData - New data from bulk file
 * @param {string} updateStrategy - "skip-existing", "update-if-newer", "add-categories-only", "merge"
 * @returns {boolean} True if should update
 */
function shouldUpdateAnimal(existingCache, newData, updateStrategy) {
  if (!existingCache) {
    return true; // Always create if doesn't exist
  }

  switch (updateStrategy) {
    case 'skip-existing':
      return false; // Never update existing
      
    case 'update-if-newer':
      // Compare timestamps - newData should have cachedAt from the animal object
      const existingTime = existingCache.cachedAt ? new Date(existingCache.cachedAt).getTime() : 0;
      const newTime = newData.cachedAt ? new Date(newData.cachedAt).getTime() : null;
      if (newTime === null) {
        // No timestamp in bulk file, treat as newer to allow update (bulk files are considered authoritative)
        return true;
      }
      // Update if new timestamp is equal or newer (>= instead of > to allow updates of same timestamp)
      return newTime >= existingTime;
      
    case 'add-categories-only':
      // Only update if we're adding categories (check if categories would change)
      const existingCats = cacheUtil.getCategoriesFromCached(existingCache);
      const newCats = cacheUtil.normalizeCategories(newData.category || newData.categories);
      // Update if new categories would be added
      return newCats.some(cat => !existingCats.includes(cat));
      
    case 'merge':
    default:
      return true; // Always update
  }
}

/**
 * Determine categories to assign based on category mode and options
 * @param {Object} animal - Animal from bulk file
 * @param {Object} bulkFileMetadata - Bulk file metadata (may have category)
 * @param {Object} options - Import options
 * @returns {Array} Array of categories to assign
 */
function determineCategories(animal, bulkFileMetadata, options) {
  const { categoryMode, userSelectedCategories, createCategoryIfMissing } = options;

  let categories = [];

  if (categoryMode === 'user-selected' && userSelectedCategories && Array.isArray(userSelectedCategories)) {
    categories = cacheUtil.normalizeCategories(userSelectedCategories);
    console.log(`[BULK-PROCESSOR] Using user-selected categories: ${categories.join(', ')}`);
  } else if (categoryMode === 'use-file-category') {
    // Use category from bulk file metadata or animal
    const fileCategory = bulkFileMetadata?.category || animal.category;
    categories = cacheUtil.normalizeCategories(fileCategory);
    console.log(`[BULK-PROCESSOR] Using file category: ${categories.join(', ')} (from metadata: ${bulkFileMetadata?.category || 'none'}, animal: ${animal.category || 'none'})`);
  } else if (categoryMode === 'add-to-existing') {
    // Will be merged with existing categories in import logic
    const fileCategory = bulkFileMetadata?.category || animal.category;
    categories = cacheUtil.normalizeCategories(fileCategory);
    console.log(`[BULK-PROCESSOR] Using add-to-existing mode, initial categories: ${categories.join(', ')}`);
  } else {
    // Default: use file category
    const fileCategory = bulkFileMetadata?.category || animal.category;
    categories = cacheUtil.normalizeCategories(fileCategory);
    console.log(`[BULK-PROCESSOR] Using default file category: ${categories.join(', ')}`);
  }

  // Ensure categories exist if createCategoryIfMissing is true
  if (createCategoryIfMissing) {
    const availableCategories = cacheUtil.loadCategories();
    categories.forEach(cat => {
      if (!availableCategories.includes(cat)) {
        console.log(`[BULK-PROCESSOR] Creating category: ${cat}`);
        cacheUtil.addCategory(cat);
      }
    });
  }

  return categories;
}

/**
 * Import bulk animals into individual cache files
 * @param {Array} animals - Array of animal objects from bulk file
 * @param {Object} bulkFileMetadata - Bulk file metadata
 * @param {Object} options - Import options
 * @param {Function} progressCallback - Optional progress callback (processed, total, currentAnimal)
 * @returns {Object} Import result with statistics
 */
function importBulkAnimals(animals, bulkFileMetadata, options, progressCallback = null) {
  const {
    categoryMode = 'use-file-category',
    userSelectedCategories = null,
    createCategoryIfMissing = true,
    updateStrategy = 'merge', // Default to 'merge' for bulk files (they're authoritative)
    source = 'bulk-file'
  } = options;

  let importedCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;
  const categoriesCreated = [];
  const categoriesUsed = new Set();

  const availableCategories = cacheUtil.loadCategories();

  // Pre-create categories if needed
  const allCategoriesToUse = new Set();
  animals.forEach(animal => {
    const fileCategory = bulkFileMetadata?.category || animal.category;
    const cats = cacheUtil.normalizeCategories(fileCategory);
    cats.forEach(cat => allCategoriesToUse.add(cat));
  });

  if (categoryMode === 'user-selected' && userSelectedCategories) {
    const userCats = cacheUtil.normalizeCategories(userSelectedCategories);
    userCats.forEach(cat => allCategoriesToUse.add(cat));
  }

  if (createCategoryIfMissing) {
    allCategoriesToUse.forEach(cat => {
      if (!availableCategories.includes(cat)) {
        console.log(`[BULK-PROCESSOR] Creating category: ${cat}`);
        const result = cacheUtil.addCategory(cat);
        if (result.success) {
          categoriesCreated.push(cat);
        }
      }
    });
  }

  // Process each animal
  for (let i = 0; i < animals.length; i++) {
    const animal = animals[i];
    const registrationNumber = animal.registrationNumber;

    try {
      // Determine categories to assign
      let categoriesToAssign = determineCategories(animal, bulkFileMetadata, options);
      console.log(`[BULK-PROCESSOR] Initial categoriesToAssign for ${registrationNumber}: ${categoriesToAssign.join(', ')}`);

      // Check if animal already exists
      const cacheKey = `epd_${registrationNumber}`;
      let existingCache = null;
      try {
        existingCache = cacheUtil.loadCache(cacheKey);
      } catch (cacheError) {
        // If we can't load existing cache (e.g., corrupted file), log but continue
        console.warn(`[BULK-PROCESSOR] Could not load existing cache for ${registrationNumber}: ${cacheError.message}`);
        // Continue as if animal doesn't exist
      }

      if (existingCache) {
        // Animal exists - apply category strategy
        const existingCategories = cacheUtil.getCategoriesFromCached(existingCache);
        console.log(`[BULK-PROCESSOR] Animal ${registrationNumber} exists with categories: ${existingCategories.join(', ')}`);

        if (categoryMode === 'add-to-existing') {
          // Merge categories (add new ones, keep existing)
          categoriesToAssign = [...new Set([...existingCategories, ...categoriesToAssign])];
          console.log(`[BULK-PROCESSOR] Merged categories (add-to-existing): ${categoriesToAssign.join(', ')}`);
        } else if (categoryMode === 'use-file-category' || categoryMode === 'user-selected') {
          // Replace mode: use new categories, but preserve existing if updateStrategy is 'add-categories-only'
          if (updateStrategy === 'add-categories-only') {
            // Only add categories that don't exist
            categoriesToAssign = [...new Set([...existingCategories, ...categoriesToAssign])];
            console.log(`[BULK-PROCESSOR] Merged categories (add-categories-only strategy): ${categoriesToAssign.join(', ')}`);
          } else {
            // Replace existing categories with new ones
            console.log(`[BULK-PROCESSOR] Replacing categories with: ${categoriesToAssign.join(', ')}`);
          }
        }

        // Check if should update based on strategy
        // Pass the animal object which has cachedAt at the top level (not in animal.data)
        // Create a merged object for timestamp comparison that includes cachedAt
        const animalForComparison = {
          ...animal.data,
          cachedAt: animal.cachedAt
        };
        if (!shouldUpdateAnimal(existingCache, animalForComparison, updateStrategy)) {
          skippedCount++;
          console.log(`[BULK-PROCESSOR] Skipping animal ${registrationNumber} due to update strategy: ${updateStrategy} (existing: ${existingCache.cachedAt || 'none'}, bulk: ${animal.cachedAt || 'none'})`);
          if (progressCallback) {
            progressCallback(i + 1, animals.length, registrationNumber);
          }
          continue;
        }
        console.log(`[BULK-PROCESSOR] Will UPDATE animal ${registrationNumber} (strategy: ${updateStrategy}, categories: ${categoriesToAssign.join(', ')})`);
        updatedCount++;
      } else {
        console.log(`[BULK-PROCESSOR] Will IMPORT new animal ${registrationNumber} (categories: ${categoriesToAssign.join(', ')})`);
        importedCount++;
      }

      // Track categories used
      categoriesToAssign.forEach(cat => categoriesUsed.add(cat));

      // Save animal to cache using existing saveCache function
      // Convert animal structure to match cache format
      console.log(`[BULK-PROCESSOR] Saving ${registrationNumber} with categories: ${categoriesToAssign.join(', ')}`);
      cacheUtil.saveCache(cacheKey, animal.data, categoriesToAssign);

      if (progressCallback) {
        progressCallback(i + 1, animals.length, registrationNumber);
      }
    } catch (error) {
      console.error(`[BULK-PROCESSOR] Error processing animal ${registrationNumber}:`, error);
      skippedCount++;
      if (progressCallback) {
        progressCallback(i + 1, animals.length, registrationNumber);
      }
    }
  }

  return {
    total: animals.length,
    importedCount,
    updatedCount,
    skippedCount,
    categoriesCreated: Array.from(new Set(categoriesCreated)),
    categoriesUsed: Array.from(categoriesUsed)
  };
}

/**
 * Process a bulk file and import animals into cache
 * @param {string} filePath - Path to bulk file
 * @param {Object} options - Import options
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Object} Processing result
 */
function processBulkFile(filePath, options = {}, progressCallback = null) {
  try {
    console.log(`[BULK-PROCESSOR] Processing bulk file: ${filePath}`);

    // Read and parse bulk file
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Bulk file not found' };
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Get file stats for debugging
    const stats = fs.statSync(filePath);
    
    let bulkData;
    try {
      bulkData = JSON.parse(fileContent);
    } catch (parseError) {
      console.error(`[BULK-PROCESSOR] JSON parse error at position ${parseError.message.match(/position (\d+)/)?.[1] || 'unknown'}`);
      console.error(`[BULK-PROCESSOR] File size: ${stats.size} bytes`);
      // Try to find the approximate line number
      if (parseError.message.includes('position')) {
        const posMatch = parseError.message.match(/position (\d+)/);
        if (posMatch) {
          const position = parseInt(posMatch[1], 10);
          const lines = fileContent.substring(0, position).split('\n');
          const lineNumber = lines.length;
          const column = lines[lines.length - 1].length + 1;
          console.error(`[BULK-PROCESSOR] Approximate location: line ${lineNumber}, column ${column}`);
          // Show context around the error
          const contextStart = Math.max(0, lineNumber - 5);
          const contextEnd = Math.min(lines.length, lineNumber + 5);
          console.error(`[BULK-PROCESSOR] Context (lines ${contextStart + 1}-${contextEnd}):`);
          lines.slice(contextStart, contextEnd).forEach((line, idx) => {
            const actualLineNum = contextStart + idx + 1;
            const marker = actualLineNum === lineNumber ? '>>>' : '   ';
            console.error(`${marker} ${actualLineNum}: ${line.substring(0, 100)}`);
          });
        }
      }
      throw parseError;
    }

    // Validate bulk file structure
    const validation = validateBulkFile(bulkData);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Extract version from filename if not in data
    const filename = path.basename(filePath);
    const versionMatch = filename.match(/v(\d+\.\d+\.\d+)/);
    const fileVersion = versionMatch ? versionMatch[1] : bulkData.version || '1.0.0';

    // Extract bulk file ID from filename (e.g., recommended-sires-v1.0.0.json -> recommended-sires)
    // But prefer the ID from options if provided (from manifest)
    const bulkFileId = options.bulkFileId || filename.replace(/[-_]v\d+\.\d+\.\d+.*$/, '').replace(/\.json$/, '');

    // Check if this version was already processed (unless forceReprocess is true)
    const forceReprocess = options.forceReprocess === true;
    const processedFiles = getProcessedBulkFiles();
    const processedFile = processedFiles.processedFiles[bulkFileId];
    if (!forceReprocess && processedFile && processedFile.version === fileVersion) {
      console.log(`[BULK-PROCESSOR] Bulk file ${bulkFileId} version ${fileVersion} already processed (use forceReprocess option to re-import)`);
      return {
        success: true,
        alreadyProcessed: true,
        importedCount: processedFile.importedCount || 0,
        skippedCount: processedFile.skippedCount || 0,
        updatedCount: processedFile.updatedCount || 0
      };
    }
    
    if (forceReprocess) {
      console.log(`[BULK-PROCESSOR] Force re-processing bulk file ${bulkFileId} version ${fileVersion}`);
    }

    // Process animals
    const animals = Array.isArray(bulkData.animals) ? bulkData.animals : Object.values(bulkData.animals || {});
    const importResult = importBulkAnimals(animals, bulkData.metadata, options, progressCallback);

    // Update tracking
    processedFiles.processedFiles[bulkFileId] = {
      version: fileVersion,
      filename: filename,
      processedAt: new Date().toISOString(),
      animalCount: animals.length,
      importedCount: importResult.importedCount,
      updatedCount: importResult.updatedCount,
      skippedCount: importResult.skippedCount,
      categoriesCreated: importResult.categoriesCreated,
      categoriesUsed: importResult.categoriesUsed
    };
    saveProcessedBulkFiles(processedFiles);

    console.log(`[BULK-PROCESSOR] Processing complete: ${importResult.importedCount} imported, ${importResult.updatedCount} updated, ${importResult.skippedCount} skipped`);

    return {
      success: true,
      bulkFileId,
      version: fileVersion,
      ...importResult
    };
  } catch (error) {
    console.error('[BULK-PROCESSOR] Error processing bulk file:', error);
    console.error('[BULK-PROCESSOR] Error stack:', error.stack);
    
    // Provide more detailed error message
    let errorMessage = error.message;
    if (error.message && error.message.includes('JSON')) {
      errorMessage = `JSON parsing error: ${error.message}. This may indicate a corrupted file or download issue.`;
    }
    
    return { success: false, error: errorMessage };
  }
}

/**
 * Create bulk file from animals array
 * @param {Array} animals - Array of animal objects with registrationNumber and data
 * @param {Object} options - Options for bulk file creation
 * @returns {Object} Bulk file object
 */
function createBulkFileFromAnimals(animals, options = {}) {
  const {
    version = '1.0.0',
    type = 'bulk-file',
    category = null,
    source = 'angus.org',
    description = null
  } = options;

  const now = new Date().toISOString();

  return {
    version,
    lastUpdated: now,
    source,
    metadata: {
      type,
      description: description || `Bulk file: ${type}`,
      animalCount: animals.length,
      category: category || null
    },
    animals: animals.map(animal => {
      // Get categories (support both old and new format)
      const categories = cacheUtil.normalizeCategories(
        animal.categories || animal.category
      );
      const animalCategory = category || categories[0] || 'My Herd';

      return {
        registrationNumber: animal.registrationNumber,
        data: animal.data,
        cachedAt: animal.cachedAt || now,
        category: animalCategory
      };
    })
  };
}

module.exports = {
  processBulkFile,
  validateBulkFile,
  importBulkAnimals,
  shouldUpdateAnimal,
  getProcessedBulkFiles,
  determineCategories,
  createBulkFileFromAnimals
};

