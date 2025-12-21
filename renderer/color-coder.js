/**
 * Color coding utility for EPD traits based on % rank
 * Loads criteria from config file and determines appropriate colors
 */

let colorCriteria = null;

/**
 * Load color criteria from config file
 */
async function loadColorCriteria() {
  if (colorCriteria) {
    return colorCriteria;
  }

  try {
    const response = await fetch('../config/color-criteria.json');
    if (!response.ok) {
      throw new Error('Failed to load color criteria');
    }
    colorCriteria = await response.json();
    return colorCriteria;
  } catch (error) {
    console.error('Error loading color criteria:', error);
    // Return default grey for all traits if file can't be loaded
    return {};
  }
}

/**
 * Get color coding for a trait based on % rank
 * @param {string} traitName - The trait name (e.g., "BW", "CED", "$M")
 * @param {string|number} percentRank - The % rank value (e.g., "30" or 30)
 * @returns {Object} Object with backgroundColor, textColor, and colorName
 */
async function getColorForTrait(traitName, percentRank) {
  const criteria = await loadColorCriteria();
  
  // Default colors (grey) if trait not found or % rank invalid
  const defaultColor = {
    backgroundColor: '#808080',
    textColor: '#000000',
    colorName: 'grey'
  };

  if (!traitName || percentRank === null || percentRank === undefined || percentRank === 'N/A') {
    return defaultColor;
  }

  // Convert percentRank to number
  const rank = typeof percentRank === 'string' ? parseInt(percentRank, 10) : percentRank;
  
  if (isNaN(rank) || rank < 1 || rank > 100) {
    return defaultColor;
  }

  // Get criteria for this trait
  const traitCriteria = criteria[traitName];
  if (!traitCriteria || !traitCriteria.ranges) {
    return defaultColor;
  }

  // Find the matching range
  for (const range of traitCriteria.ranges) {
    if (rank >= range.min && rank <= range.max) {
      return {
        backgroundColor: range.bgColor,
        textColor: range.textColor,
        colorName: getColorName(range.bgColor)
      };
    }
  }

  // If no range matches, return default
  return defaultColor;
}

/**
 * Get a human-readable color name from hex color
 */
function getColorName(hexColor) {
  const colorMap = {
    '#006400': 'darkGreen',
    '#32CD32': 'mediumGreen',
    '#90EE90': 'lightGreen',
    '#ADFF2F': 'lightYellowGreen',
    '#808080': 'grey',
    '#FFB6C1': 'pink',
    '#FF0000': 'red',
    '#8B0000': 'darkRed'
  };
  return colorMap[hexColor] || 'unknown';
}

/**
 * Preload color criteria (call this early to avoid delays)
 */
async function preloadColorCriteria() {
  await loadColorCriteria();
}

module.exports = {
  getColorForTrait,
  preloadColorCriteria,
  loadColorCriteria
};


