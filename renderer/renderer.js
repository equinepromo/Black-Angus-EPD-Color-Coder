let scrapedData = [];
let colorCriteria = null;

// Define the trait order - only traits in this list will be color coded
const traitOrder = [
  'CED', 'BW', 'WW', 'YW', 'RADG', 'DMI', 'YH', 'SC', 'DOC', 'CLAW',
  'ANGLE', 'PAP', 'HS', 'HP', 'CEM', 'MILK', 'TEAT', 'UDDR', 'FL',
  'MW', 'MH', '$EN', 'CW', 'MARB', 'RE', 'FAT', '$M', '$B', '$C'
];

// Traits that get enhanced color coding (black/white for better than top 1%)
const enhancedColorTraits = ['CED', 'BW', 'WW', 'YW', 'RADG', 'DOC', 'CLAW', 'ANGLE', 'HS', 'HP', 'CEM', 'MARB', 'RE', '$M', '$B', '$C'];

// Trait direction: true = higher is better, false = lower is better
const traitDirection = {
  'CED': true, 'BW': false, 'WW': true, 'YW': true, 'RADG': true, 'DOC': true,
  'CLAW': false, 'ANGLE': false, 'HS': false, 'HP': true, 'CEM': true,
  'MARB': true, 'RE': true, '$M': true, '$B': true, '$C': true
};

// DOM elements
const registrationInput = document.getElementById('registration-input');
const scrapeBtn = document.getElementById('scrape-btn');
const copyTableBtn = document.getElementById('copy-table-btn');
const exportExcelBtn = document.getElementById('export-excel-btn');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const progressSection = document.getElementById('progress-section');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const mainResultsContainer = document.getElementById('main-results-container');
const matingResultsContainer = document.getElementById('mating-results-container');
const sireInput = document.getElementById('sire-input');
const damInput = document.getElementById('dam-input');
const sireDropdown = document.getElementById('sire-dropdown');
const damDropdown = document.getElementById('dam-dropdown');
const calculateMatingBtn = document.getElementById('calculate-mating-btn');

// Load color criteria on page load
window.electronAPI.getColorCriteria().then(criteria => {
  colorCriteria = criteria;
}).catch(err => {
  console.error('Error loading color criteria:', err);
});

// Load and populate cached animals dropdowns
async function loadCachedAnimals() {
  try {
    const animals = await window.electronAPI.getCachedAnimals();
    
    // Filter animals by sex
    // Bulls/Males/Steers for sire dropdown
    const bulls = animals.filter(animal => {
      const sex = (animal.sex || '').toUpperCase();
      return sex === 'BULL' || sex === 'MALE' || sex === 'STEER' || sex.includes('BULL') || sex.includes('MALE');
    });
    
    // Cows/Females/Heifers for dam dropdown
    const cows = animals.filter(animal => {
      const sex = (animal.sex || '').toUpperCase();
      return sex === 'COW' || sex === 'FEMALE' || sex === 'HEIFER' || sex.includes('COW') || sex.includes('FEMALE');
    });
    
    // Populate sire dropdown (only bulls/males)
    if (sireDropdown) {
      sireDropdown.innerHTML = '<option value="">Select from cached bulls...</option>';
      bulls.forEach(animal => {
        const option = document.createElement('option');
        option.value = animal.registrationNumber;
        const displayText = animal.animalName 
          ? `${animal.animalName} (${animal.registrationNumber})`
          : animal.registrationNumber;
        option.textContent = displayText;
        sireDropdown.appendChild(option);
      });
      
      if (bulls.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No bulls in cache';
        option.disabled = true;
        sireDropdown.appendChild(option);
      }
    }
    
    // Populate dam dropdown (only cows/females)
    if (damDropdown) {
      damDropdown.innerHTML = '<option value="">Select from cached cows...</option>';
      cows.forEach(animal => {
        const option = document.createElement('option');
        option.value = animal.registrationNumber;
        const displayText = animal.animalName 
          ? `${animal.animalName} (${animal.registrationNumber})`
          : animal.registrationNumber;
        option.textContent = displayText;
        damDropdown.appendChild(option);
      });
      
      if (cows.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No cows in cache';
        option.disabled = true;
        damDropdown.appendChild(option);
      }
    }
    
    console.log(`[UI] Loaded ${animals.length} cached animals into dropdowns`);
  } catch (error) {
    console.error('Error loading cached animals:', error);
  }
}

// Load cached animals on page load
loadCachedAnimals();

// Reload cached animals after successful scraping (so new animals appear in dropdown)
// We'll hook into the scrape button's success handler instead

// Listen for progress updates
window.electronAPI.onScrapeProgress((data) => {
  updateProgress(data.completed, data.total, data.current);
});

// Listen for mating calculator progress updates
window.electronAPI.onMatingProgress((data) => {
  showMatingProgress(data.step, data.total, data.message);
});

