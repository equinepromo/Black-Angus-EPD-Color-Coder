const puppeteer = require('puppeteer');
const cacheUtil = require('./cache-util');

const PERCENTILE_CACHE_KEY = 'percentile-breakdowns';
const COW_PERCENTILE_CACHE_KEY = 'percentile-breakdowns-cows';

/**
 * Scrapes the percentile breakdowns page and extracts EPD values for each percentile rank
 * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data
 * @returns {Object} Structured data: { traitName: [{ percentile: number, epdValue: string }] }
 */
async function fetchPercentileBreakdowns(forceRefresh = false) {
  // Check file-based cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = cacheUtil.loadCache(PERCENTILE_CACHE_KEY);
    if (cached && cached.data) {
      console.log('[PERCENTILE] Using cached percentile data from file');
      return cached.data;
    }
  }

  console.log('[PERCENTILE] Fetching percentile breakdowns from Angus website...');
  
  let browser = null;
  try {
    // Use the same launch options as the scraper for consistency
    const scraper = require('./scraper-puppeteer');
    const launchOptions = scraper.getPuppeteerLaunchOptions();
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    
    // Set user agent similar to main scraper
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('[PERCENTILE] Navigating to percentile breakdowns page...');
    await page.goto('https://www.angus.org/tools-resources/national-cattle-evaluation/percentile-breakdowns', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('[PERCENTILE] Page loaded, waiting for content to render...');
    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if tables exist
    const hasTables = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      return tables.length > 0;
    });

    if (!hasTables) {
      // Try waiting longer
      console.log('[PERCENTILE] No tables found immediately, waiting longer...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Extract percentile data from the table
    const percentileData = await page.evaluate(() => {
      const result = {};
      const debugInfo = {
        tableCount: 0,
        tables: [],
        selectedTable: null,
        error: null
      };
      
      const tables = Array.from(document.querySelectorAll('table'));
      debugInfo.tableCount = tables.length;
      
      if (tables.length === 0) {
        debugInfo.error = 'No tables found on percentile breakdowns page';
        return { result: null, debugInfo };
      }
      
      // Find the main percentile breakdown table (should be the largest table with percentile data)
      let mainTable = null;
      let maxRows = 0;
      
      for (let tIdx = 0; tIdx < tables.length; tIdx++) {
        const table = tables[tIdx];
        const rows = Array.from(table.rows);
        const tableInfo = {
          index: tIdx,
          rowCount: rows.length,
          hasPercentileStructure: false,
          firstRowSample: rows.length > 0 ? Array.from(rows[0].cells).map(c => c.textContent.trim().substring(0, 30)) : []
        };
        
        // Look for table with many rows (percentile breakdown has many percentile rows)
        if (rows.length > maxRows && rows.length > 10) {
          // Check if this table has percentile-like structure (first cell of a row contains "%")
          const hasPercentileStructure = rows.some(row => {
            const cells = Array.from(row.cells);
            if (cells.length > 0) {
              const firstCellText = cells[0].textContent.trim();
              return firstCellText.match(/\d+%/);
            }
            return false;
          });
          
          tableInfo.hasPercentileStructure = hasPercentileStructure;
          
          if (hasPercentileStructure) {
            maxRows = rows.length;
            mainTable = table;
            debugInfo.selectedTable = tableInfo;
          }
        }
        
        debugInfo.tables.push(tableInfo);
      }
      
      if (!mainTable) {
        debugInfo.error = 'Could not find percentile breakdown table with proper structure';
        // Fallback: try the largest table anyway
        if (tables.length > 0) {
          mainTable = tables.reduce((largest, current) => {
            return Array.from(current.rows).length > Array.from(largest.rows).length ? current : largest;
          });
          debugInfo.selectedTable = {
            index: tables.indexOf(mainTable),
            rowCount: Array.from(mainTable.rows).length,
            note: 'Using largest table as fallback'
          };
        } else {
          return { result: null, debugInfo };
        }
      }
      
      // The table has a thead with multiple rows and a tbody
      // The actual trait headers are in the third row of the thead (index 2)
      const thead = mainTable.querySelector('thead');
      const tbody = mainTable.querySelector('tbody');
      
      if (!thead || !tbody) {
        debugInfo.error = 'Table missing thead or tbody';
        return { result: null, debugInfo };
      }
      
      const theadRows = Array.from(thead.rows);
      if (theadRows.length < 3) {
        debugInfo.error = `Table thead has too few rows: ${theadRows.length}`;
        return { result: null, debugInfo };
      }
      
      // Third row (index 2) contains the trait names
      // First cell is "Top Pct", rest are trait names
      const headerRow = theadRows[2];
      const headerCells = Array.from(headerRow.cells);
      
        // Extract trait names from headers (skip first column which is "Top Pct")
        const traitNames = [];
        for (let i = 1; i < headerCells.length; i++) {
          let headerText = headerCells[i].textContent.trim();
          // Some headers might have line breaks, clean them first
          headerText = headerText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
          // Normalize trait names - convert to uppercase
          // But preserve $ signs and their case (some are like $AxH, some might be $AXH)
          // For $ values, convert the part after $ to uppercase
          if (headerText.startsWith('$')) {
            const afterDollar = headerText.substring(1).toUpperCase();
            headerText = '$' + afterDollar;
          } else {
            headerText = headerText.toUpperCase();
          }
          // Skip empty headers or headers that look like category headers
          if (headerText && headerText.length > 0 && headerText.length < 30 && 
              !headerText.match(/^(TOTAL ANIMALS|AVG|TOP PCT|PRODUCTION|MATERNAL|MANAGEMENT|CARCASS|PERCENTILE BREAKDOWN)/i)) {
            traitNames.push(headerText);
          }
        }
      
      debugInfo.traitCount = traitNames.length;
      debugInfo.sampleTraits = traitNames.slice(0, 10);
      
      // Process data rows from tbody
      const tbodyRows = Array.from(tbody.rows);
      
      for (let rowIdx = 0; rowIdx < tbodyRows.length; rowIdx++) {
        const row = tbodyRows[rowIdx];
        const cells = Array.from(row.cells);
        
        // Skip rows with no cells
        if (cells.length === 0) continue;
        
        // First cell should contain the percentile (e.g., "1%", "5%", "10%", etc.)
        // or might be "Total Animals" or "Avg" which we should skip
        const percentileCell = cells[0].textContent.trim();
        
        // Skip "Total Animals" and "Avg" rows
        if (percentileCell.match(/^(Total Animals|Avg)$/i)) {
          continue;
        }
        
        const percentileMatch = percentileCell.match(/(\d+)%/);
        if (!percentileMatch) {
          // Not a percentile row, skip it
          continue;
        }
        
        const percentile = parseInt(percentileMatch[1], 10);
        
        // Extract EPD values for each trait
        for (let traitIdx = 0; traitIdx < traitNames.length; traitIdx++) {
          const cellIdx = traitIdx + 1; // +1 because first column is percentile
          if (cellIdx >= cells.length) break;
          
          const traitName = traitNames[traitIdx];
          const cellValue = cells[cellIdx].textContent.trim();
          
          // Parse EPD value (could be "+1.2", "-.5", "0", "+8", "+.36", etc.)
          // Handle format like "+8", "+.1", "-1.2", ".5", "0", "+.36"
          // Also handle "I" prefix for inferred values (strip it)
          let cleanValue = cellValue.replace(/^I\s*/i, '').trim();
          const epdMatch = cleanValue.match(/^([+-]?(?:\d+\.?\d*|\.\d+))$/);
          if (epdMatch) {
            const epdValue = parseFloat(epdMatch[1]);
            if (!isNaN(epdValue)) {
              if (!result[traitName]) {
                result[traitName] = [];
              }
              
              result[traitName].push({
                percentile: percentile,
                epdValue: epdValue
              });
            }
          }
        }
      }
      
      // Sort each trait's percentile data by percentile
      for (const traitName in result) {
        result[traitName].sort((a, b) => a.percentile - b.percentile);
      }
      
      debugInfo.extractedTraitCount = Object.keys(result).length;
      debugInfo.sampleExtractedTraits = Object.keys(result).slice(0, 10);
      
      return { result, debugInfo };
    });

    // Extract result and debug info
    const extractedResult = percentileData.result;
    const debugInfo = percentileData.debugInfo || {};
    
    if (!extractedResult || Object.keys(extractedResult).length === 0) {
      console.error('[PERCENTILE] Failed to extract percentile data. Debug info:', JSON.stringify(debugInfo, null, 2));
      await browser.close();
      throw new Error('Failed to extract percentile breakdown data from table');
    }

    await browser.close();

    // Save to file cache
    cacheUtil.saveCache(PERCENTILE_CACHE_KEY, extractedResult);
    console.log(`[PERCENTILE] Successfully loaded percentile data for ${Object.keys(extractedResult).length} traits`);
    if (debugInfo.sampleExtractedTraits) {
      console.log(`[PERCENTILE] Sample traits: ${debugInfo.sampleExtractedTraits.join(', ')}`);
    }
    
    return extractedResult;
  } catch (error) {
    if (browser) await browser.close();
    console.error('[PERCENTILE] Error fetching percentile breakdowns:', error);
    throw error;
  }
}

