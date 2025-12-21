const puppeteer = require('puppeteer');
const cacheUtil = require('./cache-util');

// Helper function for delays (replaces deprecated waitForTimeout)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get Puppeteer launch options that work in both dev and packaged apps
 */
function getPuppeteerLaunchOptions() {
  const baseOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage'
    ],
    defaultViewport: { width: 1920, height: 1080 }
  };

  // In packaged apps, we need to ensure Chromium is accessible
  // Puppeteer should handle this automatically, but if it fails,
  // we can add explicit path resolution here
  // For now, let Puppeteer handle it with its default behavior
  
  return baseOptions;
}

/**
 * Main scraper using Puppeteer - more reliable for web scraping
 * @param {string} registrationNumber - The registration number to scrape
 * @param {Browser} browser - Optional browser instance to reuse (for batch processing)
 * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data
 */
async function scrapeEPD(registrationNumber, browser = null, forceRefresh = false) {
  console.log('\n[SCRAPER] ===========================================');
  console.log('[SCRAPER] scrapeEPD called with registration number:', registrationNumber);
  console.log('[SCRAPER] Force refresh:', forceRefresh);
  console.log('[SCRAPER] ===========================================\n');
  
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cacheKey = `epd_${registrationNumber}`;
    const cached = cacheUtil.loadCache(cacheKey);
    if (cached && cached.data) {
      console.log('[SCRAPER] Using cached data for', registrationNumber);
      // Return data with flag indicating it came from cache
      return { ...cached.data, _fromCache: true };
    }
  }
  
  let shouldCloseBrowser = false;
  
  try {
    // Reuse browser if provided, otherwise create new one
    if (!browser) {
      console.log('[SCRAPER] Launching browser...');
      const launchOptions = getPuppeteerLaunchOptions();
      console.log('[SCRAPER] Launch options:', JSON.stringify(launchOptions, null, 2));
      browser = await puppeteer.launch(launchOptions);
      shouldCloseBrowser = true;
    }

    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Add stealth scripts
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Override the plugins property to use a custom getter
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // Override the languages property to use a custom getter
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
    });

    const url = `https://www.angus.org/find-an-animal?aid=${registrationNumber}`;
    console.log('[SCRAPER] Navigating to:', url);
    
    // Navigate to the search page with better error handling
    try {
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', // Less strict than networkidle2
        timeout: 30000 
      });
    } catch (error) {
      // If navigation fails, check if page actually loaded
      const currentUrl = page.url();
      if (!currentUrl.includes('find-an-animal') && !currentUrl.includes('EpdPedDtl')) {
        throw new Error(`Failed to navigate to search page: ${error.message}`);
      }
      console.log('[SCRAPER] Navigation error but page loaded:', currentUrl);
    }

    console.log('[SCRAPER] Page loaded, current URL:', page.url());
    
    // Wait for the page to be fully interactive (reduced from 2000ms)
    await delay(1000);
    
    // Check if we're already on the results page
    const currentUrl = page.url();
    if (currentUrl.includes('EpdPedDtl')) {
      console.log('[SCRAPER] Already on EPD page, extracting data...');
      const data = await extractData(page, registrationNumber);
      // Save to cache
      const cacheKey = `epd_${registrationNumber}`;
      cacheUtil.saveCache(cacheKey, data);
      await page.close();
      if (shouldCloseBrowser) await browser.close();
      // Return data with flag indicating it was freshly scraped
      return { ...data, _fromCache: false };
    }
    
    // We're on the search page, need to click the search button
    console.log('[SCRAPER] On search page, looking for search button...');
    
    // Try multiple strategies to find and click the search button
    const buttonClicked = await page.evaluate(() => {
      // Strategy 1: Find form and submit it
      const forms = Array.from(document.querySelectorAll('form'));
      for (const form of forms) {
        if (form.offsetParent !== null) {
          try {
            form.submit();
            return { success: true, method: 'form-submit' };
          } catch (e) {
            console.error('Form submit error:', e);
          }
        }
      }
      
      // Strategy 2: Find submit button
      const selectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button.btn-primary',
        'button.btn',
        'input.btn'
      ];
      
      for (const selector of selectors) {
        const button = document.querySelector(selector);
        if (button && button.offsetParent !== null) {
          button.click();
          return { success: true, method: selector };
        }
      }
      
      // Strategy 3: Find by text
      const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
      const searchButton = buttons.find(btn => {
        const text = (btn.textContent || btn.value || '').toLowerCase();
        return (text.includes('search') || text.includes('submit')) && btn.offsetParent !== null;
      });
      
      if (searchButton) {
        searchButton.click();
        return { success: true, method: 'text-search' };
      }
      
      return { success: false, error: 'Could not find search button' };
    });
    
    if (!buttonClicked.success) {
      await page.close();
      if (shouldCloseBrowser) await browser.close();
      throw new Error(buttonClicked.error || 'Could not find search button');
    }
    
    console.log('[SCRAPER] Button clicked via', buttonClicked.method);
    console.log('[SCRAPER] Polling URL until we reach EPD page (no navigation wait)...');
    
    // Simple approach: just poll the URL until we see EpdPedDtl
    // Don't use waitForNavigation at all - it's too unreliable
    let foundEPDPage = false;
    let attempts = 0;
    const maxAttempts = 30; // More attempts but shorter delay
    const pollInterval = 500; // Reduced from 1500ms to 500ms
    
    while (!foundEPDPage && attempts < maxAttempts) {
      attempts++;
      await delay(pollInterval); // Wait 0.5 seconds between checks
      
      try {
        const currentUrl = page.url();
        console.log(`[SCRAPER] Attempt ${attempts}/${maxAttempts}, URL:`, currentUrl);
        
        if (currentUrl.includes('EpdPedDtl')) {
          console.log('[SCRAPER] ✓ Found EPD page!');
          foundEPDPage = true;
          break;
        }
      } catch (e) {
        console.log(`[SCRAPER] Error getting URL on attempt ${attempts}:`, e.message);
        // Continue trying
      }
    }
    
    if (!foundEPDPage) {
      const finalUrl = page.url().catch(() => 'unknown');
      console.error('[SCRAPER] ✗ Never reached EPD page after', maxAttempts, 'attempts');
      console.error('[SCRAPER] Final URL:', finalUrl);
      await page.close();
      if (shouldCloseBrowser) await browser.close();
      throw new Error(`Did not reach EPD page after clicking search. Final URL: ${finalUrl}`);
    }
    
    // Wait for page to be fully loaded (reduced from 3000ms)
    console.log('[SCRAPER] Waiting for EPD page to fully load...');
    await delay(1500);
    
    // Verify we're still on the EPD page
    const finalCheckUrl = page.url();
    if (!finalCheckUrl.includes('EpdPedDtl')) {
      console.error('[SCRAPER] ERROR: Not on EPD page! Current URL:', finalCheckUrl);
      await page.close();
      if (shouldCloseBrowser) await browser.close();
      throw new Error(`Lost navigation to EPD page. Current URL: ${finalCheckUrl}`);
    }
    
    console.log('[SCRAPER] Confirmed on EPD page:', finalCheckUrl);
    console.log('[SCRAPER] Logging page contents...');
    
    // Log page contents to see what we're working with
    let pageInfo;
    try {
      pageInfo = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body.innerText.substring(0, 2000), // First 2000 chars
        tableCount: document.querySelectorAll('table').length,
        tableInfo: Array.from(document.querySelectorAll('table')).map((table, idx) => ({
          index: idx,
          rowCount: table.rows.length,
          firstRow: table.rows[0] ? Array.from(table.rows[0].cells).map(cell => cell.textContent.trim()).slice(0, 5) : [],
          sampleRows: Array.from(table.rows).slice(0, 3).map(row => 
            Array.from(row.cells).map(cell => cell.textContent.trim().substring(0, 50))
          )
        })),
        htmlSnippet: document.body.innerHTML.substring(0, 5000) // First 5000 chars of HTML
      };
      });
    } catch (error) {
      console.error('[SCRAPER] Error evaluating page content:', error.message);
      // Try to get at least the URL
      pageInfo = {
        url: page.url(),
        title: 'Error getting title',
        bodyText: 'Error getting body text',
        tableCount: 0,
        tableInfo: [],
        htmlSnippet: 'Error getting HTML'
      };
    }
    
    console.log('\n========== EPD PAGE CONTENTS ==========');
    console.log('URL:', pageInfo.url);
    console.log('Title:', pageInfo.title);
    console.log('Table Count:', pageInfo.tableCount);
    console.log('\n--- Body Text (first 2000 chars) ---');
    console.log(pageInfo.bodyText);
    console.log('\n--- Table Information ---');
    pageInfo.tableInfo.forEach((table, idx) => {
      console.log(`\nTable ${idx}:`);
      console.log(`  Rows: ${table.rowCount}`);
      console.log(`  First row:`, table.firstRow);
      console.log(`  Sample rows:`);
      table.sampleRows.forEach((row, rowIdx) => {
        console.log(`    Row ${rowIdx}:`, row);
      });
    });
    console.log('\n--- HTML Snippet (first 5000 chars) ---');
    console.log(pageInfo.htmlSnippet);
    console.log('========================================\n');
    
    console.log('[SCRAPER] Extracting full data...');
    const data = await extractData(page, registrationNumber);
    
    // Save to cache
    const cacheKey = `epd_${registrationNumber}`;
    cacheUtil.saveCache(cacheKey, data);
    
    // Close page but keep browser for reuse
    await page.close();
    if (shouldCloseBrowser) await browser.close();
    // Return data with flag indicating it was freshly scraped
    return { ...data, _fromCache: false };
    
  } catch (error) {
    console.error('[SCRAPER] Error:', error.message);
    console.error('[SCRAPER] Error details:', error);
    
    // If it's a navigation error but we might have a page loaded, try to extract anyway
    if (browser && error.message.includes('Navigation') || error.message.includes('timeout')) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          const currentPage = pages[0];
          const currentUrl = currentPage.url();
          console.log('[SCRAPER] Navigation error but checking if page loaded:', currentUrl);
          
          if (currentUrl.includes('EpdPedDtl')) {
            console.log('[SCRAPER] Page is actually loaded! Extracting data despite error...');
            const data = await extractData(currentPage, registrationNumber);
            // Save to cache
            const cacheKey = `epd_${registrationNumber}`;
            cacheUtil.saveCache(cacheKey, data);
            await currentPage.close();
            if (shouldCloseBrowser) await browser.close();
            // Return data with flag indicating it was freshly scraped
            return { ...data, _fromCache: false };
          }
        }
      } catch (e) {
        console.error('[SCRAPER] Could not recover from error:', e.message);
      }
    }
    
    if (browser && shouldCloseBrowser) {
      await browser.close();
    }
    
    // Format error message better
    if (error.message.includes('Navigation') || error.message.includes('timeout')) {
      throw new Error(`Navigation failed: The page may have loaded but navigation timed out. Try again. (${error.message})`);
    }
    
    throw error;
  }
}

