const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { app } = require('electron');
const bulkFileProcessor = require('./bulk-file-processor');
const licenseManager = require('./license-manager');

// Default manifest URL (uses same server as license server)
// Can be overridden via environment variable BULK_FILE_MANIFEST_URL
// Now uses PHP endpoint that queries database instead of static manifest.json
const DEFAULT_MANIFEST_URL = process.env.BULK_FILE_MANIFEST_URL || 'https://scoring.westernsports.video/angus/bulk-files/get-manifest.php';

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
 * Fetch manifest from URL (supports both PHP endpoint and static JSON)
 * @param {string} manifestUrl - URL to manifest endpoint/file
 * @returns {Promise<Object>} { success: boolean, manifest?: Object, error?: string }
 */
function fetchManifestFromUrl(manifestUrl) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(manifestUrl);
      const client = urlObj.protocol === 'https:' ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + (urlObj.search || ''),
        method: 'GET',
        timeout: 30000 // 30 second timeout
      };

      const req = client.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          // Try to parse response even if status code is not 200
          // PHP endpoint returns JSON even on errors
          let parsedData = null;
          try {
            parsedData = JSON.parse(data);
          } catch (parseError) {
            // If we can't parse, it's not JSON
          }

          if (res.statusCode !== 200) {
            // If we got JSON error response, use that message
            const errorMsg = parsedData?.error || `HTTP ${res.statusCode}: ${res.statusMessage}`;
            console.error('[BULK-MANAGER] Manifest fetch error:', errorMsg, parsedData);
            resolve({ 
              success: false, 
              error: errorMsg,
              // Return empty manifest structure on error so app doesn't crash
              manifest: parsedData || { lastUpdated: new Date().toISOString(), bulkFiles: [] }
            });
            return;
          }

          try {
            const manifest = parsedData || JSON.parse(data);

            // Validate manifest structure
            if (!manifest.bulkFiles || !Array.isArray(manifest.bulkFiles)) {
              resolve({ 
                success: false, 
                error: 'Invalid manifest structure: missing bulkFiles array',
                manifest: { lastUpdated: new Date().toISOString(), bulkFiles: [] }
              });
              return;
            }

            // Cache manifest locally for offline access (optional)
            try {
              const bulkFilesDir = getBulkFilesDir();
              const manifestPath = path.join(bulkFilesDir, 'manifest.json');
              fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
            } catch (cacheError) {
              // Non-fatal - just log it
              console.warn('[BULK-MANAGER] Could not cache manifest:', cacheError.message);
            }

            resolve({ success: true, manifest });
          } catch (parseError) {
            console.error('[BULK-MANAGER] Error parsing manifest JSON:', parseError);
            resolve({ 
              success: false, 
              error: `Invalid JSON response: ${parseError.message}` 
            });
          }
        });
      });

      req.on('error', (error) => {
        console.error('[BULK-MANAGER] Error fetching manifest:', error);
        resolve({ success: false, error: error.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Request timeout' });
      });

      req.end();
    } catch (error) {
      console.error('[BULK-MANAGER] Error setting up manifest request:', error);
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * Fetch manifest from PHP endpoint (database-driven)
 * @param {string} manifestUrl - URL to manifest endpoint (optional, uses default if not provided)
 * @param {boolean} adminMode - If true, fetch all files (active and inactive) for admin users
 * @returns {Promise<Object>} { success: boolean, manifest?: Object, error?: string }
 */
async function getManifest(manifestUrl = null, adminMode = false) {
  // If no URL provided, use default and check if user is admin
  if (!manifestUrl) {
    manifestUrl = DEFAULT_MANIFEST_URL;
    
    // Check if user is admin to determine if we should fetch all files
    if (!adminMode) {
      try {
        const licenseStatus = await licenseManager.validateLicense();
        const licenseType = licenseStatus.licenseType || 'standard';
        const features = licenseStatus.features || [];
        adminMode = licenseType === 'admin' || 
                   features.includes('all') || 
                   features.includes('manageBulkFiles');
      } catch (error) {
        console.warn('[BULK-MANAGER] Could not check license status for admin mode:', error.message);
        // Default to non-admin mode if we can't check
        adminMode = false;
      }
    }
  }
  
  // Append admin parameter if admin mode is enabled
  if (adminMode) {
    const urlObj = new URL(manifestUrl);
    urlObj.searchParams.set('admin', 'true');
    manifestUrl = urlObj.toString();
  }
  
  return await fetchManifestFromUrl(manifestUrl);
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
 * @param {string} filename - Bulk file filename
 * @returns {boolean} True if should be ignored
 */
function isUpdateIgnored(filename) {
  const ignoredData = getIgnoredUpdates();
  const ignored = ignoredData.ignoredUpdates[filename];
  if (!ignored) {
    return false;
  }
  // If permanent ignore, ignore all updates for this file
  if (ignored.permanent) {
    return true;
  }
  // Otherwise, check if this specific filename was ignored
  return ignored.filename === filename;
}

/**
 * Ignore an update
 * @param {string} filename - Bulk file filename
 * @param {boolean} permanent - If true, ignore all future updates for this file
 */
function ignoreBulkFileUpdate(filename, permanent = false) {
  const ignoredData = getIgnoredUpdates();
  ignoredData.ignoredUpdates[filename] = {
    filename: filename,
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
      const filename = bulkFile.filename || bulkFile.id; // Use filename, fallback to id for compatibility
      const processed = processedFiles.processedFiles[filename];
      const ignored = ignoredUpdates.ignoredUpdates[filename];
      
      let statusType = 'not-imported';
      if (processed) {
        // Compare filenames - if different, it's an update
        if (processed.filename === filename) {
          statusType = 'up-to-date';
        } else {
          statusType = 'update-available';
        }
      }

      status.bulkFiles.push({
        id: filename, // Use filename as id
        name: bulkFile.name,
        description: bulkFile.description,
        filename: filename,
        localFilename: processed?.filename || null,
        status: statusType,
        lastProcessed: processed?.processedAt || null,
        animalCount: bulkFile.animalCount || 0,
        url: bulkFile.url || null, // Include URL for importing
        updatedAt: bulkFile.updatedAt || null, // Include timestamp
        isActive: bulkFile.isActive !== undefined ? bulkFile.isActive : true, // Include isActive status
        category: bulkFile.category || null, // Include category from database
        ignored: ignored ? { filename: ignored.filename, permanent: ignored.permanent } : null
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
          // Check if this specific filename is ignored, or if permanent
          if (bf.ignored.permanent || bf.ignored.filename === bf.filename) {
            return false;
          }
        }
        return true;
      })
      .map(bf => ({
        id: bf.id,
        name: bf.name,
        filename: bf.filename,
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
 * @param {string} filename - Bulk file filename (used as identifier)
 * @param {string} url - URL to bulk file
 * @param {Object} options - Import options
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} Import result
 */
async function importBulkFile(filename, url, options = {}, progressCallback = null) {
  // Always force re-processing when explicitly importing (user wants to import with current options)
  options = { ...options, forceReprocess: true };
  try {
    const bulkFilesDir = getBulkFilesDir();
    
    // Extract filename from URL if not provided
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname;
    const actualFilename = filename || path.basename(urlPath) || 'bulk-file.json';
    const targetPath = path.join(bulkFilesDir, actualFilename);

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

    // Process the file - processor will use filename as identifier
    const processResult = bulkFileProcessor.processBulkFile(targetPath, options, (processed, total, current) => {
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

