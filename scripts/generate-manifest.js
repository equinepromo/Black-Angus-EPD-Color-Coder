#!/usr/bin/env node

/**
 * Manifest Generation Tool
 * 
 * Scans a server directory for bulk JSON files and automatically generates a manifest.json
 * Can work with local directories OR remote server URLs
 * 
 * Usage (Local):
 *   node scripts/generate-manifest.js --directory ./bulk-files --base-url https://scoring.westernsports.video/angus/bulk-files --output manifest.json
 * 
 * Usage (Server):
 *   node scripts/generate-manifest.js --server-url https://scoring.westernsports.video/angus/bulk-files --output manifest.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

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

// Options
const directory = options.directory || options.d || options.dir;
const serverUrl = options['server-url'] || options.server || options.url;
const baseUrl = options['base-url'] || options.baseurl || serverUrl || 'https://scoring.westernsports.video/angus/bulk-files';
const output = options.output || options.o || 'manifest.json';
const fileList = options['file-list'] || options.files; // Optional: comma-separated list of filenames

if (!directory && !serverUrl) {
  console.error('Usage: node generate-manifest.js [options]');
  console.error('');
  console.error('Required (one of):');
  console.error('  --directory, -d, --dir    Local directory containing bulk JSON files');
  console.error('  --server-url, --server    Server URL to scan for bulk files (e.g., https://example.com/bulk-files)');
  console.error('');
  console.error('Optional:');
  console.error('  --base-url, --url        Base URL for bulk files (defaults to server-url if provided)');
  console.error('  --file-list, --files     Comma-separated list of filenames to include (if server doesn\'t support directory listing)');
  console.error('  --output, -o            Output manifest file path (default: manifest.json)');
  console.error('');
  console.error('Examples:');
  console.error('  # Local directory:');
  console.error('  node scripts/generate-manifest.js --directory ./bulk-files --base-url https://example.com/bulk-files');
  console.error('');
  console.error('  # Server URL:');
  console.error('  node scripts/generate-manifest.js --server-url https://scoring.westernsports.video/angus/bulk-files');
  console.error('');
  console.error('  # Server with specific file list:');
  console.error('  node scripts/generate-manifest.js --server-url https://example.com/bulk-files --file-list "file1.json,file2.json"');
  process.exit(1);
}

/**
 * Extract metadata from bulk file data
 */
function extractBulkFileMetadata(data, filename, size) {
  try {
    // Extract metadata from bulk file
    const metadata = data.metadata || {};
    const version = data.version || '1.0.0';
    const animalCount = data.animals ? data.animals.length : (metadata.animalCount || 0);
    
    // Extract type from metadata or filename
    const type = metadata.type || 'bulk-file';
    
    // Extract category from metadata
    const category = metadata.category || null;
    
    // Extract description from metadata
    const description = metadata.description || `Bulk file: ${type}`;
    
    // Generate ID from type (sanitize for URL)
    const id = type.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    
    // Generate name from type (capitalize words)
    const name = type.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    // Generate URL
    const url = `${baseUrl.replace(/\/$/, '')}/${filename}`;
    
    return {
      id,
      name,
      version,
      filename,
      url,
      size,
      animalCount,
      category,
      description
    };
  } catch (error) {
    console.error(`Error extracting metadata from ${filename}:`, error.message);
    return null;
  }
}

/**
 * Download file from URL
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const request = client.get(url, (response) => {
      if (response.statusCode === 200) {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          resolve({ success: true, data, size: parseInt(response.headers['content-length'] || '0', 10) });
        });
      } else if (response.statusCode === 404) {
        resolve({ success: false, error: 'File not found' });
      } else {
        resolve({ success: false, error: `HTTP ${response.statusCode}` });
      }
    });
    
    request.on('error', (error) => {
      reject(error);
    });
    
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Get list of files from server (try common patterns)
 */
async function getServerFileList(serverUrl) {
  const files = [];
  
  // If file-list is provided, use that
  if (fileList) {
    return fileList.split(',').map(f => f.trim()).filter(f => f);
  }
  
  // Try to get directory listing (if server supports it)
  // Many servers don't allow directory listing, so we'll try common filenames
  // or the user can provide --file-list
  
  console.log('Note: Server directory listing may not be available.');
  console.log('If files are not found, use --file-list "file1.json,file2.json" to specify files.');
  console.log('');
  
  // Return empty array - we'll try to fetch known/common filenames
  // Or user can provide file-list
  return files;
}

/**
 * Scan local directory for bulk files
 */