/**
 * Extract EPD data from the page
 * Extracts EPD values and % ranks, ignoring ACC and PROG
 */
async function extractData(page, registrationNumber) {
  const data = await page.evaluate((regNum) => {
    const result = {
      registrationNumber: regNum,
      url: window.location.href,
      extractedAt: new Date().toISOString(),
      animalName: null, // Will be extracted from page
      sex: null, // Will be extracted from third H6 heading
      additionalInfo: {}, // Store additional information found on page
      epdValues: {}, // Store EPD values and % ranks
      pageStructure: {} // Store page structure for debugging
    };

    // Extract page structure for debugging
    result.pageStructure = {
      title: document.title,
      headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
        tag: h.tagName,
        text: h.textContent.trim(),
        id: h.id || null,
        className: h.className || null
      })),
      allText: document.body.innerText.substring(0, 5000) // First 5000 chars for analysis
    };

    // Extract Name from first H6 heading (user confirmed: first H6 is the animal name)
    // Extract Sex from third H6 heading (user confirmed: third H6 is the sex)
    const h6Headings = Array.from(document.querySelectorAll('h6'));
    if (h6Headings.length > 0) {
      const firstH6 = h6Headings[0];
      const headingText = firstH6.textContent.trim();
      // Should be like "Bel MS Fireball 204K" (not "Reg: AAA *20492951")
      if (headingText && !headingText.match(/^Reg:/i)) {
        result.animalName = headingText;
      }
    }
    
    // Extract sex from third H6 heading (index 2)
    if (h6Headings.length >= 3) {
      const thirdH6 = h6Headings[2];
      const sexText = thirdH6.textContent.trim().toUpperCase();
      // Look for "Bull", "Cow", "Male", "Female", "Steer", "Heifer", etc.
      if (sexText.includes('BULL') || sexText.includes('MALE')) {
        result.sex = 'Bull';
      } else if (sexText.includes('COW') || sexText.includes('FEMALE')) {
        result.sex = 'Cow';
      } else if (sexText.includes('STEER')) {
        result.sex = 'Steer';
      } else if (sexText.includes('HEIFER')) {
        result.sex = 'Heifer';
      } else {
        // Store as-is if we can't categorize
        result.sex = sexText;
      }
    }
    
    // Also check body text for name pattern if H6 didn't work
    // Line 48 shows: "Bel MS Fireball 204K"
    if (!result.animalName) {
      const bodyText = document.body.innerText || '';
      const nameMatch = bodyText.match(/^([A-Z][A-Za-z\s&'.-]{5,50})(?:\s*Reg:|$)/m);
      if (nameMatch && nameMatch[1] && !nameMatch[1].match(/EPD|Details|Association/i)) {
        result.animalName = nameMatch[1].trim();
      }
    }

    // Extract Birth Date and Tattoo from body text
    // Pattern from terminal line 52: "Birth Date: 01/19/2022 Tattoo: 204K"
    const bodyText = document.body.innerText || '';
    const birthDateMatch = bodyText.match(/Birth\s+Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (birthDateMatch && birthDateMatch[1]) {
      result.additionalInfo.birthDate = birthDateMatch[1].trim();
    }
    
    const tattooMatch = bodyText.match(/Tattoo:\s*([A-Z0-9]+)/i);
    if (tattooMatch && tattooMatch[1]) {
      result.additionalInfo.tattoo = tattooMatch[1].trim();
    }

    // Get all tables first (needed for pedigree extraction)
    const tables = Array.from(document.querySelectorAll('table'));
    
    // Extract Sire, Dam, MGS from pedigree table structure (Table 0)
    // Based on DOM structure:
    // - Sire is in <tr class="ped4">, first <td>
    // - Dam is in <tr class="ped11">, first <td>
    // - MGS is in <tr class="ped9">, second <td>
    
    // Parse the pedigree table (first table)
    const pedigreeTable = tables[0];
    if (pedigreeTable) {
      const tableRows = Array.from(pedigreeTable.rows);
      
      // Find Sire - row with class "ped4", first cell (column 0)
      const sireRow = tableRows.find(row => row.className.includes('ped4'));
      if (sireRow) {
        const cells = Array.from(sireRow.cells);
        if (cells.length > 0) {
          const sireText = cells[0].textContent.trim();
          if (sireText) {
            result.additionalInfo.sire = sireText;
          }
        }
      }
      
      // Find Dam - row with class "ped11", first cell (column 0)
      const damRow = tableRows.find(row => row.className.includes('ped11'));
      if (damRow) {
        const cells = Array.from(damRow.cells);
        if (cells.length > 0) {
          const damText = cells[0].textContent.trim();
          if (damText) {
            result.additionalInfo.dam = damText;
          }
        }
      }
      
      // Find MGS - row with class "ped9", second cell (column 1)
      const mgsRow = tableRows.find(row => row.className.includes('ped9'));
      if (mgsRow) {
        const cells = Array.from(mgsRow.cells);
        if (cells.length > 1) {
          const mgsText = cells[1].textContent.trim();
          if (mgsText) {
            result.additionalInfo.mgs = mgsText;
          }
        }
      }
    }

    // Fallback: Look in tables for label-value pairs (tables already declared above)
    const nameCandidates = [];
    
    for (const table of tables) {
      const rows = Array.from(table.rows);
      // Check first 10 rows for name information and other data
      for (let rowIdx = 0; rowIdx < Math.min(10, rows.length); rowIdx++) {
        const row = rows[rowIdx];
        const cells = Array.from(row.cells);
        
        // Extract key-value pairs from table rows (common pattern: Label | Value)
        for (let cellIdx = 0; cellIdx < cells.length - 1; cellIdx++) {
          const labelCell = cells[cellIdx];
          const valueCell = cells[cellIdx + 1];
          const label = labelCell.textContent.trim().toLowerCase();
          const value = valueCell.textContent.trim();
          
          // Store all label-value pairs for analysis
          if (label && value && label.length < 50 && value.length < 200) {
            const cleanLabel = label.replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, '_');
            if (!result.additionalInfo[cleanLabel]) {
              result.additionalInfo[cleanLabel] = value;
            }
          }
          
          // Fallback extraction for fields we haven't found yet
          if (!result.animalName && label.match(/^name:?$/i) && value && value.length > 2 && value.length < 100 && !value.match(/^\d+$/)) {
            nameCandidates.push({ source: 'table_label', value: value, row: rowIdx, cell: cellIdx });
            result.animalName = value;
          }
          
          if (!result.additionalInfo.sire && label.match(/^sire:?$/i) && value && value.trim()) {
            result.additionalInfo.sire = value.trim();
          }
          
          if (!result.additionalInfo.dam && label.match(/^dam:?$/i) && value && value.trim()) {
            result.additionalInfo.dam = value.trim();
          }
          
          if (!result.additionalInfo.mgs && label.match(/^(mgs|maternal\s+grand\s+sire|maternal\s+grandsire|maternal\s+grand\s+site):?$/i) && value && value.trim()) {
            result.additionalInfo.mgs = value.trim();
          }
          
          if (!result.additionalInfo.birthDate && label.match(/^(bd|birth\s+date|dob|date\s+of\s+birth|birthdate):?$/i) && value && value.trim()) {
            result.additionalInfo.birthDate = value.trim();
          }
          
          if (!result.additionalInfo.tattoo && label.match(/^tattoo:?$/i) && value && value.trim()) {
            result.additionalInfo.tattoo = value.trim();
          }
        }
      }
    }
    
    // Store name candidates for debugging
    result.pageStructure.nameCandidates = nameCandidates;

    // Check page title
    if (!result.animalName) {
      const pageTitle = document.title || '';
      // Look for patterns like "Animal Name - EPD" or "Name - Registration"
      const titleMatch = pageTitle.match(/([A-Z][A-Za-z\s&'.-]{3,50})\s*[-–]\s*(?:EPD|Registration)/i);
      if (titleMatch && titleMatch[1]) {
        result.animalName = titleMatch[1].trim();
      }
    }

    // Look in headings
    if (!result.animalName) {
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
      for (const heading of headings) {
        const headingText = heading.textContent.trim();
        // Skip if it contains EPD, %, or is mostly numbers
        if (headingText.match(/(EPD|%|\d{4,})/i)) continue;
        
        // If it's a reasonable length and looks like a name
        if (headingText.length > 3 && headingText.length < 100 && headingText.match(/^[A-Z][A-Za-z\s&'.-]+$/)) {
          result.animalName = headingText;
          break;
        }
      }
    }

    // Look in body text for common patterns
    if (!result.animalName) {
      const bodyText = document.body.innerText || '';
      const namePatterns = [
        /(?:^|\n)\s*(?:name|animal)[:\s]+([A-Z][A-Za-z\s&'.-]{3,50})(?:\s|$)/im,
        /([A-Z][A-Za-z\s&'.-]{3,50})\s*[-–]\s*Registration/i,
        /Registration[:\s]+\d+\s+([A-Z][A-Za-z\s&'.-]{3,50})/i
      ];
      
      for (const pattern of namePatterns) {
        const match = bodyText.match(pattern);
        if (match && match[1] && !match[1].match(/^\d+$/)) {
          result.animalName = match[1].trim();
          break;
        }
      }
    }

    // Fallback to registration number if name not found
    if (!result.animalName) {
      result.animalName = regNum;
    }

    // Log extracted name and additional info for debugging
    console.log(`[SCRAPER] Extracted animal name: "${result.animalName}" for registration ${regNum}`);
    console.log(`[SCRAPER] Name candidates found:`, result.pageStructure.nameCandidates || []);
    
    console.log(`\n[SCRAPER] Extracted additional info:`, {
      sire: result.additionalInfo.sire || 'NOT FOUND',
      dam: result.additionalInfo.dam || 'NOT FOUND',
      mgs: result.additionalInfo.mgs || 'NOT FOUND',
      birthDate: result.additionalInfo.birthDate || 'NOT FOUND',
      tattoo: result.additionalInfo.tattoo || 'NOT FOUND'
    });
    
    // Log EPD extraction results
    const epdCount = Object.keys(result.epdValues).length;
    console.log(`\n[SCRAPER] EPD Values Extracted: ${epdCount} traits`);
    if (epdCount > 0) {
      console.log(`[SCRAPER] EPD Traits:`, Object.keys(result.epdValues).join(', '));
    } else {
      console.log(`[SCRAPER] WARNING: No EPD values found!`);
    }

    // Reuse tables variable (already declared above for name extraction)
    // Look for the main EPD table with Production/Maternal data
    // Based on the structure: header row with trait names, then rows with EPD, ACC, %, PROG
    tables.forEach((table) => {
      const rows = Array.from(table.rows);
      if (rows.length < 3) return; // Skip small tables
      
      // Look for header row containing trait abbreviations
      const traitAbbrevs = ['CED', 'BW', 'WW', 'YW', 'RADG', 'DMI', 'YH', 'SC', 'HP', 'CEM', 'MILK', 'TEAT', 'UDDR', 'FL', 'MW', 'MH', '$EN', 'DOC', 'CLAW', 'ANGLE', 'PAP', 'HS', 'CW', 'MARB', 'RE', 'FAT', '$M', '$F', '$B', '$W', '$G', '$C', '$AXH', '$AXJ'];
      
      let headerRowIdx = -1;
      let headerRow = null;
      
      for (let i = 0; i < rows.length; i++) {
        const rowText = rows[i].textContent.toUpperCase();
        const matchesTraits = traitAbbrevs.some(trait => rowText.includes(trait));
        if (matchesTraits && rows[i].cells.length > 3) {
          headerRowIdx = i;
          headerRow = rows[i];
          break;
        }
      }
      
      if (headerRowIdx >= 0 && headerRow) {
        const headerCells = Array.from(headerRow.cells);
        
        // Extract trait names from headers - values may be separated by <br> tags
        const traitHeaders = headerCells.map(cell => {
          // Get innerHTML to preserve <br> tags, then split
          const html = cell.innerHTML || cell.textContent;
          // Split by <br> tags (various formats: <br>, <br/>, <br />)
          const parts = html.split(/<br\s*\/?>/i).map(p => p.trim()).filter(p => p.length > 0);
          
          // First part should be the trait name
          const firstPart = parts[0] ? parts[0].toUpperCase().trim() : '';
          
          // Handle $Values specially ($EN, $M, $F, $B, $W, $G, $C, $AXH, $AXJ)
          if (firstPart.startsWith('$')) {
            const dollarMatch = firstPart.match(/^(\$[A-Z]+)/);
            if (dollarMatch) return dollarMatch[1];
          }
          
          // For regular traits, extract just the abbreviation (CED, BW, WW, etc.)
          const traitMatch = firstPart.match(/^([A-Z]{1,5})(?:\s|ACC|PROG|DAUS|%|MKH|MKD|$)/);
          if (traitMatch) {
            return traitMatch[1];
          }
          
          return null;
        });
        
        // Now parse data rows
        // Since values are separated by <br> tags within cells, we just need to find the first data row
        // The structure in each cell is: EPD<br>ACC<br>%RANK<br>PROG (all in one cell)
        let dataRowIdx = -1;
        
        // Find the first row after headers that contains data (has + or - values)
        for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 5, rows.length); i++) {
          const row = rows[i];
          const cells = Array.from(row.cells);
          if (cells.length === 0) continue;
          
          // Check first cell to see if it contains EPD-like values
          const firstCellHtml = cells[0].innerHTML || cells[0].textContent;
          const firstCellParts = firstCellHtml.split(/<br\s*\/?>/i).map(p => p.trim());
          const hasEPDValue = firstCellParts.some(part => part.match(/^[+-]?(\d+\.?\d*|\.\d+)$/));
          
          if (hasEPDValue) {
            dataRowIdx = i;
            break;
          }
        }
        
        // Extract EPD values and % ranks from the data row
        // Format: Values are separated by <br> tags: "+8<br>.36<br>30%<br>1"
        // Structure: EPD value, ACC value, % rank, PROG value (in that order)
        if (dataRowIdx >= 0) {
          const dataRow = rows[dataRowIdx];
          const dataCells = Array.from(dataRow.cells);
          dataCells.forEach((cell, colIdx) => {
            const traitName = traitHeaders[colIdx];
            if (!traitName) return;
            
            // Get innerHTML to preserve <br> tags
            const html = cell.innerHTML || cell.textContent;
            
            // Parse values separated by <br> tags
            const parts = html.split(/<br\s*\/?>/i).map(p => p.trim()).filter(p => p.length > 0);
            
            if (parts.length > 0) {
              // First part should be the EPD value (like "+8", "+.1", "+.42", "I+1.43", etc.)
              // "I" prefix means "inferred" but we still want to extract the value
              const firstPart = parts[0].trim();
              const epdMatch = firstPart.match(/^I?([+-]?(?:\d+\.?\d*|\.\d+))$/);
              if (epdMatch) {
                if (!result.epdValues[traitName]) {
                  result.epdValues[traitName] = {};
                }
                result.epdValues[traitName].epd = epdMatch[1];
              }
              
              // Look for % rank in the parts (should be the 3rd item: EPD, ACC, %RANK, PROG)
              // Clean percentage like "30%", "25%", "65%" (1-3 digits followed by %)
              for (let i = 0; i < parts.length; i++) {
                const part = parts[i].trim();
                const percentMatch = part.match(/^(\d{1,3})%$/); // 1-3 digits followed by %
                if (percentMatch) {
                  if (!result.epdValues[traitName]) {
                    result.epdValues[traitName] = {};
                  }
                  result.epdValues[traitName].percentRank = percentMatch[1];
                  break; // Found it, move to next cell
                }
              }
            }
          });
        }
      }
    });
    
    // Also store raw tables for reference
    result.rawTables = {};
    tables.forEach((table, tableIdx) => {
      const tableData = [];
      const rows = Array.from(table.rows);
      
      rows.forEach((row) => {
        const cells = Array.from(row.cells);
        if (cells.length > 0) {
          const rowData = cells.map(cell => cell.textContent.trim());
          tableData.push(rowData);
        }
      });

      if (tableData.length > 0) {
        result.rawTables[`table_${tableIdx}`] = tableData;
      }
    });

    return result;
  }, registrationNumber);
  
  console.log('[SCRAPER] Data extracted:', {
    epdTraits: Object.keys(data.epdValues || {}).length,
    rawTables: Object.keys(data.rawTables || {}).length,
    additionalInfoKeys: Object.keys(data.additionalInfo || {}).length
  });
  
  // Log the extracted EPD values for debugging
  if (data.epdValues) {
    console.log('[SCRAPER] Extracted EPD values:');
    Object.entries(data.epdValues).forEach(([trait, values]) => {
      console.log(`  ${trait}: EPD=${values.epd || 'N/A'}, %Rank=${values.percentRank || 'N/A'}`);
    });
  }
  
  // Log additional information found
  if (data.additionalInfo && Object.keys(data.additionalInfo).length > 0) {
    console.log('\n[SCRAPER] Additional information found on page:');
    Object.entries(data.additionalInfo).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  }
  
  // Log page structure for debugging
  if (data.pageStructure) {
    console.log('\n[SCRAPER] Page structure:');
    console.log(`  Title: ${data.pageStructure.title}`);
    console.log(`  Headings found: ${data.pageStructure.headings?.length || 0}`);
    if (data.pageStructure.headings && data.pageStructure.headings.length > 0) {
      console.log('  Heading samples:');
      data.pageStructure.headings.slice(0, 5).forEach(h => {
        console.log(`    ${h.tag}: "${h.text.substring(0, 50)}"`);
      });
    }
  }
  
  return data;
}

module.exports = { scrapeEPD, getPuppeteerLaunchOptions };
