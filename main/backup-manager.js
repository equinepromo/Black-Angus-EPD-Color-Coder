const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const cacheUtil = require('./cache-util');

const MAX_BACKUPS = 7; // Keep only the 7 most recent backups

let BACKUP_DIR = null;

/**
 * Initialize backup directory using user data path
 */
function initializeBackupDir() {
  if (BACKUP_DIR) return BACKUP_DIR; // Already initialized
  
  try {
    // Use userData path - works in both dev and packaged apps
    const userDataPath = app.getPath('userData');
    BACKUP_DIR = path.join(userDataPath, 'backups');
    
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log('[BACKUP] Created backup directory:', BACKUP_DIR);
      } catch (mkdirError) {
        // Directory might have been created by another process between existsSync and mkdirSync
        if (!fs.existsSync(BACKUP_DIR)) {
          throw mkdirError; // Re-throw if it still doesn't exist
        }
        console.log('[BACKUP] Backup directory already exists (race condition handled):', BACKUP_DIR);
      }
    } else {
      // Verify it's actually a directory and we can access it
      const stats = fs.statSync(BACKUP_DIR);
      if (!stats.isDirectory()) {
        throw new Error(`Backup path exists but is not a directory: ${BACKUP_DIR}`);
      }
      console.log('[BACKUP] Using existing backup directory:', BACKUP_DIR);
    }
  } catch (error) {
    console.error('[BACKUP] Error initializing backup directory:', error);
    // Fallback to relative path if app.getPath fails (shouldn't happen in Electron)
    BACKUP_DIR = path.join(__dirname, '../backups');
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }
  
  return BACKUP_DIR;
}

/**
 * Ensure backup directory exists
 */
function ensureBackupDir() {
  if (!BACKUP_DIR) {
    initializeBackupDir();
  }
  return BACKUP_DIR;
}

/**
 * Create an auto-backup of all cached animals and categories
 * @returns {Object} Result object with success status and backup path
 */