function scanLocalDirectory(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`Error: Directory does not exist: ${dir}`);
    process.exit(1);
  }
  
  const stats = fs.statSync(dir);
  if (!stats.isDirectory()) {
    console.error(`Error: Path is not a directory: ${dir}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(dir);
  const bulkFiles = files.filter(file => {
    // Look for JSON files that might be bulk files
    // Exclude manifest.json itself
    return file.endsWith('.json') && 
           file !== 'manifest.json' && 
           file !== path.basename(output);
  });
  
  console.log(`Found ${bulkFiles.length} potential bulk file(s) in ${dir}`);
  
  const manifestEntries = [];
  
  for (const file of bulkFiles) {
    const filePath = path.join(dir, file);
    console.log(`Processing: ${file}...`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      const stats = fs.statSync(filePath);
      const size = stats.size;
      
      const metadata = extractBulkFileMetadata(data, file, size);
      if (metadata) {
        manifestEntries.push(metadata);
        console.log(`  ✓ ${metadata.name} v${metadata.version} (${metadata.animalCount} animals, ${(metadata.size / 1024).toFixed(2)} KB)`);
      } else {
        console.log(`  ✗ Skipped (not a valid bulk file)`);
      }
    } catch (error) {
      console.log(`  ✗ Error reading file: ${error.message}`);
    }
  }
  
  return manifestEntries;
}

/**
 * Scan server for bulk files
 */
async function scanServer(serverUrl) {
  console.log(`Scanning server: ${serverUrl}`);
  
  // Get list of files to check
  let filesToCheck = await getServerFileList(serverUrl);
  
  // If no file list provided and no directory listing, try common patterns
  if (filesToCheck.length === 0) {
    console.log('No file list provided. Trying to discover files...');
    console.log('Please use --file-list "file1.json,file2.json" to specify files, or ensure server supports directory listing.');
    
    // Try some common filenames as fallback
    const commonFiles = [
      'recommended-sires-v1.0.0.json',
      'sale-bulls-v1.0.0.json',
      'recommended-cows-v1.0.0.json'
    ];
    
    console.log(`Trying common filenames: ${commonFiles.join(', ')}`);
    filesToCheck = commonFiles;
  }
  
  const manifestEntries = [];
  
  for (const filename of filesToCheck) {
    const fileUrl = `${serverUrl.replace(/\/$/, '')}/${filename}`;
    console.log(`Processing: ${filename}...`);
    
    try {
      const result = await downloadFile(fileUrl);
      
      if (result.success) {
        try {
          const data = JSON.parse(result.data);
          const size = result.size || result.data.length;
          
          const metadata = extractBulkFileMetadata(data, filename, size);
          if (metadata) {
            manifestEntries.push(metadata);
            console.log(`  ✓ ${metadata.name} v${metadata.version} (${metadata.animalCount} animals, ${(metadata.size / 1024).toFixed(2)} KB)`);
          } else {
            console.log(`  ✗ Skipped (not a valid bulk file)`);
          }
        } catch (parseError) {
          console.log(`  ✗ Error parsing JSON: ${parseError.message}`);
        }
      } else {
        console.log(`  ✗ ${result.error || 'File not found'}`);
      }
    } catch (error) {
      console.log(`  ✗ Error downloading: ${error.message}`);
    }
  }
  
  return manifestEntries;
}

/**
 * Generate manifest
 */
function generateManifest(bulkFiles) {
  const now = new Date().toISOString();
  
  return {
    lastUpdated: now,
    bulkFiles: bulkFiles.sort((a, b) => {
      // Sort by name, then by version
      if (a.name !== b.name) {
        return a.name.localeCompare(b.name);
      }
      return a.version.localeCompare(b.version);
    })
  };
}

// Main execution
(async () => {
  try {
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Output: ${output}`);
    console.log('');
    
    let bulkFiles;
    
    if (serverUrl) {
      // Scan server
      bulkFiles = await scanServer(serverUrl);
    } else if (directory) {
      // Scan local directory
      console.log(`Scanning local directory: ${directory}`);
      bulkFiles = scanLocalDirectory(directory);
    } else {
      console.error('Error: Must specify either --directory or --server-url');
      process.exit(1);
    }
    
    if (bulkFiles.length === 0) {
      console.error('');
      console.error('Error: No valid bulk files found');
      if (serverUrl) {
        console.error('Tip: Use --file-list "file1.json,file2.json" to specify files on the server');
      }
      process.exit(1);
    }
    
    console.log('');
    console.log(`Generating manifest with ${bulkFiles.length} bulk file(s)...`);
    
    const manifest = generateManifest(bulkFiles);
    
    // Determine output path
    const outputPath = path.isAbsolute(output) ? output : path.join(process.cwd(), output);
    const outputDir = path.dirname(outputPath);
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write manifest
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf8');
    
    console.log('');
    console.log('✓ Manifest generated successfully!');
    console.log(`  Output: ${outputPath}`);
    console.log(`  Files: ${bulkFiles.length}`);
    console.log(`  Last Updated: ${manifest.lastUpdated}`);
    console.log('');
    console.log('Bulk files in manifest:');
    bulkFiles.forEach(bf => {
      console.log(`  - ${bf.name} (${bf.id}) v${bf.version} - ${bf.animalCount} animals`);
    });
    
  } catch (error) {
    console.error('Error generating manifest:', error);
    process.exit(1);
  }
})();

