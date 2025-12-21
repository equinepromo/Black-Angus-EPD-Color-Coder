const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

// Get app version from package.json
let appVersion = '1.0.0';
try {
  const packagePath = path.join(__dirname, '../package.json');
  if (fs.existsSync(packagePath)) {
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    appVersion = packageData.version || '1.0.0';
  }
} catch (error) {
  console.error('[LICENSE] Error reading package.json:', error);
}

// License configuration - UPDATE THIS with your server URL
// You can set this via environment variable: LICENSE_SERVER_URL
// Example: LICENSE_SERVER_URL=https://your-server.com/api/validate
const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || 'https://scoring.westernsports.video/angus/validate.php';

// NOTE: For development/testing, you can use a mock server or disable validation
// To disable license checking for development, set: process.env.DISABLE_LICENSE_CHECK=true
const DISABLE_LICENSE_CHECK = process.env.DISABLE_LICENSE_CHECK === 'true';
const LICENSE_VALIDATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const LICENSE_OFFLINE_GRACE_PERIOD = 7 * 24 * 60 * 60 * 1000; // 7 days offline grace period

let licenseDataPath = null;
let cachedLicenseStatus = null;

/**
 * Initialize license manager with app user data directory
 */
function initialize(userDataPath) {
  licenseDataPath = path.join(userDataPath, 'license.json');
  console.log('[LICENSE] License data path:', licenseDataPath);
}

/**
 * Simple encryption/decryption for storing license key
 */
