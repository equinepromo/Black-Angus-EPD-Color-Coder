const { BrowserWindow, app, session } = require('electron');

/**
 * Main scraper for extracting EPD data from Angus.org
 */
async function scrapeEPD(registrationNumber) {
  return new Promise((resolve, reject) => {
    // Create a new session to avoid cookie/session conflicts
    const ses = session.fromPartition(`persist:scraper-${Date.now()}`);
    
    const scrapeWindow = new BrowserWindow({
      show: true, // Visible window is less likely to be blocked
      width: 1920,
      height: 1080,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        session: ses,
        // More realistic user agent
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    // Add stealth features to avoid detection - must be done before navigation
    scrapeWindow.webContents.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Inject stealth script before page loads
    scrapeWindow.webContents.on('dom-ready', () => {
      scrapeWindow.webContents.executeJavaScript(`
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
    scrapeWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[Console ${level}]`, message);
    });

    const url = `https://www.angus.org/find-an-animal?aid=${registrationNumber}`;
    let dataExtracted = false;
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
      if (!isWindowDestroyed && !scrapeWindow.isDestroyed()) {
        cleanup();
        scrapeWindow.close();
      }
    };

    // Handle certificate errors
    scrapeWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
      // Log the error but allow it to proceed for now
      console.warn('Certificate error:', error, url);
      // In production, you might want to verify certificates properly
      // For now, we'll proceed to allow testing
      event.preventDefault();
      callback(true);
    });

    // Track navigation events
    let isNavigating = false;
    
    scrapeWindow.webContents.on('will-navigate', (event, navigationUrl) => {
      console.log('Navigation starting to:', navigationUrl);
      if (navigationUrl.includes('EpdPedDtl')) {
        isNavigating = true;
        // Allow navigation to proceed
      }
    });

    scrapeWindow.webContents.on('did-finish-load', async () => {
      try {
        const currentUrl = scrapeWindow.webContents.getURL();
        console.log('[SCRAPER] Page finished loading, current URL:', currentUrl);
        console.log('[SCRAPER] hasClickedSearch:', hasClickedSearch, 'dataExtracted:', dataExtracted);
        
        // Wait longer for JavaScript to fully execute and page to be interactive
        console.log('[SCRAPER] Waiting 3 seconds for page to be fully interactive...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Re-check URL in case it changed during the wait
        const urlAfterWait = scrapeWindow.webContents.getURL();
        console.log('[SCRAPER] URL after wait:', urlAfterWait);

        if (urlAfterWait.includes('EpdPedDtl')) {
          console.log('[SCRAPER] Already on EPD results page, extracting data...');
          // On results page, extract EPD data
          cleanup();
          
          const epdData = await scrapeWindow.webContents.executeJavaScript(`
            (function() {
              const data = {
                registrationNumber: '${registrationNumber.replace(/'/g, "\\'")}',
                url: window.location.href,
                extractedAt: new Date().toISOString()
              };

              // Extract data from tables
              const tables = Array.from(document.querySelectorAll('table'));
              tables.forEach((table, tableIdx) => {
                const tableData = [];
                const rows = Array.from(table.rows);
                
                rows.forEach((row, rowIdx) => {
                  const cells = Array.from(row.cells);
                  if (cells.length > 0) {
                    const rowData = cells.map(cell => cell.textContent.trim());
                    tableData.push(rowData);
                  }
                });

                if (tableData.length > 0) {
                  data[\`table_\${tableIdx}\`] = tableData;
                }
              });

              // Try to extract structured EPD data from tables
              // Look for patterns like "Field Name: Value" in table cells
              const bodyText = document.body.innerText;
              const epdFields = {};
              
              // Extract key-value pairs from tables
              tables.forEach(table => {
                const rows = Array.from(table.rows);
                rows.forEach(row => {
                  const cells = Array.from(row.cells);
                  if (cells.length >= 2) {
                    const key = cells[0].textContent.trim();
                    const value = cells[1].textContent.trim();
                    if (key && value && key.length < 100) {
                      // Clean up the key name
                      const cleanKey = key.toLowerCase().replace(/[^a-z0-9\\s]/gi, '').replace(/\\s+/g, '_');
                      if (cleanKey) {
                        epdFields[cleanKey] = value;
                      }
                    }
                  }
                });
              });

              // Try regex patterns for common EPD fields in text
              const fieldPatterns = [
                { pattern: /birth\\s*weight[\\s:]*([+-]?\\d+\\.?\\d*)/i, name: 'birth_weight' },
                { pattern: /weaning[\\s]*weight[\\s:]*([+-]?\\d+\\.?\\d*)/i, name: 'weaning_weight' },
                { pattern: /yearling[\\s]*weight[\\s:]*([+-]?\\d+\\.?\\d*)/i, name: 'yearling_weight' },
                { pattern: /marbling[\\s:]*([+-]?\\d+\\.?\\d*)/i, name: 'marbling' },
                { pattern: /ribeye[\\s]*area[\\s:]*([+-]?\\d+\\.?\\d*)/i, name: 'ribeye_area' },
                { pattern: /fat[\\s]*thickness[\\s:]*([+-]?\\d+\\.?\\d*)/i, name: 'fat_thickness' },
                { pattern: /doc[\\s:]*([+-]?\\d+\\.?\\d*)/i, name: 'doc' },
                { pattern: /\\\\$value[\\s:]*([+-]?\\d+\\.?\\d*)/i, name: 'value' },
                { pattern: /\\\\$beef[\\s:]*([+-]?\\d+\\.?\\d*)/i, name: 'beef' }
              ];

              fieldPatterns.forEach(({pattern, name}) => {
                if (!epdFields[name]) { // Don't override table-extracted values
                  const match = bodyText.match(pattern);
                  if (match && match[1]) {
                    epdFields[name] = match[1];
                  }
                }
              });

              // Extract all text content for manual parsing if needed
              data.rawText = bodyText.substring(0, 10000); // Limit size
              data.epdFields = epdFields;

              // Try to find specific EPD containers
              const epdContainers = Array.from(document.querySelectorAll('[class*="epd"], [id*="epd"], [class*="EPD"], [id*="EPD"]'));
              if (epdContainers.length > 0) {
                data.epdContainers = epdContainers.map(container => ({
                  id: container.id,
                  className: container.className,
                  text: container.textContent.trim().substring(0, 500)
                }));
              }

              return data;
            })()
          `);

          dataExtracted = true;
          safeClose();
          resolve(epdData);
        } else if (urlAfterWait.includes('find-an-animal') && !hasClickedSearch) {
          // On search page, click search button
          console.log('[SCRAPER] Detected search page, will click search button automatically');
          hasClickedSearch = true;
          
          // Wait a bit more to ensure page is fully loaded and interactive
          console.log('[SCRAPER] Waiting 2 more seconds for page to be fully interactive...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('[SCRAPER] Attempting to submit search form automatically...');
          const submitResult = await scrapeWindow.webContents.executeJavaScript(`
            (function() {
              // Strategy 1: Find and submit the form directly
              const forms = Array.from(document.querySelectorAll('form'));
              for (const form of forms) {
                if (form.offsetParent !== null) { // Check if visible
                  try {
                    form.submit();
                    return { found: true, method: 'form-submit', formId: form.id || 'no-id' };
                  } catch (e) {
                    console.error('Form submit error:', e);
                  }
                }
              }

              // Strategy 2: Find submit button and click it
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
                  if (button && button.offsetParent !== null) {
                    // Try form submission first
                    if (button.form) {
                      button.form.submit();
                      return { found: true, method: 'button-form-submit', selector: selector };
                    }
                    // Fall back to click
                    button.click();
                    return { found: true, method: 'button-click', selector: selector };
                  }
                } catch (e) {
                  console.error('Error with selector', selector, e);
                }
              }

              // Strategy 3: Find by text content and submit form
              const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"]'));
              const searchButton = buttons.find(btn => {
                const text = (btn.textContent || btn.value || btn.innerText || '').toLowerCase();
                return (text.includes('search') || text.includes('submit')) && btn.offsetParent !== null;
              });

              if (searchButton) {
                if (searchButton.form) {
                  searchButton.form.submit();
                  return { found: true, method: 'text-content-form-submit' };
                }
                searchButton.click();
                return { found: true, method: 'text-content-click' };
              }

              // If we can't find it, return debug info
              return { 
                found: false, 
                availableForms: forms.length,
                availableButtons: buttons.map(btn => ({
                  tag: btn.tagName,
                  type: btn.type,
                  text: (btn.textContent || btn.value || '').substring(0, 50),
                  visible: btn.offsetParent !== null,
                  hasForm: !!btn.form
                }))
              };
            })()
          `);

          if (!submitResult || !submitResult.found) {
            safeClose();
            const debugInfo = submitResult && submitResult.availableButtons 
              ? '\nAvailable buttons: ' + JSON.stringify(submitResult.availableButtons, null, 2) + '\nForms found: ' + submitResult.availableForms
              : '';
            reject(new Error('Could not find search form/button on page.' + debugInfo));
            return;
          }

          console.log('Form/button submitted via', submitResult.method, ', waiting for redirect...');
          
          // Wait for navigation - check multiple times since redirect might take a moment
          let redirectCheckCount = 0;
          const checkRedirect = setInterval(() => {
            if (isWindowDestroyed || scrapeWindow.isDestroyed()) {
              clearInterval(checkRedirect);
              return;
            }
            redirectCheckCount++;
            try {
              const currentUrl = scrapeWindow.webContents.getURL();
              console.log(`[SCRAPER] Redirect check ${redirectCheckCount}, current URL:`, currentUrl);
              
              if (currentUrl.includes('EpdPedDtl')) {
                console.log('[SCRAPER] EPD page detected in redirect checker! Extracting data...');
                clearInterval(checkRedirect);
                // Wait a moment for page to be ready, then extract data
                setTimeout(async () => {
                  if (dataExtracted || isWindowDestroyed || scrapeWindow.isDestroyed()) {
                    console.log('[SCRAPER] Skipping extraction - already extracted or window destroyed');
                    return;
                  }
                  try {
                    console.log('[SCRAPER] Extracting EPD data from page...');
                    console.log('[SCRAPER] Window state:', { isDestroyed: scrapeWindow.isDestroyed(), dataExtracted, isWindowDestroyed });
                    const epdData = await scrapeWindow.webContents.executeJavaScript(`
                      (function() {
                        const data = {
                          registrationNumber: '${registrationNumber.replace(/'/g, "\\'")}',
                          url: window.location.href,
                          extractedAt: new Date().toISOString()
                        };

                        // Extract data from tables
                        const tables = Array.from(document.querySelectorAll('table'));
                        tables.forEach((table, tableIdx) => {
                          const tableData = [];
                          const rows = Array.from(table.rows);
                          
                          rows.forEach((row, rowIdx) => {
                            const cells = Array.from(row.cells);
                            if (cells.length > 0) {
                              const rowData = cells.map(cell => cell.textContent.trim());
                              tableData.push(rowData);
                            }
                          });

                          if (tableData.length > 0) {
                            data[\`table_\${tableIdx}\`] = tableData;
                          }
                        });

                        // Try to extract structured EPD data from tables
                        const bodyText = document.body.innerText;
                        const epdFields = {};
                        
                        // Extract key-value pairs from tables
                        tables.forEach(table => {
                          const rows = Array.from(table.rows);
                          rows.forEach(row => {
                            const cells = Array.from(row.cells);
                            if (cells.length >= 2) {
                              const key = cells[0].textContent.trim();
                              const value = cells[1].textContent.trim();
                              if (key && value && key.length < 100) {
                                const cleanKey = key.toLowerCase().replace(/[^a-z0-9\\s]/gi, '').replace(/\\s+/g, '_');
                                if (cleanKey) {
                                  epdFields[cleanKey] = value;
                                }
                              }
                            }
                          });
                        });

                        // Extract all text content for manual parsing if needed
                        data.rawText = bodyText.substring(0, 10000);
                        data.epdFields = epdFields;

                        // Try to find specific EPD containers
                        const epdContainers = Array.from(document.querySelectorAll('[class*="epd"], [id*="epd"], [class*="EPD"], [id*="EPD"]'));
                        if (epdContainers.length > 0) {
                          data.epdContainers = epdContainers.map(container => ({
                            id: container.id,
                            className: container.className,
                            text: container.textContent.trim().substring(0, 500)
                          }));
                        }

                        return data;
                      })()
                    `);

                    console.log('[SCRAPER] Data extracted successfully, tables found:', Object.keys(epdData).filter(k => k.startsWith('table_')).length);
                    console.log('[SCRAPER] EPD fields found:', Object.keys(epdData.epdFields || {}).length);
                    dataExtracted = true;
                    cleanup();
                    safeClose();
                    resolve(epdData);
                  } catch (error) {
                    console.error('[SCRAPER] Error extracting data in redirect checker:', error.message, error.stack);
                    // Don't reject here - let did-finish-load handler try, or let timeout handle it
                  }
                }, 3000); // Increased wait time to 3 seconds
              } else if (redirectCheckCount >= 40) { // 20 seconds (40 * 500ms) - increased timeout
                clearInterval(checkRedirect);
                if (!dataExtracted) {
                  safeClose();
                  reject(new Error('Search button click did not result in redirect to EPD page. Current URL: ' + currentUrl));
                }
              }
            } catch (e) {
              // Window destroyed, stop checking
              clearInterval(checkRedirect);
              return;
            }
          }, 500);
          
          // Also set a backup timeout
          timeoutId = setTimeout(() => {
            clearInterval(checkRedirect);
            if (!dataExtracted) {
              safeClose();
              try {
                const finalUrl = scrapeWindow.webContents.getURL();
                reject(new Error('Timeout waiting for redirect. Current URL: ' + finalUrl));
              } catch (e) {
                reject(new Error('Timeout waiting for redirect. Window was closed.'));
              }
            }
          }, 20000); // 20 second timeout
        }
      } catch (error) {
        safeClose();
        reject(error);
      }
    });

    // Track page load state
    let pageLoadStarted = false;
    let initialLoadComplete = false;
    
    scrapeWindow.webContents.on('did-start-loading', () => {
      pageLoadStarted = true;
      console.log('Page load started');
    });
    
    scrapeWindow.webContents.on('did-finish-load', () => {
      const url = scrapeWindow.webContents.getURL();
      console.log('Page finished loading:', url);
      if (url.includes('find-an-animal') || url.includes('EpdPedDtl') || url.startsWith('http')) {
        initialLoadComplete = true;
        console.log('Initial page load completed successfully');
      }
    });

    // Error handling - be very lenient, especially after button click
    scrapeWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.log('[SCRAPER] Load failed:', { errorCode, errorDescription, validatedURL, isMainFrame, pageLoadStarted, initialLoadComplete, dataExtracted, hasClickedSearch });
      
      // If we've clicked the search button, error -3 on redirect is VERY common
      // The page often still loads successfully despite the error
      // So we should NOT reject - let the redirect checker and did-finish-load handle it
      if (isMainFrame && hasClickedSearch && errorCode === -3) {
        console.log('[SCRAPER] Error -3 after button click - ignoring (page often still loads). Let redirect checker handle it.');
        // Don't reject - the redirect check interval and did-finish-load will handle success/failure
        return;
      }
      
      // Only reject if:
      // 1. It's a main frame error
      // 2. We haven't successfully completed initial load
      // 3. We haven't extracted data yet
      // 4. We haven't clicked the button yet (initial page load failure)
      
      if (isMainFrame && !initialLoadComplete && !dataExtracted && !hasClickedSearch) {
        // For error -3 specifically, check if the page actually loaded
        // Sometimes -3 fires even when the page loaded successfully
        if (errorCode === -3) {
          // Give it a moment to see if the page is actually there
          setTimeout(() => {
            try {
              if (!isWindowDestroyed && !scrapeWindow.isDestroyed()) {
                const currentUrl = scrapeWindow.webContents.getURL();
                if (currentUrl && (currentUrl.includes('find-an-animal') || currentUrl.includes('EpdPedDtl'))) {
                  console.log('[SCRAPER] Page is actually loaded despite error -3, ignoring error');
                  return; // Page loaded, ignore the error
                }
              }
            } catch (e) {
              // Window might be closed, that's ok
            }
            
            // If we get here, the page really didn't load
            if (!dataExtracted && !initialLoadComplete) {
              safeClose();
              reject(new Error(`Network error -3: Page failed to load. The website may be blocking automated browsers. (URL: ${validatedURL})`));
            }
          }, 2000);
        } else {
          // For other error codes, reject immediately (but only if page hasn't loaded)
          cleanup();
          
          const errorMessages = {
            '-2': 'Connection refused - The server refused the connection',
            '-6': 'Connection reset - The connection was reset',
            '-7': 'Connection aborted - The connection was aborted',
            '-21': 'Network changed - Network connection changed',
            '-105': 'Name not resolved - DNS lookup failed. Check your internet connection.',
            '-106': 'Internet disconnected - No internet connection available',
            '-118': 'Connection timed out - The connection timed out'
          };

          const friendlyMessage = errorMessages[errorCode.toString()] || `Failed to load page: ${errorDescription || 'Unknown error'}`;
          console.error('Page load failed:', errorCode, errorDescription, validatedURL);
          
          safeClose();
          reject(new Error(`${friendlyMessage} (Error code: ${errorCode}, URL: ${validatedURL})`));
        }
      }
      // Ignore all sub-resource failures and errors after initial load
    });

    // Global timeout
    timeoutId = setTimeout(() => {
      if (!dataExtracted && !isWindowDestroyed) {
        safeClose();
        reject(new Error('Timeout: Page did not complete loading within 30 seconds'));
      }
    }, 30000);

    // Wait a moment for window to be ready, then load URL
    setTimeout(() => {
      const loadOptions = {
        extraHeaders: 'Accept-Language: en-US,en;q=0.9\r\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8\r\nAccept-Encoding: gzip, deflate, br'
      };
      
      if (isWindowDestroyed || scrapeWindow.isDestroyed()) return;
      scrapeWindow.loadURL(url, loadOptions).catch((error) => {
        safeClose();
        reject(new Error(`Failed to initiate page load: ${error.message}`));
      });
    }, 100);
  });
}

module.exports = { scrapeEPD };