/**
 * Scrapes the cow percentile breakdowns page and extracts EPD values for each percentile rank
 * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data
 * @returns {Object} Structured data: { traitName: [{ percentile: number, epdValue: string }] }
 */
async function fetchCowPercentileBreakdowns(forceRefresh = false) {
  // Check file-based cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = cacheUtil.loadCache(COW_PERCENTILE_CACHE_KEY);
    if (cached && cached.data) {
      console.log('[PERCENTILE] Using cached cow percentile data from file');
      return cached.data;
    }
  }

  console.log('[PERCENTILE] Fetching cow percentile breakdowns from Angus website...');
  
  let browser = null;
  try {
    // Use the same launch options as the scraper for consistency
    const scraper = require('./scraper-puppeteer');
    const launchOptions = scraper.getPuppeteerLaunchOptions();
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    
    // Set user agent similar to main scraper
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('[PERCENTILE] Navigating to cow percentile breakdowns page...');
    await page.goto('https://www.angus.org/tools-resources/national-cattle-evaluation/percentile-breakdowns?activeTab=Current+Dams&__scrollposition=284', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('[PERCENTILE] Page loaded, waiting for content to render...');
    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if tables exist
    const hasTables = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      return tables.length > 0;
    });

    if (!hasTables) {
      // Try waiting longer
      console.log('[PERCENTILE] No tables found immediately, waiting longer...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Extract percentile data from the table (same logic as bull data)
    const percentileData = await page.evaluate(() => {
      const result = {};
      const debugInfo = {
        tableCount: 0,
        tables: [],
        selectedTable: null,
        error: null
      };
      
      const tables = Array.from(document.querySelectorAll('table'));
      debugInfo.tableCount = tables.length;
      
      if (tables.length === 0) {
        debugInfo.error = 'No tables found on percentile breakdowns page';
        return { result: null, debugInfo };
      }
      
      // Find the main percentile breakdown table (should be the largest table with percentile data)
      let mainTable = null;
      let maxRows = 0;
      
      for (let tIdx = 0; tIdx < tables.length; tIdx++) {
        const table = tables[tIdx];
        const rows = Array.from(table.rows);
        const tableInfo = {
          index: tIdx,
          rowCount: rows.length,
          hasPercentileStructure: false,
          firstRowSample: rows.length > 0 ? Array.from(rows[0].cells).map(c => c.textContent.trim().substring(0, 30)) : []
        };
        
        // Look for table with many rows (percentile breakdown has many percentile rows)
        if (rows.length > maxRows && rows.length > 10) {
          // Check if this table has percentile-like structure (first cell of a row contains "%")
          const hasPercentileStructure = rows.some(row => {
            const cells = Array.from(row.cells);
            if (cells.length > 0) {
              const firstCellText = cells[0].textContent.trim();
              return firstCellText.match(/\d+%/);
            }
            return false;
          });
          
          tableInfo.hasPercentileStructure = hasPercentileStructure;
          
          if (hasPercentileStructure) {
            maxRows = rows.length;
            mainTable = table;
            debugInfo.selectedTable = tableInfo;
          }
        }
        
        debugInfo.tables.push(tableInfo);
      }
      
      if (!mainTable) {
        debugInfo.error = 'Could not find percentile breakdown table with proper structure';
        // Fallback: try the largest table anyway
        if (tables.length > 0) {
          mainTable = tables.reduce((largest, current) => {
            return Array.from(current.rows).length > Array.from(largest.rows).length ? current : largest;
          });
          debugInfo.selectedTable = {
            index: tables.indexOf(mainTable),
            rowCount: Array.from(mainTable.rows).length,
            note: 'Using largest table as fallback'
          };
        } else {
          return { result: null, debugInfo };
        }
      }
      
      // The table has a thead with multiple rows and a tbody
      // The actual trait headers are in the third row of the thead (index 2)
      const thead = mainTable.querySelector('thead');
      const tbody = mainTable.querySelector('tbody');
      
      if (!thead || !tbody) {
        debugInfo.error = 'Table missing thead or tbody';
        return { result: null, debugInfo };
      }
      
      const theadRows = Array.from(thead.rows);
      if (theadRows.length < 3) {
        debugInfo.error = `Table thead has too few rows: ${theadRows.length}`;
        return { result: null, debugInfo };
      }
      
      // Third row (index 2) contains the trait names
      // First cell is "Top Pct", rest are trait names
      const headerRow = theadRows[2];
      const headerCells = Array.from(headerRow.cells);
      
        // Extract trait names from headers (skip first column which is "Top Pct")
        const traitNames = [];
        for (let i = 1; i < headerCells.length; i++) {
          let headerText = headerCells[i].textContent.trim();
          // Some headers might have line breaks, clean them first
          headerText = headerText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
          // Normalize trait names - convert to uppercase
          // But preserve $ signs and their case (some are like $AxH, some might be $AXH)
          // For $ values, convert the part after $ to uppercase
          if (headerText.startsWith('$')) {
            const afterDollar = headerText.substring(1).toUpperCase();
            headerText = '$' + afterDollar;
          } else {
            headerText = headerText.toUpperCase();
          }
          // Skip empty headers or headers that look like category headers
          if (headerText && headerText.length > 0 && headerText.length < 30 && 
              !headerText.match(/^(TOTAL ANIMALS|AVG|TOP PCT|PRODUCTION|MATERNAL|MANAGEMENT|CARCASS|PERCENTILE BREAKDOWN)/i)) {
            traitNames.push(headerText);
          }
        }
      
      debugInfo.traitCount = traitNames.length;
      debugInfo.sampleTraits = traitNames.slice(0, 10);
      
      // Process data rows from tbody
      const tbodyRows = Array.from(tbody.rows);
      
      for (let rowIdx = 0; rowIdx < tbodyRows.length; rowIdx++) {
        const row = tbodyRows[rowIdx];
        const cells = Array.from(row.cells);
        
        // Skip rows with no cells
        if (cells.length === 0) continue;
        
        // First cell should contain the percentile (e.g., "1%", "5%", "10%", etc.)
        // or might be "Total Animals" or "Avg" which we should skip
        const percentileCell = cells[0].textContent.trim();
        
        // Skip "Total Animals" and "Avg" rows
        if (percentileCell.match(/^(Total Animals|Avg)$/i)) {
          continue;
        }
        
        const percentileMatch = percentileCell.match(/(\d+)%/);
        if (!percentileMatch) {
          // Not a percentile row, skip it
          continue;
        }
        
        const percentile = parseInt(percentileMatch[1], 10);
        
        // Extract EPD values for each trait
        for (let traitIdx = 0; traitIdx < traitNames.length; traitIdx++) {
          const cellIdx = traitIdx + 1; // +1 because first column is percentile
          if (cellIdx >= cells.length) break;
          
          const traitName = traitNames[traitIdx];
          const cellValue = cells[cellIdx].textContent.trim();
          
          // Parse EPD value (could be "+1.2", "-.5", "0", "+8", "+.36", etc.)
          // Handle format like "+8", "+.1", "-1.2", ".5", "0", "+.36"
          // Also handle "I" prefix for inferred values (strip it)
          let cleanValue = cellValue.replace(/^I\s*/i, '').trim();
          const epdMatch = cleanValue.match(/^([+-]?(?:\d+\.?\d*|\.\d+))$/);
          if (epdMatch) {
            const epdValue = parseFloat(epdMatch[1]);
            if (!isNaN(epdValue)) {
              if (!result[traitName]) {
                result[traitName] = [];
              }
              
              result[traitName].push({
                percentile: percentile,
                epdValue: epdValue
              });
            }
          }
        }
      }
      
      // Sort each trait's percentile data by percentile
      for (const traitName in result) {
        result[traitName].sort((a, b) => a.percentile - b.percentile);
      }
      
      debugInfo.extractedTraitCount = Object.keys(result).length;
      debugInfo.sampleExtractedTraits = Object.keys(result).slice(0, 10);
      
      return { result, debugInfo };
    });

    // Extract result and debug info
    const extractedResult = percentileData.result;
    const debugInfo = percentileData.debugInfo || {};
    
    if (!extractedResult || Object.keys(extractedResult).length === 0) {
      console.error('[PERCENTILE] Failed to extract cow percentile data. Debug info:', JSON.stringify(debugInfo, null, 2));
      await browser.close();
      throw new Error('Failed to extract cow percentile breakdown data from table');
    }

    await browser.close();

    // Save to file cache
    cacheUtil.saveCache(COW_PERCENTILE_CACHE_KEY, extractedResult);
    console.log(`[PERCENTILE] Successfully loaded cow percentile data for ${Object.keys(extractedResult).length} traits`);
    if (debugInfo.sampleExtractedTraits) {
      console.log(`[PERCENTILE] Sample traits: ${debugInfo.sampleExtractedTraits.join(', ')}`);
    }
    
    return extractedResult;
  } catch (error) {
    if (browser) await browser.close();
    console.error('[PERCENTILE] Error fetching cow percentile breakdowns:', error);
    throw error;
  }
}

