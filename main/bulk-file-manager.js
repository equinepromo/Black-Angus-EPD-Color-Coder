const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { app } = require('electron');
const bulkFileProcessor = require('./bulk-file-processor');

// Default manifest URL (uses same server as license server)
// Can be overridden via environment variable BULK_FILE_MANIFEST_URL
const DEFAULT_MANIFEST_URL = process.env.BULK_FILE_MANIFEST_URL || 'https://scoring.westernsports.video/angus/bulk-files/manifest.json';

/**
 * Get path to bulk files directory (for storing downloaded files)
 * @returns {string} Path to bulk files directory
 */
function getBulkFilesDir() {
  try {
    const userDataPath = app.getPath('userData');
    const bulkFilesDir = path.join(userDataPath, 'bulk-files');
    if (!fs.existsSync(bulkFilesDir)) {
      fs.mkdirSync(bulkFilesDir, { recursive: true });
    }
    return bulkFilesDir;
  } catch (error) {
    console.error('[BULK-MANAGER] Error getting bulk files directory:', error);
    // Fallback
    const fallbackDir = path.join(__dirname, '../bulk-files');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return fallbackDir;
  }
}

/**
 * Get path to ignored updates storage
 * @returns {string} Path to ignored updates file
 */
function getIgnoredUpdatesPath() {
  try {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'bulk-files-ignored.json');
  } catch (error) {
    return path.join(__dirname, '../bulk-files-ignored.json');
  }
}

/**
 * Download a file from URL
 * @param {string} url - URL to download from
 * @param {string} targetPath - Path to save file to
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
function downloadBulkFile(url, targetPath) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + (urlObj.search || ''),
        method: 'GET',
        timeout: 30000 // 30 second timeout
      };

      const file = fs.createWriteStream(targetPath);
      let downloadedBytes = 0;

      const req = client.request(options, (res) => {
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(targetPath); // Delete incomplete file
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${res.statusMessage}` });
          return;
        }

        const totalSize = parseInt(res.headers['content-length'] || '0', 10);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const written = file.write(chunk);
          // Handle backpressure - if write buffer is full, wait for drain
          if (!written) {
            res.pause();
            file.once('drain', () => {
              res.resume();
            });
          }
        });

        res.on('end', () => {
          file.end();
        });

        // Wait for file stream to finish writing all data
        file.on('finish', () => {
          console.log(`[BULK-MANAGER] Downloaded ${downloadedBytes} bytes to ${targetPath}`);
          // Verify file was written correctly
          try {
            const stats = fs.statSync(targetPath);
            if (stats.size !== downloadedBytes) {
              console.error(`[BULK-MANAGER] WARNING: File size mismatch! Expected ${downloadedBytes} bytes, got ${stats.size} bytes`);
              // Still resolve success, but log the warning
            }
          } catch (statError) {
            console.error(`[BULK-MANAGER] Error checking file stats:`, statError);
          }
          resolve({ success: true, size: downloadedBytes });
        });

        file.on('error', (error) => {
          file.close();
          if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }
          console.error('[BULK-MANAGER] File write error:', error);
          resolve({ success: false, error: `File write error: ${error.message}` });
        });
      });

      req.on('error', (error) => {
        file.close();
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        console.error('[BULK-MANAGER] Download error:', error);
        resolve({ success: false, error: error.message });
      });

      req.on('timeout', () => {
        req.destroy();
        file.close();
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        resolve({ success: false, error: 'Download timeout' });
      });

      req.end();
    } catch (error) {
      console.error('[BULK-MANAGER] Error setting up download:', error);
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * Download and parse manifest file
 * @param {string} manifestUrl - URL to manifest file (optional, uses default if not provided)
 * @returns {Promise<Object>} { success: boolean, manifest?: Object, error?: string }
 */
