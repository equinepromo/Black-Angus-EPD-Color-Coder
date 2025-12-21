const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CACHE_EXPIRY_DAYS = 30;

/**
 * Get cache directory path
 * IMPORTANT: This should match the path used in cache-util.js
 */
function getCacheDir() {
  const userDataPath = app.getPath('userData');
  // Use 'epd-cache' instead of 'cache' to avoid conflicts with Electron's cache management
  const cacheDir = path.join(userDataPath, 'epd-cache');
  console.log(`[CACHE-CLEANUP] Using cache directory: ${cacheDir}`);
  return cacheDir;
}

/**
 * Clean up expired cache files (files older than CACHE_EXPIRY_DAYS)
 * This can be run periodically to keep the cache directory clean
 */
function cleanupExpiredCache() {
  try {
    const CACHE_DIR = getCacheDir();
    console.log(`[CACHE-CLEANUP] Starting cleanup, checking directory: ${CACHE_DIR}`);
    
    if (!fs.existsSync(CACHE_DIR)) {
      console.log(`[CACHE-CLEANUP] Cache directory does not exist: ${CACHE_DIR}`);
      return { deleted: 0, errors: 0 };
    }

    const files = fs.readdirSync(CACHE_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    console.log(`[CACHE-CLEANUP] Found ${jsonFiles.length} cache file(s) to check`);
    
    let deletedCount = 0;
    let errorCount = 0;
    const now = Date.now();
    const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    jsonFiles.forEach(file => {
      try {
        const filePath = path.join(CACHE_DIR, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;
        const ageDays = age / (1000 * 60 * 60 * 24);

        console.log(`[CACHE-CLEANUP] Checking file: ${file}, age: ${ageDays.toFixed(2)} days, expiry: ${CACHE_EXPIRY_DAYS} days`);

        if (age > expiryMs) {
          console.log(`[CACHE-CLEANUP] Deleting expired file: ${file} (${ageDays.toFixed(2)} days old)`);
          fs.unlinkSync(filePath);
          deletedCount++;
        } else {
          console.log(`[CACHE-CLEANUP] Keeping file: ${file} (${ageDays.toFixed(2)} days old, still valid)`);
        }
      } catch (error) {
        console.error(`[CACHE-CLEANUP] Error processing ${file}:`, error);
        errorCount++;
      }
    });

    console.log(`[CACHE-CLEANUP] Cleanup complete. Deleted ${deletedCount} expired cache file(s), ${errorCount} error(s), kept ${jsonFiles.length - deletedCount - errorCount} valid file(s)`);
    return { deleted: deletedCount, errors: errorCount };
  } catch (error) {
    console.error('[CACHE-CLEANUP] Error during cleanup:', error);
    return { deleted: 0, errors: 1 };
  }
}

/**
 * Get cache directory size and file count
 */
function getCacheInfo() {
  try {
    const CACHE_DIR = getCacheDir();
    if (!fs.existsSync(CACHE_DIR)) {
      return { fileCount: 0, totalSize: 0, totalSizeMB: 0 };
    }

    const files = fs.readdirSync(CACHE_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    let totalSize = 0;

    jsonFiles.forEach(file => {
      try {
        const filePath = path.join(CACHE_DIR, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      } catch (error) {
        // Skip files we can't stat
      }
    });

    return {
      fileCount: jsonFiles.length,
      totalSize: totalSize,
      totalSizeMB: Math.round((totalSize / 1024 / 1024) * 100) / 100
    };
  } catch (error) {
    console.error('[CACHE-CLEANUP] Error getting cache info:', error);
    return { fileCount: 0, totalSize: 0, totalSizeMB: 0 };
  }
}

module.exports = {
  cleanupExpiredCache,
  getCacheInfo
};

// Run cleanup if called directly
if (require.main === module) {
  const info = getCacheInfo();
  console.log(`Current cache: ${info.fileCount} files, ${info.totalSizeMB} MB`);
  const result = cleanupExpiredCache();
  const newInfo = getCacheInfo();
  console.log(`After cleanup: ${newInfo.fileCount} files, ${newInfo.totalSizeMB} MB`);
}


