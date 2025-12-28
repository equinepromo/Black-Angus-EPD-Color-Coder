<?php
/**
 * Bulk Files Manifest API Endpoint
 * 
 * Returns bulk file manifest from database (replaces static manifest.json)
 * 
 * This endpoint can be called with GET (no parameters needed)
 * 
 * Returns JSON in the same format as manifest.json:
 * {
 *   "lastUpdated": "2025-12-25T00:20:56.477Z",
 *   "bulkFiles": [
 *     {
 *       "id": "category-recommended-sires",
 *       "name": "Category Recommended Sires",
 *       "version": "1.0.0",
 *       "filename": "category-recommended-sires-v1.0.0.json",
 *       "url": "https://scoring.westernsports.video/angus/bulk-files/category-recommended-sires-v1.0.0.json",
 *       "size": 1148389,
 *       "animalCount": 52,
 *       "category": "Recommended Sires",
 *       "description": "Bulk file: category-recommended-sires"
 *     }
 *   ]
 * }
 */

// Enable CORS if needed (adjust origin as necessary)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'error' => 'Method not allowed. Use GET.'
    ]);
    exit;
}

// Check if admin mode is requested (returns all files, not just active ones)
$adminMode = isset($_GET['admin']) && $_GET['admin'] === 'true';

// Database configuration
$dbHost = 'localhost';
$dbUser = 'jeremy_admin';      // UPDATE THIS
$dbPass = 'a+qgRnj,NelS';  // UPDATE THIS
$dbName = 'appUsers';

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

    // Query for bulk files - all files if admin mode, otherwise only active files
    // Ordered by updatedAt (most recent first)
    // Note: If no files exist, return empty array (not an error)
    if ($adminMode) {
        // Admin mode: get all files (active and inactive)
        $stmt = $pdo->prepare("
            SELECT 
                filename as id,
                name,
                filename,
                url,
                size,
                animalCount,
                category,
                description,
                updatedAt,
                isActive
            FROM bulkFiles 
            ORDER BY updatedAt DESC, name ASC
        ");
        $stmt->execute();
    } else {
        // Normal mode: only get active files
        $stmt = $pdo->prepare("
            SELECT 
                filename as id,
                name,
                filename,
                url,
                size,
                animalCount,
                category,
                description,
                updatedAt,
                isActive
            FROM bulkFiles 
            WHERE isActive = 1 
            ORDER BY updatedAt DESC, name ASC
        ");
        $stmt->execute();
    }
    $bulkFiles = $stmt->fetchAll();
    
    // If query succeeds but table is empty, that's OK - return empty manifest

    // Get the most recent updatedAt timestamp for lastUpdated
    $lastUpdated = null;
    if (!empty($bulkFiles)) {
        // Find the most recent updatedAt
        $maxUpdatedAt = null;
        foreach ($bulkFiles as $file) {
            if ($file['updatedAt']) {
                $fileTime = strtotime($file['updatedAt']);
                if ($maxUpdatedAt === null || $fileTime > $maxUpdatedAt) {
                    $maxUpdatedAt = $fileTime;
                    $lastUpdated = $file['updatedAt'];
                }
            }
        }
    }

    // Format the response to match manifest.json structure
    $manifest = [
        'lastUpdated' => $lastUpdated ? date('c', strtotime($lastUpdated)) : date('c'),
        'bulkFiles' => array_map(function($file) {
            return [
                'id' => $file['filename'], // Use filename as id for app compatibility
                'name' => $file['name'],
                'filename' => $file['filename'],
                'url' => $file['url'],
                'size' => (int)$file['size'],
                'animalCount' => (int)$file['animalCount'],
                'category' => $file['category'],
                'description' => $file['description'],
                'updatedAt' => $file['updatedAt'], // Include timestamp for comparison
                'isActive' => isset($file['isActive']) ? (bool)$file['isActive'] : true // Include isActive status for admin users
            ];
        }, $bulkFiles)
    ];

    // Return the manifest
    echo json_encode($manifest, JSON_PRETTY_PRINT);

} catch (PDOException $e) {
    // Database error
    error_log("Bulk files manifest database error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'error' => 'Database error. Please contact support.',
        'lastUpdated' => date('c'),
        'bulkFiles' => []
    ]);
    exit;
} catch (Exception $e) {
    error_log("Bulk files manifest error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'error' => 'Error retrieving manifest. Please contact support.',
        'lastUpdated' => date('c'),
        'bulkFiles' => []
    ]);
    exit;
}