// Process button
scrapeBtn.addEventListener('click', async () => {
  const input = registrationInput.value.trim();
  if (!input) {
    alert('Please enter at least one registration number');
    return;
  }

  // Parse input - support comma or newline separated
  const registrationNumbers = input
    .split(/[,\n]/)
    .map(num => num.trim())
    .filter(num => num.length > 0);

  if (registrationNumbers.length === 0) {
    alert('Please enter at least one valid registration number');
    return;
  }

  scrapeBtn.disabled = true;
  mainResultsContainer.innerHTML = '';
  scrapedData = [];
  showProgress(0, registrationNumbers.length);

  try {
    let results;
    if (registrationNumbers.length === 1) {
      // Single scrape
      const result = await window.electronAPI.scrapeEPD(registrationNumbers[0]);
      results = [{
        registrationNumber: registrationNumbers[0],
        ...result
      }];
    } else {
      // Batch scrape
      results = await window.electronAPI.scrapeBatch(registrationNumbers);
    }

    scrapedData = results;
    // Await displayResults so progress bar is managed correctly
    await displayResults(results);
    copyTableBtn.disabled = false;
    exportExcelBtn.disabled = results.length === 0;
    
    // Only reload cached animals dropdowns if new data was actually scraped (not from cache)
    // This avoids expensive file I/O when using cached data
    const hasNewData = results.some(r => r.success && r.data && r.data._fromCache === false);
    if (hasNewData) {
      // Use setTimeout to make it non-blocking and not delay the UI update
      setTimeout(() => {
        loadCachedAnimals().catch(err => {
          console.error('Error reloading cached animals:', err);
        });
      }, 0);
    }
  } catch (error) {
    alert('Error during scraping: ' + error.message);
    hideProgress();
  } finally {
    scrapeBtn.disabled = false;
    // Don't hide progress here - let displayResults manage it since it needs to fetch percentile data
  }
});

// Sire dropdown selection
if (sireDropdown) {
  sireDropdown.addEventListener('change', (e) => {
    if (e.target.value) {
      sireInput.value = e.target.value;
      sireDropdown.value = ''; // Reset dropdown after selection
    }
  });
}

// Dam dropdown selection
if (damDropdown) {
  damDropdown.addEventListener('change', (e) => {
    if (e.target.value) {
      damInput.value = e.target.value;
      damDropdown.value = ''; // Reset dropdown after selection
    }
  });
}

// Mating Calculator button
calculateMatingBtn.addEventListener('click', async () => {
  const sireRegNum = sireInput.value.trim();
  const damRegNum = damInput.value.trim();

  if (!sireRegNum || !damRegNum) {
    alert('Please enter both sire and dam registration numbers');
    return;
  }

  calculateMatingBtn.disabled = true;
  calculateMatingBtn.textContent = 'Calculating...';
  showMatingProgress(0, 5, 'Starting...');

  try {
    const result = await window.electronAPI.calculateMating(sireRegNum, damRegNum);
    
    if (result.success) {
      displayMatingResults(result.data);
    } else {
      alert('Error calculating mating: ' + result.error);
    }
  } catch (error) {
    alert('Error during calculation: ' + error.message);
  } finally {
    calculateMatingBtn.disabled = false;
    calculateMatingBtn.textContent = 'Calculate';
    hideMatingProgress();
  }
});

function showProgress(completed, total) {
  progressSection.style.display = 'block';
  updateProgress(completed, total);
}

function updateProgress(completed, total, current) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  progressFill.style.width = `${percentage}%`;
  
  if (current) {
    progressText.textContent = `Processing: ${current} (${completed} of ${total} completed)`;
  } else {
    progressText.textContent = `${completed} of ${total} completed`;
  }
}

function hideProgress() {
  progressSection.style.display = 'none';
}

// Mating calculator progress
const matingProgressSection = document.getElementById('mating-progress-section');
const matingProgressFill = document.getElementById('mating-progress-fill');
const matingProgressText = document.getElementById('mating-progress-text');

function showMatingProgress(step, total, message) {
  if (!matingProgressSection) return;
  matingProgressSection.style.display = 'block';
  const percentage = (step / total) * 100;
  if (matingProgressFill) {
    matingProgressFill.style.width = `${percentage}%`;
  }
  if (matingProgressText) {
    matingProgressText.textContent = message || `Step ${step} of ${total}`;
  }
}

function hideMatingProgress() {
  if (matingProgressSection) {
    matingProgressSection.style.display = 'none';
  }
}

