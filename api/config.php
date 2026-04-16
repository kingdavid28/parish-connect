<?php
declare(strict_types=1);

// Load .env file
$envFile = __DIR__ . '/.env';
if (!file_exists($envFile)) {
    http_response_code(500);
    die(json_encode([
        'success'    => false,
        'message'    => '.env file not found',
        'looked_at'  => $envFile,
        'dir'        => __DIR__,
    ]));
}

$env = parse_ini_file($envFile);
if ($env === false) {
    http_response_code(500);
    die(json_encode([
        'success'   => false,
        'message'   => '.env file could not be parsed — check for syntax errors',
        'looked_at' => $envFile,
    ]));
}

define('DB_HOST',        $env['DB_HOST']           ?? '127.0.0.1');
define('DB_PORT',        $env['DB_PORT']           ?? '3306');
define('DB_NAME',        $env['DB_NAME']           ?? '');
define('DB_USER',        $env['DB_USER']           ?? '');
define('DB_PASSWORD',    $env['DB_PASSWORD']       ?? '');
define('JWT_SECRET',     $env['JWT_SECRET']        ?? '');
define('JWT_EXPIRES',    (int)($env['JWT_EXPIRES_SECONDS'] ?? 604800));
define('ALLOWED_ORIGINS',$env['ALLOWED_ORIGINS']   ?? '');
define('VAPID_PUBLIC_KEY', $env['VAPID_PUBLIC_KEY'] ?? '');
define('VAPID_PRIVATE_KEY',$env['VAPID_PRIVATE_KEY'] ?? '');
define('VAPID_EMAIL',    $env['VAPID_EMAIL']        ?? '');

// GCash parish info (displayed to users for manual top-up)
define('GCASH_NUMBER',  $env['GCASH_NUMBER']  ?? '');
define('GCASH_NAME',    $env['GCASH_NAME']    ?? '');
define('GCASH_QR_URL',  $env['GCASH_QR_URL']  ?? '');
