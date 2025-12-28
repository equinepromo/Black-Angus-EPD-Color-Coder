<?php
/**
 * Delete Bulk File API
 * 
 * Deletes a bulk file from both the database and the filesystem (for admin users)
 * 
 * Expected POST data:
 * - filename: The filename of the bulk file to delete
 * 
 * Returns JSON:
 * {
 *   "success": true/false,
 *   "message": "Success message" or error message
 * }
 */

// Enable CORS if needed
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed. Use POST.'
    ]);
    exit;
}

// Database configuration
$dbHost = 'localhost';
$dbUser = 'jeremy_admin';      // UPDATE THIS
$dbPass = 'a+qgRnj,NelS';  // UPDATE THIS
$dbName = 'appUsers';

// Upload directory (same as upload-bulk-file.php)
$uploadDir = __DIR__ . '/../bulk-files/';

try {
    // Get filename from POST
    $filename = $_POST['filename'] ?? null;
    if (empty($filename)) {
        throw new Exception('Filename is required');
    }

    // Sanitize filename
    $filename = basename($filename);

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

    // Check if file exists in database
    $checkStmt = $pdo->prepare("SELECT id FROM bulkFiles WHERE filename = ?");
    $checkStmt->execute([$filename]);
    $existing = $checkStmt->fetch();

    if (!$existing) {
        throw new Exception('Bulk file not found in database');
    }

    // Delete from database
    $deleteStmt = $pdo->prepare("DELETE FROM bulkFiles WHERE filename = ?");
    $deleteStmt->execute([$filename]);

    // Delete physical file
    $filePath = $uploadDir . $filename;
    if (file_exists($filePath)) {
        if (!unlink($filePath)) {
            error_log("Warning: Could not delete physical file: $filePath");
            // Don't fail the request if file deletion fails - DB record is already deleted
        }
    }

    echo json_encode([
        'success' => true,
        'message' => 'Bulk file deleted successfully'
    ]);

} catch (PDOException $e) {
    error_log("Delete bulk file database error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
    exit;
} catch (Exception $e) {
    error_log("Delete bulk file error: " . $e->getMessage());
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
    exit;
}