// Get color for a trait based on % rank
// Only applies colors to traits in the traitOrder list
// Optional parameters: epdValue (number), percentileData (object), animalType ('bull' or 'cow')
function getColorForTrait(traitName, percentRank, epdValue = null, percentileData = null, animalType = 'bull') {
  // If trait is not in the predefined list, return default (no color coding)
  if (!traitOrder.includes(traitName)) {
    return { bgColor: '#FFFFFF', textColor: '#000000', noColorCode: true };
  }

  if (!colorCriteria || !traitName || !percentRank || percentRank === 'N/A') {
    return { bgColor: '#808080', textColor: '#000000' };
  }

  const rank = typeof percentRank === 'string' ? parseInt(percentRank, 10) : percentRank;
  if (isNaN(rank) || rank < 1 || rank > 100) {
    return { bgColor: '#808080', textColor: '#000000' };
  }

  // Check if this trait should get enhanced color coding and if value is better than top 1%
  if (enhancedColorTraits.includes(traitName) && rank >= 1 && rank <= 10 && epdValue !== null && percentileData) {
    // Get the 1st percentile threshold
    const normalizedTrait = traitName.toUpperCase();
    const traitPercentiles = percentileData[normalizedTrait];
    
    if (traitPercentiles && traitPercentiles.length > 0) {
      // Find the 1st percentile entry
      const firstPercentileEntry = traitPercentiles.find(entry => entry.percentile === 1);
      const threshold = firstPercentileEntry ? firstPercentileEntry.epdValue : traitPercentiles[0].epdValue;
      
      if (threshold !== null && threshold !== undefined) {
        const isHigherBetter = traitDirection[traitName] !== false; // Default to true if not specified
        
        // Check if EPD value is better than threshold
        const isBetter = isHigherBetter ? (epdValue > threshold) : (epdValue < threshold);
        
        if (isBetter) {
          // Return black background with white text for better-than-top-1%
          return { bgColor: '#000000', textColor: '#FFFFFF' };
        }
      }
    }
  }

  const traitCriteria = colorCriteria[traitName];
  if (!traitCriteria || !traitCriteria.ranges) {
    return { bgColor: '#808080', textColor: '#000000' };
  }

  for (const range of traitCriteria.ranges) {
    if (rank >= range.min && rank <= range.max) {
      return {
        bgColor: range.bgColor,
        textColor: range.textColor
      };
    }
  }

  return { bgColor: '#808080', textColor: '#000000' };
}

