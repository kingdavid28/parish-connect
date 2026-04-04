<?php
// Simple diagnostic - no dependencies needed
error_reporting(E_ALL);
ini_set('display_errors', '1');

header('Content-Type: application/json');

$checks = [];

// Check PHP version
$checks['php_version'] = PHP_VERSION;

// Check .env exists
$envFile = __DIR__ . '/.env';
$checks['env_exists'] = file_exists($envFile);
$checks['env_path'] = $envFile;

// Check vendor/autoload exists
$checks['vendor_exists'] = file_exists(__DIR__ . '/vendor/autoload.php');

// Try parsing .env
if ($checks['env_exists']) {
    $env = parse_ini_file($envFile);
    $checks['env_parsed'] = $env !== false;
    if ($env !== false) {
        $checks['db_host'] = $env['DB_HOST'] ?? 'NOT SET';
        $checks['db_name'] = $env['DB_NAME'] ?? 'NOT SET';
        $checks['db_user'] = $env['DB_USER'] ?? 'NOT SET';
        $checks['db_pass_set'] = !empty($env['DB_PASSWORD']);
        $checks['jwt_set'] = !empty($env['JWT_SECRET']);
    }
}

// Try DB connection
if ($checks['env_exists'] && isset($env) && $env !== false) {
    try {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            $env['DB_HOST'] ?? '127.0.0.1',
            $env['DB_PORT'] ?? '3306',
            $env['DB_NAME'] ?? ''
        );
        $pdo = new PDO($dsn, $env['DB_USER'] ?? '', $env['DB_PASSWORD'] ?? '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $pdo->query('SELECT 1');
        $checks['db_connection'] = 'SUCCESS';
    } catch (Exception $e) {
        $checks['db_connection'] = 'FAILED: ' . $e->getMessage();
    }
}

echo json_encode($checks, JSON_PRETTY_PRINT);
