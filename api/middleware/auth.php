<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../vendor/autoload.php';

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\SignatureInvalidException;

function getAuthUser(): ?array {
    // Try to get Authorization header from multiple sources for compatibility
    $authHeader = '';
    
    // First try getallheaders() (works in most setups)
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    
    // Fallback to $_SERVER for FastCGI / shared hosting environments (e.g., Hostinger)
    if (!$authHeader && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    }

    // Some Apache + mod_rewrite setups prefix with REDIRECT_
    if (!$authHeader && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }

    if (!str_starts_with($authHeader, 'Bearer ')) {
        return null;
    }

    $token = substr($authHeader, 7);

    try {
        $decoded = JWT::decode($token, new Key(JWT_SECRET, 'HS256'));
        return (array) $decoded;
    } catch (ExpiredException | SignatureInvalidException | Exception) {
        return null;
    }
}

function authenticate(): array {
    $user = getAuthUser();
    if (!$user) {
        jsonResponse(['success' => false, 'message' => 'Unauthorized'], 401);
        exit;
    }
    return $user;
}

function requireRole(array $user, string ...$roles): void {
    if (!in_array($user['role'], $roles, true)) {
        jsonResponse(['success' => false, 'message' => 'Insufficient permissions'], 403);
    }
}