async function displayResults(results) {
  mainResultsContainer.innerHTML = '';

  // Remove internal flags from data before displaying
  results = results.map(r => {
    if (r.success && r.data && r.data._fromCache !== undefined) {
      const { _fromCache, ...dataWithoutFlag } = r.data;
      return { ...r, data: dataWithoutFlag };
    }
    return r;
  });

  // Show progress while fetching percentile data
  // Make sure progress bar is visible and update it
  if (progressSection && progressFill && progressText) {
    progressSection.style.display = 'block';
    progressFill.style.width = '50%';
    progressText.textContent = 'Fetching percentile data...';
  }

  // Fetch percentile data for bulls and cows (fetch both in parallel)
  let bullPercentileData = null;
  let cowPercentileData = null;
  try {
    [bullPercentileData, cowPercentileData] = await Promise.all([
      window.electronAPI.getPercentileData('bull'),
      window.electronAPI.getPercentileData('cow')
    ]);
  } catch (error) {
    console.error('Error fetching percentile data:', error);
    // Continue without percentile data - will fall back to normal color coding
  }
  
  // Update progress to show we're processing results
  if (progressSection && progressFill && progressText) {
    progressFill.style.width = '80%';
    progressText.textContent = 'Processing results...';
  }

  // Show errors first if any
  const errors = results.filter(r => !r.success || (r.success && (!r.data || !r.data.epdValues)));
  if (errors.length > 0) {
    const errorContainer = document.createElement('div');
    errorContainer.style.marginBottom = '20px';
    errors.forEach(error => {
      const errorMsg = document.createElement('p');
      errorMsg.style.color = '#dc3545';
      errorMsg.style.margin = '5px 0';
      const regNum = error.registrationNumber || 'Unknown';
      const errorText = error.error || 'No EPD data found';
      errorMsg.textContent = `${regNum}: ${errorText}`;
      errorContainer.appendChild(errorMsg);
    });
    mainResultsContainer.appendChild(errorContainer);
  }

  // Filter to only successful results with EPD data
  const validResults = results.filter(r => r.success && r.data && r.data.epdValues);

  if (validResults.length === 0) {
    const noDataMsg = document.createElement('p');
    noDataMsg.style.color = '#dc3545';
    noDataMsg.textContent = 'No valid EPD data found. ' + (errors.length > 0 ? 'See errors above.' : 'Please check the registration number and try again.');
    mainResultsContainer.appendChild(noDataMsg);
    return;
  }

  // Get all unique traits
  const allTraits = new Set();
  validResults.forEach(result => {
    if (result.data.epdValues) {
      Object.keys(result.data.epdValues).forEach(trait => allTraits.add(trait));
    }
  });

  // Use the predefined trait order (already defined at top of file)

  // Sort traits according to the predefined order
  const sortedTraits = Array.from(allTraits).sort((a, b) => {
    const indexA = traitOrder.indexOf(a);
    const indexB = traitOrder.indexOf(b);
    
    // If both are in the order, sort by their position
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    // If only A is in the order, A comes first
    if (indexA !== -1) return -1;
    // If only B is in the order, B comes first
    if (indexB !== -1) return 1;
    // If neither is in the order, sort alphabetically
    return a.localeCompare(b);
  });

  // Create color-coded table
  const table = document.createElement('table');
  table.id = 'epd-data-table';
  table.className = 'epd-table';
  table.style.borderCollapse = 'collapse';
  table.style.width = '100%';
  table.style.marginTop = '20px';

  // Create header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.style.backgroundColor = '#E0E0E0';
  headerRow.style.fontWeight = 'bold';
  headerRow.setAttribute('bgcolor', '#E0E0E0'); // Excel compatibility

  // Define additional info columns (before EPD traits)
  const additionalInfoColumns = ['Name', 'Sire', 'Dam', 'MGS', 'BD', 'Tattoo'];
  const headers = ['Registration Number', ...additionalInfoColumns, ...sortedTraits];
  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '8px';
    th.style.border = '1px solid #000';
    th.style.textAlign = 'center';
    th.setAttribute('bgcolor', '#E0E0E0'); // Excel compatibility
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create body
  const tbody = document.createElement('tbody');
  validResults.forEach(result => {
    const row = document.createElement('tr');
    
    // Registration Number
    const regNumCell = document.createElement('td');
    regNumCell.textContent = result.registrationNumber || '';
    regNumCell.style.padding = '8px';
    regNumCell.style.border = '1px solid #000';
    regNumCell.style.textAlign = 'center';
    row.appendChild(regNumCell);

    // Additional info columns
    const additionalInfoMap = {
      'Name': result.data.animalName || '',
      'Sire': result.data.additionalInfo?.sire || '',
      'Dam': result.data.additionalInfo?.dam || '',
      'MGS': result.data.additionalInfo?.mgs || '',
      'BD': result.data.additionalInfo?.birthDate || '',
      'Tattoo': result.data.additionalInfo?.tattoo || ''
    };
    
    additionalInfoColumns.forEach(columnName => {
      const cell = document.createElement('td');
      cell.textContent = additionalInfoMap[columnName] || '';
      cell.style.padding = '8px';
      cell.style.border = '1px solid #000';
      cell.style.textAlign = 'center';
      cell.style.backgroundColor = '#FFFFFF';
      cell.style.color = '#000000';
      // Set bgcolor attribute for Excel compatibility
      cell.setAttribute('bgcolor', '#FFFFFF');
      row.appendChild(cell);
    });

    // Trait values
    sortedTraits.forEach(trait => {
      const cell = document.createElement('td');
      const traitData = result.data.epdValues[trait];
      
      if (traitData) {
        // Format EPD to 2 decimal places
        let epd = traitData.epd || 'N/A';
        if (epd !== 'N/A' && typeof epd === 'string') {
          // Remove "I" prefix if present (inferred value)
          const cleanedEPD = epd.replace(/^I\s*/i, '').trim();
          const epdNum = parseFloat(cleanedEPD);
          if (!isNaN(epdNum)) {
            // Preserve sign (+ or -) and format to 2 decimals
            const sign = epdNum >= 0 ? '+' : '';
            epd = sign + epdNum.toFixed(2);
          }
        }
        const rank = traitData.percentRank || 'N/A';
        cell.textContent = `${epd} (${rank}%)`;
        
        // Determine animal type and get appropriate percentile data
        const sex = (result.data.sex || '').toUpperCase();
        const isCow = sex === 'COW' || sex === 'FEMALE' || sex === 'HEIFER' || sex.includes('COW') || sex.includes('FEMALE');
        const animalType = isCow ? 'cow' : 'bull';
        const percentileData = isCow ? cowPercentileData : bullPercentileData;
        
        // Parse EPD value for enhanced color coding
        let epdValue = null;
        if (epd !== 'N/A' && typeof epd === 'string') {
          const cleanedEPD = epd.replace(/^I\s*/i, '').trim();
          const epdNum = parseFloat(cleanedEPD);
          if (!isNaN(epdNum)) {
            epdValue = epdNum;
          }
        }
        
        // Apply color coding only if trait is in the predefined list
        const colors = getColorForTrait(trait, rank, epdValue, percentileData, animalType);
        cell.style.backgroundColor = colors.bgColor;
        cell.style.color = colors.textColor;
        // Set bgcolor attribute for Excel compatibility (Excel reads this better than CSS)
        const bgColorHex = rgbToHex(colors.bgColor);
        cell.setAttribute('bgcolor', bgColorHex);
      } else {
        cell.textContent = 'N/A';
        // Use white background for traits not in the list
        const isInList = traitOrder.includes(trait);
        const bgColor = isInList ? '#808080' : '#FFFFFF';
        cell.style.backgroundColor = bgColor;
        cell.style.color = '#000000';
        // Set bgcolor attribute for Excel compatibility
        cell.setAttribute('bgcolor', rgbToHex(bgColor));
      }
      
      cell.style.padding = '8px';
      cell.style.border = '1px solid #000';
      cell.style.textAlign = 'center';
      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  mainResultsContainer.appendChild(table);

  // Show errors if any
  const errorResults = results.filter(r => !r.success);
  if (errorResults.length > 0) {
    const errorDiv = document.createElement('div');
    errorDiv.style.marginTop = '20px';
    errorDiv.style.padding = '10px';
    errorDiv.style.backgroundColor = '#FFE0E0';
    errorDiv.style.border = '1px solid #FF0000';
    errorDiv.innerHTML = '<h4>Errors:</h4>';
    errorResults.forEach(result => {
      const errorP = document.createElement('p');
      errorP.textContent = `${result.registrationNumber}: ${result.error}`;
      errorDiv.appendChild(errorP);
    });
    mainResultsContainer.appendChild(errorDiv);
  }

  // Update progress to 100% and hide after all processing is complete
  if (progressSection) {
    progressFill.style.width = '100%';
    progressText.textContent = 'Complete';
    // Small delay to show completion before hiding
    setTimeout(() => {
      hideProgress();
    }, 300);
  } else {
    hideProgress();
  }
}

async function displayMatingResults(data) {
  // Clear existing results
  matingResultsContainer.innerHTML = '';

  // Fetch percentile data for bulls and cows (fetch both in parallel)
  let bullPercentileData = null;
  let cowPercentileData = null;
  try {
    [bullPercentileData, cowPercentileData] = await Promise.all([
      window.electronAPI.getPercentileData('bull'),
      window.electronAPI.getPercentileData('cow')
    ]);
  } catch (error) {
    console.error('Error fetching percentile data for mating results:', error);
    // Continue without percentile data - will fall back to normal color coding
  }

  const matingSection = document.createElement('div');
  matingSection.id = 'mating-results-section';

  // Header with sire and dam info
  const header = document.createElement('div');
  header.style.marginBottom = '20px';
  header.innerHTML = `
    <h3>Mating Calculation Results</h3>
    <p><strong>Sire:</strong> ${data.sire.registrationNumber} - ${data.sire.animalName || 'N/A'}</p>
    <p><strong>Dam:</strong> ${data.dam.registrationNumber} - ${data.dam.animalName || 'N/A'}</p>
  `;
  matingSection.appendChild(header);

  // Get all traits from calculated EPDs and sort them
  const allTraits = Object.keys(data.calculatedEPDs || {});
  const sortedTraits = allTraits.sort((a, b) => {
    const indexA = traitOrder.indexOf(a);
    const indexB = traitOrder.indexOf(b);
    
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });

  if (sortedTraits.length === 0) {
    matingSection.innerHTML += '<p style="color: #dc3545;">No calculated EPD data available.</p>';
    matingResultsContainer.appendChild(matingSection);
    return;
  }

  // Create table
  const table = document.createElement('table');
  table.className = 'epd-table';
  table.style.borderCollapse = 'collapse';
  table.style.width = '100%';
  table.style.marginTop = '20px';

  // Header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.style.backgroundColor = '#E0E0E0';
  headerRow.style.fontWeight = 'bold';

  const headers = ['Trait', 'Sire EPD', 'Dam EPD', 'Expected EPD', 'Est. % Rank'];
  headers.forEach(headerText => {
    const th = document.createElement('th');
    th.textContent = headerText;
    th.style.padding = '8px';
    th.style.border = '1px solid #000';
    th.style.textAlign = 'center';
    th.setAttribute('bgcolor', '#E0E0E0'); // Excel compatibility
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');

  sortedTraits.forEach(trait => {
    const row = document.createElement('tr');
    const calcData = data.calculatedEPDs[trait];

    // Trait name
    const traitCell = document.createElement('td');
    traitCell.textContent = trait;
    traitCell.style.padding = '8px';
    traitCell.style.border = '1px solid #000';
    traitCell.style.textAlign = 'center';
    traitCell.style.fontWeight = 'bold';
    row.appendChild(traitCell);

    // Sire EPD (format to 2 decimal places and color code)
    const sireCell = document.createElement('td');
    let sireDisplay = 'N/A';
    const sireEPDData = data.sire.epdValues?.[trait];
    const sirePercentRank = sireEPDData?.percentRank;
    
    if (calcData.sireEPD && calcData.sireEPD !== 'N/A' && typeof calcData.sireEPD === 'string') {
      const cleanedEPD = calcData.sireEPD.replace(/^I\s*/i, '').trim();
      const sireNum = parseFloat(cleanedEPD);
      if (!isNaN(sireNum)) {
        const sign = sireNum >= 0 ? '+' : '';
        sireDisplay = sign + sireNum.toFixed(2);
      } else {
        sireDisplay = calcData.sireEPD;
      }
    }
    sireCell.textContent = sireDisplay;
    sireCell.style.padding = '8px';
    sireCell.style.border = '1px solid #000';
    sireCell.style.textAlign = 'center';
    
    // Apply color coding based on sire percentile rank (sire is always a bull)
    if (sirePercentRank !== null && sirePercentRank !== undefined && sirePercentRank !== 'N/A') {
      let sireEPDValue = null;
      if (sireDisplay !== 'N/A') {
        const sireNum = parseFloat(sireDisplay);
        if (!isNaN(sireNum)) {
          sireEPDValue = sireNum;
        }
      }
      const colors = getColorForTrait(trait, sirePercentRank.toString(), sireEPDValue, bullPercentileData, 'bull');
      sireCell.style.backgroundColor = colors.bgColor;
      sireCell.style.color = colors.textColor;
    } else {
      sireCell.style.backgroundColor = '#FFFFFF';
      sireCell.style.color = '#000000';
    }
    row.appendChild(sireCell);

    // Dam EPD (format to 2 decimal places and color code)
    const damCell = document.createElement('td');
    let damDisplay = 'N/A';
    const damEPDData = data.dam.epdValues?.[trait];
    const damPercentRank = damEPDData?.percentRank;
    
    if (calcData.damEPD && calcData.damEPD !== 'N/A' && typeof calcData.damEPD === 'string') {
      const cleanedEPD = calcData.damEPD.replace(/^I\s*/i, '').trim();
      const damNum = parseFloat(cleanedEPD);
      if (!isNaN(damNum)) {
        const sign = damNum >= 0 ? '+' : '';
        damDisplay = sign + damNum.toFixed(2);
      } else {
        damDisplay = calcData.damEPD;
      }
    }
    damCell.textContent = damDisplay;
    damCell.style.padding = '8px';
    damCell.style.border = '1px solid #000';
    damCell.style.textAlign = 'center';
    
    // Apply color coding based on dam percentile rank (dam is always a cow)
    if (damPercentRank !== null && damPercentRank !== undefined && damPercentRank !== 'N/A') {
      let damEPDValue = null;
      if (damDisplay !== 'N/A') {
        const damNum = parseFloat(damDisplay);
        if (!isNaN(damNum)) {
          damEPDValue = damNum;
        }
      }
      const colors = getColorForTrait(trait, damPercentRank.toString(), damEPDValue, cowPercentileData, 'cow');
      damCell.style.backgroundColor = colors.bgColor;
      damCell.style.color = colors.textColor;
    } else {
      damCell.style.backgroundColor = '#FFFFFF';
      damCell.style.color = '#000000';
    }
    row.appendChild(damCell);

    // Expected EPD (color-coded based on estimated percentile rank)
    const expectedCell = document.createElement('td');
    // Format EPD value to 2 decimal places
    let epdDisplay = 'N/A';
    if (calcData.epd && calcData.epd !== 'N/A' && typeof calcData.epd === 'string') {
      const cleanedEPD = calcData.epd.replace(/^I\s*/i, '').trim();
      const epdNum = parseFloat(cleanedEPD);
      if (!isNaN(epdNum)) {
        const sign = epdNum >= 0 ? '+' : '';
        epdDisplay = sign + epdNum.toFixed(2);
      } else {
        epdDisplay = calcData.epd;
      }
    }
    expectedCell.textContent = epdDisplay;
    expectedCell.style.padding = '8px';
    expectedCell.style.border = '1px solid #000';
    expectedCell.style.textAlign = 'center';

    // Apply color coding based on estimated percentile rank (expected calf uses bull data)
    const estimatedRank = calcData.estimatedPercentileRank;
    if (estimatedRank !== null && estimatedRank !== undefined && estimatedRank !== 'N/A') {
      let expectedEPDValue = null;
      if (epdDisplay !== 'N/A') {
        const epdNum = parseFloat(epdDisplay);
        if (!isNaN(epdNum)) {
          expectedEPDValue = epdNum;
        }
      }
      const colors = getColorForTrait(trait, estimatedRank.toString(), expectedEPDValue, bullPercentileData, 'bull');
      expectedCell.style.backgroundColor = colors.bgColor;
      expectedCell.style.color = colors.textColor;
    } else {
      // No color coding if percentile rank is not available
      expectedCell.style.backgroundColor = '#FFFFFF';
      expectedCell.style.color = '#000000';
    }
    row.appendChild(expectedCell);

    // Estimated % Rank
    const rankCell = document.createElement('td');
    rankCell.textContent = estimatedRank !== null && estimatedRank !== undefined ? `${estimatedRank}%` : 'N/A';
    rankCell.style.padding = '8px';
    rankCell.style.border = '1px solid #000';
    rankCell.style.textAlign = 'center';
    rankCell.style.backgroundColor = '#FFFFFF';
    rankCell.style.color = '#000000';
    row.appendChild(rankCell);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  matingSection.appendChild(table);
  matingResultsContainer.appendChild(matingSection);
}

// Helper function to convert RGB to hex for Excel compatibility
function rgbToHex(rgb) {
  if (!rgb) return '#FFFFFF';
  if (rgb.startsWith('#')) return rgb.toUpperCase();
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`.toUpperCase();
  }
  // Handle rgba
  const rgbaMatch = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`.toUpperCase();
  }
  return '#FFFFFF'; // Default to white
}

// Helper function to convert RGB to RTF color format (BGR order for RTF)
function rgbToRtfColor(rgb) {
  if (!rgb) return { r: 255, g: 255, b: 255 };
  if (rgb.startsWith('#')) {
    const r = parseInt(rgb.substring(1, 3), 16);
    const g = parseInt(rgb.substring(3, 5), 16);
    const b = parseInt(rgb.substring(5, 7), 16);
    return { r, g, b };
  }
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3])
    };
  }
  const rgbaMatch = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]),
      g: parseInt(rgbaMatch[2]),
      b: parseInt(rgbaMatch[3])
    };
  }
  return { r: 255, g: 255, b: 255 }; // Default to white
}

