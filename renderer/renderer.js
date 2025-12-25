let scrapedData = [];
let colorCriteria = null;

// Column visibility preferences storage
const COLUMN_VISIBILITY_STORAGE_KEY = 'epd-table-column-visibility';

function loadColumnVisibilityPreferences() {
  try {
    const saved = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('Error loading column visibility preferences:', error);
  }
  return {};
}

function saveColumnVisibilityPreferences(preferences) {
  try {
    localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Error saving column visibility preferences:', error);
  }
}

// Gate traits preferences storage
const GATE_TRAITS_STORAGE_KEY = 'gate-traits-selection';

function loadGateTraitsPreferences() {
  try {
    const saved = localStorage.getItem(GATE_TRAITS_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('Error loading gate traits preferences:', error);
  }
  return [];
}

function saveGateTraitsPreferences(selectedTraits) {
  try {
    localStorage.setItem(GATE_TRAITS_STORAGE_KEY, JSON.stringify(selectedTraits));
  } catch (error) {
    console.error('Error saving gate traits preferences:', error);
  }
}

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
const categorySelect = document.getElementById('category-select');

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

  // Get selected category
  const selectedCategory = categorySelect ? categorySelect.value : 'My Herd';

  try {
    let results;
    if (registrationNumbers.length === 1) {
      // Single scrape
      const result = await window.electronAPI.scrapeEPD(registrationNumbers[0], selectedCategory);
      results = [{
        registrationNumber: registrationNumbers[0],
        ...result
      }];
    } else {
      // Batch scrape - use selected category for all animals in batch
      results = await window.electronAPI.scrapeBatch(registrationNumbers, selectedCategory);
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

// Mating mode toggle
const matingModeSingle = document.getElementById('mating-mode-single');
const matingModeAll = document.getElementById('mating-mode-all');
const singleMatingMode = document.getElementById('single-mating-mode');
const allMatingsMode = document.getElementById('all-matings-mode');

let currentMatingMode = 'single'; // 'single' or 'all'

if (matingModeSingle && matingModeAll) {
  matingModeSingle.addEventListener('click', () => {
    currentMatingMode = 'single';
    singleMatingMode.style.display = 'block';
    allMatingsMode.style.display = 'none';
    matingModeSingle.className = 'btn btn-primary';
    matingModeAll.className = 'btn btn-secondary';
    // Clear all matings results when switching modes
    const allMatingsContainer = document.getElementById('all-matings-results-container');
    if (allMatingsContainer) {
      allMatingsContainer.innerHTML = '';
    }
    // Don't clear lastRankedResults - we need it for the back button
    // lastRankedResults = null;
  });
  
  matingModeAll.addEventListener('click', () => {
    currentMatingMode = 'all';
    singleMatingMode.style.display = 'none';
    allMatingsMode.style.display = 'block';
    matingModeSingle.className = 'btn btn-secondary';
    matingModeAll.className = 'btn btn-primary';
    // Clear single mating results when switching modes
    // But preserve All Matings results if they exist
    const allMatingsContainer = document.getElementById('all-matings-results-container');
    if (!allMatingsContainer || allMatingsContainer.innerHTML === '') {
      matingResultsContainer.innerHTML = '';
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

// Rank All Matings button
const rankAllMatingsBtn = document.getElementById('rank-all-matings-btn');
const topNSelect = document.getElementById('top-n-select');
const gateTraitsCheckboxesContainer = document.getElementById('gate-traits-checkboxes');
const gateFilterCheckbox = document.getElementById('gate-filter-checkbox');

// Store last ranked results for filtering
let lastRankedResults = null;

// Populate gate traits checkboxes with available traits
function populateGateTraitsCheckboxes() {
  if (!gateTraitsCheckboxesContainer) return;
  
  // Load saved preferences
  const savedTraits = loadGateTraitsPreferences();
  const savedSet = new Set(savedTraits);
  
  // Use the traitOrder array which contains all available traits
  gateTraitsCheckboxesContainer.innerHTML = '';
  traitOrder.forEach(trait => {
    const checkboxContainer = document.createElement('div');
    checkboxContainer.style.display = 'flex';
    checkboxContainer.style.alignItems = 'center';
    checkboxContainer.style.gap = '5px';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `gate-trait-${trait}`;
    checkbox.value = trait;
    checkbox.checked = savedSet.has(trait);
    checkbox.style.margin = '0';
    checkbox.style.cursor = 'pointer';
    
    const label = document.createElement('label');
    label.htmlFor = `gate-trait-${trait}`;
    label.textContent = trait;
    label.style.cursor = 'pointer';
    label.style.userSelect = 'none';
    label.style.margin = '0';
    
    // Save preferences when checkbox changes
    checkbox.addEventListener('change', () => {
      const selectedTraits = getSelectedGateTraits();
      saveGateTraitsPreferences(selectedTraits);
    });
    
    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(label);
    gateTraitsCheckboxesContainer.appendChild(checkboxContainer);
  });
}

// Get currently selected gate traits from checkboxes
function getSelectedGateTraits() {
  if (!gateTraitsCheckboxesContainer) return [];
  
  const checkboxes = gateTraitsCheckboxesContainer.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

// Initialize gate traits checkboxes on page load
populateGateTraitsCheckboxes();

if (rankAllMatingsBtn) {
  rankAllMatingsBtn.addEventListener('click', async () => {
    rankAllMatingsBtn.disabled = true;
    rankAllMatingsBtn.textContent = 'Ranking...';
    showMatingProgress(0, 6, 'Starting...');

    try {
      const topN = parseInt(topNSelect.value, 10) || 5;
      
      // Get selected gate traits from checkboxes
      const gateTraits = getSelectedGateTraits();
      
      // Get selected categories (default to "all" if not set)
      const sireCategorySelect = document.getElementById('sire-category-select');
      const cowCategorySelect = document.getElementById('cow-category-select');
      const sireCategory = sireCategorySelect ? sireCategorySelect.value : 'all';
      const cowCategory = cowCategorySelect ? cowCategorySelect.value : 'all';
      
      const config = {
        topN: topN,
        gateTraits: gateTraits, // Empty array if none selected
        sireCategory: sireCategory === 'all' ? null : sireCategory,
        cowCategory: cowCategory === 'all' ? null : cowCategory
      };
      
      const result = await window.electronAPI.rankAllMatings(config);
      
      if (result.success) {
        lastRankedResults = result.data;
        displayAllMatingsResults(result.data);
      } else {
        alert('Error ranking matings: ' + result.error);
      }
    } catch (error) {
      alert('Error during ranking: ' + error.message);
    } finally {
      rankAllMatingsBtn.disabled = false;
      rankAllMatingsBtn.textContent = 'Rank All Matings';
      hideMatingProgress();
    }
  });
}

// Gate filter checkbox - re-display results when toggled
if (gateFilterCheckbox) {
  gateFilterCheckbox.addEventListener('change', () => {
    if (lastRankedResults) {
      displayAllMatingsResults(lastRankedResults);
    }
  });
}

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
  // Only apply black color for rank <= 1 (top 1%)
  if (enhancedColorTraits.includes(traitName) && rank <= 1 && epdValue !== null && percentileData) {
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

/**
 * Scores a single animal using the shared scoring function from mating-ranker
 * @param {Object} animalData - Animal data object with epdValues
 * @param {string} animalType - 'bull' or 'cow'
 * @param {Array} gateTraits - Array of gate trait names (optional, defaults to empty)
 * @returns {Promise<number>} Final score
 */
async function scoreAnimal(animalData, animalType, gateTraits = []) {
  if (!animalData || !animalData.epdValues) {
    return 0;
  }
  
  // Extract EPD values from animal data
  const epdValues = {};
  for (const trait in animalData.epdValues) {
    const traitData = animalData.epdValues[trait];
    if (!traitData || !traitData.epd) {
      continue;
    }
    
    // Parse EPD value
    let epdStr = traitData.epd;
    if (typeof epdStr === 'string') {
      epdStr = epdStr.replace(/^I\s*/i, '').trim(); // Remove "I" prefix if present
    }
    const epdValue = parseFloat(epdStr);
    
    if (!isNaN(epdValue)) {
      epdValues[trait] = epdValue;
    }
  }
  
  // Call shared scoring function via IPC
  try {
    const result = await window.electronAPI.scoreAnimal(epdValues, animalType, gateTraits);
    return result.success ? result.score : 0;
  } catch (error) {
    console.error('Error scoring animal:', error);
    return 0;
  }
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

  // Calculate missing percentile ranks for cached animals (from bulk imports)
  await Promise.all(validResults.map(async (result) => {
    if (result.data.epdValues && result.registrationNumber) {
      // Check if any traits are missing percentile ranks
      const hasMissingRanks = Object.values(result.data.epdValues).some(traitData => 
        traitData.epd && (!traitData.percentRank || traitData.percentRank === 'N/A' || traitData.percentRank === null)
      );
      
      if (hasMissingRanks) {
        // Determine animal type
        const sex = (result.data.sex || '').toUpperCase();
        const isCow = sex === 'COW' || sex === 'FEMALE' || sex === 'HEIFER' || sex.includes('COW') || sex.includes('FEMALE');
        const animalType = isCow ? 'cow' : 'bull';
        
        try {
          console.log(`[UI] Calculating missing percentile ranks for ${result.registrationNumber} (${animalType})`);
          const rankResult = await window.electronAPI.calculatePercentileRanks(
            result.data.epdValues, 
            animalType, 
            result.registrationNumber, 
            true // saveToCache = true
          );
          if (rankResult.success && rankResult.updated) {
            result.data.epdValues = rankResult.epdValues;
            console.log(`[UI] Successfully calculated and saved percentile ranks for ${result.registrationNumber}`);
          }
        } catch (error) {
          console.error(`[UI] Error calculating percentile ranks:`, error);
          // Continue without percentile ranks - not a fatal error
        }
      }
    }
  }));

  // Get selected gate traits (if any) for scoring
  const gateTraits = getSelectedGateTraits();

  // Calculate scores for each animal (using shared scoring function)
  await Promise.all(validResults.map(async (result) => {
    const sex = (result.data.sex || '').toUpperCase();
    const isCow = sex === 'COW' || sex === 'FEMALE' || sex === 'HEIFER' || sex.includes('COW') || sex.includes('FEMALE');
    const animalType = isCow ? 'cow' : 'bull';
    
    result.score = await scoreAnimal(result.data, animalType, gateTraits);
  }));

  // Update scrapedData with scores so Excel export has them
  // Map the scores from validResults back to scrapedData by matching registration numbers
  validResults.forEach(result => {
    const matchingScraped = scrapedData.find(s => s.registrationNumber === result.registrationNumber);
    if (matchingScraped && result.score !== undefined) {
      matchingScraped.score = result.score;
    }
  });

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
  table.style.borderCollapse = 'separate';
  table.style.borderSpacing = '0';
  table.style.width = '100%';
  table.style.marginTop = '20px';

  // Create header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.style.backgroundColor = '#E0E0E0';
  headerRow.style.fontWeight = 'bold';
  headerRow.setAttribute('bgcolor', '#E0E0E0'); // Excel compatibility

  // Define additional info columns (Name first, then Registration Number, then others)
  const additionalInfoColumns = ['Sire', 'Dam', 'MGS', 'BD', 'Tattoo'];
  const headers = ['Name', 'Registration Number', 'Score', ...additionalInfoColumns, ...sortedTraits];
  
  // Load saved column visibility preferences
  const savedPreferences = loadColumnVisibilityPreferences();
  
  // Store column metadata for sorting and visibility
  const columnMetadata = {};
  headers.forEach((header, index) => {
    // Check if we have a saved preference for this column, default to true
    const isVisible = savedPreferences.hasOwnProperty(header) 
      ? savedPreferences[header] 
      : true;
    columnMetadata[header] = { index, visible: isVisible };
  });

  headers.forEach((header, index) => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '8px';
    th.style.border = '1px solid #000';
    th.style.textAlign = 'center';
    th.setAttribute('bgcolor', '#E0E0E0'); // Excel compatibility
    th.dataset.columnName = header;
    
    // Make Name column sticky (both left and top)
    if (header === 'Name') {
      th.classList.add('sticky-name-column');
      th.style.position = 'sticky';
      th.style.left = '0';
      th.style.top = '0';
      th.style.zIndex = '25';
      th.style.backgroundColor = '#E0E0E0';
    }
    
    // Make all headers clickable for sorting
    th.style.cursor = 'pointer';
    th.classList.add('sortable-header');
    th.title = 'Click to sort';
    
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create body
  const tbody = document.createElement('tbody');
  validResults.forEach((result, rowIndex) => {
    const row = document.createElement('tr');
    row.dataset.rowIndex = rowIndex;
    
    // Name column (first) - sticky
    const nameCell = document.createElement('td');
    nameCell.textContent = result.data.animalName || '';
    nameCell.style.padding = '8px';
    nameCell.style.border = '1px solid #000';
    nameCell.style.textAlign = 'center';
    nameCell.style.backgroundColor = '#FFFFFF';
    nameCell.style.color = '#000000';
    nameCell.classList.add('sticky-name-column');
    nameCell.style.position = 'sticky';
    nameCell.style.left = '0';
    nameCell.style.zIndex = '10';
    nameCell.style.backgroundColor = rowIndex % 2 === 0 ? '#FFFFFF' : '#f9f9f9';
    nameCell.setAttribute('bgcolor', '#FFFFFF');
    nameCell.dataset.columnName = 'Name';
    row.appendChild(nameCell);
    
    // Registration Number
    const regNumCell = document.createElement('td');
    const regNumText = result.registrationNumber || '';
    regNumCell.textContent = regNumText;
    regNumCell.style.padding = '8px';
    regNumCell.style.border = '1px solid #000';
    regNumCell.style.textAlign = 'center';
    regNumCell.dataset.columnName = 'Registration Number';
    // Store sort value for numeric registration numbers
    const regNumVal = parseFloat(regNumText);
    regNumCell.dataset.sortValue = !isNaN(regNumVal) ? regNumVal.toString() : '';
    row.appendChild(regNumCell);

    // Score column
    const scoreCell = document.createElement('td');
    const score = result.score !== undefined ? result.score : 0;
    scoreCell.textContent = score.toFixed(2);
    scoreCell.style.padding = '8px';
    scoreCell.style.border = '1px solid #000';
    scoreCell.style.textAlign = 'center';
    scoreCell.style.backgroundColor = '#FFFFFF';
    scoreCell.style.color = '#000000';
    scoreCell.setAttribute('bgcolor', '#FFFFFF');
    scoreCell.dataset.columnName = 'Score';
    scoreCell.dataset.sortValue = score.toString();
    row.appendChild(scoreCell);

    // Additional info columns
    const additionalInfoMap = {
      'Sire': result.data.additionalInfo?.sire || '',
      'Dam': result.data.additionalInfo?.dam || '',
      'MGS': result.data.additionalInfo?.mgs || '',
      'BD': result.data.additionalInfo?.birthDate || '',
      'Tattoo': result.data.additionalInfo?.tattoo || ''
    };
    
    additionalInfoColumns.forEach(columnName => {
      const cell = document.createElement('td');
      const cellText = additionalInfoMap[columnName] || '';
      cell.textContent = cellText;
      cell.style.padding = '8px';
      cell.style.border = '1px solid #000';
      cell.style.textAlign = 'center';
      cell.style.backgroundColor = '#FFFFFF';
      cell.style.color = '#000000';
      // Set bgcolor attribute for Excel compatibility
      cell.setAttribute('bgcolor', '#FFFFFF');
      cell.dataset.columnName = columnName;
      
      // Store sort value - for BD, parse as date; for others, try numeric
      if (columnName === 'BD' && cellText) {
        // Parse MM/DD/YYYY format to Date timestamp for sorting
        const dateMatch = cellText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dateMatch) {
          const month = parseInt(dateMatch[1], 10) - 1; // JavaScript months are 0-indexed
          const day = parseInt(dateMatch[2], 10);
          const year = parseInt(dateMatch[3], 10);
          const dateObj = new Date(year, month, day);
          if (!isNaN(dateObj.getTime())) {
            cell.dataset.sortValue = dateObj.getTime().toString(); // Store as timestamp
          } else {
            cell.dataset.sortValue = '';
          }
        } else {
          cell.dataset.sortValue = '';
        }
      } else {
        // For other columns, try numeric
        const cellNum = parseFloat(cellText);
        cell.dataset.sortValue = !isNaN(cellNum) ? cellNum.toString() : '';
      }
      row.appendChild(cell);
    });

    // Trait values
    sortedTraits.forEach(trait => {
      const cell = document.createElement('td');
      cell.dataset.columnName = trait;
      const traitData = result.data.epdValues[trait];
      
      if (traitData) {
        // Format EPD to 2 decimal places (3 for FAT)
        let epd = traitData.epd || 'N/A';
        let epdNum = null;
        if (epd !== 'N/A' && typeof epd === 'string') {
          // Remove "I" prefix if present (inferred value)
          const cleanedEPD = epd.replace(/^I\s*/i, '').trim();
          epdNum = parseFloat(cleanedEPD);
          if (!isNaN(epdNum)) {
            // Preserve sign (+ or -) and format to 2 decimals (3 for FAT)
            const sign = epdNum >= 0 ? '+' : '';
            const decimals = trait === 'FAT' ? 3 : 2;
            epd = sign + epdNum.toFixed(decimals);
          }
        }
        const rank = traitData.percentRank || 'N/A';
        cell.textContent = `${epd} (${rank}%)`;
        // Store raw EPD value for sorting
        cell.dataset.sortValue = epdNum !== null && !isNaN(epdNum) ? epdNum.toString() : '';
        
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
        // Store empty sort value for N/A
        cell.dataset.sortValue = '';
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

  // Define helper function for toggling column visibility
  function toggleColumnVisibility(table, columnName, isVisible) {
    // Hide/show header using data attribute
    const headerCells = table.querySelectorAll('th');
    headerCells.forEach(th => {
      if (th.dataset.columnName === columnName) {
        th.style.display = isVisible ? '' : 'none';
      }
    });
    
    // Hide/show cells in body using data attribute
    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      cells.forEach(cell => {
        if (cell.dataset.columnName === columnName) {
          cell.style.display = isVisible ? '' : 'none';
        }
      });
    });
  }

  // Add table controls (sorting and column visibility)
  const tableControls = document.createElement('div');
  tableControls.className = 'table-controls';
  tableControls.style.marginBottom = '15px';
  tableControls.style.display = 'flex';
  tableControls.style.gap = '15px';
  tableControls.style.flexWrap = 'wrap';
  tableControls.style.alignItems = 'center';

  // Column visibility dropdown
  const columnVisibilityContainer = document.createElement('div');
  columnVisibilityContainer.style.display = 'flex';
  columnVisibilityContainer.style.alignItems = 'center';
  columnVisibilityContainer.style.gap = '8px';
  
  const columnVisibilityLabel = document.createElement('label');
  columnVisibilityLabel.textContent = 'Show/Hide Columns:';
  columnVisibilityLabel.style.fontWeight = '600';
  columnVisibilityLabel.style.marginRight = '5px';
  
  const columnVisibilityBtn = document.createElement('button');
  columnVisibilityBtn.textContent = 'Columns';
  columnVisibilityBtn.className = 'btn btn-secondary';
  columnVisibilityBtn.style.padding = '8px 16px';
  columnVisibilityBtn.style.fontSize = '14px';
  columnVisibilityBtn.style.cursor = 'pointer';
  
  const columnVisibilityMenu = document.createElement('div');
  columnVisibilityMenu.className = 'column-visibility-menu';
  columnVisibilityMenu.style.display = 'none';
  columnVisibilityMenu.style.position = 'absolute';
  columnVisibilityMenu.style.backgroundColor = 'white';
  columnVisibilityMenu.style.border = '2px solid #ddd';
  columnVisibilityMenu.style.borderRadius = '6px';
  columnVisibilityMenu.style.padding = '10px';
  columnVisibilityMenu.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  columnVisibilityMenu.style.zIndex = '1000';
  columnVisibilityMenu.style.maxHeight = '400px';
  columnVisibilityMenu.style.overflowY = 'auto';
  columnVisibilityMenu.style.minWidth = '200px';
  
  headers.forEach(header => {
    const checkboxContainer = document.createElement('div');
    checkboxContainer.style.display = 'flex';
    checkboxContainer.style.alignItems = 'center';
    checkboxContainer.style.marginBottom = '5px';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `col-vis-${header}`;
    checkbox.checked = columnMetadata[header].visible;
    checkbox.dataset.columnName = header;
    
    const label = document.createElement('label');
    label.htmlFor = `col-vis-${header}`;
    label.textContent = header;
    label.style.marginLeft = '8px';
    label.style.cursor = 'pointer';
    label.style.flex = '1';
    
    checkbox.addEventListener('change', () => {
      columnMetadata[header].visible = checkbox.checked;
      toggleColumnVisibility(table, header, checkbox.checked);
      
      // Save preferences to localStorage
      const preferences = {};
      headers.forEach(h => {
        preferences[h] = columnMetadata[h].visible;
      });
      saveColumnVisibilityPreferences(preferences);
    });
    
    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(label);
    columnVisibilityMenu.appendChild(checkboxContainer);
  });
  
  columnVisibilityBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = columnVisibilityMenu.style.display !== 'none';
    columnVisibilityMenu.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
      // Position menu relative to button
      const rect = columnVisibilityBtn.getBoundingClientRect();
      columnVisibilityMenu.style.position = 'fixed';
      columnVisibilityMenu.style.top = (rect.bottom + 5) + 'px';
      columnVisibilityMenu.style.left = rect.left + 'px';
    }
  });
  
  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!columnVisibilityMenu.contains(e.target) && e.target !== columnVisibilityBtn) {
      columnVisibilityMenu.style.display = 'none';
    }
  });
  
  columnVisibilityContainer.appendChild(columnVisibilityLabel);
  columnVisibilityContainer.appendChild(columnVisibilityBtn);
  columnVisibilityContainer.style.position = 'relative';
  columnVisibilityContainer.appendChild(columnVisibilityMenu);
  
  tableControls.appendChild(columnVisibilityContainer);
  
  // Add sort info
  const sortInfo = document.createElement('div');
  sortInfo.className = 'sort-info';
  sortInfo.textContent = 'Click column headers to sort';
  sortInfo.style.fontSize = '13px';
  sortInfo.style.color = '#666';
  sortInfo.style.fontStyle = 'italic';
  tableControls.appendChild(sortInfo);

  // Apply saved column visibility preferences to the table
  headers.forEach(header => {
    if (!columnMetadata[header].visible) {
      toggleColumnVisibility(table, header, false);
    }
  });

  // Create wrapper for table with controls
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-wrapper';
  tableWrapper.appendChild(tableControls);
  tableWrapper.appendChild(table);

  mainResultsContainer.appendChild(tableWrapper);
  
  // Add sorting functionality
  // Default sort: Score descending (highest to lowest)
  let currentSort = { column: 'Score', direction: 'desc' };
  
  function sortTable(columnName, direction) {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const isTraitColumn = sortedTraits.includes(columnName);
    
    rows.sort((a, b) => {
      // Find cells by data-column-name attribute
      const aCell = Array.from(a.querySelectorAll('td')).find(cell => cell.dataset.columnName === columnName);
      const bCell = Array.from(b.querySelectorAll('td')).find(cell => cell.dataset.columnName === columnName);
      
      if (!aCell || !bCell) return 0;
      
      let comparison = 0;
      
      if (isTraitColumn) {
        // For trait columns, sort by the stored EPD value (data-sort-value)
        const aSortValue = aCell.dataset.sortValue || '';
        const bSortValue = bCell.dataset.sortValue || '';
        
        // If either is empty/N/A, treat as null/undefined for sorting
        if (aSortValue === '' && bSortValue === '') {
          comparison = 0;
        } else if (aSortValue === '') {
          comparison = 1; // N/A values go to the end
        } else if (bSortValue === '') {
          comparison = -1; // N/A values go to the end
        } else {
          const aNum = parseFloat(aSortValue);
          const bNum = parseFloat(bSortValue);
          if (!isNaN(aNum) && !isNaN(bNum)) {
            comparison = aNum - bNum;
          } else {
            // Fallback to text comparison if parsing fails
            comparison = aCell.textContent.trim().localeCompare(bCell.textContent.trim());
          }
        }
      } else {
        // For non-trait columns, try to use stored sort value first, then fallback to text
        const aSortValue = aCell.dataset.sortValue || '';
        const bSortValue = bCell.dataset.sortValue || '';
        
        // Handle empty values - put them at the end
        if (aSortValue === '' && bSortValue === '') {
          comparison = 0;
        } else if (aSortValue === '') {
          comparison = 1; // N/A/empty values go to the end
        } else if (bSortValue === '') {
          comparison = -1; // N/A/empty values go to the end
        } else if (aSortValue !== '' && bSortValue !== '') {
          // Check if this is a date column (BD) - sort values are timestamps
          if (columnName === 'BD') {
            const aTimestamp = parseInt(aSortValue, 10);
            const bTimestamp = parseInt(bSortValue, 10);
            if (!isNaN(aTimestamp) && !isNaN(bTimestamp)) {
              comparison = aTimestamp - bTimestamp;
            } else {
              comparison = aCell.textContent.trim().localeCompare(bCell.textContent.trim());
            }
          } else {
            // For other columns, try numeric
            const aNum = parseFloat(aSortValue);
            const bNum = parseFloat(bSortValue);
            if (!isNaN(aNum) && !isNaN(bNum)) {
              comparison = aNum - bNum;
            } else {
              comparison = aCell.textContent.trim().localeCompare(bCell.textContent.trim());
            }
          }
        } else {
          // Fallback to text comparison
          const aText = aCell.textContent.trim();
          const bText = bCell.textContent.trim();
          comparison = aText.localeCompare(bText);
        }
      }
      
      return direction === 'asc' ? comparison : -comparison;
    });
    
    // Remove all rows and re-append in sorted order
    rows.forEach(row => {
      tbody.removeChild(row);
    });
    
    rows.forEach((row, index) => {
      // Update sticky name column background for zebra striping
      const nameCell = row.querySelector('.sticky-name-column');
      if (nameCell) {
        nameCell.style.backgroundColor = index % 2 === 0 ? '#FFFFFF' : '#f9f9f9';
      }
      tbody.appendChild(row);
    });
    
    // Update sort indicators (preserve original column name)
    table.querySelectorAll('th').forEach(th => {
      const originalName = th.dataset.columnName;
      if (originalName === columnName) {
        th.textContent = originalName + (direction === 'asc' ? ' ↑' : ' ↓');
      } else {
        // Remove sort indicator from other columns
        th.textContent = originalName;
      }
    });
  }
  
  // Add click handlers for sortable headers
  table.querySelectorAll('.sortable-header').forEach(th => {
    th.addEventListener('click', () => {
      const columnName = th.dataset.columnName;
      if (currentSort.column === columnName) {
        // Toggle direction
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.column = columnName;
        currentSort.direction = 'asc';
      }
      sortTable(columnName, currentSort.direction);
    });
  });

  // Apply default sort (after sortTable is defined)
  sortTable('Score', 'desc');

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

async function displayMatingResults(data, fromAllMatings = false) {
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
  
  // Add back button if viewing from All Matings
  let backButtonHtml = '';
  if (fromAllMatings) {
    backButtonHtml = `
      <button id="back-to-all-matings-btn" class="btn btn-secondary" style="margin-bottom: 15px;">
        ← Back to All Matings Ranking
      </button>
    `;
  }
  
  header.innerHTML = `
    ${backButtonHtml}
    <h3>Mating Calculation Results</h3>
    <p><strong>Sire:</strong> ${data.sire.registrationNumber} - ${data.sire.animalName || 'N/A'}</p>
    <p><strong>Dam:</strong> ${data.dam.registrationNumber} - ${data.dam.animalName || 'N/A'}</p>
    <div id="mating-improvement-counts" style="margin-top: 10px;"></div>
  `;
  matingSection.appendChild(header);
  
  // Add back button click handler
  if (fromAllMatings) {
    // Use setTimeout to ensure the button exists in the DOM
    setTimeout(() => {
      const backButton = document.getElementById('back-to-all-matings-btn');
      if (backButton) {
        // Remove any existing listeners to avoid duplicates
        const newBackButton = backButton.cloneNode(true);
        backButton.parentNode.replaceChild(newBackButton, backButton);
        
        newBackButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Switch back to All Matings mode first (without triggering clear)
          if (matingModeAll) {
            currentMatingMode = 'all';
            singleMatingMode.style.display = 'none';
            allMatingsMode.style.display = 'block';
            matingModeSingle.className = 'btn btn-secondary';
            matingModeAll.className = 'btn btn-primary';
          }
          
          // Clear only the detailed view, not the all-matings container
          const allMatingsContainer = document.getElementById('all-matings-results-container');
          if (!allMatingsContainer) {
            // If container doesn't exist, clear everything and restore
            matingResultsContainer.innerHTML = '';
          } else {
            // Just clear the detailed view section
            const matingResultsSection = document.getElementById('mating-results-section');
            if (matingResultsSection) {
              matingResultsSection.remove();
            }
          }
          
          // Restore the last ranked results
          if (lastRankedResults) {
            displayAllMatingsResults(lastRankedResults);
          }
        });
      }
    }, 100);
  }

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

  // Calculate improved/worsened counts by comparing calf EPD to dam EPD
  let improvedCount = 0;
  let worsenedCount = 0;
  const traitComparison = {}; // Store comparison result for each trait for highlighting

  sortedTraits.forEach(trait => {
    const calcData = data.calculatedEPDs[trait];
    if (!calcData) return;

    // Get calf EPD (expected EPD) - prefer raw numeric value if available
    let calfEpd = null;
    if (calcData.epd !== undefined && calcData.epd !== 'N/A') {
      if (typeof calcData.epd === 'number') {
        calfEpd = calcData.epd;
      } else {
        const calfEpdStr = String(calcData.epd).replace(/^\+/, '').replace(/^I\s*/i, '').trim();
        calfEpd = parseFloat(calfEpdStr);
      }
    }
    
    // Get dam EPD - prefer raw value from epdValues, otherwise parse from calcData
    let damEpd = null;
    const damEPDData = data.dam.epdValues?.[trait];
    if (damEPDData?.epd !== undefined) {
      if (typeof damEPDData.epd === 'number') {
        damEpd = damEPDData.epd;
      } else {
        const damEpdStr = String(damEPDData.epd).replace(/^\+/, '').replace(/^I\s*/i, '').trim();
        damEpd = parseFloat(damEpdStr);
      }
    } else if (calcData.damEPD && calcData.damEPD !== 'N/A') {
      const damEpdStr = String(calcData.damEPD).replace(/^\+/, '').replace(/^I\s*/i, '').trim();
      damEpd = parseFloat(damEpdStr);
    }

    if (isNaN(calfEpd) || isNaN(damEpd) || calfEpd === null || damEpd === null) {
      traitComparison[trait] = 'neutral';
      return;
    }

    // Determine if higher or lower is better for this trait
    const isHigherBetter = traitDirection[trait] !== false; // Default to true if not specified
    
    // Compare values
    if (Math.abs(calfEpd - damEpd) > 0.001) { // Use small epsilon for floating point comparison
      const isImproved = isHigherBetter ? (calfEpd > damEpd) : (calfEpd < damEpd);
      const isWorsened = isHigherBetter ? (calfEpd < damEpd) : (calfEpd > damEpd);
      
      if (isImproved) {
        improvedCount++;
        traitComparison[trait] = 'improved';
      } else if (isWorsened) {
        worsenedCount++;
        traitComparison[trait] = 'worsened';
      }
    } else {
      traitComparison[trait] = 'neutral';
    }
  });

  // Update header to include improved/worsened counts
  const countsContainer = document.getElementById('mating-improvement-counts');
  if (countsContainer) {
    countsContainer.innerHTML = `
      <span style="background-color: #d4edda; color: #155724; padding: 4px 8px; border-radius: 4px; margin-right: 10px; font-weight: bold;">
        Improved: ${improvedCount}
      </span>
      <span style="background-color: #f8d7da; color: #721c24; padding: 4px 8px; border-radius: 4px; font-weight: bold;">
        Worsened: ${worsenedCount}
      </span>
    `;
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

    // Trait name - color code based on improvement/worsening
    const traitCell = document.createElement('td');
    traitCell.textContent = trait;
    traitCell.style.padding = '8px';
    traitCell.style.border = '1px solid #000';
    traitCell.style.textAlign = 'center';
    traitCell.style.fontWeight = 'bold';
    
    // Apply color based on comparison result
    const comparison = traitComparison[trait] || 'neutral';
    if (comparison === 'improved') {
      traitCell.style.backgroundColor = '#d4edda'; // Light green
      traitCell.style.color = '#155724'; // Dark green text
    } else if (comparison === 'worsened') {
      traitCell.style.backgroundColor = '#f8d7da'; // Light red
      traitCell.style.color = '#721c24'; // Dark red text
    } else {
      traitCell.style.backgroundColor = '#FFFFFF'; // White/neutral
      traitCell.style.color = '#000000'; // Black text
    }
    
    row.appendChild(traitCell);

    // Sire EPD (format to 2 decimal places, 3 for FAT, and color code)
    const sireCell = document.createElement('td');
    let sireDisplay = 'N/A';
    const sireEPDData = data.sire.epdValues?.[trait];
    const sirePercentRank = sireEPDData?.percentRank;
    
    if (calcData.sireEPD && calcData.sireEPD !== 'N/A' && typeof calcData.sireEPD === 'string') {
      const cleanedEPD = calcData.sireEPD.replace(/^I\s*/i, '').trim();
      const sireNum = parseFloat(cleanedEPD);
      if (!isNaN(sireNum)) {
        const sign = sireNum >= 0 ? '+' : '';
        const decimals = trait === 'FAT' ? 3 : 2;
        sireDisplay = sign + sireNum.toFixed(decimals);
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

    // Dam EPD (format to 2 decimal places, 3 for FAT, and color code)
    const damCell = document.createElement('td');
    let damDisplay = 'N/A';
    const damEPDData = data.dam.epdValues?.[trait];
    const damPercentRank = damEPDData?.percentRank;
    
    if (calcData.damEPD && calcData.damEPD !== 'N/A' && typeof calcData.damEPD === 'string') {
      const cleanedEPD = calcData.damEPD.replace(/^I\s*/i, '').trim();
      const damNum = parseFloat(cleanedEPD);
      if (!isNaN(damNum)) {
        const sign = damNum >= 0 ? '+' : '';
        const decimals = trait === 'FAT' ? 3 : 2;
        damDisplay = sign + damNum.toFixed(decimals);
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
    // Format EPD value to 2 decimal places (3 for FAT)
    let epdDisplay = 'N/A';
    if (calcData.epd && calcData.epd !== 'N/A' && typeof calcData.epd === 'string') {
      const cleanedEPD = calcData.epd.replace(/^I\s*/i, '').trim();
      const epdNum = parseFloat(cleanedEPD);
      if (!isNaN(epdNum)) {
        const sign = epdNum >= 0 ? '+' : '';
        const decimals = trait === 'FAT' ? 3 : 2;
        epdDisplay = sign + epdNum.toFixed(decimals);
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

// Display all matings ranked results
function displayAllMatingsResults(data) {
  const { rankedMatings, totalCows, totalSires, totalMatings, config } = data;
  
  // Clear existing results
  const allMatingsContainer = document.getElementById('all-matings-results-container');
  if (allMatingsContainer) {
    allMatingsContainer.innerHTML = '';
  } else {
    // Create container if it doesn't exist
    const container = document.createElement('div');
    container.id = 'all-matings-results-container';
    container.style.marginTop = '30px';
    matingResultsContainer.appendChild(container);
  }
  
  const container = document.getElementById('all-matings-results-container');
  
  // Filter by gate if checkbox is checked
  const showOnlyGatePass = gateFilterCheckbox && gateFilterCheckbox.checked;
  const filteredMatings = showOnlyGatePass 
    ? rankedMatings.filter(m => m.passedGate)
    : rankedMatings;
  
  // Group by cow and sort sires within each cow by score (best to worst)
  const matingsByCow = {};
  filteredMatings.forEach(mating => {
    const cowId = mating.cowId;
    if (!matingsByCow[cowId]) {
      matingsByCow[cowId] = {
        cowId: cowId,
        cowName: mating.cowName || cowId,
        matings: []
      };
    }
    matingsByCow[cowId].matings.push(mating);
  });
  
  // Sort sires within each cow by score (descending - best first)
  Object.keys(matingsByCow).forEach(cowId => {
    matingsByCow[cowId].matings.sort((a, b) => {
      // First by gate pass (passers first)
      if (a.passedGate !== b.passedGate) {
        return b.passedGate ? 1 : -1;
      }
      // Then by score (higher is better)
      if (Math.abs(a.score - b.score) > 0.001) {
        return b.score - a.score;
      }
      // Then by fewer below light green traits
      if (a.numBelowLightGreenAllTraits !== b.numBelowLightGreenAllTraits) {
        return a.numBelowLightGreenAllTraits - b.numBelowLightGreenAllTraits;
      }
      // Finally by more improved emphasis traits
      return b.improvedEmphasisTraitsCount - a.improvedEmphasisTraitsCount;
    });
  });
  
  // Get all unique traits from all matings
  const allTraits = new Set();
  filteredMatings.forEach(mating => {
    Object.keys(mating.traitResults || {}).forEach(trait => allTraits.add(trait));
  });
  
  // Sort traits according to predefined order
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
  
  // Summary header with export button
  const summary = document.createElement('div');
  summary.style.marginBottom = '20px';
  summary.style.padding = '15px';
  summary.style.backgroundColor = '#f8f9fa';
  summary.style.borderRadius = '6px';
  summary.style.display = 'flex';
  summary.style.justifyContent = 'space-between';
  summary.style.alignItems = 'flex-start';
  summary.style.flexWrap = 'wrap';
  summary.style.gap = '15px';
  
  const summaryText = document.createElement('div');
  summaryText.style.flex = '1';
  const gateTraitsDisplay = config.gateTraits && config.gateTraits.length > 0 
    ? config.gateTraits.join(', ') 
    : 'None (all matings pass gate)';
  
  summaryText.innerHTML = `
    <h3 style="margin-top: 0;">All Matings Ranking Results (Grouped by Cow)</h3>
    <p><strong>Total Matings Evaluated:</strong> ${totalMatings} (${totalCows} cows × ${totalSires} sires)</p>
    <p><strong>Results Shown:</strong> ${filteredMatings.length} of ${rankedMatings.length} ranked matings</p>
    <p><strong>Gate Traits:</strong> ${gateTraitsDisplay}</p>
    <p><strong>Scoring:</strong> Emphasis-based weighting (all traits contribute)</p>
  `;
  
  // Export button
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-primary';
  exportBtn.textContent = 'Export to Excel';
  exportBtn.style.alignSelf = 'flex-start';
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    const originalText = exportBtn.textContent;
    exportBtn.textContent = 'Exporting...';
    
    try {
      // Convert matings data to format expected by Excel export
      // Include score and gate status in the export
      const exportData = filteredMatings.map(mating => ({
        success: true,
        registrationNumber: `${mating.cowId} × ${mating.sireId}`,
        score: typeof mating.score === 'number' ? mating.score : (mating.score ? parseFloat(mating.score) : 0), // Score at top level for Excel export
        data: {
          animalName: `${mating.cowName} × ${mating.sireName}`,
          epdValues: Object.keys(mating.traitResults || {}).reduce((acc, trait) => {
            const result = mating.traitResults[trait];
            const decimals = trait === 'FAT' ? 3 : 2;
            acc[trait] = {
              epd: result.calfEpd !== null && result.calfEpd !== undefined ? result.calfEpd.toFixed(decimals) : 'N/A',
              percentRank: result.calfPercentile || 'N/A'
            };
            return acc;
          }, {}),
          additionalInfo: {
            sire: mating.sireName || mating.sireId,
            dam: mating.cowName || mating.cowId,
            score: mating.score?.toFixed(2) || '0.00', // Keep as string in additionalInfo for reference
            passedGate: mating.passedGate ? 'Yes' : 'No',
            numBelowLightGreen: mating.numBelowLightGreenAllTraits || 0,
            improvedEmphasisTraits: mating.improvedEmphasisTraitsCount || 0
          }
        }
      }));
      
      const result = await window.electronAPI.exportToExcel(exportData);
      
      if (result && result.success) {
        alert(`Excel file saved successfully!\n${result.path}`);
      } else {
        const errorMsg = result?.error || 'Unknown error';
        alert(`Export failed: ${errorMsg}`);
      }
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Error exporting to Excel: ' + (error.message || String(error)));
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = originalText;
    }
  });
  
  summary.appendChild(summaryText);
  summary.appendChild(exportBtn);
  container.appendChild(summary);
  
  // Calculate sire summary (how many times each bull was ranked #1, #2, etc. per cow)
  const sireSummary = {};
  Object.keys(matingsByCow).forEach(cowId => {
    const cowGroup = matingsByCow[cowId];
    cowGroup.matings.forEach((mating, sireIndex) => {
      const rank = sireIndex + 1; // 1-based rank
      const sireId = mating.sireId;
      const sireName = mating.sireName || sireId;
      
      if (!sireSummary[sireId]) {
        sireSummary[sireId] = {
          sireName: sireName,
          ranks: {} // rank -> count
        };
      }
      
      if (!sireSummary[sireId].ranks[rank]) {
        sireSummary[sireId].ranks[rank] = 0;
      }
      sireSummary[sireId].ranks[rank]++;
    });
  });
  
  // Create sire summary table
  const sireSummaryDiv = document.createElement('div');
  sireSummaryDiv.style.marginBottom = '20px';
  sireSummaryDiv.style.padding = '15px';
  sireSummaryDiv.style.backgroundColor = '#e8f4f8';
  sireSummaryDiv.style.borderRadius = '6px';
  
  const sireSummaryTitle = document.createElement('h4');
  sireSummaryTitle.textContent = 'Sire Summary (Rankings per Cow)';
  sireSummaryTitle.style.marginTop = '0';
  sireSummaryTitle.style.marginBottom = '15px';
  sireSummaryDiv.appendChild(sireSummaryTitle);
  
  // Get all unique ranks to determine columns
  const allRanks = new Set();
  Object.keys(sireSummary).forEach(sireId => {
    Object.keys(sireSummary[sireId].ranks).forEach(rank => allRanks.add(parseInt(rank, 10)));
  });
  const sortedRanks = Array.from(allRanks).sort((a, b) => a - b);
  
  // Create summary table
  const summaryTable = document.createElement('table');
  summaryTable.style.borderCollapse = 'collapse';
  summaryTable.style.width = '100%';
  summaryTable.style.marginTop = '10px';
  
  // Header row
  const summaryThead = document.createElement('thead');
  const summaryHeaderRow = document.createElement('tr');
  summaryHeaderRow.style.backgroundColor = '#d0e8f0';
  summaryHeaderRow.style.fontWeight = 'bold';
  
  const summaryHeaders = ['Sire', ...sortedRanks.map(r => `#${r}`), 'Total'];
  summaryHeaders.forEach(headerText => {
    const th = document.createElement('th');
    th.textContent = headerText;
    th.style.padding = '8px';
    th.style.border = '1px solid #000';
    th.style.textAlign = 'center';
    th.setAttribute('bgcolor', '#d0e8f0');
    summaryHeaderRow.appendChild(th);
  });
  summaryThead.appendChild(summaryHeaderRow);
  summaryTable.appendChild(summaryThead);
  
  // Body
  const summaryTbody = document.createElement('tbody');
  
  // Sort sires by total count (descending)
  const sortedSires = Object.keys(sireSummary).sort((a, b) => {
    const totalA = Object.values(sireSummary[a].ranks).reduce((sum, count) => sum + count, 0);
    const totalB = Object.values(sireSummary[b].ranks).reduce((sum, count) => sum + count, 0);
    return totalB - totalA;
  });
  
  sortedSires.forEach(sireId => {
    const sire = sireSummary[sireId];
    const row = document.createElement('tr');
    
    // Sire name
    const sireNameCell = document.createElement('td');
    sireNameCell.textContent = sire.sireName;
    sireNameCell.style.padding = '8px';
    sireNameCell.style.border = '1px solid #000';
    sireNameCell.style.textAlign = 'left';
    sireNameCell.style.fontWeight = 'bold';
    row.appendChild(sireNameCell);
    
    // Rank counts
    let total = 0;
    sortedRanks.forEach(rank => {
      const count = sire.ranks[rank] || 0;
      total += count;
      
      const rankCell = document.createElement('td');
      rankCell.textContent = count > 0 ? count : '';
      rankCell.style.padding = '8px';
      rankCell.style.border = '1px solid #000';
      rankCell.style.textAlign = 'center';
      // Highlight #1 rankings
      if (rank === 1 && count > 0) {
        rankCell.style.backgroundColor = '#d4edda';
        rankCell.style.fontWeight = 'bold';
      }
      row.appendChild(rankCell);
    });
    
    // Total
    const totalCell = document.createElement('td');
    totalCell.textContent = total;
    totalCell.style.padding = '8px';
    totalCell.style.border = '1px solid #000';
    totalCell.style.textAlign = 'center';
    totalCell.style.fontWeight = 'bold';
    totalCell.style.backgroundColor = '#f0f0f0';
    row.appendChild(totalCell);
    
    summaryTbody.appendChild(row);
  });
  
  summaryTable.appendChild(summaryTbody);
  sireSummaryDiv.appendChild(summaryTable);
  container.appendChild(sireSummaryDiv);
  
  if (filteredMatings.length === 0) {
    const noResults = document.createElement('p');
    noResults.style.color = '#dc3545';
    noResults.textContent = showOnlyGatePass 
      ? 'No matings passed the gate filter. Try unchecking "Show only gate-pass".'
      : 'No ranked matings found.';
    container.appendChild(noResults);
    return;
  }
  
  // Create wrapper for horizontal scrolling
  const tableWrapper = document.createElement('div');
  tableWrapper.style.overflowX = 'auto';
  tableWrapper.style.width = '100%';
  tableWrapper.style.marginTop = '20px';
  
  // Create ranked table
  const table = document.createElement('table');
  table.className = 'epd-table';
  table.style.borderCollapse = 'collapse';
  table.style.width = '100%';
  table.style.minWidth = 'max-content';
  
  // Header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.style.backgroundColor = '#E0E0E0';
  headerRow.style.fontWeight = 'bold';
  
  // Base headers
  const baseHeaders = ['Cow', 'Sire Rank', 'Score', 'Gate', 'Improved', 'Worsened', 'Sire'];
  
  // Add all trait headers
  const headers = [...baseHeaders, ...sortedTraits];
  
  headers.forEach(headerText => {
    const th = document.createElement('th');
    th.textContent = headerText;
    th.style.padding = '8px';
    th.style.border = '1px solid #000';
    th.style.textAlign = 'center';
    th.style.whiteSpace = 'nowrap';
    th.setAttribute('bgcolor', '#E0E0E0');
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Body
  const tbody = document.createElement('tbody');
  
  // Iterate through cows
  Object.keys(matingsByCow).forEach(cowId => {
    const cowGroup = matingsByCow[cowId];
    
    cowGroup.matings.forEach((mating, sireIndex) => {
      const row = document.createElement('tr');
      row.dataset.matingIndex = sireIndex;
      row.style.cursor = 'pointer';
      row.title = 'Click to view detailed trait results';
      
      // Cow (only show on first row for each cow)
      const cowCell = document.createElement('td');
      if (sireIndex === 0) {
        cowCell.textContent = cowGroup.cowName;
        cowCell.style.fontWeight = 'bold';
        cowCell.rowSpan = cowGroup.matings.length;
        cowCell.style.verticalAlign = 'top';
      }
      cowCell.style.padding = '8px';
      cowCell.style.border = '1px solid #000';
      cowCell.style.textAlign = 'center';
      cowCell.style.backgroundColor = sireIndex === 0 ? '#e8f4f8' : '';
      if (sireIndex === 0) {
        row.appendChild(cowCell);
      }
      
      // Sire Rank (1, 2, 3, etc. for this cow)
      const rankCell = document.createElement('td');
      rankCell.textContent = sireIndex + 1;
      rankCell.style.padding = '8px';
      rankCell.style.border = '1px solid #000';
      rankCell.style.textAlign = 'center';
      rankCell.style.fontWeight = 'bold';
      row.appendChild(rankCell);
      
      // Score
      const scoreCell = document.createElement('td');
      scoreCell.textContent = mating.score.toFixed(2);
      scoreCell.style.padding = '8px';
      scoreCell.style.border = '1px solid #000';
      scoreCell.style.textAlign = 'center';
      row.appendChild(scoreCell);
      
      // Gate
      const gateCell = document.createElement('td');
      gateCell.textContent = mating.passedGate ? '✓ Pass' : '✗ Fail';
      gateCell.style.padding = '8px';
      gateCell.style.border = '1px solid #000';
      gateCell.style.textAlign = 'center';
      gateCell.style.backgroundColor = mating.passedGate ? '#d4edda' : '#f8d7da';
      gateCell.style.color = mating.passedGate ? '#155724' : '#721c24';
      row.appendChild(gateCell);
      
      // Improved Traits
      const improvedCell = document.createElement('td');
      improvedCell.textContent = mating.improvedTraitsCount || 0;
      improvedCell.style.padding = '8px';
      improvedCell.style.border = '1px solid #000';
      improvedCell.style.textAlign = 'center';
      improvedCell.style.backgroundColor = '#d4edda';
      improvedCell.style.color = '#155724';
      row.appendChild(improvedCell);
      
      // Worsened Traits
      const worsenedCell = document.createElement('td');
      worsenedCell.textContent = mating.worsenedTraitsCount || 0;
      worsenedCell.style.padding = '8px';
      worsenedCell.style.border = '1px solid #000';
      worsenedCell.style.textAlign = 'center';
      worsenedCell.style.backgroundColor = '#f8d7da';
      worsenedCell.style.color = '#721c24';
      row.appendChild(worsenedCell);
      
      // Sire
      const sireCell = document.createElement('td');
      sireCell.textContent = mating.sireName || mating.sireId;
      sireCell.style.padding = '8px';
      sireCell.style.border = '1px solid #000';
      sireCell.style.textAlign = 'center';
      row.appendChild(sireCell);
      
      // All traits (show EPD value with color coding)
      sortedTraits.forEach(trait => {
        const traitCell = document.createElement('td');
        const traitResult = mating.traitResults[trait];
        
        if (traitResult) {
          // Show EPD value and percentile (3 decimals for FAT)
          const decimals = trait === 'FAT' ? 3 : 2;
          const epdDisplay = traitResult.calfEpd >= 0 
            ? `+${traitResult.calfEpd.toFixed(decimals)}` 
            : traitResult.calfEpd.toFixed(decimals);
          const percentileDisplay = traitResult.calfPercentile !== null 
            ? ` (${traitResult.calfPercentile}%)` 
            : '';
          traitCell.textContent = epdDisplay + percentileDisplay;
          traitCell.style.padding = '8px';
          traitCell.style.border = '1px solid #000';
          traitCell.style.textAlign = 'center';
          traitCell.style.whiteSpace = 'nowrap';
          traitCell.style.backgroundColor = traitResult.bgColor;
          traitCell.style.color = traitResult.textColor;
          traitCell.setAttribute('bgcolor', traitResult.bgColor);
        } else {
          traitCell.textContent = 'N/A';
          traitCell.style.padding = '8px';
          traitCell.style.border = '1px solid #000';
          traitCell.style.textAlign = 'center';
          traitCell.style.whiteSpace = 'nowrap';
          traitCell.style.backgroundColor = '#FFFFFF';
          traitCell.style.color = '#000000';
        }
        row.appendChild(traitCell);
      });
      
      // Click handler to show detail
      row.addEventListener('click', () => {
        showMatingDetail(mating);
      });
      
      // Hover effect
      row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = '#f0f0f0';
      });
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = '';
      });
      
      tbody.appendChild(row);
    });
  });
  
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);
}

// Show detailed mating view (reuses existing displayMatingResults)
function showMatingDetail(mating) {
  // Convert mating result format to displayMatingResults format
  // Use full animal data if available, otherwise construct from mating result
  const displayData = {
    sire: {
      registrationNumber: mating.sireId,
      animalName: mating.sireName,
      epdValues: mating.sireData?.epdValues || {}
    },
    dam: {
      registrationNumber: mating.cowId,
      animalName: mating.cowName,
      epdValues: mating.cowData?.epdValues || {}
    },
    calculatedEPDs: {}
  };
  
  // Convert traitResults to calculatedEPDs format
  Object.keys(mating.traitResults).forEach(trait => {
    const result = mating.traitResults[trait];
    const decimals = trait === 'FAT' ? 3 : 2;
    displayData.calculatedEPDs[trait] = {
      epd: result.calfEpd >= 0 ? `+${result.calfEpd.toFixed(decimals)}` : result.calfEpd.toFixed(decimals),
      estimatedPercentileRank: result.calfPercentile,
      sireEPD: mating.sireData?.epdValues?.[trait]?.epd || 'N/A',
      damEPD: mating.cowData?.epdValues?.[trait]?.epd || 'N/A'
    };
  });
  
  // Check if we're currently in All Matings mode
  const isFromAllMatings = currentMatingMode === 'all';
  
  // Switch to single mating mode and display (but mark it as from All Matings)
  if (isFromAllMatings) {
    matingModeSingle.click();
  }
  displayMatingResults(displayData, isFromAllMatings);
}

// Herd Inventory Management
const refreshInventoryBtn = document.getElementById('refresh-inventory-btn');
const inventoryFilter = document.getElementById('inventory-filter');
const categoryFilter = document.getElementById('category-filter');
const inventorySearch = document.getElementById('inventory-search');
const inventoryResultsContainer = document.getElementById('inventory-results-container');
const compareSelectedBtn = document.getElementById('compare-selected-btn');
const selectedCountSpan = document.getElementById('selected-count');
const bulkChangeCategoryBtn = document.getElementById('bulk-change-category-btn');
const manageCategoriesBtn = document.getElementById('manage-categories-btn');
const deleteCategoryBtn = document.getElementById('delete-category-btn');

let allInventoryAnimals = [];
let selectedAnimals = new Set(); // Store registration numbers of selected animals
let availableCategories = []; // Store available categories

// Load categories from config
async function loadCategoriesFromConfig() {
  try {
    availableCategories = await window.electronAPI.getAvailableCategories();
    updateCategoryDropdowns();
  } catch (error) {
    console.error('Error loading categories:', error);
    // Default to predefined category (only "My Herd" is predefined)
    availableCategories = ['My Herd'];
    updateCategoryDropdowns();
  }
}

// Update category dropdowns throughout the UI
function updateCategoryDropdowns() {
  // Update main category selector
  if (categorySelect) {
    const currentValue = categorySelect.value;
    categorySelect.innerHTML = '';
    availableCategories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      categorySelect.appendChild(option);
    });
    // Restore previous selection if it still exists
    if (availableCategories.includes(currentValue)) {
      categorySelect.value = currentValue;
    } else {
      categorySelect.value = 'My Herd';
    }
  }
  
  // Update category filter in inventory
  if (categoryFilter) {
    const currentValue = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="all">All Categories</option>';
    availableCategories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      categoryFilter.appendChild(option);
    });
    // Restore previous selection if it still exists
    if (currentValue === 'all' || availableCategories.includes(currentValue)) {
      categoryFilter.value = currentValue;
    } else {
      categoryFilter.value = 'all';
    }
  }
  
  // Update sire category selector for All Matings
  const sireCategorySelect = document.getElementById('sire-category-select');
  if (sireCategorySelect) {
    const currentValue = sireCategorySelect.value;
    sireCategorySelect.innerHTML = '<option value="all">All</option>';
    availableCategories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      sireCategorySelect.appendChild(option);
    });
    // Restore previous selection if it still exists
    if (currentValue === 'all' || availableCategories.includes(currentValue)) {
      sireCategorySelect.value = currentValue;
    } else {
      sireCategorySelect.value = 'all';
    }
  }
  
  // Update cow category selector for All Matings
  const cowCategorySelect = document.getElementById('cow-category-select');
  if (cowCategorySelect) {
    const currentValue = cowCategorySelect.value;
    cowCategorySelect.innerHTML = '<option value="all">All</option>';
    availableCategories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      cowCategorySelect.appendChild(option);
    });
    // Restore previous selection if it still exists
    if (currentValue === 'all' || availableCategories.includes(currentValue)) {
      cowCategorySelect.value = currentValue;
    } else {
      cowCategorySelect.value = 'all';
    }
  }
}

