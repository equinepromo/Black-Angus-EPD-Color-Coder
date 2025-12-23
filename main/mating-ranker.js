const percentileLookup = require('./percentile-lookup');
const path = require('path');
const fs = require('fs');

// Band definitions
const BANDS = {
  DARK_GREEN: 'DARK_GREEN',
  GREEN: 'GREEN',
  LIGHT_GREEN: 'LIGHT_GREEN',
  GRAY: 'GRAY',
  PINK: 'PINK',
  RED: 'RED',
  DARK_RED: 'DARK_RED'
};

// Color to band mapping
const COLOR_TO_BAND = {
  '#006400': BANDS.DARK_GREEN,
  '#32CD32': BANDS.GREEN,
  '#90EE90': BANDS.LIGHT_GREEN,
  '#ADFF2F': BANDS.LIGHT_GREEN,  // Also light green
  '#808080': BANDS.GRAY,
  '#FFB6C1': BANDS.PINK,
  '#FF0000': BANDS.RED,
  '#8B0000': BANDS.DARK_RED
};

// Color rank (lower is better)
const COLOR_RANK = {
  [BANDS.DARK_GREEN]: 0,
  [BANDS.GREEN]: 1,
  [BANDS.LIGHT_GREEN]: 2,
  [BANDS.GRAY]: 3,
  [BANDS.PINK]: 4,
  [BANDS.RED]: 5,
  [BANDS.DARK_RED]: 6
};

// Color goodness (higher is better)
const COLOR_GOODNESS = {
  [BANDS.DARK_GREEN]: 3,
  [BANDS.GREEN]: 2,
  [BANDS.LIGHT_GREEN]: 1,
  [BANDS.GRAY]: 0,
  [BANDS.PINK]: -1,
  [BANDS.RED]: -2,
  [BANDS.DARK_RED]: -3
};

/**
 * Maps hex color to semantic band
 * @param {string} hex - Hex color code (e.g., "#006400")
 * @returns {string} Band name (e.g., "DARK_GREEN")
 */
function bandFromBgColor(hex) {
  if (!hex) {
    console.warn('[MATING-RANKER] Empty hex color, defaulting to GRAY');
    return BANDS.GRAY;
  }
  
  // Normalize hex (uppercase, ensure # prefix)
  const normalizedHex = hex.toUpperCase().startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
  
  const band = COLOR_TO_BAND[normalizedHex];
  if (band) {
    return band;
  }
  
  console.warn(`[MATING-RANKER] Unknown color ${hex}, defaulting to GRAY`);
  return BANDS.GRAY;
}

/**
 * Gets color rank (lower is better)
 * @param {string} band - Band name
 * @returns {number} Color rank (0-6)
 */
function getColorRank(band) {
  return COLOR_RANK[band] !== undefined ? COLOR_RANK[band] : COLOR_RANK[BANDS.GRAY];
}

/**
 * Gets color goodness score (higher is better)
 * @param {string} band - Band name
 * @returns {number} Color goodness (-3 to +3)
 */
function getColorGoodness(band) {
  return COLOR_GOODNESS[band] !== undefined ? COLOR_GOODNESS[band] : COLOR_GOODNESS[BANDS.GRAY];
}

/**
 * Checks if band is worse than gray
 * @param {string} band - Band name
 * @returns {boolean} True if worse than gray
 */
function isWorseThanGray(band) {
  return getColorRank(band) > getColorRank(BANDS.GRAY);
}

/**
 * Gets percentile from EPD value using existing percentile lookup logic
 * @param {string} trait - Trait name
 * @param {number} calfEpd - Calf EPD value
 * @param {Object} percentileData - Percentile breakdown data
 * @returns {number|null} Percentile rank (1-100) or null
 */
function percentileFromEpd(trait, calfEpd, percentileData) {
  if (!percentileData || !trait || calfEpd === null || calfEpd === undefined || isNaN(calfEpd)) {
    return null;
  }
  
  // Normalize trait name to uppercase for lookup
  const normalizedTrait = trait.toUpperCase();
  
  // Use existing estimatePercentileRank function
  return percentileLookup.estimatePercentileRank(normalizedTrait, calfEpd, percentileData);
}

/**
 * Gets color from percentile using color criteria
 * @param {string} trait - Trait name
 * @param {number} percentile - Percentile rank (1-100)
 * @param {Object} colorCriteria - Color criteria from config
 * @returns {{bgColor: string, textColor: string}} Color object
 */
