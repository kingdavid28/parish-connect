<?php
declare(strict_types=1);

error_reporting(0);
ini_set('display_errors', '0');

require_once __DIR__ . '/config.php';

// ─── CORS ─────────────────────────────────────────────────────────────────────
$origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = array_map('trim', explode(',', ALLOWED_ORIGINS));

if (in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
}

header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

// Security headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header_remove('X-Powered-By');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ─── Helper Functions (available to all routes) ────────────────────────────────
/**
 * Send JSON response and terminate script.
 * @param array $data The response data
 * @param int $status HTTP status code (default: 200)
 */
function jsonResponse(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Parse incoming JSON request body.
 * @return array The decoded JSON data, or empty array if invalid
 */
function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * Generate a RFC 4122 compliant UUID v4.
 * @return string The generated UUID
 */
function generateUuid(): string {
    $data    = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

/**
 * Get the client's IP address.
 * @return string The IP address
 */
function getClientIp(): string {
    return $_SERVER['HTTP_X_FORWARDED_FOR']
        ?? $_SERVER['HTTP_X_REAL_IP']
        ?? $_SERVER['REMOTE_ADDR']
        ?? '0.0.0.0';
}

/**
 * Check and enforce rate limit using APCu cache.
 * @param string $key The cache key for rate limiting
 * @param int $max Maximum requests allowed
 * @param int $windowSeconds Time window in seconds
 */
function checkRateLimit(string $key, int $max, int $windowSeconds): void {
    if (!function_exists('apcu_fetch')) {
        return;
    }
    $count = (int) apcu_fetch($key);
    if ($count >= $max) {
        jsonResponse(['success' => false, 'message' => 'Too many requests, please try again later'], 429);
    }
    if ($count === 0) {
        apcu_store($key, 1, $windowSeconds);
    } else {
        apcu_inc($key);
    }
}

// ─── Load Database ────────────────────────────────────────────────────────────
require_once __DIR__ . '/db.php';

// ─── Request Parsing ──────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Strip everything up to and including /api
$uri = preg_replace('#^.*?/api#', '', $uri);
$uri = rtrim($uri, '/');
if ($uri === '') {
    $uri = '/';
}

$segments = explode('/', ltrim($uri, '/'));
$resource = $segments[0] ?? '';
$id       = isset($segments[1]) && $segments[1] !== '' ? $segments[1] : null;
$action   = isset($segments[2]) && $segments[2] !== '' ? $segments[2] : null;

// ─── Health Check ─────────────────────────────────────────────────────────────
if ($resource === 'health') {
    jsonResponse(['success' => true, 'message' => 'Parish Connect API is running']);
}


// ─── Database Test (remove after confirming) ──────────────────────────────────
if ($resource === 'db-test') {
    try {
        $db = getDB();
        $db->query('SELECT 1');
        jsonResponse(['success' => true, 'message' => 'Database connected', 'db' => DB_NAME]);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
    }
}

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
$clientIp = getClientIp();

// ─── Route Handling ───────────────────────────────────────────────────────────

// Auth routes (higher rate limit due to frequent requests)
if ($resource === 'auth') {
    checkRateLimit('auth_' . $clientIp, 10, 900);
    require_once __DIR__ . '/routes/auth.php';
    handleAuth($method, $id ?? '');
    exit;
}

// Global rate limit for all other routes
checkRateLimit('global_' . $clientIp, 100, 900);

// User routes
if ($resource === 'users') {
    require_once __DIR__ . '/routes/users.php';
    // Search: GET /users/search?q=name (any authenticated user)
    if ($id === 'search' && $method === 'GET') {
        searchUsers();
        exit;
    }
    // Handle avatar upload: POST /users/{id}/avatar
    if ($action === 'avatar' && $method === 'POST' && $id) {
        handleAvatarUpload($id);
        exit;
    }
    handleUsers($method, $id);
    exit;
}

// Post routes
if ($resource === 'posts') {
    require_once __DIR__ . '/routes/posts.php';
    handlePosts($method, $id, $action);
    exit;
}

// Follow routes
if ($resource === 'follows') {
    require_once __DIR__ . '/routes/follows.php';
    handleFollows($method, $id, $action);
    exit;
}

// Message routes
if ($resource === 'messages') {
    require_once __DIR__ . '/routes/messages.php';
    handleMessages($method, $id, $action);
    exit;
}

// Group chat routes
if ($resource === 'groups') {
    require_once __DIR__ . '/routes/groups.php';
    handleGroups($method, $id, $action);
    exit;
}

// Push notification routes
if ($resource === 'push') {
    require_once __DIR__ . '/routes/push.php';
    handlePush($method, $id);
    exit;
}

// Rewards & gamification routes
if ($resource === 'rewards') {
    require_once __DIR__ . '/routes/rewards.php';
    handleRewards($method, $id, $action);
    exit;
}

// GBless wallet routes (top-up, cash-out, gifting)
if ($resource === 'wallet') {
    require_once __DIR__ . '/routes/wallet.php';
    handleWallet($method, $id, $action);
    exit;
}

// Parish record routes
if ($resource === 'records') {
    require_once __DIR__ . '/routes/records.php';
    handleRecords($method, $id ?? 'baptism', $action);
    exit;
}

// Sacramental records from SVF parish database
if ($resource === 'sacraments') {
    require_once __DIR__ . '/routes/sacraments.php';
    handleSacraments($method, $id, $action);
    exit;
}

// Family groups & ministries
if ($resource === 'families' || $resource === 'ministries') {
    require_once __DIR__ . '/routes/community.php';
    handleCommunity($method, $resource, $id, $action);
    exit;
}

// Audit log (admin only)
if ($resource === 'audit') {
    require_once __DIR__ . '/routes/audit.php';
    handleAudit($method, $id);
    exit;
}

// Auto-post cron (HTTP trigger with secret token)
if ($resource === 'cron-autopost') {
    require_once __DIR__ . '/cron-autopost.php';
    exit;
}

// 404 Not Found
jsonResponse(['success' => false, 'message' => 'Not found'], 404);