/**
 * Gets the 1st percentile threshold EPD value for a trait
 * @param {string} traitName - Name of the trait
 * @param {Object} percentileData - The percentile breakdown data
 * @returns {number|null} The 1st percentile EPD threshold or null if not found
 */
function getFirstPercentileThreshold(traitName, percentileData) {
  if (!percentileData || !percentileData[traitName] || percentileData[traitName].length === 0) {
    return null;
  }

  const traitPercentiles = percentileData[traitName];
  
  // Find the entry with percentile = 1
  const firstPercentileEntry = traitPercentiles.find(entry => entry.percentile === 1);
  if (firstPercentileEntry) {
    return firstPercentileEntry.epdValue;
  }
  
  // If no exact 1% entry, use the first entry (lowest percentile)
  if (traitPercentiles.length > 0) {
    return traitPercentiles[0].epdValue;
  }
  
  return null;
}

/**
 * Estimates the percentile rank for a given EPD value and trait
 * Uses linear interpolation when value falls between percentile points
 * @param {string} traitName - Name of the trait (e.g., "BW", "WW", "CED")
 * @param {number} epdValue - The EPD value to look up
 * @param {Object} percentileData - The percentile breakdown data (from fetchPercentileBreakdowns)
 * @returns {number|null} Estimated percentile rank (1-100) or null if cannot determine
 */