function createAutoBackup() {
  try {
    console.log('[BACKUP] Creating auto-backup...');
    
    // Ensure backup directory exists
    const backupDir = ensureBackupDir();
    
    // Create backup using cache-util
    const result = cacheUtil.createBackup();
    
    if (!result.success) {
      console.error('[BACKUP] Failed to create backup data:', result.error);
      return result;
    }
    
    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                      new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
    const filename = `auto-backup-${timestamp}.json`;
    const backupPath = path.join(backupDir, filename);
    
    // Write backup to file
    fs.writeFileSync(backupPath, JSON.stringify(result.backup, null, 2), 'utf8');
    
    console.log(`[BACKUP] Auto-backup created: ${backupPath} (${result.backup.animalCount} animals, ${result.backup.categories?.length || 0} categories)`);
    
    // Clean up old backups (keep only MAX_BACKUPS most recent)
    cleanupOldBackups();
    
    return {
      success: true,
      backupPath,
      filename,
      animalCount: result.backup.animalCount,
      categoryCount: result.backup.categories?.length || 0,
      createdAt: result.backup.createdAt
    };
  } catch (error) {
    console.error('[BACKUP] Error creating auto-backup:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clean up old backups, keeping only the MAX_BACKUPS most recent
 */
function cleanupOldBackups() {
  try {
    const backupDir = ensureBackupDir();
    
    if (!fs.existsSync(backupDir)) {
      return;
    }
    
    // Get all backup files
    const files = fs.readdirSync(backupDir);
    const backupFiles = files
      .filter(f => f.startsWith('auto-backup-') && f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(backupDir, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          path: filePath,
          mtime: stats.mtimeMs
        };
      });
    
    // Sort by modification time (newest first)
    backupFiles.sort((a, b) => b.mtime - a.mtime);
    
    // Delete backups beyond MAX_BACKUPS
    if (backupFiles.length > MAX_BACKUPS) {
      const toDelete = backupFiles.slice(MAX_BACKUPS);
      let deletedCount = 0;
      
      toDelete.forEach(backup => {
        try {
          fs.unlinkSync(backup.path);
          deletedCount++;
          console.log(`[BACKUP] Deleted old backup: ${backup.filename}`);
        } catch (error) {
          console.error(`[BACKUP] Error deleting old backup ${backup.filename}:`, error);
        }
      });
      
      if (deletedCount > 0) {
        console.log(`[BACKUP] Cleaned up ${deletedCount} old backup(s), keeping ${MAX_BACKUPS} most recent`);
      }
    }
  } catch (error) {
    console.error('[BACKUP] Error cleaning up old backups:', error);
  }
}

/**
 * Get list of all available auto-backups
 * @returns {Array} Array of backup info objects
 */
function listAutoBackups() {
  try {
    const backupDir = ensureBackupDir();
    
    if (!fs.existsSync(backupDir)) {
      return [];
    }
    
    // Get all backup files
    const files = fs.readdirSync(backupDir);
    const backupFiles = files
      .filter(f => f.startsWith('auto-backup-') && f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(backupDir, f);
        try {
          const stats = fs.statSync(filePath);
          const backupContent = fs.readFileSync(filePath, 'utf8');
          const backup = JSON.parse(backupContent);
          
          return {
            filename: f,
            path: filePath,
            createdAt: backup.createdAt || stats.birthtime.toISOString(),
            modifiedAt: stats.mtime.toISOString(),
            size: stats.size,
            animalCount: backup.animalCount || 0,
            categoryCount: backup.categories?.length || 0,
            version: backup.version || '1.0'
          };
        } catch (error) {
          console.error(`[BACKUP] Error reading backup file ${f}:`, error);
          return null;
        }
      })
      .filter(b => b !== null); // Remove any failed reads
    
    // Sort by creation time (newest first)
    backupFiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return backupFiles;
  } catch (error) {
    console.error('[BACKUP] Error listing auto-backups:', error);
    return [];
  }
}

/**
 * Restore from an auto-backup file
 * @param {string} backupPath - Path to the backup file
 * @param {Object} options - Restore options
 * @returns {Object} Result object with success status and counts
 */
function restoreAutoBackup(backupPath, options = {}) {
  try {
    if (!fs.existsSync(backupPath)) {
      return { success: false, error: 'Backup file not found' };
    }
    
    // Read backup file
    const backupContent = fs.readFileSync(backupPath, 'utf8');
    const backup = JSON.parse(backupContent);
    
    // Validate backup format
    if (!backup.animals || !Array.isArray(backup.animals)) {
      return { success: false, error: 'Invalid backup file format. Expected an object with an "animals" array.' };
    }
    
    // Use cache-util's restoreBackup function
    // For auto-backups with overwriteExisting, enable snapshot mode to restore to exact backup state
    const restoreOptions = {
      overwriteExisting: options.overwriteExisting || false,
      restoreCategories: options.restoreCategories !== false, // Default to true
      snapshot: options.overwriteExisting || false // Snapshot mode for auto-backups with overwrite
    };
    
    const result = cacheUtil.restoreBackup(backup, restoreOptions);
    
    if (result.success) {
      console.log(`[BACKUP] Auto-backup restored: ${result.restoredCount} animals restored, ${result.skippedCount} skipped`);
    }
    
    return result;
  } catch (error) {
    console.error('[BACKUP] Error restoring auto-backup:', error);
    if (error instanceof SyntaxError) {
      return { success: false, error: 'Invalid JSON file: ' + error.message };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Get backup directory path (for external access)
 * @returns {string} Path to backup directory
 */
function getBackupDir() {
  return ensureBackupDir();
}

module.exports = {
  createAutoBackup,
  listAutoBackups,
  restoreAutoBackup,
  cleanupOldBackups,
  getBackupDir,
  MAX_BACKUPS
};

