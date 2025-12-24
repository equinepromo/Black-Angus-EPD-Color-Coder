#!/usr/bin/env node

/**
 * Bulk File Creation Tool
 * 
 * Creates bulk files from existing cache files or other sources
 * 
 * Usage:
 *   node scripts/create-bulk-file.js --source cache/ --output recommended-sires-v1.0.0.json --version 1.0.0 --type recommended-sires --category "Recommended Sires" --filter "sex=BULL"
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i += 2) {
  const key = args[i]?.replace(/^--/, '');
  const value = args[i + 1];
  if (key && value) {
    options[key] = value;
  }
}

// Required options
const source = options.source || options.s;
const output = options.output || options.o;
const version = options.version || options.v || '1.0.0';
const type = options.type || options.t || 'bulk-file';
const category = options.category || options.c;
const filter = options.filter || options.f;

if (!source || !output) {
  console.error('Usage: node create-bulk-file.js --source <path> --output <file> [options]');
  console.error('');
  console.error('Required:');
  console.error('  --source, -s    Source directory containing cache files (epd_*.json)');
  console.error('  --output, -o    Output file path');
  console.error('');
  console.error('Optional:');
  console.error('  --version, -v         Version number (default: 1.0.0)');
  console.error('  --type, -t           Bulk file type (default: bulk-file)');
  console.error('  --category, -c       Category name for animals');
  console.error('  --filter, -f         Filter criteria (e.g., "sex=BULL", "category=My Herd")');
  process.exit(1);
}

/**
 * Load cache files from source directory
 */
function loadCacheFiles(sourceDir) {
  const files = fs.readdirSync(sourceDir);
  const cacheFiles = files.filter(f => f.startsWith('epd_') && f.endsWith('.json'));
  
  const animals = [];
  
  for (const file of cacheFiles) {
    try {
      const filePath = path.join(sourceDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const cached = JSON.parse(content);
      
      if (!cached.data) {
        console.warn(`Skipping ${file}: missing data field`);
        continue;
      }
      
      // Extract registration number from filename
      const registrationNumber = file.replace(/^epd_/, '').replace(/\.json$/, '');
      
      // Get categories (support both old and new format)
      let categories = cached.categories;
      if (!categories && cached.category) {
        categories = [cached.category];
      }
      if (!categories) {
        categories = ['My Herd'];
      }
      
      animals.push({
        registrationNumber,
        data: cached.data,
        cachedAt: cached.cachedAt || new Date().toISOString(),
        category: category || categories[0] || 'My Herd',
        categories: category ? [category] : categories
      });
    } catch (error) {
      console.error(`Error loading ${file}:`, error.message);
    }
  }
  
  return animals;
}

/**
 * Apply filter to animals
 */
function applyFilter(animals, filterStr) {
  if (!filterStr) return animals;
  
  const filters = filterStr.split(',').map(f => f.trim());
  
  return animals.filter(animal => {
    return filters.every(filter => {
      const [key, value] = filter.split('=').map(s => s.trim());
      
      if (key === 'sex') {
        const animalSex = (animal.data.sex || '').toUpperCase();
        const filterValue = value.toUpperCase();
        return animalSex === filterValue || animalSex.includes(filterValue);
      }
      
      if (key === 'category') {
        const animalCategories = animal.categories || [animal.category];
        return animalCategories.includes(value);
      }
      
      // Add more filter types as needed
      return true;
    });
  });
}

/**
 * Create bulk file structure
 */
function createBulkFile(animals, options) {
  const now = new Date().toISOString();
  
  return {
    version: options.version,
    lastUpdated: now,
    source: 'angus.org',
    metadata: {
      type: options.type,
      description: `Bulk file: ${options.type}`,
      animalCount: animals.length,
      category: options.category || null
    },
    animals: animals.map(animal => ({
      registrationNumber: animal.registrationNumber,
      data: animal.data,
      cachedAt: animal.cachedAt,
      category: animal.category || options.category || 'My Herd'
    }))
  };
}

// Main execution
try {
  console.log(`Reading cache files from: ${source}`);
  
  if (!fs.existsSync(source)) {
    console.error(`Error: Source directory does not exist: ${source}`);
    process.exit(1);
  }
  
  const stats = fs.statSync(source);
  if (!stats.isDirectory()) {
    console.error(`Error: Source path is not a directory: ${source}`);
    process.exit(1);
  }
  
  // Load animals
  let animals = loadCacheFiles(source);
  console.log(`Loaded ${animals.length} animals from cache files`);
  
  // Apply filter
  if (filter) {
    const beforeCount = animals.length;
    animals = applyFilter(animals, filter);
    console.log(`Filtered to ${animals.length} animals (${beforeCount - animals.length} removed)`);
  }
  
  if (animals.length === 0) {
    console.error('Error: No animals to include in bulk file');
    process.exit(1);
  }
  
  // Create bulk file structure
  const bulkFile = createBulkFile(animals, {
    version,
    type,
    category
  });
  
  // Ensure output directory exists
  const outputDir = path.dirname(output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write output file
  fs.writeFileSync(output, JSON.stringify(bulkFile, null, 2), 'utf8');
  
  console.log(`\nBulk file created successfully!`);
  console.log(`  Output: ${output}`);
  console.log(`  Version: ${version}`);
  console.log(`  Animals: ${animals.length}`);
  console.log(`  Type: ${type}`);
  if (category) {
    console.log(`  Category: ${category}`);
  }
  if (filter) {
    console.log(`  Filter: ${filter}`);
  }
  
} catch (error) {
  console.error('Error creating bulk file:', error);
  process.exit(1);
}

