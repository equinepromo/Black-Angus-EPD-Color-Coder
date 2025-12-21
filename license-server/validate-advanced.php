<?php
/**
 * Advanced License Validation API Endpoint
 * Uses separate config file for better security
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
        'valid' => false,
        'error' => 'Method not allowed. Use POST.'
    ]);
    exit;
}

// Load configuration
$configFile = __DIR__ . '/config.php';
if (file_exists($configFile)) {
    $config = require $configFile;
} else {
    // Fallback to default config
    $config = [
        'db' => [
            'host' => 'localhost',
            'name' => 'appUsers',
            'user' => 'your_db_user',
            'pass' => 'your_db_password',
            'charset' => 'utf8mb4'
        ]
    ];
}

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
    $dsn = sprintf(
        "mysql:host=%s;dbname=%s;charset=%s",
        $config['db']['host'],
        $config['db']['name'],
        $config['db']['charset']
    );
    
    $pdo = new PDO(
        $dsn,
        $config['db']['user'],
        $config['db']['pass'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );

    // Query for license key
    $stmt = $pdo->prepare("SELECT id, licenseKey, user, expires FROM blackAngus WHERE licenseKey = ?");
    $stmt->execute([$licenseKey]);
    $license = $stmt->fetch();

    if (!$license) {
        echo json_encode([
            'valid' => false,
            'error' => 'License key not found'
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
            echo json_encode([
                'valid' => false,
                'error' => 'License expiration date is invalid'
            ]);
            exit;
        }
        
        if ($expiresDate < $now) {
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

    // License is valid
    echo json_encode([
        'valid' => true,
        'userName' => $license['user'] ?: null,
        'expiresAt' => $expiresAt
    ]);

} catch (PDOException $e) {
    error_log("License validation database error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'valid' => false,
        'error' => 'Database error. Please contact support.'
    ]);
    exit;
} catch (Exception $e) {
    error_log("License validation error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'valid' => false,
        'error' => 'Validation error. Please contact support.'
    ]);
    exit;
}