async function getManifest(manifestUrl = DEFAULT_MANIFEST_URL) {
  try {
    const bulkFilesDir = getBulkFilesDir();
    const manifestPath = path.join(bulkFilesDir, 'manifest.json');

    // Download manifest
    const downloadResult = await downloadBulkFile(manifestUrl, manifestPath);
    if (!downloadResult.success) {
      return { success: false, error: downloadResult.error };
    }

    // Parse manifest
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    // Validate manifest structure
    if (!manifest.bulkFiles || !Array.isArray(manifest.bulkFiles)) {
      return { success: false, error: 'Invalid manifest structure: missing bulkFiles array' };
    }

    return { success: true, manifest };
  } catch (error) {
    console.error('[BULK-MANAGER] Error getting manifest:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get ignored updates
 * @returns {Object} Ignored updates data
 */
function getIgnoredUpdates() {
  try {
    const ignoredPath = getIgnoredUpdatesPath();
    if (fs.existsSync(ignoredPath)) {
      const content = fs.readFileSync(ignoredPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('[BULK-MANAGER] Error reading ignored updates:', error);
  }
  return { ignoredUpdates: {} };
}

/**
 * Save ignored updates
 * @param {Object} data - Ignored updates data
 */
function saveIgnoredUpdates(data) {
  try {
    const ignoredPath = getIgnoredUpdatesPath();
    const ignoredDir = path.dirname(ignoredPath);
    if (!fs.existsSync(ignoredDir)) {
      fs.mkdirSync(ignoredDir, { recursive: true });
    }
    fs.writeFileSync(ignoredPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('[BULK-MANAGER] Error saving ignored updates:', error);
  }
}

/**
 * Check if an update should be ignored
 * @param {string} bulkFileId - Bulk file ID
 * @param {string} version - Version to check
 * @returns {boolean} True if should be ignored
 */
function isUpdateIgnored(bulkFileId, version) {
  const ignoredData = getIgnoredUpdates();
  const ignored = ignoredData.ignoredUpdates[bulkFileId];
  if (!ignored) {
    return false;
  }
  // If permanent ignore, ignore all versions
  if (ignored.permanent) {
    return true;
  }
  // Otherwise, check if this specific version was ignored
  return ignored.version === version;
}

/**
 * Ignore an update
 * @param {string} bulkFileId - Bulk file ID
 * @param {string} version - Version to ignore
 * @param {boolean} permanent - If true, ignore all future updates for this file
 */
function ignoreBulkFileUpdate(bulkFileId, version, permanent = false) {
  const ignoredData = getIgnoredUpdates();
  ignoredData.ignoredUpdates[bulkFileId] = {
    version: version,
    ignoredAt: new Date().toISOString(),
    permanent: permanent
  };
  saveIgnoredUpdates(ignoredData);
}

/**
 * Get available bulk files from manifest
 * @param {string} manifestUrl - Optional manifest URL
 * @returns {Promise<Object>} { success: boolean, bulkFiles?: Array, error?: string }
 */
async function getAvailableBulkFiles(manifestUrl = null) {
  const result = await getManifest(manifestUrl);
  if (!result.success) {
    return result;
  }
  return { success: true, bulkFiles: result.manifest.bulkFiles || [] };
}

/**
 * Get status of all bulk files (local versions vs manifest versions)
 * @returns {Promise<Object>} Status of bulk files
 */
async function getBulkFileStatus() {
  try {
    // Get manifest
    const manifestResult = await getManifest();
    if (!manifestResult.success) {
      return { success: false, error: manifestResult.error };
    }

    const manifest = manifestResult.manifest;
    const processedFiles = bulkFileProcessor.getProcessedBulkFiles();
    const ignoredUpdates = getIgnoredUpdates();

    const status = {
      lastChecked: new Date().toISOString(),
      bulkFiles: []
    };

    manifest.bulkFiles.forEach(bulkFile => {
      const processed = processedFiles.processedFiles[bulkFile.id];
      const ignored = ignoredUpdates.ignoredUpdates[bulkFile.id];
      
      let statusType = 'not-imported';
      if (processed) {
        // Compare versions
        const localVersion = processed.version;
        const manifestVersion = bulkFile.version;
        
        // Simple version comparison (assuming semantic versioning)
        if (localVersion === manifestVersion) {
          statusType = 'up-to-date';
        } else {
          statusType = 'update-available';
        }
      }

      status.bulkFiles.push({
        id: bulkFile.id,
        name: bulkFile.name,
        description: bulkFile.description,
        manifestVersion: bulkFile.version,
        localVersion: processed?.version || null,
        status: statusType,
        lastProcessed: processed?.processedAt || null,
        animalCount: bulkFile.animalCount || 0,
        url: bulkFile.url || null, // Include URL for importing
        ignored: ignored ? { version: ignored.version, permanent: ignored.permanent } : null
      });
    });

    return { success: true, ...status };
  } catch (error) {
    console.error('[BULK-MANAGER] Error getting bulk file status:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get pending updates (files with available updates that aren't ignored)
 * @returns {Promise<Object>} Pending updates
 */
async function getPendingUpdates() {
  try {
    const statusResult = await getBulkFileStatus();
    if (!statusResult.success) {
      return statusResult;
    }

    const pendingUpdates = statusResult.bulkFiles
      .filter(bf => {
        if (bf.status !== 'update-available' && bf.status !== 'not-imported') {
          return false;
        }
        // Check if ignored
        if (bf.ignored) {
          // Check if this specific version is ignored, or if permanent
          if (bf.ignored.permanent || bf.ignored.version === bf.manifestVersion) {
            return false;
          }
        }
        return true;
      })
      .map(bf => ({
        id: bf.id,
        name: bf.name,
        version: bf.manifestVersion,
        url: bf.url,
        description: bf.description,
        animalCount: bf.animalCount
      }));

    return { success: true, pendingUpdates };
  } catch (error) {
    console.error('[BULK-MANAGER] Error getting pending updates:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check for updates (compare manifest with local processed files)
 * @returns {Promise<Object>} Updates check result
 */
async function checkForUpdates() {
  return await getPendingUpdates();
}

/**
 * Import a bulk file (download and process)
 * @param {string} bulkFileId - Bulk file ID
 * @param {string} url - URL to bulk file
 * @param {Object} options - Import options
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} Import result
 */
async function importBulkFile(bulkFileId, url, options = {}, progressCallback = null) {
  // Always force re-processing when explicitly importing (user wants to import with current options)
  options = { ...options, forceReprocess: true };
  try {
    const bulkFilesDir = getBulkFilesDir();
    
    // Extract filename from URL or use bulk file ID
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname;
    const filename = path.basename(urlPath) || `${bulkFileId}.json`;
    const targetPath = path.join(bulkFilesDir, filename);

    // Download bulk file
    if (progressCallback) {
      progressCallback(0, 100, 'Downloading bulk file...');
    }

    const downloadResult = await downloadBulkFile(url, targetPath);
    if (!downloadResult.success) {
      return { success: false, error: `Download failed: ${downloadResult.error}` };
    }

    // Validate downloaded file is valid JSON before processing
    try {
      const downloadedContent = fs.readFileSync(targetPath, 'utf8');
      const downloadedData = JSON.parse(downloadedContent);
      console.log(`[BULK-MANAGER] Downloaded file validated as JSON (${downloadResult.size} bytes)`);
      
      // Basic validation - check it has expected structure
      if (!downloadedData.animals || !Array.isArray(downloadedData.animals)) {
        return { 
          success: false, 
          error: 'Downloaded file has invalid structure (missing animals array). File may be corrupted.' 
        };
      }
      console.log(`[BULK-MANAGER] File contains ${downloadedData.animals.length} animals`);
    } catch (validateError) {
      console.error(`[BULK-MANAGER] Downloaded file is not valid JSON: ${validateError.message}`);
      // Try to get file size for debugging
      const stats = fs.statSync(targetPath);
      return { 
        success: false, 
        error: `Downloaded file is corrupted (invalid JSON at position ${validateError.message.match(/position (\d+)/)?.[1] || 'unknown'}): ${validateError.message}. File size: ${stats.size} bytes. Please re-upload the file to the server or contact support.` 
      };
    }

    // Process bulk file
    if (progressCallback) {
      progressCallback(50, 100, 'Processing bulk file...');
    }

    // Pass bulkFileId in options so processor uses the correct ID (from manifest, not filename)
    const processOptions = { ...options, bulkFileId };
    const processResult = bulkFileProcessor.processBulkFile(targetPath, processOptions, (processed, total, current) => {
      if (progressCallback) {
        const progress = 50 + Math.floor((processed / total) * 50); // 50-100%
        progressCallback(progress, 100, `Processing animal ${processed} of ${total}...`);
      }
    });

    // Clean up downloaded file (optional - could keep for reference)
    // fs.unlinkSync(targetPath);

    return processResult;
  } catch (error) {
    console.error('[BULK-MANAGER] Error importing bulk file:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getManifest,
  getAvailableBulkFiles,
  downloadBulkFile,
  importBulkFile,
  checkForUpdates,
  getBulkFileStatus,
  getPendingUpdates,
  ignoreBulkFileUpdate,
  isUpdateIgnored,
  getIgnoredUpdates,
  getBulkFilesDir,
  DEFAULT_MANIFEST_URL
};