// Helper function to escape RTF text
function escapeRtf(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\n/g, '\\par ');
}

// Helper function to escape HTML text
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Update Management
const updateNotification = document.getElementById('update-notification');
const updateNotificationTitle = document.getElementById('update-notification-title');
const updateNotificationMessage = document.getElementById('update-notification-message');
const updateDownloadBtn = document.getElementById('update-download-btn');
const updateInstallBtn = document.getElementById('update-install-btn');
const updateDismissBtn = document.getElementById('update-dismiss-btn');
const updateProgressBar = document.getElementById('update-progress-bar');
const updateProgressFill = document.getElementById('update-progress-fill');
const updateProgressText = document.getElementById('update-progress-text');
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const appVersionSpan = document.getElementById('app-version');

// Load app version on startup
window.electronAPI.getAppVersion().then(result => {
  if (result && result.version) {
    appVersionSpan.textContent = result.version;
  }
}).catch(err => {
  console.error('Error getting app version:', err);
  appVersionSpan.textContent = 'Unknown';
});

// Check for updates button
if (checkUpdatesBtn) {
  checkUpdatesBtn.addEventListener('click', async () => {
    checkUpdatesBtn.disabled = true;
    checkUpdatesBtn.textContent = 'Checking...';
    try {
      await window.electronAPI.checkForUpdates(true);
    } catch (error) {
      console.error('Error checking for updates:', error);
      alert('Error checking for updates: ' + error.message);
    } finally {
      checkUpdatesBtn.disabled = false;
      checkUpdatesBtn.textContent = 'Check for Updates';
    }
  });
}

