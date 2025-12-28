<?php
/**
 * Migration Script: Import manifest.json into database
 * 
 * This script reads a manifest.json file and imports all bulk files into the database.
 * 
 * Usage:
 *   php migrate-manifest-to-db.php path/to/manifest.json
 * 
 * Or set the path in the script below.
 */

// Database configuration (same as get-manifest.php)
$dbHost = 'localhost';
$dbUser = 'jeremy_admin';      // UPDATE THIS
$dbPass = 'a+qgRnj,NelS';  // UPDATE THIS
$dbName = 'appUsers';

// Get manifest.json path from command line or set it here
$manifestPath = isset($argv[1]) ? $argv[1] : __DIR__ . '/manifest.json';

if (!file_exists($manifestPath)) {
    die("Error: manifest.json not found at: $manifestPath\n");
}

echo "Reading manifest from: $manifestPath\n";

// Read and parse manifest
$manifestContent = file_get_contents($manifestPath);
$manifest = json_decode($manifestContent, true);

if (!$manifest || !isset($manifest['bulkFiles']) || !is_array($manifest['bulkFiles'])) {
    die("Error: Invalid manifest.json structure\n");
}

echo "Found " . count($manifest['bulkFiles']) . " bulk file(s) in manifest\n\n";

try {
    // Connect to database
    $pdo = new PDO(
        "mysql:host=$dbHost;dbname=$dbName;charset=utf8mb4",
        $dbUser,
        $dbPass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );

    // Check if table exists
    $tableExists = $pdo->query("SHOW TABLES LIKE 'bulkFiles'")->rowCount() > 0;
    if (!$tableExists) {
        echo "Error: bulkFiles table does not exist. Please run bulk-files-schema.sql first.\n";
        exit(1);
    }

    $inserted = 0;
    $updated = 0;
    $skipped = 0;

    foreach ($manifest['bulkFiles'] as $bulkFile) {
        $filename = $bulkFile['filename'] ?? $bulkFile['id'] ?? null;
        if (!$filename) {
            echo "  ⚠ Skipping entry without 'filename' or 'id' field\n";
            $skipped++;
            continue;
        }

        // Check if file already exists (by filename)
        $stmt = $pdo->prepare("SELECT id FROM bulkFiles WHERE filename = ?");
        $stmt->execute([$filename]);
        $existing = $stmt->fetch();

        if ($existing) {
            // Update existing record
            $updateStmt = $pdo->prepare("
                UPDATE bulkFiles 
                SET 
                    name = ?,
                    url = ?,
                    size = ?,
                    animalCount = ?,
                    category = ?,
                    description = ?,
                    isActive = 1,
                    updatedAt = NOW()
                WHERE filename = ?
            ");
            
            $updateStmt->execute([
                $bulkFile['name'] ?? '',
                $bulkFile['url'] ?? '',
                $bulkFile['size'] ?? 0,
                $bulkFile['animalCount'] ?? 0,
                $bulkFile['category'] ?? null,
                $bulkFile['description'] ?? null,
                $filename
            ]);
            
            echo "  ✓ Updated: {$bulkFile['name']} ({$filename})\n";
            $updated++;
        } else {
            // Insert new record
            $insertStmt = $pdo->prepare("
                INSERT INTO bulkFiles (filename, name, url, size, animalCount, category, description, isActive)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            ");
            
            $insertStmt->execute([
                $filename,
                $bulkFile['name'] ?? '',
                $bulkFile['url'] ?? '',
                $bulkFile['size'] ?? 0,
                $bulkFile['animalCount'] ?? 0,
                $bulkFile['category'] ?? null,
                $bulkFile['description'] ?? null
            ]);
            
            echo "  ✓ Inserted: {$bulkFile['name']} ({$filename})\n";
            $inserted++;
        }
    }

    echo "\n";
    echo "Migration complete!\n";
    echo "  Inserted: $inserted\n";
    echo "  Updated: $updated\n";
    echo "  Skipped: $skipped\n";
    echo "\n";
    echo "You can now test the endpoint:\n";
    echo "  curl https://your-domain.com/get-manifest.php\n";

} catch (PDOException $e) {
    die("Database error: " . $e->getMessage() . "\n");
} catch (Exception $e) {
    die("Error: " . $e->getMessage() . "\n");
}

