<?php
/**
 * License Validation API Endpoint
 * 
 * Validates license keys against the blackAngus database table
 * 
 * Expected POST data:
 * {
 *   "licenseKey": "USER_LICENSE_KEY",
 *   "machineId": "hostname",
 *   "appVersion": "1.0.0"
 * }
 * 
 * Returns JSON:
 * {
 *   "valid": true/false,
 *   "userName": "User Name" (if valid),
 *   "expiresAt": "2025-12-31T23:59:59Z" (if valid),
 *   "error": "Error message" (if invalid)
 * }
 */

// Enable CORS if needed (adjust origin as necessary)
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
        'valid' => false,
        'error' => 'Method not allowed. Use POST.'
    ]);
    exit;
}

// Database configuration
$dbHost = 'localhost';
$dbUser = 'jeremy_admin';      // UPDATE THIS
$dbPass = 'a+qgRnj,NelS';  // UPDATE THIS
$dbName = 'appUsers';

// Get POST data
$input = file_get_contents('php://input');
$data = json_decode($input, true);

// Validate input
if (!$data || !isset($data['licenseKey'])) {
    http_response_code(400);
    echo json_encode([
        'valid' => false,
        'error' => 'License key is required'
    ]);
    exit;
}

$licenseKey = trim($data['licenseKey']);
$machineId = isset($data['machineId']) ? $data['machineId'] : '';
$appVersion = isset($data['appVersion']) ? $data['appVersion'] : '';

if (empty($licenseKey)) {
    http_response_code(400);
    echo json_encode([
        'valid' => false,
        'error' => 'License key cannot be empty'
    ]);
    exit;
}

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

    // Query for license key (including activeMachineId field)
    // Note: You'll need to add 'activeMachineId' column to your blackAngus table
    // ALTER TABLE blackAngus ADD COLUMN activeMachineId VARCHAR(255) NULL;
    $stmt = $pdo->prepare("SELECT id, licenseKey, user, expires, activeMachineId FROM blackAngus WHERE licenseKey = ?");
    $stmt->execute([$licenseKey]);
    $license = $stmt->fetch();

    if (!$license) {
        // License key not found
        echo json_encode([
            'valid' => false,
            'error' => 'License key not found'
        ]);
        exit;
    }

    // Check if license is already bound to a different machine
    if (!empty($license['activeMachineId']) && $license['activeMachineId'] !== $machineId) {
        // License is already in use on a different machine
        echo json_encode([
            'valid' => false,
            'error' => 'License is already in use on another computer. Only one active session is allowed per license.',
            'machineBound' => true
        ]);
        exit;
    }

    // Check if license has expired
    $now = new DateTime();
    $expiresDate = null;
    
    if (!empty($license['expires'])) {
        try {
            $expiresDate = new DateTime($license['expires']);
        } catch (Exception $e) {
            // Invalid date format, treat as expired
            echo json_encode([
                'valid' => false,
                'error' => 'License expiration date is invalid'
            ]);
            exit;
        }
        
        if ($expiresDate < $now) {
            // License has expired
            echo json_encode([
                'valid' => false,
                'error' => 'License has expired'
            ]);
            exit;
        }
    }

    // Format expiration date for response (ISO 8601 format)
    $expiresAt = null;
    if ($expiresDate) {
        $expiresAt = $expiresDate->format('c'); // ISO 8601 format
    }

    // License is valid - update or set the active machine ID
    // This binds the license to this machine
    $updateStmt = $pdo->prepare("UPDATE blackAngus SET activeMachineId = ? WHERE licenseKey = ?");
    $updateStmt->execute([$machineId, $licenseKey]);

    // License is valid
    echo json_encode([
        'valid' => true,
        'userName' => $license['user'] ?: null,
        'expiresAt' => $expiresAt,
        'machineId' => $machineId
    ]);

    // Optional: Log the validation request (uncomment if you want to track usage)
    /*
    try {
        $logStmt = $pdo->prepare("
            INSERT INTO license_logs (license_key, machine_id, app_version, validated_at, ip_address) 
            VALUES (?, ?, ?, NOW(), ?)
        ");
        $logStmt->execute([
            $licenseKey,
            $machineId,
            $appVersion,
            $_SERVER['REMOTE_ADDR'] ?? 'unknown'
        ]);
    } catch (Exception $e) {
        // Log error but don't fail the validation
        error_log("Failed to log license validation: " . $e->getMessage());
    }
    */

} catch (PDOException $e) {
    // Database error
    error_log("License validation database error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'valid' => false,
        'error' => 'Database error. Please contact support.'
    ]);
    exit;
} catch (Exception $e) {
    // Other errors
    error_log("License validation error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'valid' => false,
        'error' => 'Validation error. Please contact support.'
    ]);
    exit;
}