// Update available handler
window.electronAPI.onUpdateAvailable((data) => {
  console.log('Update available:', data);
  updateNotificationTitle.textContent = `Update Available: v${data.version}`;
  updateNotificationMessage.textContent = data.releaseNotes 
    ? `Release notes: ${data.releaseNotes.substring(0, 100)}${data.releaseNotes.length > 100 ? '...' : ''}`
    : `A new version (${data.version}) is available.`;
  updateDownloadBtn.style.display = 'inline-block';
  updateInstallBtn.style.display = 'none';
  updateProgressBar.style.display = 'none';
  updateNotification.style.display = 'block';
});

// Update not available handler
window.electronAPI.onUpdateNotAvailable((data) => {
  console.log('No update available:', data);
  // Show a brief message that user is up to date
  if (checkUpdatesBtn) {
    const originalText = checkUpdatesBtn.textContent;
    checkUpdatesBtn.textContent = 'Up to date!';
    checkUpdatesBtn.style.background = '#28a745';
    setTimeout(() => {
      checkUpdatesBtn.textContent = originalText;
      checkUpdatesBtn.style.background = '';
    }, 2000);
  }
});

// Update error handler
window.electronAPI.onUpdateError((data) => {
  console.error('Update error:', data);
  updateNotificationTitle.textContent = 'Update Check Failed';
  updateNotificationMessage.textContent = data.message || 'Unknown error occurred.';
  updateDownloadBtn.style.display = 'none';
  updateInstallBtn.style.display = 'none';
  updateProgressBar.style.display = 'none';
  updateNotification.style.display = 'block';
  updateNotification.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
});

