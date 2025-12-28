<?php
/**
 * Toggle Bulk File Active Status API
 * 
 * Toggles the isActive status of a bulk file (for admin users)
 * 
 * Expected POST data:
 * - filename: The filename of the bulk file to toggle
 * - isActive: 1 or 0 (optional, if not provided, toggles current state)
 * 
 * Returns JSON:
 * {
 *   "success": true/false,
 *   "message": "Success message" or error message,
 *   "isActive": new isActive status (if successful)
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

    // Check if file exists
    $checkStmt = $pdo->prepare("SELECT isActive FROM bulkFiles WHERE filename = ?");
    $checkStmt->execute([$filename]);
    $existing = $checkStmt->fetch();

    if (!$existing) {
        throw new Exception('Bulk file not found');
    }

    // Determine new isActive value
    $newIsActive = isset($_POST['isActive']) ? (int)$_POST['isActive'] : (1 - (int)$existing['isActive']);

    // Update isActive status
    $updateStmt = $pdo->prepare("
        UPDATE bulkFiles 
        SET isActive = ?, updatedAt = NOW()
        WHERE filename = ?
    ");
    
    $updateStmt->execute([$newIsActive, $filename]);

    echo json_encode([
        'success' => true,
        'message' => $newIsActive ? 'Bulk file activated successfully' : 'Bulk file deactivated successfully',
        'isActive' => $newIsActive
    ]);

} catch (PDOException $e) {
    error_log("Toggle bulk file active database error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
    exit;
} catch (Exception $e) {
    error_log("Toggle bulk file active error: " . $e->getMessage());
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
    exit;
}