// Initialize categories on page load
loadCategoriesFromConfig();

// Load and display inventory
async function loadInventory() {
  try {
    allInventoryAnimals = await window.electronAPI.getCachedAnimals();
    displayInventory();
  } catch (error) {
    console.error('Error loading inventory:', error);
    inventoryResultsContainer.innerHTML = '<p style="color: #dc3545;">Error loading inventory: ' + error.message + '</p>';
  }
}

// Display inventory with filtering and search
function displayInventory() {
  let filtered = [...allInventoryAnimals];
  
  // Apply type filter
  const filterValue = inventoryFilter ? inventoryFilter.value : 'all';
  if (filterValue === 'cows') {
    filtered = filtered.filter(animal => {
      const sex = (animal.sex || '').toUpperCase();
      return sex === 'COW' || sex === 'FEMALE' || sex === 'HEIFER' || sex.includes('COW') || sex.includes('FEMALE');
    });
  } else if (filterValue === 'sires') {
    filtered = filtered.filter(animal => {
      const sex = (animal.sex || '').toUpperCase();
      return sex === 'BULL' || sex === 'MALE' || sex === 'STEER' || sex.includes('BULL') || sex.includes('MALE');
    });
  }
  
  // Apply category filter (support multi-category)
  const categoryFilterValue = categoryFilter ? categoryFilter.value : 'all';
  if (categoryFilterValue !== 'all') {
    filtered = filtered.filter(animal => {
      const animalCategories = animal.categories || (animal.category ? [animal.category] : ['My Herd']);
      return animalCategories.includes(categoryFilterValue);
    });
  }
  
  // Apply search filter
  const searchTerm = inventorySearch ? inventorySearch.value.toLowerCase().trim() : '';
  if (searchTerm) {
    filtered = filtered.filter(animal => {
      const name = (animal.animalName || '').toLowerCase();
      const regNum = (animal.registrationNumber || '').toLowerCase();
      return name.includes(searchTerm) || regNum.includes(searchTerm);
    });
  }
  
  // Clear container
  inventoryResultsContainer.innerHTML = '';
  
  if (filtered.length === 0) {
    const noResults = document.createElement('p');
    noResults.style.color = '#666';
    noResults.textContent = 'No animals found matching the current filter.';
    inventoryResultsContainer.appendChild(noResults);
    return;
  }
  
  // Create summary
  const summary = document.createElement('div');
  summary.style.marginBottom = '15px';
  summary.style.padding = '10px';
  summary.style.backgroundColor = '#f8f9fa';
  summary.style.borderRadius = '6px';
  summary.textContent = `Showing ${filtered.length} of ${allInventoryAnimals.length} animals`;
  inventoryResultsContainer.appendChild(summary);
  
  // Create table
  const table = document.createElement('table');
  table.className = 'epd-table';
  table.style.borderCollapse = 'collapse';
  table.style.width = '100%';
  table.style.marginTop = '10px';
  
  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.style.backgroundColor = '#E0E0E0';
  headerRow.style.fontWeight = 'bold';
  
  const headers = ['Select', 'Name', 'Registration Number', 'Sex', 'Category', 'Cached At', 'Actions'];
  headers.forEach((headerText, index) => {
    const th = document.createElement('th');
    if (headerText === 'Select') {
      // Add select all checkbox
      const selectAllLabel = document.createElement('label');
      selectAllLabel.style.cursor = 'pointer';
      selectAllLabel.style.display = 'flex';
      selectAllLabel.style.alignItems = 'center';
      selectAllLabel.style.justifyContent = 'center';
      selectAllLabel.style.gap = '5px';
      
      const selectAllCheckbox = document.createElement('input');
      selectAllCheckbox.type = 'checkbox';
      selectAllCheckbox.id = 'select-all-inventory';
      
      // Check if all filtered animals are selected
      const allSelected = filtered.length > 0 && filtered.every(a => selectedAnimals.has(a.registrationNumber));
      selectAllCheckbox.checked = allSelected;
      
      selectAllCheckbox.addEventListener('change', () => {
        if (selectAllCheckbox.checked) {
          // Select all filtered animals
          filtered.forEach(animal => {
            selectedAnimals.add(animal.registrationNumber);
          });
        } else {
          // Deselect all filtered animals
          filtered.forEach(animal => {
            selectedAnimals.delete(animal.registrationNumber);
          });
        }
        updateSelectedCount();
        displayInventory(); // Refresh to update checkbox states
      });
      
      selectAllLabel.appendChild(selectAllCheckbox);
      selectAllLabel.appendChild(document.createTextNode('All'));
      th.appendChild(selectAllLabel);
    } else {
      th.textContent = headerText;
    }
    th.style.padding = '8px';
    th.style.border = '1px solid #000';
    th.style.textAlign = headerText === 'Select' ? 'center' : 'left';
    th.setAttribute('bgcolor', '#E0E0E0');
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Body
  const tbody = document.createElement('tbody');
  
  filtered.forEach(animal => {
    const row = document.createElement('tr');
    
    // Checkbox for selection
    const selectCell = document.createElement('td');
    selectCell.style.padding = '8px';
    selectCell.style.border = '1px solid #000';
    selectCell.style.textAlign = 'center';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.registrationNumber = animal.registrationNumber;
    checkbox.checked = selectedAnimals.has(animal.registrationNumber);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedAnimals.add(animal.registrationNumber);
      } else {
        selectedAnimals.delete(animal.registrationNumber);
      }
      updateSelectedCount();
    });
    selectCell.appendChild(checkbox);
    row.appendChild(selectCell);
    
    // Name
    const nameCell = document.createElement('td');
    nameCell.textContent = animal.animalName || 'N/A';
    nameCell.style.padding = '8px';
    nameCell.style.border = '1px solid #000';
    row.appendChild(nameCell);
    
    // Registration Number
    const regNumCell = document.createElement('td');
    regNumCell.textContent = animal.registrationNumber;
    regNumCell.style.padding = '8px';
    regNumCell.style.border = '1px solid #000';
    row.appendChild(regNumCell);
    
    // Sex
    const sexCell = document.createElement('td');
    sexCell.textContent = animal.sex || 'N/A';
    sexCell.style.padding = '8px';
    sexCell.style.border = '1px solid #000';
    row.appendChild(sexCell);
    
    // Category - show all categories
    const categoryCell = document.createElement('td');
    const animalCategories = animal.categories || (animal.category ? [animal.category] : ['My Herd']);
    const categoriesText = animalCategories.join(', ');
    categoryCell.textContent = categoriesText;
    categoryCell.style.padding = '8px';
    categoryCell.style.border = '1px solid #000';
    categoryCell.style.textAlign = 'center';
    categoryCell.title = categoriesText; // Tooltip with full list
    // Apply category badge styling - only "My Herd" gets special green color
    if (animalCategories.includes('My Herd')) {
      categoryCell.style.backgroundColor = '#d4edda';
      categoryCell.style.color = '#155724';
      categoryCell.style.fontWeight = 'bold';
    } else {
      // All other categories - gray
      categoryCell.style.backgroundColor = '#e9ecef';
      categoryCell.style.color = '#495057';
      categoryCell.style.fontWeight = 'bold';
    }
    row.appendChild(categoryCell);
    
    // Cached At
    const cachedCell = document.createElement('td');
    if (animal.cachedAt) {
      const cachedDate = new Date(animal.cachedAt);
      cachedCell.textContent = cachedDate.toLocaleDateString() + ' ' + cachedDate.toLocaleTimeString();
    } else {
      cachedCell.textContent = 'N/A';
    }
    cachedCell.style.padding = '8px';
    cachedCell.style.border = '1px solid #000';
    row.appendChild(cachedCell);
    
    // Actions
    const actionsCell = document.createElement('td');
    actionsCell.style.padding = '8px';
    actionsCell.style.border = '1px solid #000';
    
    // View Details button
    const viewBtn = document.createElement('button');
    viewBtn.textContent = 'View Details';
    viewBtn.className = 'btn btn-secondary';
    viewBtn.style.marginRight = '5px';
    viewBtn.style.padding = '4px 8px';
    viewBtn.style.fontSize = '0.9em';
    viewBtn.addEventListener('click', () => {
      showAnimalDetailsModal(animal);
    });
    actionsCell.appendChild(viewBtn);
    
    // Change Category button
    const changeCategoryBtn = document.createElement('button');
    changeCategoryBtn.textContent = 'Change Category';
    changeCategoryBtn.className = 'btn btn-secondary';
    changeCategoryBtn.style.marginRight = '5px';
    changeCategoryBtn.style.padding = '4px 8px';
    changeCategoryBtn.style.fontSize = '0.9em';
    changeCategoryBtn.addEventListener('click', async () => {
      // Get current categories (support both old and new format)
      const currentCategories = animal.categories || (animal.category ? [animal.category] : ['My Herd']);
      
      // Create checkbox container for multi-select
      const checkboxContainer = document.createElement('div');
      checkboxContainer.style.maxHeight = '300px';
      checkboxContainer.style.overflowY = 'auto';
      checkboxContainer.style.border = '1px solid #ddd';
      checkboxContainer.style.borderRadius = '4px';
      checkboxContainer.style.padding = '10px';
      checkboxContainer.style.marginBottom = '15px';
      
      const checkboxes = [];
      availableCategories.forEach(cat => {
        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.padding = '5px';
        label.style.cursor = 'pointer';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = cat;
        checkbox.checked = currentCategories.includes(cat);
        checkbox.style.marginRight = '8px';
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(cat));
        checkboxContainer.appendChild(label);
        checkboxes.push(checkbox);
      });
      
      // Mode selector (replace, add, remove)
      const modeContainer = document.createElement('div');
      modeContainer.style.marginBottom = '15px';
      modeContainer.innerHTML = `
        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Operation Mode:</label>
        <select id="category-mode-select" style="width: 100%; padding: 8px;">
          <option value="replace">Replace all categories</option>
          <option value="add">Add to existing categories</option>
          <option value="remove">Remove selected categories</option>
        </select>
      `;
      
      // Create modal-like dialog
      const dialog = document.createElement('div');
      dialog.style.position = 'fixed';
      dialog.style.top = '0';
      dialog.style.left = '0';
      dialog.style.width = '100%';
      dialog.style.height = '100%';
      dialog.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      dialog.style.display = 'flex';
      dialog.style.justifyContent = 'center';
      dialog.style.alignItems = 'center';
      dialog.style.zIndex = '10000';
      
      const dialogContent = document.createElement('div');
      dialogContent.style.backgroundColor = 'white';
      dialogContent.style.padding = '20px';
      dialogContent.style.borderRadius = '8px';
      dialogContent.style.minWidth = '350px';
      dialogContent.style.maxWidth = '500px';
      dialogContent.style.maxHeight = '80vh';
      dialogContent.style.overflowY = 'auto';
      dialogContent.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
      
      dialogContent.innerHTML = `
        <h3 style="margin-top: 0;">Change Categories</h3>
        <p style="margin-bottom: 10px;">Animal: ${animal.animalName || animal.registrationNumber}</p>
        <p style="margin-bottom: 10px; font-size: 0.9em; color: #666;">Current categories: ${currentCategories.join(', ')}</p>
      `;
      
      dialogContent.appendChild(modeContainer);
      dialogContent.appendChild(checkboxContainer);
      
      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.justifyContent = 'flex-end';
      buttonContainer.style.gap = '10px';
      buttonContainer.style.marginTop = '15px';
      
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.addEventListener('click', () => {
        document.body.removeChild(dialog);
      });
      
      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.className = 'btn btn-primary';
      saveBtn.addEventListener('click', async () => {
        const selectedCategories = checkboxes.filter(cb => cb.checked).map(cb => cb.value);
        const mode = document.getElementById('category-mode-select').value;
        
        if (selectedCategories.length === 0 && mode !== 'remove') {
          alert('Please select at least one category');
          return;
        }
        
        try {
          const result = await window.electronAPI.updateAnimalCategories(animal.registrationNumber, selectedCategories, mode);
          if (result.success) {
            // Update local data and refresh display
            animal.categories = result.categories || selectedCategories;
            animal.category = animal.categories[0] || 'My Herd'; // Keep backward compatibility
            // Reload inventory to get fresh data
            await loadInventory();
            // Also refresh cached animals dropdowns
            loadCachedAnimals();
            document.body.removeChild(dialog);
          } else {
            alert('Error updating categories: ' + (result.error || 'Unknown error'));
          }
        } catch (error) {
          alert('Error updating categories: ' + error.message);
        }
      });
      
      buttonContainer.appendChild(cancelBtn);
      buttonContainer.appendChild(saveBtn);
      dialogContent.appendChild(buttonContainer);
      dialog.appendChild(dialogContent);
      document.body.appendChild(dialog);
      
      // Close on click outside
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          document.body.removeChild(dialog);
        }
      });
      
      // Close on Escape key
      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          document.body.removeChild(dialog);
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    });
    actionsCell.appendChild(changeCategoryBtn);
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'btn btn-secondary';
    deleteBtn.style.padding = '4px 8px';
    deleteBtn.style.fontSize = '0.9em';
    deleteBtn.style.backgroundColor = '#dc3545';
    deleteBtn.style.color = 'white';
    deleteBtn.style.borderColor = '#dc3545';
    deleteBtn.addEventListener('click', async () => {
      if (confirm(`Are you sure you want to delete ${animal.animalName || animal.registrationNumber} from the cache?`)) {
        try {
          const result = await window.electronAPI.deleteCachedAnimal(animal.registrationNumber);
          if (result.success) {
            // Remove from selected animals if it was selected
            selectedAnimals.delete(animal.registrationNumber);
            // Remove from local array and refresh display
            allInventoryAnimals = allInventoryAnimals.filter(a => a.registrationNumber !== animal.registrationNumber);
            updateSelectedCount();
            displayInventory();
            // Also refresh cached animals dropdowns
            loadCachedAnimals();
          } else {
            alert('Error deleting animal: ' + (result.error || 'Unknown error'));
          }
        } catch (error) {
          alert('Error deleting animal: ' + error.message);
        }
      }
    });
    actionsCell.appendChild(deleteBtn);
    
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  inventoryResultsContainer.appendChild(table);
}