// Download progress handler
window.electronAPI.onUpdateDownloadProgress((data) => {
  console.log('Download progress:', data.percent + '%');
  updateProgressBar.style.display = 'block';
  updateProgressFill.style.width = data.percent + '%';
  updateProgressText.textContent = `${data.percent}%`;
  
  // Format bytes
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };
  
  if (data.transferred && data.total) {
    updateProgressText.textContent = `${data.percent}% (${formatBytes(data.transferred)} / ${formatBytes(data.total)})`;
  }
});

// Update downloaded handler
window.electronAPI.onUpdateDownloaded((data) => {
  console.log('Update downloaded:', data);
  updateNotificationTitle.textContent = `Update Ready: v${data.version}`;
  updateNotificationMessage.textContent = 'The update has been downloaded and is ready to install. Click "Install & Restart" to apply the update.';
  updateDownloadBtn.style.display = 'none';
  updateInstallBtn.style.display = 'inline-block';
  updateProgressBar.style.display = 'none';
  updateNotification.style.display = 'block';
});

// Download update button
updateDownloadBtn.addEventListener('click', async () => {
  updateDownloadBtn.disabled = true;
  updateDownloadBtn.textContent = 'Downloading...';
  try {
    await window.electronAPI.downloadUpdate();
  } catch (error) {
    console.error('Error downloading update:', error);
    alert('Error downloading update: ' + error.message);
    updateDownloadBtn.disabled = false;
    updateDownloadBtn.textContent = 'Download Update';
  }
});

