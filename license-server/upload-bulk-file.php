<?php
/**
 * Bulk File Upload and Database Entry Creation API
 * 
 * Uploads a bulk file JSON and creates a database entry in bulkFiles table
 * 
 * Expected POST data (multipart/form-data):
 * - file: The JSON file to upload
 * - filename: The filename to use (must match uploaded file)
 * - name: Human-readable name
 * - category: Category name (optional)
 * - description: Description (optional)
 * 
 * Returns JSON:
 * {
 *   "success": true/false,
 *   "message": "Success message" or error message,
 *   "url": "Full URL to uploaded file" (if successful)
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

// Upload directory (relative to this script or absolute path)
$uploadDir = __DIR__ . '/../bulk-files/';
// Or use absolute path: $uploadDir = '/path/to/angus/bulk-files/';

// Base URL for uploaded files
$baseUrl = 'https://scoring.westernsports.video/angus/bulk-files/';

try {
    // Check if file was uploaded
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        throw new Exception('No file uploaded or upload error occurred');
    }

    $uploadedFile = $_FILES['file'];
    $filename = $_POST['filename'] ?? $uploadedFile['name'];
    $name = $_POST['name'] ?? pathinfo($filename, PATHINFO_FILENAME);
    $category = $_POST['category'] ?? null;
    $description = $_POST['description'] ?? '';
    // isActive defaults to 0 (inactive) if not provided
    $isActive = isset($_POST['isActive']) ? (int)$_POST['isActive'] : 0;

    // Validate filename
    if (empty($filename)) {
        throw new Exception('Filename is required');
    }

    // Ensure filename ends with .json
    if (!preg_match('/\.json$/i', $filename)) {
        $filename .= '.json';
    }

    // Sanitize filename (remove any path components)
    $filename = basename($filename);
    
    // Validate it's a JSON file
    if (strtolower(pathinfo($filename, PATHINFO_EXTENSION)) !== 'json') {
        throw new Exception('File must be a JSON file');
    }

    // Validate uploaded file is JSON
    $fileContent = file_get_contents($uploadedFile['tmp_name']);
    $jsonData = json_decode($fileContent, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Uploaded file is not valid JSON: ' . json_last_error_msg());
    }

    // Validate JSON structure has animals array
    if (!isset($jsonData['animals']) || !is_array($jsonData['animals'])) {
        throw new Exception('JSON file must have an "animals" array');
    }

    $animalCount = count($jsonData['animals']);
    $fileSize = filesize($uploadedFile['tmp_name']);

    // Ensure upload directory exists
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
            throw new Exception('Failed to create upload directory');
        }
    }

    // Move uploaded file to destination
    $targetPath = $uploadDir . $filename;
    if (!move_uploaded_file($uploadedFile['tmp_name'], $targetPath)) {
        throw new Exception('Failed to move uploaded file');
    }

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

    // Check if file already exists in database
    $checkStmt = $pdo->prepare("SELECT id FROM bulkFiles WHERE filename = ?");
    $checkStmt->execute([$filename]);
    $existing = $checkStmt->fetch();

    $url = $baseUrl . $filename;

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
                isActive = ?,
                updatedAt = NOW()
            WHERE filename = ?
        ");
        
        $updateStmt->execute([
            $name,
            $url,
            $fileSize,
            $animalCount,
            $category,
            $description,
            $isActive,
            $filename
        ]);
        
        echo json_encode([
            'success' => true,
            'message' => 'Bulk file updated successfully',
            'url' => $url,
            'filename' => $filename,
            'animalCount' => $animalCount
        ]);
    } else {
        // Insert new record
        $insertStmt = $pdo->prepare("
            INSERT INTO bulkFiles (filename, name, url, size, animalCount, category, description, isActive)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        $insertStmt->execute([
            $filename,
            $name,
            $url,
            $fileSize,
            $animalCount,
            $category,
            $description,
            $isActive
        ]);
        
        echo json_encode([
            'success' => true,
            'message' => 'Bulk file uploaded and database entry created successfully',
            'url' => $url,
            'filename' => $filename,
            'animalCount' => $animalCount
        ]);
    }

} catch (PDOException $e) {
    error_log("Bulk file upload database error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
    exit;
} catch (Exception $e) {
    error_log("Bulk file upload error: " . $e->getMessage());
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
    exit;
}

