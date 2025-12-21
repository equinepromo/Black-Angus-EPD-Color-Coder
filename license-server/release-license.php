<?php
/**
 * License Release Endpoint
 * 
 * Allows releasing a license from a machine so it can be used on another machine
 * This is useful for transferring a license or if a user needs to switch computers
 * 
 * Expected POST data:
 * {
 *   "licenseKey": "USER_LICENSE_KEY",
 *   "machineId": "hostname" (optional - if provided, only releases if matches)
 * }
 * 
 * Returns JSON:
 * {
 *   "success": true/false,
 *   "message": "License released successfully" or error message
 * }
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed. Use POST.'
    ]);
    exit;
}

// Database configuration - UPDATE THESE
$dbHost = 'localhost';
$dbUser = 'jeremy_admin';
$dbPass = 'a+qgRnj,NelS';
$dbName = 'appUsers';

// Get POST data
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['licenseKey'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'License key is required'
    ]);
    exit;
}

$licenseKey = trim($data['licenseKey']);
$machineId = isset($data['machineId']) ? trim($data['machineId']) : null;

try {
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

    // Check if license exists
    $stmt = $pdo->prepare("SELECT id, licenseKey, activeMachineId FROM blackAngus WHERE licenseKey = ?");
    $stmt->execute([$licenseKey]);
    $license = $stmt->fetch();

    if (!$license) {
        echo json_encode([
            'success' => false,
            'message' => 'License key not found'
        ]);
        exit;
    }

    // If machineId is provided, verify it matches before releasing
    if ($machineId && !empty($license['activeMachineId']) && $license['activeMachineId'] !== $machineId) {
        echo json_encode([
            'success' => false,
            'message' => 'License is not bound to this machine. Cannot release.'
        ]);
        exit;
    }

    // Release the license (set activeMachineId to NULL)
    $updateStmt = $pdo->prepare("UPDATE blackAngus SET activeMachineId = NULL WHERE licenseKey = ?");
    $updateStmt->execute([$licenseKey]);

    echo json_encode([
        'success' => true,
        'message' => 'License released successfully. It can now be used on another computer.'
    ]);

} catch (PDOException $e) {
    error_log("License release database error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error. Please contact support.'
    ]);
    exit;
} catch (Exception $e) {
    error_log("License release error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error releasing license. Please contact support.'
    ]);
    exit;
}