function encrypt(text, key) {
  const algorithm = 'aes-256-cbc';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key.padEnd(32, '0').substring(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text, key) {
  try {
    const algorithm = 'aes-256-cbc';
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key.padEnd(32, '0').substring(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('[LICENSE] Decryption error:', error);
    return null;
  }
}

/**
 * Get encryption key based on machine ID
 */
function getEncryptionKey() {
  // Use machine-specific information for encryption key
  // This makes it harder to copy license between machines
  const os = require('os');
  const machineId = os.hostname() + os.platform() + os.arch();
  return crypto.createHash('sha256').update(machineId).digest('hex');
}

/**
 * Load license data from disk
 */
function loadLicenseData() {
  if (!licenseDataPath || !fs.existsSync(licenseDataPath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(licenseDataPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[LICENSE] Error loading license data:', error);
    return null;
  }
}

/**
 * Save license data to disk
 */
function saveLicenseData(data) {
  if (!licenseDataPath) {
    throw new Error('License manager not initialized');
  }

  try {
    // Ensure directory exists
    const dir = path.dirname(licenseDataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(licenseDataPath, JSON.stringify(data, null, 2), 'utf8');
    console.log('[LICENSE] License data saved');
    return true;
  } catch (error) {
    console.error('[LICENSE] Error saving license data:', error);
    return false;
  }
}

/**
 * Validate license key with remote server
 */
function validateLicenseWithServer(licenseKey) {
  return new Promise((resolve, reject) => {
    if (!licenseKey || licenseKey.trim().length === 0) {
      resolve({ valid: false, error: 'License key is required' });
      return;
    }

    // Parse URL
    let url;
    try {
      url = new URL(LICENSE_SERVER_URL);
    } catch (error) {
      console.error('[LICENSE] Invalid license server URL:', error);
      resolve({ valid: false, error: 'Invalid license server configuration' });
      return;
    }

    const postData = JSON.stringify({
      licenseKey: licenseKey.trim(),
      machineId: require('os').hostname(),
      appVersion: appVersion
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000 // 10 second timeout
    };

    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          console.error('[LICENSE] Error parsing server response:', error);
          resolve({ valid: false, error: 'Invalid server response' });
        }
      });
    });

    req.on('error', (error) => {
      console.error('[LICENSE] License validation request error:', error);
      resolve({ valid: false, error: 'Network error: ' + error.message, offline: true });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ valid: false, error: 'Request timeout', offline: true });
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Check if license is valid (checks cache first, then server if needed)
 */
async function validateLicense(forceRefresh = false) {
  // Bypass license check if disabled (development mode)
  if (DISABLE_LICENSE_CHECK) {
    console.log('[LICENSE] License checking is disabled (development mode)');
    return { valid: true, activated: true, developmentMode: true };
  }

  const licenseData = loadLicenseData();

  if (!licenseData || !licenseData.licenseKey) {
    return {
      valid: false,
      activated: false,
      error: 'No license key found. Please activate the application.'
    };
  }

  // Decrypt license key
  const encryptionKey = getEncryptionKey();
  const licenseKey = decrypt(licenseData.licenseKey, encryptionKey);

  if (!licenseKey) {
    return {
      valid: false,
      activated: false,
      error: 'Invalid license key format'
    };
  }

  // Check cached validation if not forcing refresh
  if (!forceRefresh && licenseData.lastValidation) {
    const lastValidation = new Date(licenseData.lastValidation);
    const now = new Date();
    const timeSinceValidation = now - lastValidation;

    // If validated recently, use cached result
    if (timeSinceValidation < LICENSE_VALIDATION_INTERVAL) {
      if (licenseData.valid === true) {
        console.log('[LICENSE] Using cached valid license');
        return {
          valid: true,
          activated: true,
          cached: true,
          expiresAt: licenseData.expiresAt,
          userName: licenseData.userName
        };
      } else {
        // Check if we're still in grace period
        const lastSuccessfulValidation = licenseData.lastSuccessfulValidation 
          ? new Date(licenseData.lastSuccessfulValidation)
          : null;

        if (lastSuccessfulValidation) {
          const timeSinceLastSuccess = now - lastSuccessfulValidation;
          if (timeSinceLastSuccess < LICENSE_OFFLINE_GRACE_PERIOD) {
            console.log('[LICENSE] Using cached license (offline grace period)');
            return {
              valid: true,
              activated: true,
              cached: true,
              offline: true,
              expiresAt: licenseData.expiresAt,
              userName: licenseData.userName
            };
          }
        }
      }
    }
  }

  // Validate with server
  console.log('[LICENSE] Validating license with server...');
  const validation = await validateLicenseWithServer(licenseKey);

  // Update cached license data
  licenseData.lastValidation = new Date().toISOString();
  licenseData.valid = validation.valid === true;
  
  if (validation.valid) {
    licenseData.lastSuccessfulValidation = new Date().toISOString();
    licenseData.userName = validation.userName || null;
    licenseData.expiresAt = validation.expiresAt || null;
  } else {
    licenseData.error = validation.error || 'License validation failed';
  }

  saveLicenseData(licenseData);

  return {
    valid: validation.valid === true,
    activated: true,
    cached: false,
    offline: validation.offline || false,
    error: validation.error || null,
    expiresAt: validation.expiresAt || licenseData.expiresAt,
    userName: validation.userName || licenseData.userName
  };
}

/**
 * Activate license with license key
 */
async function activateLicense(licenseKey) {
  if (!licenseKey || licenseKey.trim().length === 0) {
    return {
      success: false,
      error: 'License key is required'
    };
  }

  // Validate with server
  const validation = await validateLicenseWithServer(licenseKey.trim());

  if (validation.valid !== true) {
    return {
      success: false,
      error: validation.error || 'Invalid license key'
    };
  }

  // Encrypt and save license key
  const encryptionKey = getEncryptionKey();
  const encryptedKey = encrypt(licenseKey.trim(), encryptionKey);

  const licenseData = {
    licenseKey: encryptedKey,
    activatedAt: new Date().toISOString(),
    lastValidation: new Date().toISOString(),
    lastSuccessfulValidation: new Date().toISOString(),
    valid: true,
    userName: validation.userName || null,
    expiresAt: validation.expiresAt || null
  };

  if (saveLicenseData(licenseData)) {
    console.log('[LICENSE] License activated successfully');
    return {
      success: true,
      userName: validation.userName || null,
      expiresAt: validation.expiresAt || null
    };
  } else {
    return {
      success: false,
      error: 'Failed to save license data'
    };
  }
}

/**
 * Deactivate license (remove license key)
 */
function deactivateLicense() {
  if (!licenseDataPath || !fs.existsSync(licenseDataPath)) {
    return { success: true };
  }

  try {
    fs.unlinkSync(licenseDataPath);
    console.log('[LICENSE] License deactivated');
    cachedLicenseStatus = null;
    return { success: true };
  } catch (error) {
    console.error('[LICENSE] Error deactivating license:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get current license status
 */
function getLicenseStatus() {
  const licenseData = loadLicenseData();
  
  if (!licenseData) {
    return {
      activated: false,
      valid: false
    };
  }

  return {
    activated: true,
    valid: licenseData.valid === true,
    userName: licenseData.userName || null,
    expiresAt: licenseData.expiresAt || null,
    lastValidation: licenseData.lastValidation || null
  };
}

module.exports = {
  initialize,
  validateLicense,
  activateLicense,
  deactivateLicense,
  getLicenseStatus
};