// Update selected count display
function updateSelectedCount() {
  const count = selectedAnimals.size;
  if (selectedCountSpan) {
    selectedCountSpan.textContent = count;
  }
  const selectedCountSpan2 = document.getElementById('selected-count-2');
  if (selectedCountSpan2) {
    selectedCountSpan2.textContent = count;
  }
  if (compareSelectedBtn) {
    compareSelectedBtn.disabled = count === 0;
  }
  if (bulkChangeCategoryBtn) {
    bulkChangeCategoryBtn.disabled = count === 0;
  }
  // Update export button state
  const exportSelectedBulkFileBtn = document.getElementById('export-selected-bulk-file-btn');
  if (exportSelectedBulkFileBtn) {
    exportSelectedBulkFileBtn.disabled = count === 0;
  }
}

// Compare selected animals
async function compareSelectedAnimals() {
  if (selectedAnimals.size === 0) {
    alert('Please select at least one animal to compare.');
    return;
  }

  // Switch to Animal Entry tab to show results
  const animalEntryTabButton = document.querySelector('.tab-button[data-tab="animal-entry"]');
  if (animalEntryTabButton) {
    animalEntryTabButton.click(); // This will trigger the tab switch logic
  }

  const registrationNumbers = Array.from(selectedAnimals);

  // Set the registration input and trigger processing
  registrationInput.value = registrationNumbers.join(', ');

  // Scroll to top to show the results
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Trigger the scrape button
  scrapeBtn.click();
}