function colorFromPercentile(trait, percentile, colorCriteria) {
  if (!colorCriteria || !trait || percentile === null || percentile === undefined) {
    return { bgColor: '#808080', textColor: '#000000' };
  }
  
  const rank = typeof percentile === 'string' ? parseInt(percentile, 10) : percentile;
  if (isNaN(rank) || rank < 1 || rank > 100) {
    return { bgColor: '#808080', textColor: '#000000' };
  }
  
  const traitCriteria = colorCriteria[trait];
  if (!traitCriteria || !traitCriteria.ranges) {
    return { bgColor: '#808080', textColor: '#000000' };
  }
  
  // Find matching range
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
 * Evaluates a single mating and computes score
 * @param {Object} cow - Cow data object with epdValues
 * @param {Object} sire - Sire data object with epdValues
 * @param {Array} traits - Array of trait names to evaluate
 * @param {Object} percentileData - Percentile breakdown data
 * @param {Object} colorCriteria - Color criteria from config
 * @param {Object} config - Configuration object
 * @returns {Object} Mating result with score, gate status, and trait results
 */
function evaluateMating(cow, sire, traits, percentileData, colorCriteria, config) {
  const {
    herdWeaknessTraits = ['WW', 'YW', 'CLAW', 'ANGLE', '$M'],
    gateTraits = ['WW', 'YW', 'CLAW', 'ANGLE', '$M'],
    weaknessWeight = 2.0,
    defaultWeight = 1.0
  } = config;
  
  const traitResults = {};
  let baseScore = 0;
  let belowGrayPenalty = 0;
  let extraGatePenalty = 0;
  let numBelowGrayAllTraits = 0;
  let improvedWeaknessesCount = 0;
  const failedGateTraits = [];
  
  // Process each trait
  for (const trait of traits) {
    const sireEpd = sire.epdValues?.[trait]?.epd;
    const cowEpd = cow.epdValues?.[trait]?.epd;
    
    if (!sireEpd || !cowEpd) {
      continue; // Skip traits without data
    }
    
    // Parse EPD values
    const sireValue = parseFloat(sireEpd);
    const cowValue = parseFloat(cowEpd);
    
    if (isNaN(sireValue) || isNaN(cowValue)) {
      continue;
    }
    
    // Calculate calf EPD
    const calfEpd = (sireValue + cowValue) / 2;
    
    // Get percentile
    const calfPercentile = percentileFromEpd(trait, calfEpd, percentileData);
    
    // Get color
    const colors = calfPercentile !== null 
      ? colorFromPercentile(trait, calfPercentile, colorCriteria)
      : { bgColor: '#808080', textColor: '#000000' };
    
    // Get band
    const band = bandFromBgColor(colors.bgColor);
    
    // Determine weight
    const weight = herdWeaknessTraits.includes(trait) ? weaknessWeight : defaultWeight;
    
    // Get color goodness
    const goodness = getColorGoodness(band);
    
    // Add to base score
    baseScore += weight * goodness;
    
    // Check if worse than gray
    if (isWorseThanGray(band)) {
      numBelowGrayAllTraits++;
      const colorRank = getColorRank(band);
      const grayRank = getColorRank(BANDS.GRAY);
      const rankDiff = colorRank - grayRank;
      
      // Below gray penalty
      belowGrayPenalty += rankDiff * 0.25 * weight;
      
      // Extra gate penalty if this is a gate trait
      if (gateTraits.includes(trait)) {
        extraGatePenalty += rankDiff * 0.60 * weight;
        failedGateTraits.push(trait);
      }
    }
    
    // Check if weakness trait is improved (at or better than gray)
    if (herdWeaknessTraits.includes(trait) && !isWorseThanGray(band)) {
      improvedWeaknessesCount++;
    }
    
    // Store trait result
    traitResults[trait] = {
      calfEpd: calfEpd,
      calfPercentile: calfPercentile,
      bgColor: colors.bgColor,
      textColor: colors.textColor,
      band: band,
      weight: weight,
      colorGoodness: goodness
    };
  }
  
  // Calculate final score
  const finalScore = baseScore - belowGrayPenalty - extraGatePenalty;
  
  // Check gate (all gate traits must be <= GRAY)
  const passedGate = gateTraits.every(trait => {
    const result = traitResults[trait];
    if (!result) return false; // Missing data fails gate
    return !isWorseThanGray(result.band);
  });
  
  return {
    cowId: cow.registrationNumber,
    cowName: cow.animalName || cow.registrationNumber,
    sireId: sire.registrationNumber,
    sireName: sire.animalName || sire.registrationNumber,
    passedGate: passedGate,
    failedGateTraits: failedGateTraits,
    score: finalScore,
    numBelowGrayAllTraits: numBelowGrayAllTraits,
    improvedWeaknessesCount: improvedWeaknessesCount,
    traitResults: traitResults
  };
}

/**
 * Ranks all matings (cows × sires)
 * @param {Array} cows - Array of cow data objects
 * @param {Array} sires - Array of sire data objects
 * @param {Object} percentileData - Percentile breakdown data
 * @param {Object} colorCriteria - Color criteria from config
 * @param {Object} config - Configuration object
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Array} Sorted array of ranked mating results
 */
function rankAllMatings(cows, sires, percentileData, colorCriteria, config, progressCallback = null) {
  const {
    topN = 50
  } = config;
  
  // Get all unique traits from all animals
  const allTraits = new Set();
  cows.forEach(cow => {
    if (cow.epdValues) {
      Object.keys(cow.epdValues).forEach(trait => allTraits.add(trait));
    }
  });
  sires.forEach(sire => {
    if (sire.epdValues) {
      Object.keys(sire.epdValues).forEach(trait => allTraits.add(trait));
    }
  });
  
  const traits = Array.from(allTraits);
  const results = [];
  const totalMatings = cows.length * sires.length;
  let processed = 0;
  
  // Evaluate all matings
  for (const cow of cows) {
    for (const sire of sires) {
      const result = evaluateMating(cow, sire, traits, percentileData, colorCriteria, config);
      results.push(result);
      processed++;
      
      // Report progress (every 10 matings or at completion)
      if (progressCallback && (processed % 10 === 0 || processed === totalMatings)) {
        progressCallback(processed, totalMatings);
      }
    }
  }
  
  // Sort results (for ranking within each cow)
  results.sort((a, b) => {
    // 1. passedGate (desc) - gate passers first
    if (a.passedGate !== b.passedGate) {
      return b.passedGate ? 1 : -1;
    }
    
    // 2. score (desc) - higher scores first
    if (Math.abs(a.score - b.score) > 0.001) {
      return b.score - a.score;
    }
    
    // 3. numBelowGrayAllTraits (asc) - fewer bad traits first
    if (a.numBelowGrayAllTraits !== b.numBelowGrayAllTraits) {
      return a.numBelowGrayAllTraits - b.numBelowGrayAllTraits;
    }
    
    // 4. improvedWeaknessesCount (desc) - more improved weaknesses first
    if (a.improvedWeaknessesCount !== b.improvedWeaknessesCount) {
      return b.improvedWeaknessesCount - a.improvedWeaknessesCount;
    }
    
    // Tie-breaker: alphabetical by cow name, then sire name
    const cowCompare = a.cowName.localeCompare(b.cowName);
    if (cowCompare !== 0) return cowCompare;
    return a.sireName.localeCompare(b.sireName);
  });
  
  // Group by cow and take top N sires per cow
  const matingsByCow = {};
  results.forEach(mating => {
    const cowId = mating.cowId;
    if (!matingsByCow[cowId]) {
      matingsByCow[cowId] = [];
    }
    matingsByCow[cowId].push(mating);
  });
  
  // Take top N sires per cow and flatten
  const topMatingsPerCow = [];
  Object.keys(matingsByCow).forEach(cowId => {
    const cowMatings = matingsByCow[cowId];
    topMatingsPerCow.push(...cowMatings.slice(0, topN));
  });
  
  // Sort final results by cow name (for consistent display), then by score within each cow
  topMatingsPerCow.sort((a, b) => {
    const cowCompare = a.cowName.localeCompare(b.cowName);
    if (cowCompare !== 0) return cowCompare;
    
    // Within same cow, maintain the sorted order (already sorted by score above)
    // 1. passedGate (desc)
    if (a.passedGate !== b.passedGate) {
      return b.passedGate ? 1 : -1;
    }
    // 2. score (desc)
    if (Math.abs(a.score - b.score) > 0.001) {
      return b.score - a.score;
    }
    // 3. numBelowGrayAllTraits (asc)
    if (a.numBelowGrayAllTraits !== b.numBelowGrayAllTraits) {
      return a.numBelowGrayAllTraits - b.numBelowGrayAllTraits;
    }
    // 4. improvedWeaknessesCount (desc)
    if (a.improvedWeaknessesCount !== b.improvedWeaknessesCount) {
      return b.improvedWeaknessesCount - a.improvedWeaknessesCount;
    }
    // Final tie-breaker: sire name
    return a.sireName.localeCompare(b.sireName);
  });
  
  return topMatingsPerCow;
}

module.exports = {
  BANDS,
  bandFromBgColor,
  getColorRank,
  getColorGoodness,
  isWorseThanGray,
  percentileFromEpd,
  colorFromPercentile,
  evaluateMating,
  rankAllMatings
};