// Install update button
updateInstallBtn.addEventListener('click', async () => {
  if (confirm('The application will restart to install the update. Continue?')) {
    try {
      await window.electronAPI.installUpdate();
    } catch (error) {
      console.error('Error installing update:', error);
      alert('Error installing update: ' + error.message);
    }
  }
});

// Dismiss update notification
updateDismissBtn.addEventListener('click', () => {
  updateNotification.style.display = 'none';
});

// Clear cache button
clearCacheBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to clear all cached data? This will force the app to re-fetch all EPD data and percentile breakdowns on the next lookup.')) {
    return;
  }

  try {
    clearCacheBtn.disabled = true;
    clearCacheBtn.textContent = 'Clearing...';
    
    const result = await window.electronAPI.clearCache();
    
    if (result.success) {
      alert(`Cache cleared successfully! ${result.deletedCount || 0} file(s) deleted.`);
      clearCacheBtn.textContent = 'Clear Cache';
    } else {
      alert('Error clearing cache: ' + (result.error || 'Unknown error'));
      clearCacheBtn.textContent = 'Clear Cache';
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
    alert('Error clearing cache: ' + error.message);
    clearCacheBtn.textContent = 'Clear Cache';
  } finally {
    clearCacheBtn.disabled = false;
  }
});

// Copy table to clipboard
copyTableBtn.addEventListener('click', async () => {
  const table = document.getElementById('epd-data-table');
  if (!table) {
    alert('No table to copy');
    return;
  }

  try {
    // Excel is very difficult with clipboard colors
    // Try creating a temporary div with HTML string that has explicit Excel formatting
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '-9999px';
    
    // Build HTML string with explicit bgcolor attributes for Excel
    let htmlString = '<table border="1" cellpadding="5" cellspacing="0">';
    
    // Process header
    const headerRow = table.querySelector('thead tr');
    if (headerRow) {
      htmlString += '<thead><tr>';
      headerRow.querySelectorAll('th').forEach(th => {
        const bgColor = rgbToHex(window.getComputedStyle(th).backgroundColor);
        const textColor = rgbToHex(window.getComputedStyle(th).color);
        const text = th.textContent || '';
        htmlString += `<th bgcolor="${bgColor}" style="background-color: ${bgColor}; color: ${textColor}; border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold;">${escapeHtml(text)}</th>`;
      });
      htmlString += '</tr></thead>';
    }
    
    // Process data rows
    htmlString += '<tbody>';
    table.querySelectorAll('tbody tr').forEach(tr => {
      htmlString += '<tr>';
      tr.querySelectorAll('td').forEach(td => {
        const bgColor = rgbToHex(window.getComputedStyle(td).backgroundColor);
        const textColor = rgbToHex(window.getComputedStyle(td).color);
        const text = td.textContent || '';
        htmlString += `<td bgcolor="${bgColor}" style="background-color: ${bgColor}; color: ${textColor}; border: 1px solid #000; padding: 8px; text-align: center;">${escapeHtml(text)}</td>`;
      });
      htmlString += '</tr>';
    });
    htmlString += '</tbody></table>';
    
    tempDiv.innerHTML = htmlString;
    document.body.appendChild(tempDiv);
    
    // Select and copy
    const range = document.createRange();
    range.selectNodeContents(tempDiv);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Copy using execCommand
    const success = document.execCommand('copy');
    selection.removeAllRanges();
    
    // Clean up
    document.body.removeChild(tempDiv);
    
    if (!success) {
      throw new Error('execCommand copy failed');
    }

    // Show success feedback
    const originalText = copyTableBtn.textContent;
    copyTableBtn.textContent = 'Copied!';
    copyTableBtn.style.backgroundColor = '#28a745';
    setTimeout(() => {
      copyTableBtn.textContent = originalText;
      copyTableBtn.style.backgroundColor = '';
    }, 2000);
    
    // Note: Excel's clipboard HTML doesn't preserve background colors reliably.
    // For Excel with colors, use "Export to Excel" button instead.
  } catch (error) {
    console.error('Error copying table:', error);
    alert('Failed to copy table. Please try selecting the table manually and copying (Ctrl+C / Cmd+C).\n\nNote: For Excel with colors, use "Export to Excel" button.');
  }
});

// Export to Excel
exportExcelBtn.addEventListener('click', async () => {
  if (scrapedData.length === 0) {
    alert('No data to export');
    return;
  }

  exportExcelBtn.disabled = true;
  const originalText = exportExcelBtn.textContent;
  exportExcelBtn.textContent = 'Exporting...';

  try {
    console.log('Starting Excel export with data:', scrapedData);
    const result = await window.electronAPI.exportToExcel(scrapedData);
    console.log('Excel export result:', result);
    
    if (result && result.success) {
      alert(`Excel file saved successfully!\n${result.path}`);
    } else {
      const errorMsg = result?.error || 'Unknown error';
      console.error('Excel export failed:', errorMsg);
      alert(`Export failed: ${errorMsg}`);
    }
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    alert('Error exporting to Excel: ' + (error.message || String(error)));
  } finally {
    exportExcelBtn.disabled = false;
    exportExcelBtn.textContent = originalText;
  }
});