// Bulk change category for selected animals
async function bulkChangeCategory() {
  if (selectedAnimals.size === 0) {
    alert('Please select at least one animal to change category.');
    return;
  }
  
  if (availableCategories.length === 0) {
    alert('No categories available.');
    return;
  }
  
  // Create checkbox container for multi-select
  const checkboxContainer = document.createElement('div');
  checkboxContainer.style.maxHeight = '300px';
  checkboxContainer.style.overflowY = 'auto';
  checkboxContainer.style.border = '1px solid #ddd';
  checkboxContainer.style.borderRadius = '4px';
  checkboxContainer.style.padding = '10px';
  checkboxContainer.style.marginBottom = '15px';
  
  const checkboxes = [];
  availableCategories.forEach(cat => {
    const label = document.createElement('label');
    label.style.display = 'block';
    label.style.padding = '5px';
    label.style.cursor = 'pointer';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = cat;
    checkbox.style.marginRight = '8px';
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(cat));
    checkboxContainer.appendChild(label);
    checkboxes.push(checkbox);
  });
  
  // Mode selector (replace, add, remove)
  const modeContainer = document.createElement('div');
  modeContainer.style.marginBottom = '15px';
  modeContainer.innerHTML = `
    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Operation Mode:</label>
    <select id="bulk-category-mode-select" style="width: 100%; padding: 8px;">
      <option value="replace">Replace all categories</option>
      <option value="add">Add to existing categories</option>
      <option value="remove">Remove selected categories</option>
    </select>
  `;
  
  // Create modal-like dialog
  const dialog = document.createElement('div');
  dialog.style.position = 'fixed';
  dialog.style.top = '0';
  dialog.style.left = '0';
  dialog.style.width = '100%';
  dialog.style.height = '100%';
  dialog.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  dialog.style.display = 'flex';
  dialog.style.justifyContent = 'center';
  dialog.style.alignItems = 'center';
  dialog.style.zIndex = '10000';
  
  const dialogContent = document.createElement('div');
  dialogContent.style.backgroundColor = 'white';
  dialogContent.style.padding = '20px';
  dialogContent.style.borderRadius = '8px';
  dialogContent.style.minWidth = '350px';
  dialogContent.style.maxWidth = '500px';
  dialogContent.style.maxHeight = '80vh';
  dialogContent.style.overflowY = 'auto';
  dialogContent.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
  
  dialogContent.innerHTML = `
    <h3 style="margin-top: 0;">Bulk Change Categories</h3>
    <p style="margin-bottom: 10px;">Change categories for <strong>${selectedAnimals.size}</strong> selected animal(s):</p>
  `;
  
  dialogContent.appendChild(modeContainer);
  dialogContent.appendChild(checkboxContainer);
  
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.justifyContent = 'flex-end';
  buttonContainer.style.gap = '10px';
  buttonContainer.style.marginTop = '15px';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(dialog);
  });
  
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Change Categories';
  saveBtn.className = 'btn btn-primary';
  saveBtn.addEventListener('click', async () => {
    const selectedCategories = checkboxes.filter(cb => cb.checked).map(cb => cb.value);
    const mode = document.getElementById('bulk-category-mode-select').value;
    
    if (selectedCategories.length === 0 && mode !== 'remove') {
      alert('Please select at least one category');
      return;
    }
    
    const registrationNumbers = Array.from(selectedAnimals);
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // Disable button during operation
    saveBtn.disabled = true;
    saveBtn.textContent = 'Updating...';
    
    // Update each animal's categories
    for (const regNum of registrationNumbers) {
      try {
        const result = await window.electronAPI.updateAnimalCategories(regNum, selectedCategories, mode);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          errors.push(`${regNum}: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        errorCount++;
        errors.push(`${regNum}: ${error.message}`);
      }
    }
    
    // Close dialog
    document.body.removeChild(dialog);
    
    // Show results
    const modeText = mode === 'replace' ? 'replaced with' : mode === 'add' ? 'added' : 'removed';
    if (errorCount === 0) {
      alert(`Successfully ${modeText} categories for ${successCount} animal(s).`);
    } else {
      alert(`Updated ${successCount} animal(s). ${errorCount} error(s):\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...' : ''}`);
    }
    
    // Reload inventory to get fresh data
    await loadInventory();
    selectedAnimals.clear();
    updateSelectedCount();
    loadCachedAnimals();
  });
  
  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(saveBtn);
  dialogContent.appendChild(buttonContainer);
  dialog.appendChild(dialogContent);
  document.body.appendChild(dialog);
  
  // Close on click outside
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      document.body.removeChild(dialog);
    }
  });
  
  // Close on Escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(dialog);
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