function estimatePercentileRank(traitName, epdValue, percentileData) {
  if (!percentileData || !percentileData[traitName] || percentileData[traitName].length === 0) {
    return null;
  }

  const traitPercentiles = percentileData[traitName];
  
  // Handle edge cases: value is outside the range
  // Since data is sorted by percentile, we need to check EPD values
  const first = traitPercentiles[0];
  const last = traitPercentiles[traitPercentiles.length - 1];
  
  // Determine if EPD values are ascending or descending with percentile
  const isAscending = last.epdValue >= first.epdValue;
  
  if (isAscending) {
    if (epdValue <= first.epdValue) return first.percentile;
    if (epdValue >= last.epdValue) return last.percentile;
  } else {
    if (epdValue >= first.epdValue) return first.percentile;
    if (epdValue <= last.epdValue) return last.percentile;
  }
  
  // Find the two percentile points that bracket the EPD value
  for (let i = 0; i < traitPercentiles.length - 1; i++) {
    const lower = traitPercentiles[i];
    const upper = traitPercentiles[i + 1];
    
    const minEPD = Math.min(lower.epdValue, upper.epdValue);
    const maxEPD = Math.max(lower.epdValue, upper.epdValue);
    
    // Check if EPD value falls between these two points
    if (epdValue >= minEPD && epdValue <= maxEPD) {
      // Linear interpolation
      const range = upper.epdValue - lower.epdValue;
      if (Math.abs(range) < 0.0001) {
        // Values are the same, use the lower percentile
        return lower.percentile;
      }
      
      const position = (epdValue - lower.epdValue) / range;
      const percentileRange = upper.percentile - lower.percentile;
      const estimatedPercentile = lower.percentile + (position * percentileRange);
      
      return Math.round(estimatedPercentile);
    }
  }
  
  return null;
}

