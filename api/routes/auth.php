<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../vendor/autoload.php';

use Firebase\JWT\JWT;

function handleAuth(string $method, string $action): void {
    match (true) {
        $method === 'POST' && $action === 'login'    => authLogin(),
        $method === 'POST' && $action === 'register' => authRegister(),
        $method === 'POST' && $action === 'password' => authChangePassword(),
        $method === 'GET'  && $action === 'me'       => authMe(),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

function authLogin(): void {
    $body = getJsonBody();
    $email    = trim(strtolower($body['email'] ?? ''));
    $password = $body['password'] ?? '';

    if (!$email || !$password) {
        jsonResponse(['success' => false, 'message' => 'Email and password are required'], 400);
    }

    try {
        $db   = getDB();
        $stmt = $db->prepare('SELECT * FROM users WHERE email = ? AND is_active = 1 LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            jsonResponse(['success' => false, 'message' => 'Invalid credentials'], 401);
        }

        // Update last login
        $db->prepare('UPDATE users SET last_login = NOW() WHERE id = ?')->execute([$user['id']]);

        // Audit log
        $db->prepare(
            'INSERT INTO audit_logs (id, user_id, action, ip_address) VALUES (?, ?, ?, ?)'
        )->execute([generateUuid(), $user['id'], 'login', getClientIp()]);

        $payload = [
            'id'       => $user['id'],
            'email'    => $user['email'],
            'role'     => $user['role'],
            'parishId' => $user['parish_id'],
            'iat'      => time(),
            'exp'      => time() + JWT_EXPIRES,
        ];

        $token = JWT::encode($payload, JWT_SECRET, 'HS256');

        jsonResponse([
            'success' => true,
            'data'    => [
                'token' => $token,
                'user'  => [
                    'id'          => $user['id'],
                    'name'        => $user['name'],
                    'email'       => $user['email'],
                    'role'        => $user['role'],
                    'parishId'    => $user['parish_id'],
                    'avatar'      => $user['avatar'],
                    'memberSince' => $user['member_since'],
                    'lastLogin'   => $user['last_login'],
                ],
            ],
        ]);
    } catch (PDOException $e) {
        error_log('Login error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function authRegister(): void {
    $body     = getJsonBody();
    $name     = trim($body['name'] ?? '');
    $email    = trim(strtolower($body['email'] ?? ''));
    $password = $body['password'] ?? '';

    // Validate inputs
    if (!$name || !$email || !$password) {
        jsonResponse(['success' => false, 'message' => 'Name, email and password are required'], 400);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => 'Invalid email address'], 400);
    }

    if (strlen($password) < 8) {
        jsonResponse(['success' => false, 'message' => 'Password must be at least 8 characters'], 400);
    }

    if (!preg_match('/[A-Z]/', $password) ||
        !preg_match('/[a-z]/', $password) ||
        !preg_match('/\d/', $password)) {
        jsonResponse(['success' => false, 'message' => 'Password must contain uppercase, lowercase and a number'], 400);
    }

    try {
        $db = getDB();

        // Check duplicate email
        $check = $db->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $check->execute([$email]);
        if ($check->fetch()) {
            jsonResponse(['success' => false, 'message' => 'An account with this email already exists'], 409);
        }

        $id   = generateUuid();
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        $db->prepare(
            'INSERT INTO users (id, name, email, password_hash, role, parish_id, member_since)
             VALUES (?, ?, ?, ?, ?, ?, CURDATE())'
        )->execute([$id, $name, $email, $hash, 'parishioner', 'st-marys']);

        // Audit log
        $db->prepare(
            'INSERT INTO audit_logs (id, user_id, action, ip_address) VALUES (?, ?, ?, ?)'
        )->execute([generateUuid(), $id, 'register', getClientIp()]);

        jsonResponse(['success' => true, 'message' => 'Account created successfully'], 201);
    } catch (PDOException $e) {
        error_log('Register error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function authMe(): void {
    $user = authenticate();

    try {
        $db   = getDB();
        $stmt = $db->prepare(
            'SELECT id, name, email, role, parish_id, avatar, member_since, last_login
             FROM users WHERE id = ? AND is_active = 1 LIMIT 1'
        );
        $stmt->execute([$user['id']]);
        $row = $stmt->fetch();

        if (!$row) {
            jsonResponse(['success' => false, 'message' => 'User not found'], 404);
        }

        jsonResponse([
            'success' => true,
            'data'    => [
                'id'          => $row['id'],
                'name'        => $row['name'],
                'email'       => $row['email'],
                'role'        => $row['role'],
                'parishId'    => $row['parish_id'],
                'avatar'      => $row['avatar'],
                'memberSince' => $row['member_since'],
                'lastLogin'   => $row['last_login'],
            ],
        ]);
    } catch (PDOException $e) {
        error_log('Auth me error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}


function authChangePassword(): void {
    $user = authenticate();
    $body = getJsonBody();

    $currentPassword = $body['currentPassword'] ?? '';
    $newPassword     = $body['newPassword'] ?? '';

    if (!$currentPassword || !$newPassword) {
        jsonResponse(['success' => false, 'message' => 'Current and new password are required'], 400);
    }

    if (strlen($newPassword) < 8) {
        jsonResponse(['success' => false, 'message' => 'New password must be at least 8 characters'], 400);
    }

    try {
        $db   = getDB();
        $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ? AND is_active = 1 LIMIT 1');
        $stmt->execute([$user['id']]);
        $row = $stmt->fetch();

        if (!$row || !password_verify($currentPassword, $row['password_hash'])) {
            jsonResponse(['success' => false, 'message' => 'Current password is incorrect'], 401);
        }

        $hash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
        $db->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $user['id']]);

        $db->prepare(
            'INSERT INTO audit_logs (id, user_id, action, ip_address) VALUES (?, ?, ?, ?)'
        )->execute([generateUuid(), $user['id'], 'change_password', getClientIp()]);

        jsonResponse(['success' => true, 'message' => 'Password changed successfully']);
    } catch (PDOException $e) {
        error_log('Change password error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
