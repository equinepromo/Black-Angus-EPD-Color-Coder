<?php
/**
 * Database Configuration Example
 * 
 * Copy this file to config.php and update with your actual database credentials
 * DO NOT commit config.php to version control
 */

return [
    'db' => [
        'host' => 'localhost',
        'name' => 'appUsers',
        'user' => 'your_db_user',
        'pass' => 'your_db_password',
        'charset' => 'utf8mb4'
    ],
    
    // Optional: Enable logging
    'logging' => [
        'enabled' => false,
        'table' => 'license_logs' // Create this table if you want to log validations
    ]
];