/**
 * Maps calculated EPDs to percentile ranks
 * @param {Object} calculatedEPDs - Object with trait names as keys and EPD values as values: { "BW": "+1.5", "WW": "+57", ... }
 * @returns {Object} Object with percentile ranks: { "BW": 27, "WW": 65, ... }
 */
async function mapEPDsToPercentiles(calculatedEPDs) {
  const percentileData = await fetchPercentileBreakdowns();
  const result = {};
  
  // Log available traits in percentile data for debugging
  const availableTraits = Object.keys(percentileData);
  console.log(`[PERCENTILE] Available traits in percentile data: ${availableTraits.slice(0, 10).join(', ')}...`);
  
  for (const traitName in calculatedEPDs) {
    const epdString = calculatedEPDs[traitName];
    
    // Parse EPD value (handle strings like "+1.5", "-.5", "0", etc.)
    const epdValue = parseFloat(epdString);
    if (isNaN(epdValue)) {
      result[traitName] = null;
      continue;
    }
    
    // Normalize trait name to uppercase for lookup
    const normalizedTrait = traitName.toUpperCase();
    
    // Check if trait exists in percentile data
    if (!percentileData[normalizedTrait]) {
      console.log(`[PERCENTILE] Trait "${normalizedTrait}" not found in percentile data`);
      result[traitName] = null;
      continue;
    }
    
    const estimatedRank = estimatePercentileRank(normalizedTrait, epdValue, percentileData);
    result[traitName] = estimatedRank;
  }
  
  return result;
}

module.exports = {
  fetchPercentileBreakdowns,
  fetchCowPercentileBreakdowns,
  estimatePercentileRank,
  mapEPDsToPercentiles,
  getFirstPercentileThreshold
};