// Event listeners
if (refreshInventoryBtn) {
  refreshInventoryBtn.addEventListener('click', loadInventory);
}

if (inventoryFilter) {
  inventoryFilter.addEventListener('change', displayInventory);
}

if (categoryFilter) {
  categoryFilter.addEventListener('change', displayInventory);
}

if (inventorySearch) {
  inventorySearch.addEventListener('input', displayInventory);
}

if (compareSelectedBtn) {
  compareSelectedBtn.addEventListener('click', compareSelectedAnimals);
}

if (bulkChangeCategoryBtn) {
  bulkChangeCategoryBtn.addEventListener('click', bulkChangeCategory);
}

// Export selected animals to bulk file
const exportSelectedBulkFileBtn = document.getElementById('export-selected-bulk-file-btn');
if (exportSelectedBulkFileBtn) {
  exportSelectedBulkFileBtn.addEventListener('click', async () => {
    const selectedAnimalsArray = allInventoryAnimals.filter(a => selectedAnimals.has(a.registrationNumber));
    if (selectedAnimalsArray.length === 0) {
      alert('Please select at least one animal to export');
      return;
    }

    await exportAnimalsToBulkFile(selectedAnimalsArray, 'Export Selected Animals');
  });
}

// Export category to bulk file
const exportCategoryBulkFileBtn = document.getElementById('export-category-bulk-file-btn');
if (exportCategoryBulkFileBtn) {
  exportCategoryBulkFileBtn.addEventListener('click', async () => {
    const selectedCategory = categoryFilter ? categoryFilter.value : 'all';
    if (selectedCategory === 'all') {
      alert('Please select a specific category to export');
      return;
    }

    const categoryAnimals = allInventoryAnimals.filter(animal => {
      const animalCategories = normalizeCategoriesForDisplay(animal.categories || animal.category);
      return animalCategories.includes(selectedCategory);
    });

    if (categoryAnimals.length === 0) {
      alert(`No animals found in category "${selectedCategory}"`);
      return;
    }

    await exportAnimalsToBulkFile(categoryAnimals, `Export Category: ${selectedCategory}`, {
      category: selectedCategory,
      type: `category-${selectedCategory.toLowerCase().replace(/\s+/g, '-')}`
    });
  });
}

// Helper function to normalize categories for display/filtering
function normalizeCategoriesForDisplay(categoryOrArray) {
  if (!categoryOrArray) return ['My Herd'];
  if (Array.isArray(categoryOrArray)) return categoryOrArray.filter(c => c && typeof c === 'string');
  if (typeof categoryOrArray === 'string') return [categoryOrArray];
  return ['My Herd'];
}

// Export animals to bulk file - uses modal dialog
let exportDialogResolve = null;
let exportDialogAnimals = null;
let exportDialogOptions = null;

// Set up export dialog event listeners (once)
(function setupExportDialog() {
  const exportDialog = document.getElementById('bulk-file-export-dialog');
  const versionInput = document.getElementById('bulk-export-version');
  const typeInput = document.getElementById('bulk-export-type');
  const descriptionInput = document.getElementById('bulk-export-description');
  const confirmBtn = document.getElementById('confirm-bulk-file-export-btn');
  const cancelBtn = document.getElementById('cancel-bulk-file-export-btn');
  const closeBtn = document.getElementById('close-bulk-file-export-dialog-btn');

  if (!exportDialog || !confirmBtn || !cancelBtn || !closeBtn) return;

  const closeDialog = () => {
    if (exportDialog) {
      exportDialog.style.display = 'none';
    }
    if (exportDialogResolve) {
      exportDialogResolve();
      exportDialogResolve = null;
    }
    exportDialogAnimals = null;
    exportDialogOptions = null;
  };

  // Confirm button handler
  confirmBtn.addEventListener('click', async () => {
    if (!exportDialogAnimals || !versionInput || !typeInput) {
      closeDialog();
      return;
    }

    const version = versionInput.value.trim();
    const type = typeInput.value.trim();

    if (!version) {
      alert('Please enter a version number');
      return;
    }

    if (!type) {
      alert('Please enter a type/name');
      return;
    }

    const exportOptions = {
      version,
      type,
      category: exportDialogOptions?.category || null,
      description: descriptionInput?.value.trim() || null,
      filename: `${type}-v${version}.json`
    };

    try {
      const result = await window.electronAPI.exportAnimalsToBulkFile(exportDialogAnimals, exportOptions);

      if (result.success) {
        alert(`Bulk file exported successfully!\n\nFile: ${result.path}\nAnimals: ${result.animalCount}`);
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Error exporting animals to bulk file:', error);
      alert(`Error exporting: ${error.message}`);
    }

    closeDialog();
  });

  // Cancel button
  cancelBtn.addEventListener('click', closeDialog);

  // Close button
  closeBtn.addEventListener('click', closeDialog);

  // Close on click outside
  exportDialog.addEventListener('click', (e) => {
    if (e.target === exportDialog) {
      closeDialog();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && exportDialog && exportDialog.style.display === 'block') {
      closeDialog();
    }
  });

  // Allow Enter key to submit from inputs
  [versionInput, typeInput, descriptionInput].forEach(input => {
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmBtn.click();
        }
      });
    }
  });
})();

