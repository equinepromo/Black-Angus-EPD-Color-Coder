const { BrowserWindow, session } = require('electron');

/**
 * Test/Prototype scraper to inspect the page structure
 * This helps us understand what data is available before building the full scraper
 */
async function testScrape(registrationNumber) {
  return new Promise((resolve, reject) => {
    // Create a new session to avoid cookie/session conflicts
    const ses = session.fromPartition(`persist:test-${Date.now()}`);
    
    const testWindow = new BrowserWindow({
      show: true, // Visible window is less likely to be blocked
      width: 1920,
      height: 1080,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        session: ses,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    // Add stealth features to avoid detection - must be done before navigation
    testWindow.webContents.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Inject stealth script before page loads
    testWindow.webContents.on('dom-ready', () => {
      testWindow.webContents.executeJavaScript(`
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
        // Hide other automation indicators
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
      `).catch(() => {}); // Ignore errors if script injection fails
    });

    // Log console messages for debugging
    testWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[Console ${level}]`, message);
    });

    const url = `https://www.angus.org/find-an-animal?aid=${registrationNumber}`;
    let redirectUrl = null;
    let finalHTML = null;
    let pageStructure = null;
    let hasClickedSearch = false;
    let timeoutId = null;
    let isWindowDestroyed = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      isWindowDestroyed = true;
    };
    
    const safeClose = () => {
      if (!isWindowDestroyed && !testWindow.isDestroyed()) {
        cleanup();
        testWindow.close();
      }
    };

    // Handle certificate errors
    testWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
      console.warn('Certificate error:', error, url);
      event.preventDefault();
      callback(true);
    });

    // Monitor navigation to catch the redirect
    testWindow.webContents.on('did-navigate', (event, navigationUrl) => {
      if (navigationUrl.includes('EpdPedDtl')) {
        redirectUrl = navigationUrl;
      }
    });

    testWindow.webContents.on('did-finish-load', async () => {
      try {
        // Wait longer for JavaScript to fully execute and page to be interactive
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const currentUrl = testWindow.webContents.getURL();
        
        // Check if we're on the results page
        if (currentUrl.includes('EpdPedDtl')) {
          // We're on the results page, extract data
          cleanup();
          
          finalHTML = await testWindow.webContents.executeJavaScript(`
            document.documentElement.outerHTML
          `);

          pageStructure = await testWindow.webContents.executeJavaScript(`
            (function() {
              const tables = Array.from(document.querySelectorAll('table'));
              const divs = Array.from(document.querySelectorAll('div[class*="epd"], div[class*="EPD"], div[id*="epd"], div[id*="EPD"]'));
              
              return {
                tables: tables.map((table, idx) => ({
                  index: idx,
                  rows: table.rows.length,
                  cells: Array.from(table.rows).map(row => 
                    Array.from(row.cells).map(cell => cell.textContent.trim())
                  ),
                  html: table.outerHTML.substring(0, 1000) // First 1000 chars
                })),
                epdDivs: divs.map(div => ({
                  id: div.id,
                  className: div.className,
                  textContent: div.textContent.trim().substring(0, 200)
                })),
                allText: document.body.innerText.substring(0, 5000),
                url: window.location.href
              };
            })()
          `);

          safeClose();
          resolve({
            redirectUrl: redirectUrl || currentUrl,
            html: finalHTML,
            structure: pageStructure,
            timestamp: new Date().toISOString()
          });
        } else if (currentUrl.includes('find-an-animal') && !hasClickedSearch) {
          // We're on the search page, click the search button
          hasClickedSearch = true;
          
          // Wait a bit more to ensure page is fully loaded
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const buttonFound = await testWindow.webContents.executeJavaScript(`
            (function() {
              // Try multiple strategies to find the search button
              const selectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button.btn-primary',
                'button.btn',
                'input.btn',
                'button[class*="search"]',
                'input[class*="search"]'
              ];

              for (const selector of selectors) {
                try {
                  const button = document.querySelector(selector);
                  if (button && button.offsetParent !== null) { // Check if visible
                    // Use a more natural click approach
                    const event = new MouseEvent('click', {
                      bubbles: true,
                      cancelable: true,
                      view: window
                    });
                    button.dispatchEvent(event);
                    if (typeof button.click === 'function') {
                      button.click();
                    }
                    return { found: true, method: selector };
                  }
                } catch (e) {
                  console.error('Error with selector', selector, e);
                }
              }

              // Try finding by text content
              const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"]'));
              const searchButton = buttons.find(btn => {
                const text = (btn.textContent || btn.value || btn.innerText || '').toLowerCase();
                return (text.includes('search') || text.includes('submit')) && btn.offsetParent !== null;
              });

              if (searchButton) {
                const event = new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window
                });
                searchButton.dispatchEvent(event);
                if (typeof searchButton.click === 'function') {
                  searchButton.click();
                }
                return { found: true, method: 'text-content' };
              }

              return { found: false };
            })()
          `);

          if (!buttonFound || !buttonFound.found) {
            safeClose();
            reject(new Error('Could not find search button on page'));
            return;
          }

          // Set timeout to check if redirect happened
          timeoutId = setTimeout(() => {
            if (isWindowDestroyed || testWindow.isDestroyed()) return;
            try {
              const finalUrl = testWindow.webContents.getURL();
              if (!finalUrl.includes('EpdPedDtl')) {
                safeClose();
                reject(new Error('Search button click did not trigger redirect. Current URL: ' + finalUrl));
              }
            } catch (e) {
              // Window already destroyed, ignore
            }
          }, 15000); // 15 second timeout for redirect
        }
      } catch (error) {
        safeClose();
        reject(error);
      }
    });

    // Handle errors with better error messages
    testWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      cleanup();
      
      // Map error codes to human-readable messages
      const errorMessages = {
        '-2': 'Connection refused - The server refused the connection',
        '-3': 'Network error - Could not connect to server. Check your internet connection or the website may be down.',
        '-6': 'Connection reset - The connection was reset',
        '-7': 'Connection aborted - The connection was aborted',
        '-21': 'Network changed - Network connection changed',
        '-105': 'Name not resolved - DNS lookup failed. Check your internet connection.',
        '-106': 'Internet disconnected - No internet connection available',
        '-118': 'Connection timed out - The connection timed out'
      };

      const friendlyMessage = errorMessages[errorCode.toString()] || `Failed to load page: ${errorDescription || 'Unknown error'}`;
      safeClose();
      reject(new Error(`${friendlyMessage} (Error code: ${errorCode})`));
    });

    // Global timeout
    timeoutId = setTimeout(() => {
      if (!finalHTML && !isWindowDestroyed) {
        safeClose();
        reject(new Error('Timeout waiting for page to load (30 seconds)'));
      }
    }, 30000);

    // Wait a moment for window to be ready, then load URL
    setTimeout(() => {
      const loadOptions = {
        extraHeaders: 'Accept-Language: en-US,en;q=0.9\r\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8\r\nAccept-Encoding: gzip, deflate, br'
      };
      
      if (isWindowDestroyed || testWindow.isDestroyed()) return;
      testWindow.loadURL(url, loadOptions).catch((error) => {
        safeClose();
        reject(new Error(`Failed to initiate page load: ${error.message}`));
      });
    }, 100);
  });
}

module.exports = { testScrape };

