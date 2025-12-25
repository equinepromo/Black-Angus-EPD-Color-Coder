const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

/**
 * Common EPD trait names and variations
 */
const EPD_TRAIT_PATTERNS = {
  'BW': ['birth weight', 'bw', 'birth wt', 'birthweight'],
  'WW': ['weaning weight', 'ww', 'weaning wt', 'weaningweight'],
  'YW': ['yearling weight', 'yw', 'yearling wt', 'yearlingweight'],
  'CED': ['calving ease direct', 'ced', 'calving ease'],
  'RADG': ['residual avg daily gain', 'radg', 'residual adg'],
  'DMI': ['dry matter intake', 'dmi'],
  'YH': ['yearling height', 'yh', 'yearling ht'],
  'SC': ['scrotal circumference', 'sc', 'scrotal circ'],
  'DOC': ['docility', 'doc'],
  'CLAW': ['claw set', 'claw'],
  'ANGLE': ['foot angle', 'angle', 'foot'],
  'PAP': ['pulmonary arterial pressure', 'pap'],
  'HS': ['heel depth', 'hs', 'heel'],
  'HP': ['hip height', 'hp', 'hip'],
  'CEM': ['calving ease maternal', 'cem'],
  'MILK': ['milk', 'milk epd'],
  'TEAT': ['teat size', 'teat'],
  'UDDR': ['udder quality', 'udder', 'uddr'],
  'FL': ['fat thickness', 'fl', 'fat'],
  'MW': ['mature weight', 'mw', 'mature wt'],
  'MH': ['mature height', 'mh', 'mature ht'],
  '$EN': ['energy', '$en', 'energy $'],
  'CW': ['carcass weight', 'cw', 'carcass wt'],
  'MARB': ['marbling', 'marb'],
  'RE': ['ribeye area', 're', 'ribeye'],
  'FAT': ['fat thickness', 'fat'],
  '$M': ['marbling $', '$m', 'marbling value'],
  '$B': ['beef value', '$b', 'beef $'],
  '$C': ['carcass value', '$c', 'carcass $']
};

/**
 * Percent rank patterns
 */
const PERCENT_RANK_PATTERNS = ['percentile', 'percent rank', 'percentrank', 'rank', '%', 'pr', 'pct'];

/**
 * Parse Excel file (.xlsx)
 */
async function parseExcelFile(filePath) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    // Use first worksheet
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('Excel file has no worksheets');
    }
    
    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      const rowData = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // Get cell value, handling formulas
        let value = cell.value;
        if (value && typeof value === 'object' && value.result !== undefined) {
          value = value.result; // Formula result
        }
        // Convert dates to ISO strings
        if (value instanceof Date) {
          value = value.toISOString().split('T')[0];
        }
        rowData.push(value !== null && value !== undefined ? String(value) : '');
      });
      rows.push(rowData);
    });
    
    if (rows.length === 0) {
      throw new Error('Excel file is empty');
    }
    
    // First row is headers
    const headers = rows[0];
    const dataRows = rows.slice(1);
    
    return { headers, rows: dataRows };
  } catch (error) {
    throw new Error(`Error parsing Excel file: ${error.message}`);
  }
}

/**
 * Detect CSV delimiter
 */
function detectDelimiter(content) {
  const delimiters = [',', '\t', ';', '|'];
  const counts = {};
  
  // Sample first 5 lines
  const lines = content.split('\n').slice(0, 5).filter(l => l.trim());
  
  for (const delim of delimiters) {
    counts[delim] = 0;
    for (const line of lines) {
      const matches = (line.match(new RegExp(`\\${delim}`, 'g')) || []).length;
      counts[delim] += matches;
    }
  }
  
  // Return delimiter with highest count
  let maxCount = 0;
  let bestDelim = ',';
  for (const [delim, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      bestDelim = delim;
    }
  }
  
  return bestDelim;
}

/**
 * Parse CSV file
 */
function parseCSVFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const delimiter = detectDelimiter(content);
    
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }
    
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
    const rows = lines.slice(1).map(line => {
      // Simple CSV parsing - handle quoted fields
      const values = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim()); // Last value
      
      return values.map(v => v.replace(/^["']|["']$/g, ''));
    });
    
    return { headers, rows };
  } catch (error) {
    throw new Error(`Error parsing CSV file: ${error.message}`);
  }
}