async function exportAnimalsToBulkFile(animals, title, options = {}) {
  return new Promise((resolve) => {
    const exportDialog = document.getElementById('bulk-file-export-dialog');
    const exportTitle = document.getElementById('bulk-file-export-title');
    const versionInput = document.getElementById('bulk-export-version');
    const typeInput = document.getElementById('bulk-export-type');
    const descriptionInput = document.getElementById('bulk-export-description');

    if (!exportDialog || !versionInput || !typeInput) {
      alert('Export dialog elements not found');
      resolve();
      return;
    }

    // Store for use by event handlers
    exportDialogResolve = resolve;
    exportDialogAnimals = animals;
    exportDialogOptions = options;

    // Set title
    if (exportTitle) {
      exportTitle.textContent = title || 'Export to Bulk File';
    }

    // Set default values
    versionInput.value = options.version || '1.0.0';
    typeInput.value = options.type || 'bulk-file';
    if (descriptionInput) {
      descriptionInput.value = options.description || '';
    }

    // Show dialog and focus first input
    exportDialog.style.display = 'block';
    versionInput.focus();
    versionInput.select();
  });
}

// Delete category animals button
if (deleteCategoryBtn) {
  deleteCategoryBtn.addEventListener('click', async () => {
    if (availableCategories.length === 0) {
      alert('No categories available.');
      return;
    }
    
    // Create a simple selection dialog using select element
    const categorySelect = document.createElement('select');
    categorySelect.style.width = '100%';
    categorySelect.style.padding = '8px';
    categorySelect.style.marginBottom = '15px';
    categorySelect.style.fontSize = '14px';
    
    availableCategories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      categorySelect.appendChild(option);
    });
    
    // Create modal-like dialog
    const dialog = document.createElement('div');
    dialog.style.position = 'fixed';
    dialog.style.top = '0';
    dialog.style.left = '0';
    dialog.style.width = '100%';
    dialog.style.height = '100%';
    dialog.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    dialog.style.display = 'flex';
    dialog.style.justifyContent = 'center';
    dialog.style.alignItems = 'center';
    dialog.style.zIndex = '10000';
    
    const dialogContent = document.createElement('div');
    dialogContent.style.backgroundColor = 'white';
    dialogContent.style.padding = '20px';
    dialogContent.style.borderRadius = '8px';
    dialogContent.style.minWidth = '300px';
    dialogContent.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    
    dialogContent.innerHTML = `
      <h3 style="margin-top: 0; color: #dc3545;">Delete Category Animals</h3>
      <p style="margin-bottom: 10px;">Select a category to delete all animals from:</p>
    `;
    
    dialogContent.appendChild(categorySelect);
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '15px';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Animals';
    deleteBtn.className = 'btn btn-secondary';
    deleteBtn.style.backgroundColor = '#dc3545';
    deleteBtn.style.color = 'white';
    deleteBtn.addEventListener('click', async () => {
      const categoryToDelete = categorySelect.value;
      
      if (availableCategories.includes(categoryToDelete)) {
        const confirmMessage = `Are you sure you want to delete ALL animals in the "${categoryToDelete}" category?\n\nThis action cannot be undone.`;
        if (confirm(confirmMessage)) {
            try {
            const result = await window.electronAPI.deleteAnimalsByCategory(categoryToDelete);
            if (result.success) {
              alert(`Successfully deleted ${result.deletedCount} animal(s) from category "${categoryToDelete}".`);
              // Reload inventory to get fresh data
              await loadInventory();
              selectedAnimals.clear();
              updateSelectedCount();
              // Also refresh cached animals dropdowns
              loadCachedAnimals();
              document.body.removeChild(dialog);
            } else {
              alert('Error deleting animals: ' + (result.error || 'Unknown error'));
            }
          } catch (error) {
            alert('Error deleting animals: ' + error.message);
          }
        }
      } else {
        alert('Invalid category selected');
      }
    });
    
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(deleteBtn);
    dialogContent.appendChild(buttonContainer);
    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);
    
    // Close on click outside
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog);
      }
    });
    
    // Close on Escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(dialog);
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  });
}

// Initialize selected count
updateSelectedCount();


// Modal functionality
const animalDetailsModal = document.getElementById('animal-details-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalAnimalName = document.getElementById('modal-animal-name');
const modalAnimalDetails = document.getElementById('modal-animal-details');

// Close modal when clicking the X button
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', () => {
    animalDetailsModal.style.display = 'none';
  });
}

// Close modal when clicking outside of it
if (animalDetailsModal) {
  animalDetailsModal.addEventListener('click', (e) => {
    if (e.target === animalDetailsModal) {
      animalDetailsModal.style.display = 'none';
    }
  });
}

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && animalDetailsModal.style.display === 'block') {
    animalDetailsModal.style.display = 'none';
  }
});

// Show animal details in modal
async function showAnimalDetailsModal(animal) {
  if (!animalDetailsModal || !modalAnimalName || !modalAnimalDetails) {
    console.error('Modal elements not found');
    return;
  }
  
  // Set animal name in header
  modalAnimalName.textContent = `${animal.animalName || 'Unknown'} (${animal.registrationNumber})`;
  
  // Show loading state
  modalAnimalDetails.innerHTML = '<p>Loading animal details...</p>';
  animalDetailsModal.style.display = 'block';
  
  try {
    // Process the animal to get its EPD data
    const result = await window.electronAPI.scrapeEPD(animal.registrationNumber);
    
    if (result.success && result.data) {
      const animalData = result.data;
      
      // Fetch percentile data for color coding
      let percentileData = null;
      try {
        const animalType = (animalData.sex || '').toUpperCase().includes('COW') || 
                           (animalData.sex || '').toUpperCase().includes('FEMALE') ? 'cow' : 'bull';
        percentileData = await window.electronAPI.getPercentileData(animalType);
      } catch (error) {
        console.error('Error fetching percentile data for modal:', error);
      }
      
      // Build HTML with animal info
      let html = '<div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 6px;">';
      html += `<p><strong>Registration Number:</strong> ${animal.registrationNumber}</p>`;
      html += `<p><strong>Name:</strong> ${animalData.animalName || 'N/A'}</p>`;
      html += `<p><strong>Sex:</strong> ${animalData.sex || 'N/A'}</p>`;
      if (animalData.additionalInfo) {
        if (animalData.additionalInfo.Sire) {
          html += `<p><strong>Sire:</strong> ${animalData.additionalInfo.Sire}</p>`;
        }
        if (animalData.additionalInfo.Dam) {
          html += `<p><strong>Dam:</strong> ${animalData.additionalInfo.Dam}</p>`;
        }
        if (animalData.additionalInfo.BD) {
          html += `<p><strong>Birth Date:</strong> ${animalData.additionalInfo.BD}</p>`;
        }
      }
      html += '</div>';
      
      if (animalData.epdValues && Object.keys(animalData.epdValues).length > 0) {
        // Create EPD table with color coding
        html += '<h3 style="margin-top: 20px; margin-bottom: 10px;">EPD Values</h3>';
        html += '<div style="overflow-x: auto;">';
        html += '<table class="epd-table" style="border-collapse: collapse; width: 100%; margin-top: 10px;">';
        html += '<thead><tr style="background-color: #E0E0E0; font-weight: bold;">';
        html += '<th style="padding: 8px; border: 1px solid #000; text-align: center;">Trait</th>';
        html += '<th style="padding: 8px; border: 1px solid #000; text-align: center;">EPD</th>';
        html += '<th style="padding: 8px; border: 1px solid #000; text-align: center;">% Rank</th>';
        html += '</tr></thead><tbody>';
        
        // Get all traits and sort them
        const traits = Object.keys(animalData.epdValues);
        const sortedTraits = traits.sort((a, b) => {
          const indexA = traitOrder.indexOf(a);
          const indexB = traitOrder.indexOf(b);
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return a.localeCompare(b);
        });
        
        sortedTraits.forEach(trait => {
          const epdData = animalData.epdValues[trait];
          let epd = epdData?.epd || 'N/A';
          const percentRank = epdData?.percentRank || 'N/A';
          
          // Format EPD value (3 decimals for FAT, 2 for others)
          if (epd !== 'N/A' && typeof epd === 'string') {
            const cleanedEPD = epd.replace(/^I\s*/i, '').trim();
            const epdNum = parseFloat(cleanedEPD);
            if (!isNaN(epdNum)) {
              const decimals = trait === 'FAT' ? 3 : 2;
              const sign = epdNum >= 0 ? '+' : '';
              epd = sign + epdNum.toFixed(decimals);
            }
          } else if (typeof epd === 'number') {
            const decimals = trait === 'FAT' ? 3 : 2;
            const sign = epd >= 0 ? '+' : '';
            epd = sign + epd.toFixed(decimals);
          }
          
          // Get color coding
          let bgColor = '#FFFFFF';
          let textColor = '#000000';
          if (percentRank !== 'N/A' && percentRank !== null && colorCriteria) {
            const epdNum = parseFloat(epd);
            const animalType = (animalData.sex || '').toUpperCase().includes('COW') || 
                               (animalData.sex || '').toUpperCase().includes('FEMALE') ? 'cow' : 'bull';
            const colors = getColorForTrait(trait, percentRank.toString(), isNaN(epdNum) ? null : epdNum, percentileData, animalType);
            bgColor = colors.bgColor;
            textColor = colors.textColor;
          }
          
          html += '<tr>';
          html += `<td style="padding: 8px; border: 1px solid #000; text-align: center; font-weight: bold;">${trait}</td>`;
          html += `<td style="padding: 8px; border: 1px solid #000; text-align: center; background-color: ${bgColor}; color: ${textColor};">${epd}</td>`;
          html += `<td style="padding: 8px; border: 1px solid #000; text-align: center; background-color: ${bgColor}; color: ${textColor};">${percentRank}</td>`;
          html += '</tr>';
        });
        
        html += '</tbody></table>';
        html += '</div>';
      } else {
        html += '<p style="color: #666; margin-top: 20px;">No EPD data available for this animal.</p>';
      }
      
      modalAnimalDetails.innerHTML = html;
    } else {
      modalAnimalDetails.innerHTML = '<p style="color: #dc3545;">Error loading animal details: ' + (result.error || 'Unknown error') + '</p>';
    }
  } catch (error) {
    console.error('Error loading animal details:', error);
    modalAnimalDetails.innerHTML = '<p style="color: #dc3545;">Error loading animal details: ' + error.message + '</p>';
  }
}

// Category Management Modal
const categoryManagementModal = document.getElementById('category-management-modal');
const closeCategoryModalBtn = document.getElementById('close-category-modal-btn');
const categoryManagementContent = document.getElementById('category-management-content');
const addCategoryBtn = document.getElementById('add-category-btn');

// Category Input Modal
const categoryInputModal = document.getElementById('category-input-modal');
const closeCategoryInputModalBtn = document.getElementById('close-category-input-modal-btn');
const newCategoryNameInput = document.getElementById('new-category-name');
const saveCategoryBtn = document.getElementById('save-category-btn');
const cancelCategoryBtn = document.getElementById('cancel-category-btn');

// Close category input modal
if (closeCategoryInputModalBtn) {
  closeCategoryInputModalBtn.addEventListener('click', () => {
    categoryInputModal.style.display = 'none';
    if (newCategoryNameInput) newCategoryNameInput.value = '';
  });
}

if (cancelCategoryBtn) {
  cancelCategoryBtn.addEventListener('click', () => {
    categoryInputModal.style.display = 'none';
    if (newCategoryNameInput) newCategoryNameInput.value = '';
  });
}

// Close category input modal when clicking outside
if (categoryInputModal) {
  categoryInputModal.addEventListener('click', (e) => {
    if (e.target === categoryInputModal) {
      categoryInputModal.style.display = 'none';
      if (newCategoryNameInput) newCategoryNameInput.value = '';
    }
  });
}

// Close category input modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && categoryInputModal && categoryInputModal.style.display === 'block') {
    categoryInputModal.style.display = 'none';
    if (newCategoryNameInput) newCategoryNameInput.value = '';
  }
});

// Save category from input modal
if (saveCategoryBtn && newCategoryNameInput) {
  const saveCategory = async () => {
    const categoryName = newCategoryNameInput.value.trim();
    
    if (!categoryName) {
      alert('Please enter a category name');
      return;
    }
    
    try {
      console.log('Adding category:', categoryName);
      const result = await window.electronAPI.addCategory(categoryName);
      console.log('Add category result:', result);
      
      if (result.success) {
        // Close input modal and clear input
        categoryInputModal.style.display = 'none';
        newCategoryNameInput.value = '';
        
        // Refresh categories and modal
        await loadCategoriesFromConfig();
        showCategoryManagementModal();
      } else {
        alert('Error adding category: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error adding category:', error);
      alert('Error adding category: ' + error.message);
    }
  };
  
  saveCategoryBtn.addEventListener('click', saveCategory);
  
  // Allow Enter key to submit
  newCategoryNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveCategory();
    }
  });
}

// Show category input modal
function showCategoryInputModal() {
  if (categoryInputModal) {
    categoryInputModal.style.display = 'block';
    if (newCategoryNameInput) {
      newCategoryNameInput.focus();
      newCategoryNameInput.value = '';
    }
  }
}

// Close category modal
if (closeCategoryModalBtn) {
  closeCategoryModalBtn.addEventListener('click', () => {
    categoryManagementModal.style.display = 'none';
  });
}

// Close modal when clicking outside
if (categoryManagementModal) {
  categoryManagementModal.addEventListener('click', (e) => {
    if (e.target === categoryManagementModal) {
      categoryManagementModal.style.display = 'none';
    }
  });
}

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && categoryManagementModal && categoryManagementModal.style.display === 'block') {
    categoryManagementModal.style.display = 'none';
  }
});

