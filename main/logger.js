const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let logFilePath = null;
let logStream = null;

/**
 * Initialize file-based logging
 */
function initializeLogger() {
  try {
    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, 'logs');
    
    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    logFilePath = path.join(logsDir, `app-${timestamp}.log`);
    
    // Also write to a "latest.log" for easy access
    const latestLogPath = path.join(logsDir, 'latest.log');
    
    console.log(`[LOGGER] Logging to: ${logFilePath}`);
    console.log(`[LOGGER] Also logging to: ${latestLogPath}`);
    
    // Override console methods to also write to file
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    function writeToFile(level, ...args) {
      const timestamp = new Date().toISOString();
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      const logLine = `[${timestamp}] [${level}] ${message}\n`;
      
      // Write to timestamped log file (append)
      try {
        fs.appendFileSync(logFilePath, logLine, 'utf8');
      } catch (e) {
        // Ignore write errors
      }
      
      // Write to latest.log (append)
      try {
        fs.appendFileSync(latestLogPath, logLine, 'utf8');
      } catch (e) {
        // Ignore write errors
      }
    }
    
    console.log = function(...args) {
      originalLog.apply(console, args);
      writeToFile('LOG', ...args);
    };
    
    console.error = function(...args) {
      originalError.apply(console, args);
      writeToFile('ERROR', ...args);
    };
    
    console.warn = function(...args) {
      originalWarn.apply(console, args);
      writeToFile('WARN', ...args);
    };
    
    return { logFilePath, latestLogPath };
  } catch (error) {
    console.error('[LOGGER] Failed to initialize file logging:', error);
    return null;
  }
}

/**
 * Get the latest log file path
 */
function getLatestLogPath() {
  try {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'logs', 'latest.log');
  } catch (error) {
    return null;
  }
}

module.exports = {
  initializeLogger,
  getLatestLogPath
};