/**
 * Parse text file (tab or space delimited)
 */
function parseTextFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('Text file is empty');
    }
    
    // Try to detect delimiter (tab or multiple spaces)
    const firstLine = lines[0];
    const hasTabs = firstLine.includes('\t');
    const delimiter = hasTabs ? '\t' : /\s{2,}/; // Tab or 2+ spaces
    
    const headers = hasTabs 
      ? firstLine.split('\t').map(h => h.trim())
      : firstLine.split(/\s{2,}/).map(h => h.trim());
    
    const rows = lines.slice(1).map(line => {
      if (hasTabs) {
        return line.split('\t').map(v => v.trim());
      } else {
        return line.split(/\s{2,}/).map(v => v.trim());
      }
    });
    
    return { headers, rows };
  } catch (error) {
    throw new Error(`Error parsing text file: ${error.message}`);
  }
}

/**
 * Parse external file based on extension
 */
async function parseExternalFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.xlsx' || ext === '.xls') {
    return await parseExcelFile(filePath);
  } else if (ext === '.csv') {
    return parseCSVFile(filePath);
  } else if (ext === '.txt' || ext === '.tsv') {
    return parseTextFile(filePath);
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }
}

/**
 * Fuzzy match column name to pattern
 */
function fuzzyMatch(columnName, patterns) {
  const normalized = columnName.toLowerCase().trim();
  
  for (const pattern of patterns) {
    if (normalized === pattern.toLowerCase()) {
      return true;
    }
    if (normalized.includes(pattern.toLowerCase()) || pattern.toLowerCase().includes(normalized)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Auto-detect column mappings
 */
function autoDetectColumnMappings(headers, sampleRows) {
  const mappings = {
    registrationNumber: null,
    animalName: null,
    sex: null,
    epdTraits: {},
    percentRanks: {}
  };
  
  // Normalize headers for matching
  const normalizedHeaders = headers.map((h, idx) => ({
    original: h,
    normalized: h.toLowerCase().trim(),
    index: idx
  }));
  
  // Find registration number
  const regPatterns = ['registration', 'reg', 'id', 'registration number', 'reg num', 'regno', 'reg#', 'animal id'];
  for (const header of normalizedHeaders) {
    if (fuzzyMatch(header.normalized, regPatterns)) {
      mappings.registrationNumber = header.index;
      break;
    }
  }
  
  // Find animal name
  const namePatterns = ['name', 'animal name', 'call name', 'animal', 'cow name', 'bull name'];
  for (const header of normalizedHeaders) {
    if (fuzzyMatch(header.normalized, namePatterns) && mappings.animalName === null) {
      mappings.animalName = header.index;
      break;
    }
  }
  
  // Find sex
  const sexPatterns = ['sex', 'gender', 'bull/cow', 'type'];
  for (const header of normalizedHeaders) {
    if (fuzzyMatch(header.normalized, sexPatterns)) {
      mappings.sex = header.index;
      break;
    }
  }
  
  // Find EPD traits
  for (const [trait, patterns] of Object.entries(EPD_TRAIT_PATTERNS)) {
    for (const header of normalizedHeaders) {
      const headerLower = header.normalized;
      // Check if header contains trait code or any pattern
      if (headerLower === trait.toLowerCase() || 
          headerLower.includes(trait.toLowerCase()) ||
          patterns.some(p => headerLower.includes(p))) {
        mappings.epdTraits[trait] = header.index;
        break;
      }
    }
  }
  
  // Find percent ranks (look for trait + percent rank pattern)
  for (const [trait, patterns] of Object.entries(EPD_TRAIT_PATTERNS)) {
    for (const header of normalizedHeaders) {
      const headerLower = header.normalized;
      // Check for percent rank patterns combined with trait
      if (PERCENT_RANK_PATTERNS.some(pr => headerLower.includes(pr)) &&
          (headerLower.includes(trait.toLowerCase()) || 
           patterns.some(p => headerLower.includes(p)))) {
        mappings.percentRanks[trait] = header.index;
        break;
      }
    }
  }
  
  return mappings;
}

/**
 * Convert mapped data to bulk file format
 */
function mapToBulkFileFormat(mappedData, columnMappings, metadata) {
  const animals = [];
  const registrationNumbers = new Set();
  
  for (const row of mappedData.rows) {
    // Get registration number (required)
    const regNumIndex = columnMappings.registrationNumber;
    if (regNumIndex === null || regNumIndex === undefined) {
      continue; // Skip rows without registration number
    }
    
    const registrationNumber = String(row[regNumIndex] || '').trim();
    if (!registrationNumber) {
      continue; // Skip empty registration numbers
    }
    
    // Check for duplicates
    if (registrationNumbers.has(registrationNumber)) {
      console.warn(`[PARSER] Duplicate registration number found: ${registrationNumber}`);
      continue;
    }
    registrationNumbers.add(registrationNumber);
    
    // Build animal data object
    const animalData = {
      registrationNumber: registrationNumber
    };
    
    // Add animal name if mapped
    if (columnMappings.animalName !== null && columnMappings.animalName !== undefined) {
      const name = String(row[columnMappings.animalName] || '').trim();
      if (name) {
        animalData.animalName = name;
      }
    }
    
    // Add sex if mapped
    if (columnMappings.sex !== null && columnMappings.sex !== undefined) {
      const sex = String(row[columnMappings.sex] || '').trim();
      if (sex) {
        animalData.sex = sex;
      }
    }
    
    // Build EPD values
    const epdValues = {};
    for (const [trait, colIndex] of Object.entries(columnMappings.epdTraits)) {
      if (colIndex !== null && colIndex !== undefined) {
        const epdValue = String(row[colIndex] || '').trim();
        if (epdValue) {
          // Handle incomplete EPDs (values starting with "I" or "i")
          let epd = epdValue;
          if (!epdValue.startsWith('I') && !epdValue.startsWith('i')) {
            // Try to parse as number
            const numValue = parseFloat(epdValue);
            if (!isNaN(numValue)) {
              epd = String(numValue);
            }
          }
          
          epdValues[trait] = { epd };
          
          // Add percent rank if mapped
          if (columnMappings.percentRanks[trait] !== null && 
              columnMappings.percentRanks[trait] !== undefined) {
            const prValue = String(row[columnMappings.percentRanks[trait]] || '').trim();
            if (prValue) {
              // Try to parse as number (handle both percentage and decimal)
              let prNum = parseFloat(prValue);
              if (!isNaN(prNum)) {
                // If value is > 1, assume it's a percentage (e.g., 75 for 75%)
                // If value is <= 1, assume it's already a decimal (e.g., 0.75)
                if (prNum > 1) {
                  prNum = prNum / 100;
                }
                epdValues[trait].percentRank = Math.round(prNum * 100); // Store as integer percentage
              }
            }
          }
        }
      }
    }
    
    if (Object.keys(epdValues).length > 0) {
      animalData.epdValues = epdValues;
    }
    
    // Store additional unmapped columns in additionalInfo
    const additionalInfo = {};
    for (let i = 0; i < row.length; i++) {
      // Skip mapped columns
      if (i === columnMappings.registrationNumber ||
          i === columnMappings.animalName ||
          i === columnMappings.sex ||
          Object.values(columnMappings.epdTraits).includes(i) ||
          Object.values(columnMappings.percentRanks).includes(i)) {
        continue;
      }
      
      const header = mappedData.headers[i];
      const value = String(row[i] || '').trim();
      if (header && value) {
        additionalInfo[header] = value;
      }
    }
    
    if (Object.keys(additionalInfo).length > 0) {
      animalData.additionalInfo = additionalInfo;
    }
    
    // Create animal object
    const animal = {
      registrationNumber: registrationNumber,
      data: animalData,
      cachedAt: new Date().toISOString(),
      category: metadata.category || 'My Herd'
    };
    
    animals.push(animal);
  }
  
  // Create bulk file structure
  const bulkFile = {
    version: metadata.version || '1.0.0',
    lastUpdated: new Date().toISOString(),
    source: 'external',
    metadata: {
      type: metadata.type || 'bulk-file',
      description: metadata.description || 'Imported from external data file',
      animalCount: animals.length,
      category: metadata.category || null
    },
    animals: animals
  };
  
  return bulkFile;
}

module.exports = {
  parseExternalFile,
  autoDetectColumnMappings,
  mapToBulkFileFormat
};