// Show category management modal
async function showCategoryManagementModal() {
  if (!categoryManagementModal || !categoryManagementContent) {
    console.error('Category management modal elements not found');
    return;
  }
  
  // Load current categories
  await loadCategoriesFromConfig();
  
  // Get all animals to count per category
  const categoryCounts = {};
  allInventoryAnimals.forEach(animal => {
    const cat = animal.category || 'My Herd';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });
  
  // Build modal content
  let html = '<div style="margin-bottom: 20px;">';
  html += '<table style="width: 100%; border-collapse: collapse;">';
  html += '<thead><tr style="background-color: #E0E0E0; font-weight: bold;">';
  html += '<th style="padding: 8px; border: 1px solid #000; text-align: left;">Category</th>';
  html += '<th style="padding: 8px; border: 1px solid #000; text-align: center;">Animal Count</th>';
  html += '<th style="padding: 8px; border: 1px solid #000; text-align: center;">Actions</th>';
  html += '</tr></thead><tbody>';
  
  const predefinedCategories = ['My Herd'];
  
  availableCategories.forEach(category => {
    const isPredefined = predefinedCategories.includes(category);
    const count = categoryCounts[category] || 0;
    // Badge colors - "My Herd" gets green, others get gray (custom colors removed)
    const badgeColor = category === 'My Herd' ? '#d4edda' : '#e9ecef';
    const textColor = category === 'My Herd' ? '#155724' : '#495057';
    
    html += '<tr>';
    html += `<td style="padding: 8px; border: 1px solid #000; background-color: ${badgeColor}; color: ${textColor}; font-weight: bold;">${category}</td>`;
    html += `<td style="padding: 8px; border: 1px solid #000; text-align: center;">${count}</td>`;
    html += '<td style="padding: 8px; border: 1px solid #000; text-align: center;">';
    
    if (!isPredefined) {
      html += `<button class="btn btn-secondary delete-category-btn" data-category="${category}" style="padding: 4px 8px; font-size: 0.9em; margin-right: 5px;">Delete</button>`;
    } else {
      html += '<span style="color: #999; font-style: italic;">Predefined</span>';
    }
    
    html += '</td>';
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  html += '</div>';
  
  categoryManagementContent.innerHTML = html;
  categoryManagementModal.style.display = 'block';
  
  // Add event listeners for delete buttons
  document.querySelectorAll('.delete-category-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const categoryToDelete = btn.dataset.category;
      
      try {
        const result = await window.electronAPI.deleteCategory(categoryToDelete);
        if (result.success) {
          // Refresh categories and modal
          await loadCategoriesFromConfig();
          showCategoryManagementModal();
        } else {
          alert('Error deleting category: ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        alert('Error deleting category: ' + error.message);
      }
    });
  });
}

// Add category button - show input modal
if (addCategoryBtn) {
  addCategoryBtn.addEventListener('click', () => {
    showCategoryInputModal();
  });
}

// Manage categories button
if (manageCategoriesBtn) {
  manageCategoriesBtn.addEventListener('click', showCategoryManagementModal);
}

// Load inventory on page load
loadInventory();

// ==================== Bulk File Management ====================

let bulkFileStatus = null;
let pendingUpdates = [];

// Load bulk file status on page load
async function loadBulkFileStatus() {
  try {
    const result = await window.electronAPI.getBulkFileStatus();
    if (result.success) {
      bulkFileStatus = result;
      displayBulkFileStatus(result);
    } else {
      console.error('Error loading bulk file status:', result.error);
    }
  } catch (error) {
    console.error('Error loading bulk file status:', error);
  }
}

// Display bulk file status
function displayBulkFileStatus(status) {
  const container = document.getElementById('bulk-files-status-container');
  if (!container) return;

  if (!status.bulkFiles || status.bulkFiles.length === 0) {
    container.innerHTML = '<div class="placeholder"><p>No bulk files available</p></div>';
    return;
  }

  console.log('[UI] Displaying bulk file status:', status.bulkFiles.length, 'files');
  
  let html = '<div style="display: grid; gap: 15px;">';
  
  status.bulkFiles.forEach((bf, index) => {
    console.log(`[UI] Processing bulk file ${index + 1}/${status.bulkFiles.length}:`, bf.id, bf.name);
    const statusBadge = getStatusBadge(bf.status);
    const versionInfo = bf.localVersion ? `v${bf.localVersion} → v${bf.manifestVersion}` : `v${bf.manifestVersion}`;
    
    // Escape HTML in user-provided content to prevent injection
    const safeName = (bf.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeDescription = (bf.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeId = (bf.id || '').replace(/"/g, '&quot;');
    // URL should already be encoded, but ensure it's safe for HTML attributes
    const safeUrl = (bf.url || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    
    html += `
      <div style="border: 1px solid #ddd; padding: 15px; border-radius: 5px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
          <div>
            <h3 style="margin: 0 0 5px 0;">${safeName}</h3>
            <p style="margin: 0; color: #666; font-size: 0.9em;">${safeDescription}</p>
          </div>
          ${statusBadge}
        </div>
        <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
          <div>Version: ${versionInfo}</div>
          <div>Animals: ${bf.animalCount || 0}</div>
          ${bf.lastProcessed ? `<div>Last Imported: ${new Date(bf.lastProcessed).toLocaleString()}</div>` : ''}
        </div>
        <div style="margin-top: 15px;">
          <button class="btn btn-primary bulk-file-import-btn" data-bulk-file-id="${safeId}" data-url="${safeUrl}" style="margin-right: 10px;" ${!bf.url ? 'disabled title="URL not available - check for updates first"' : ''}>
            ${bf.status === 'not-imported' ? 'Import' : bf.status === 'update-available' ? 'Update' : 'Re-import'}
          </button>
          ${bf.status === 'update-available' && !bf.ignored?.permanent ? `
            <button class="btn btn-secondary bulk-file-ignore-btn" data-bulk-file-id="${safeId}" data-version="${bf.manifestVersion}">
              Ignore Update
            </button>
          ` : ''}
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  console.log('[UI] Generated HTML length:', html.length, 'characters');
  container.innerHTML = html;
  
  // Attach event listeners
  attachBulkFileEventListeners(container);

}

function attachBulkFileEventListeners(container) {
  container.querySelectorAll('.bulk-file-import-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const bulkFileId = e.target.dataset.bulkFileId;
      const url = e.target.dataset.url;
      if (!url) {
        alert('URL not available. Please check for updates first.');
        return;
      }
      await showBulkFileImportDialog(bulkFileId, url);
    });
  });

  container.querySelectorAll('.bulk-file-ignore-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const bulkFileId = e.target.dataset.bulkFileId;
      const version = e.target.dataset.version;
      await ignoreBulkFileUpdate(bulkFileId, version);
    });
  });
}

function displayBulkFileStatusFallback(status, container) {
  let html = '<div style="display: grid; gap: 15px;">';
  
  status.bulkFiles.forEach(bf => {
    const statusBadge = getStatusBadge(bf.status);
    const versionInfo = bf.localVersion ? `v${bf.localVersion} → v${bf.manifestVersion}` : `v${bf.manifestVersion}`;
    
    html += `
      <div style="border: 1px solid #ddd; padding: 15px; border-radius: 5px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
          <div>
            <h3 style="margin: 0 0 5px 0;">${bf.name}</h3>
            <p style="margin: 0; color: #666; font-size: 0.9em;">${bf.description || ''}</p>
          </div>
          ${statusBadge}
        </div>
        <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
          <div>Version: ${versionInfo}</div>
          <div>Animals: ${bf.animalCount || 0}</div>
          ${bf.lastProcessed ? `<div>Last Imported: ${new Date(bf.lastProcessed).toLocaleString()}</div>` : ''}
        </div>
        <div style="margin-top: 15px;">
          <button class="btn btn-primary bulk-file-import-btn" data-bulk-file-id="${bf.id}" data-url="" style="margin-right: 10px;" disabled>
            ${bf.status === 'not-imported' ? 'Import' : bf.status === 'update-available' ? 'Update' : 'Re-import'} (Check for updates first)
          </button>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

function getStatusBadge(status) {
  const badges = {
    'up-to-date': '<span style="background-color: #4caf50; color: white; padding: 3px 8px; border-radius: 3px; font-size: 0.85em;">Up to Date</span>',
    'update-available': '<span style="background-color: #ff9800; color: white; padding: 3px 8px; border-radius: 3px; font-size: 0.85em;">Update Available</span>',
    'not-imported': '<span style="background-color: #2196f3; color: white; padding: 3px 8px; border-radius: 3px; font-size: 0.85em;">Not Imported</span>'
  };
  return badges[status] || '';
}

// Show bulk file import dialog
async function showBulkFileImportDialog(bulkFileId, url) {
  const dialog = document.getElementById('bulk-file-import-dialog');
  const content = document.getElementById('bulk-file-import-content');
  
  if (!dialog || !content) return;

  // Get available categories
  const categories = await window.electronAPI.getAvailableCategories();

  content.innerHTML = `
    <div>
      <p><strong>Importing:</strong> ${bulkFileId}</p>
      
      <div style="margin-top: 20px;">
        <label><strong>Category Assignment Mode:</strong></label>
        <select id="bulk-import-category-mode" style="width: 100%; padding: 8px; margin-top: 5px;">
          <option value="use-file-category">Use file's category</option>
          <option value="user-selected">Select category</option>
          <option value="add-to-existing">Add to existing categories</option>
        </select>
      </div>

      <div id="bulk-import-category-select-container" style="margin-top: 15px; display: none;">
        <label><strong>Select Category:</strong></label>
        <select id="bulk-import-category-select" style="width: 100%; padding: 8px; margin-top: 5px;">
          ${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
        </select>
      </div>

      <div style="margin-top: 15px;">
        <label>
          <input type="checkbox" id="bulk-import-create-category" checked>
          Create category if it doesn't exist
        </label>
      </div>

      <div style="margin-top: 15px;">
        <label><strong>Update Strategy:</strong></label>
        <select id="bulk-import-update-strategy" style="width: 100%; padding: 8px; margin-top: 5px;">
          <option value="merge" selected>Always update</option>
          <option value="update-if-newer">Update if newer</option>
          <option value="skip-existing">Skip existing animals</option>
          <option value="add-categories-only">Add categories only</option>
        </select>
      </div>

      <div style="margin-top: 25px; display: flex; gap: 10px; justify-content: flex-end;">
        <button id="bulk-import-cancel-btn" class="btn btn-secondary">Cancel</button>
        <button id="bulk-import-confirm-btn" class="btn btn-primary">Import</button>
      </div>
    </div>
  `;

  // Show category select when user-selected mode is chosen
  const categoryModeSelect = content.querySelector('#bulk-import-category-mode');
  const categorySelectContainer = content.querySelector('#bulk-import-category-select-container');
  
  categoryModeSelect.addEventListener('change', () => {
    if (categoryModeSelect.value === 'user-selected') {
      categorySelectContainer.style.display = 'block';
    } else {
      categorySelectContainer.style.display = 'none';
    }
  });

  // Handle cancel
  content.querySelector('#bulk-import-cancel-btn').addEventListener('click', () => {
    dialog.style.display = 'none';
  });

  // Handle confirm
  content.querySelector('#bulk-import-confirm-btn').addEventListener('click', async () => {
    const categoryMode = categoryModeSelect.value;
    const userSelectedCategories = categoryMode === 'user-selected' 
      ? [content.querySelector('#bulk-import-category-select').value]
      : null;
    const createCategoryIfMissing = content.querySelector('#bulk-import-create-category').checked;
    const updateStrategy = content.querySelector('#bulk-import-update-strategy').value;

    const options = {
      categoryMode,
      userSelectedCategories,
      createCategoryIfMissing,
      updateStrategy
    };

    dialog.style.display = 'none';
    await importBulkFile(bulkFileId, url, options);
  });

  dialog.style.display = 'block';
}

// Import bulk file
async function importBulkFile(bulkFileId, url, options) {
  try {
    // Show progress
    const statusContainer = document.getElementById('bulk-files-status-container');
    const originalContent = statusContainer.innerHTML;
    statusContainer.innerHTML = '<div class="placeholder"><p>Importing bulk file... Please wait.</p></div>';

    // Listen for progress updates
    window.electronAPI.onBulkFileProgress((data) => {
      statusContainer.innerHTML = `<div class="placeholder"><p>${data.message || 'Processing...'} (${data.progress || 0}%)</p></div>`;
    });

    const result = await window.electronAPI.importBulkFile(bulkFileId, url, options);
    
    if (result.success) {
      alert(`Bulk file imported successfully!\n\nImported: ${result.importedCount}\nUpdated: ${result.updatedCount || 0}\nSkipped: ${result.skippedCount || 0}`);
      // Reload status
      await loadBulkFileStatus();
      // Reload categories to show any newly created categories
      await loadCategoriesFromConfig();
      // Refresh herd inventory to show newly imported/updated animals
      await loadInventory();
    } else {
      alert(`Error importing bulk file: ${result.error}`);
      statusContainer.innerHTML = originalContent;
    }
  } catch (error) {
    console.error('Error importing bulk file:', error);
    alert(`Error importing bulk file: ${error.message}`);
  }
}

// Ignore bulk file update
async function ignoreBulkFileUpdate(bulkFileId, version) {
  try {
    await window.electronAPI.ignoreBulkFileUpdate(bulkFileId, version, false);
    await loadBulkFileStatus();
  } catch (error) {
    console.error('Error ignoring bulk file update:', error);
    alert(`Error ignoring update: ${error.message}`);
  }
}

// Check for bulk file updates
async function checkBulkFileUpdates() {
  try {
    const result = await window.electronAPI.checkBulkFileUpdates();
    if (result.success) {
      pendingUpdates = result.pendingUpdates || [];
      if (pendingUpdates.length > 0) {
        showBulkFileUpdatesNotification(pendingUpdates);
      } else {
        alert('All bulk files are up to date.');
      }
    } else {
      alert(`Error checking for updates: ${result.error}`);
    }
  } catch (error) {
    console.error('Error checking for bulk file updates:', error);
    alert(`Error checking for updates: ${error.message}`);
  }
}

// Show bulk file updates notification
function showBulkFileUpdatesNotification(updates) {
  const notification = document.getElementById('bulk-file-updates-notification');
  const title = document.getElementById('bulk-file-updates-title');
  const message = document.getElementById('bulk-file-updates-message');
  
  if (!notification || !title || !message) return;

  title.textContent = `${updates.length} Bulk File Update${updates.length > 1 ? 's' : ''} Available`;
  message.textContent = updates.map(u => `${u.name} (v${u.manifestVersion})`).join(', ');
  
  notification.style.display = 'block';
}

// ==================== External Data Import ====================

let externalImportState = {
  currentStep: 1,
  filePath: null,
  headers: [],
  sampleRows: [],
  totalRows: 0,
  columnMappings: {
    registrationNumber: null,
    animalName: null,
    sex: null,
    epdTraits: {},
    percentRanks: {}
  },
  autoDetectedMappings: null
};

// Open external data import dialog
async function importExternalData() {
  const dialog = document.getElementById('external-data-import-dialog');
  if (!dialog) return;

  // Reset state
  externalImportState = {
    currentStep: 1,
    filePath: null,
    headers: [],
    sampleRows: [],
    totalRows: 0,
    columnMappings: {
      registrationNumber: null,
      animalName: null,
      sex: null,
      epdTraits: {},
      percentRanks: {}
    },
    autoDetectedMappings: null
  };

  // Show step 1, hide others
  showExternalImportStep(1);
  
  // Load categories for category dropdown
  try {
    const categories = await window.electronAPI.getAvailableCategories();
    const categorySelect = document.getElementById('external-import-category');
    if (categorySelect && categories && categories.length > 0) {
      categorySelect.innerHTML = categories.map(cat => 
        `<option value="${cat}">${cat}</option>`
      ).join('');
    }
  } catch (error) {
    console.error('Error loading categories:', error);
  }

  dialog.style.display = 'block';
}

// Show specific step
function showExternalImportStep(step) {
  externalImportState.currentStep = step;
  
  // Hide all steps
  for (let i = 1; i <= 4; i++) {
    const stepDiv = document.getElementById(`external-import-step${i}`);
    if (stepDiv) {
      stepDiv.style.display = 'none';
    }
  }

  // Show current step
  const currentStepDiv = document.getElementById(`external-import-step${step}`);
  if (currentStepDiv) {
    currentStepDiv.style.display = 'block';
  }

  // Update navigation buttons
  const prevBtn = document.getElementById('external-import-prev-btn');
  const nextBtn = document.getElementById('external-import-next-btn');
  const convertBtn = document.getElementById('external-import-convert-btn');

  if (prevBtn) {
    prevBtn.style.display = step > 1 ? 'block' : 'none';
  }
  if (nextBtn) {
    nextBtn.style.display = step < 4 ? 'block' : 'none';
  }
  if (convertBtn) {
    convertBtn.style.display = step === 4 ? 'block' : 'none';
  }
}

// Select external file
async function selectExternalFile() {
  try {
    // Show file picker dialog
    const pickerResult = await window.electronAPI.showExternalFilePicker();
    
    if (!pickerResult.success) {
      if (pickerResult.canceled) {
        return; // User cancelled
      }
      alert(`Error selecting file: ${pickerResult.error}`);
      return;
    }

    const filePath = pickerResult.filePath;
    externalImportState.filePath = filePath;

    // Show file info
    const fileInfo = document.getElementById('selected-file-info');
    const fileName = document.getElementById('selected-file-name');
    const fileDetails = document.getElementById('selected-file-details');
    
    if (fileInfo && fileName && fileDetails) {
      const pathParts = filePath.split(/[/\\]/);
      fileName.textContent = pathParts[pathParts.length - 1];
      fileDetails.textContent = `Path: ${filePath}`;
      fileInfo.style.display = 'block';
    }

    // Parse file
    try {
      const result = await window.electronAPI.parseExternalFile(filePath);
      if (result.success) {
        externalImportState.headers = result.headers;
        externalImportState.sampleRows = result.sampleRows;
        externalImportState.totalRows = result.totalRows;

        // Auto-detect mappings
        const mappingResult = await window.electronAPI.detectColumnMappings(result.headers, result.sampleRows);
        if (mappingResult.success) {
          externalImportState.autoDetectedMappings = mappingResult.mappings;
          externalImportState.columnMappings = JSON.parse(JSON.stringify(mappingResult.mappings));
        }

        // Move to step 2
        showExternalImportStep(2);
        showColumnMappingDialog();
      } else {
        alert(`Error parsing file: ${result.error}`);
      }
    } catch (error) {
      console.error('Error parsing file:', error);
      alert(`Error parsing file: ${error.message}`);
    }
  } catch (error) {
    console.error('Error selecting file:', error);
    alert(`Error selecting file: ${error.message}`);
  }
}

// Show column mapping dialog
function showColumnMappingDialog() {
  const container = document.getElementById('column-mapping-container');
  if (!container) return;

  const mappings = externalImportState.columnMappings;
  const headers = externalImportState.headers;

  let html = '<div style="display: grid; gap: 10px;">';

  // Registration Number (required)
  html += createMappingRow('Registration Number *', 'registrationNumber', headers, mappings.registrationNumber);

  // Animal Name
  html += createMappingRow('Animal Name', 'animalName', headers, mappings.animalName);

  // Sex
  html += createMappingRow('Sex', 'sex', headers, mappings.sex);

  // EPD Traits
  html += '<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;"><strong>EPD Traits:</strong></div>';
  const epdTraits = ['BW', 'WW', 'YW', 'CED', 'RADG', 'DMI', 'YH', 'SC', 'DOC', 'CLAW', 'ANGLE', 'PAP', 'HS', 'HP', 'CEM', 'MILK', 'TEAT', 'UDDR', 'FL', 'MW', 'MH', '$EN', 'CW', 'MARB', 'RE', 'FAT', '$M', '$B', '$C'];
  epdTraits.forEach(trait => {
    html += createMappingRow(`EPD: ${trait}`, `epd_${trait}`, headers, mappings.epdTraits[trait] || null);
    html += createMappingRow(`Percent Rank: ${trait}`, `pr_${trait}`, headers, mappings.percentRanks[trait] || null);
  });

  html += '</div>';
  container.innerHTML = html;
}

// Create a mapping row
function createMappingRow(label, fieldKey, headers, currentValue) {
  let html = `<div style="display: grid; grid-template-columns: 200px 1fr; gap: 10px; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">`;
  html += `<label style="font-weight: 500;">${label}:</label>`;
  html += `<select class="column-mapping-select" data-field="${fieldKey}" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px;">`;
  html += `<option value="">-- Skip --</option>`;
  
  headers.forEach((header, index) => {
    const selected = currentValue === index ? 'selected' : '';
    html += `<option value="${index}" ${selected}>${header}</option>`;
  });
  
  html += `</select></div>`;
  return html;
}

// Update column mappings from UI
function updateColumnMappings() {
  const selects = document.querySelectorAll('.column-mapping-select');
  const mappings = {
    registrationNumber: null,
    animalName: null,
    sex: null,
    epdTraits: {},
    percentRanks: {}
  };

  selects.forEach(select => {
    const field = select.dataset.field;
    const value = select.value ? parseInt(select.value) : null;

    if (field === 'registrationNumber') {
      mappings.registrationNumber = value;
    } else if (field === 'animalName') {
      mappings.animalName = value;
    } else if (field === 'sex') {
      mappings.sex = value;
    } else if (field.startsWith('epd_')) {
      const trait = field.replace('epd_', '');
      if (value !== null) {
        mappings.epdTraits[trait] = value;
      }
    } else if (field.startsWith('pr_')) {
      const trait = field.replace('pr_', '');
      if (value !== null) {
        mappings.percentRanks[trait] = value;
      }
    }
  });

  externalImportState.columnMappings = mappings;
}

// Auto-detect mappings
async function autoDetectMappings() {
  try {
    const result = await window.electronAPI.detectColumnMappings(
      externalImportState.headers,
      externalImportState.sampleRows
    );

    if (result.success) {
      externalImportState.columnMappings = JSON.parse(JSON.stringify(result.mappings));
      externalImportState.autoDetectedMappings = JSON.parse(JSON.stringify(result.mappings));
      showColumnMappingDialog();
    } else {
      alert(`Error detecting mappings: ${result.error}`);
    }
  } catch (error) {
    console.error('Error auto-detecting mappings:', error);
    alert(`Error: ${error.message}`);
  }
}

// Preview converted data
async function previewConvertedData() {
  const container = document.getElementById('preview-container');
  if (!container) return;

  // Update mappings from UI
  updateColumnMappings();

  // Validate registration number is mapped
  if (externalImportState.columnMappings.registrationNumber === null) {
    alert('Registration Number must be mapped. Please select a column for Registration Number.');
    return;
  }

  // Create preview table
  let html = '<table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">';
  html += '<thead><tr style="background-color: #f5f5f5; position: sticky; top: 0;">';
  html += '<th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Registration Number</th>';
  html += '<th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Name</th>';
  html += '<th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Sex</th>';
  
  // Add EPD trait columns
  const traits = Object.keys(externalImportState.columnMappings.epdTraits).filter(t => 
    externalImportState.columnMappings.epdTraits[t] !== null
  );
  traits.forEach(trait => {
    html += `<th style="padding: 8px; border: 1px solid #ddd; text-align: left;">${trait} EPD</th>`;
    if (externalImportState.columnMappings.percentRanks[trait]) {
      html += `<th style="padding: 8px; border: 1px solid #ddd; text-align: left;">${trait} %Rank</th>`;
    }
  });
  html += '</tr></thead><tbody>';

  // Show preview of first 10 rows
  const previewRows = externalImportState.sampleRows.slice(0, 10);
  previewRows.forEach(row => {
    const regNumIdx = externalImportState.columnMappings.registrationNumber;
    const nameIdx = externalImportState.columnMappings.animalName;
    const sexIdx = externalImportState.columnMappings.sex;

    html += '<tr>';
    html += `<td style="padding: 8px; border: 1px solid #ddd;">${row[regNumIdx] || ''}</td>`;
    html += `<td style="padding: 8px; border: 1px solid #ddd;">${nameIdx !== null ? (row[nameIdx] || '') : ''}</td>`;
    html += `<td style="padding: 8px; border: 1px solid #ddd;">${sexIdx !== null ? (row[sexIdx] || '') : ''}</td>`;
    
    traits.forEach(trait => {
      const traitIdx = externalImportState.columnMappings.epdTraits[trait];
      html += `<td style="padding: 8px; border: 1px solid #ddd;">${traitIdx !== null ? (row[traitIdx] || '') : ''}</td>`;
      const prIdx = externalImportState.columnMappings.percentRanks[trait];
      if (prIdx !== null && prIdx !== undefined) {
        html += `<td style="padding: 8px; border: 1px solid #ddd;">${row[prIdx] || ''}</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  html += `<p style="margin-top: 10px; color: #666; font-size: 0.9em;">Showing preview of first 10 rows. Total rows: ${externalImportState.totalRows}</p>`;
  
  container.innerHTML = html;
}

// Convert and save
async function convertExternalDataToBulkFile() {
  // Update mappings from UI
  updateColumnMappings();

  // Validate required fields
  if (externalImportState.columnMappings.registrationNumber === null) {
    alert('Registration Number must be mapped. Please select a column for Registration Number.');
    return;
  }

  const versionInput = document.getElementById('external-import-version');
  const typeInput = document.getElementById('external-import-type');
  const categorySelect = document.getElementById('external-import-category');
  const descriptionInput = document.getElementById('external-import-description');

  if (!versionInput || !versionInput.value.trim()) {
    alert('Version is required. Please enter a version number.');
    return;
  }

  if (!typeInput || !typeInput.value.trim()) {
    alert('Type/Name is required. Please enter a type/name.');
    return;
  }

  const metadata = {
    version: versionInput.value.trim(),
    type: typeInput.value.trim(),
    category: categorySelect ? categorySelect.value : 'My Herd',
    description: descriptionInput ? descriptionInput.value.trim() : ''
  };

  try {
    const convertBtn = document.getElementById('external-import-convert-btn');
    if (convertBtn) {
      convertBtn.disabled = true;
      convertBtn.textContent = 'Converting...';
    }

    const result = await window.electronAPI.convertExternalDataToBulkFile(
      externalImportState.filePath,
      externalImportState.columnMappings,
      metadata
    );

    if (result.success) {
      alert(`Bulk file created successfully!\n\nFile: ${result.path}\nAnimals: ${result.animalCount}`);
      
      // Close dialog
      const dialog = document.getElementById('external-data-import-dialog');
      if (dialog) {
        dialog.style.display = 'none';
      }

      // Optionally refresh bulk file status
      if (typeof loadBulkFileStatus === 'function') {
        loadBulkFileStatus();
      }
    } else {
      alert(`Error creating bulk file: ${result.error}`);
    }
  } catch (error) {
    console.error('Error converting external data:', error);
    alert(`Error: ${error.message}`);
  } finally {
    const convertBtn = document.getElementById('external-import-convert-btn');
    if (convertBtn) {
      convertBtn.disabled = false;
      convertBtn.textContent = 'Convert & Save';
    }
  }
}

// Event listeners for external data import
document.addEventListener('DOMContentLoaded', () => {
  // Import external data button
  const importBtn = document.getElementById('import-external-data-btn');
  if (importBtn) {
    importBtn.addEventListener('click', importExternalData);
  }

  // File selection
  const selectFileBtn = document.getElementById('select-external-file-btn');
  if (selectFileBtn) {
    selectFileBtn.addEventListener('click', selectExternalFile);
  }

  // Auto-detect mappings
  const autoDetectBtn = document.getElementById('auto-detect-mappings-btn');
  if (autoDetectBtn) {
    autoDetectBtn.addEventListener('click', autoDetectMappings);
  }

  // Navigation buttons
  const prevBtn = document.getElementById('external-import-prev-btn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (externalImportState.currentStep > 1) {
        showExternalImportStep(externalImportState.currentStep - 1);
      }
    });
  }

  const nextBtn = document.getElementById('external-import-next-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (externalImportState.currentStep === 2) {
        // Validate mappings before moving to preview
        updateColumnMappings();
        if (externalImportState.columnMappings.registrationNumber === null) {
          alert('Registration Number must be mapped. Please select a column for Registration Number.');
          return;
        }
        previewConvertedData();
        showExternalImportStep(3);
      } else if (externalImportState.currentStep === 3) {
        showExternalImportStep(4);
      }
    });
  }

  // Convert button
  const convertBtn = document.getElementById('external-import-convert-btn');
  if (convertBtn) {
    convertBtn.addEventListener('click', convertExternalDataToBulkFile);
  }

  // Cancel/Close buttons
  const cancelBtn = document.getElementById('external-import-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      const dialog = document.getElementById('external-data-import-dialog');
      if (dialog) {
        dialog.style.display = 'none';
      }
    });
  }

  const closeBtn = document.getElementById('close-external-import-dialog-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const dialog = document.getElementById('external-data-import-dialog');
      if (dialog) {
        dialog.style.display = 'none';
      }
    });
  }

  // Update mappings when selects change
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('column-mapping-select')) {
      updateColumnMappings();
    }
  });
});

// Event listeners for bulk file management
document.addEventListener('DOMContentLoaded', () => {
  // Check for updates button
  const checkUpdatesBtn = document.getElementById('check-bulk-updates-btn');
  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', checkBulkFileUpdates);
  }

  // Refresh status button
  const refreshStatusBtn = document.getElementById('refresh-bulk-status-btn');
  if (refreshStatusBtn) {
    refreshStatusBtn.addEventListener('click', loadBulkFileStatus);
  }

  // Close import dialog button
  const closeImportDialogBtn = document.getElementById('close-bulk-import-dialog-btn');
  if (closeImportDialogBtn) {
    closeImportDialogBtn.addEventListener('click', () => {
      document.getElementById('bulk-file-import-dialog').style.display = 'none';
    });
  }

  // Bulk file updates notification buttons
  const importAllBtn = document.getElementById('bulk-file-import-all-btn');
  if (importAllBtn) {
    importAllBtn.addEventListener('click', async () => {
      // Import all pending updates (for now, just show message)
      alert('Import all feature coming soon. Please import files individually from the Bulk Files tab.');
      document.getElementById('bulk-file-updates-notification').style.display = 'none';
    });
  }

  const importSelectedBtn = document.getElementById('bulk-file-import-selected-btn');
  if (importSelectedBtn) {
    importSelectedBtn.addEventListener('click', () => {
      // Switch to bulk files tab
      document.querySelector('[data-tab="bulk-files"]').click();
      document.getElementById('bulk-file-updates-notification').style.display = 'none';
    });
  }

  const ignoreBtn = document.getElementById('bulk-file-ignore-btn');
  if (ignoreBtn) {
    ignoreBtn.addEventListener('click', () => {
      document.getElementById('bulk-file-updates-notification').style.display = 'none';
    });
  }

  const dismissBtn = document.getElementById('bulk-file-dismiss-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      document.getElementById('bulk-file-updates-notification').style.display = 'none';
    });
  }

  // Listen for bulk file updates from main process
  window.electronAPI.onBulkFileUpdatesAvailable((data) => {
    if (data && data.pendingUpdates && data.pendingUpdates.length > 0) {
      pendingUpdates = data.pendingUpdates;
      showBulkFileUpdatesNotification(data.pendingUpdates);
    }
  });
});

// Load bulk file status on page load
loadBulkFileStatus();

// Tab Navigation Functionality
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    const targetTab = button.dataset.tab;
    
    // Remove active class from all buttons and contents
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Add active class to clicked button and corresponding content
    button.classList.add('active');
    const targetContent = document.getElementById(`${targetTab}-tab`);
    if (targetContent) {
      targetContent.classList.add('active');
    }
  });
});

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

// Helper function to strip HTML tags from text
function stripHtmlTags(html) {
  if (!html) return '';
  // Create a temporary div element
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  // Get text content (which automatically strips HTML tags)
  const text = tmp.textContent || tmp.innerText || '';
  // Clean up extra whitespace
  return text.replace(/\s+/g, ' ').trim();
}

// Update available handler
window.electronAPI.onUpdateAvailable((data) => {
  console.log('Update available:', data);
  updateNotificationTitle.textContent = `Update Available: v${data.version}`;
  
  let releaseNotesText = '';
  if (data.releaseNotes) {
    // Strip HTML tags from release notes
    const cleanNotes = stripHtmlTags(data.releaseNotes);
    releaseNotesText = cleanNotes.length > 150 
      ? `Release notes: ${cleanNotes.substring(0, 150)}...`
      : `Release notes: ${cleanNotes}`;
  }
  
  updateNotificationMessage.textContent = releaseNotesText 
    || `A new version (${data.version}) is available.`;
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
  if (!confirm('This will mark all cached data as expired, forcing fresh data to be fetched on the next scrape. The cached files will remain but will be refreshed. Continue?')) {
    return;
  }

  try {
    clearCacheBtn.disabled = true;
    clearCacheBtn.textContent = 'Refreshing...';

    const result = await window.electronAPI.invalidateCache();

    if (result.success) {
      alert(`Cache invalidated successfully! ${result.invalidatedCount || 0} cache file(s) will be refreshed on next scrape.`);
      clearCacheBtn.textContent = 'Force Refresh';
    } else {
      alert('Error invalidating cache: ' + (result.error || 'Unknown error'));
      clearCacheBtn.textContent = 'Force Refresh';
    }
  } catch (error) {
    console.error('Error invalidating cache:', error);
    alert('Error invalidating cache: ' + error.message);
    clearCacheBtn.textContent = 'Force Refresh';
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

