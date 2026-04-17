<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/sacraments.php';

use Firebase\JWT\JWT;

function handleAuth(string $method, string $action): void {
    match (true) {
        $method === 'POST' && $action === 'login'           => authLogin(),
        $method === 'POST' && $action === 'register'        => authRegister(),
        $method === 'POST' && $action === 'password'        => authChangePassword(),
        $method === 'POST' && $action === 'forgot-password' => authForgotPassword(),
        $method === 'GET'  && $action === 'me'              => authMe(),
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

    // Brute-force protection: max 10 failed attempts per IP per 15 minutes
    $ip = getClientIp();
    $failKey = 'login_fail_' . md5($ip . $email);
    if (function_exists('apcu_fetch')) {
        $fails = (int) apcu_fetch($failKey);
        if ($fails >= 10) {
            jsonResponse(['success' => false, 'message' => 'Too many failed attempts. Please try again in 15 minutes.'], 429);
        }
    }

    try {
        $db   = getDB();
        $stmt = $db->prepare('SELECT * FROM users WHERE email = ? AND is_active = 1 LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            // Increment fail counter
            if (function_exists('apcu_fetch')) {
                $fails = (int) apcu_fetch($failKey);
                if ($fails === 0) apcu_store($failKey, 1, 900);
                else apcu_inc($failKey);
            }
            jsonResponse(['success' => false, 'message' => 'Invalid credentials'], 401);
        }

        // Clear fail counter on success
        if (function_exists('apcu_delete')) apcu_delete($failKey);

        // Update last login
        $db->prepare('UPDATE users SET last_login = NOW() WHERE id = ?')->execute([$user['id']]);

        // Award daily login points (idempotent — once per day)
        require_once __DIR__ . '/rewards.php';
        awardPoints($user['id'], 'daily_login', null);

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

    // Verify name + birthday + father's first name against sacraments DB
    $birthday = trim($body['birthday'] ?? '');
    $fatherFirstName = trim($body['fatherFirstName'] ?? '');

    if (!$fatherFirstName) {
        jsonResponse(['success' => false, 'message' => "Father's first name is required for verification"], 400);
    }

    try {
        $sacDb = getSacramentsDB();

        $sacRecord = null;

        if ($birthday) {
            // Try to match name + birthday
            $ts = strtotime($birthday);
            if ($ts !== false) {
                $birthdayISO          = date('Y-m-d', $ts);
                $birthdayWithComma    = date('F j, Y', $ts);
                $birthdayWithoutComma = date('F j Y', $ts);

                $sacStmt = $sacDb->prepare(
                    'SELECT id, parents_name FROM sacraments
                     WHERE LOWER(name) = LOWER(?)
                       AND (birthday = ? OR birthday = ? OR birthday = ?)
                     LIMIT 1'
                );
                $sacStmt->execute([$name, $birthdayISO, $birthdayWithComma, $birthdayWithoutComma]);
                $sacRecord = $sacStmt->fetch();
            }
        }

        // Fallback: match name only when birthday is empty or not provided in DB
        if (!$sacRecord) {
            $fallbackStmt = $sacDb->prepare(
                "SELECT id, parents_name FROM sacraments
                 WHERE LOWER(name) = LOWER(?)
                   AND (birthday IS NULL OR birthday = '' OR birthday = '0000-00-00')
                 LIMIT 1"
            );
            $fallbackStmt->execute([$name]);
            $sacRecord = $fallbackStmt->fetch();
        }

        if (!$sacRecord) {
            jsonResponse([
                'success' => false,
                'message' => 'Your name was not found in the parish records. Please use the exact name as it appears in the sacramental records.'
            ], 403);
        }

        // Verify father's first name from parents_name field
        $parentsName = strtolower($sacRecord['parents_name'] ?? '');
        $fatherCheck = strtolower($fatherFirstName);
        if (!$parentsName || strpos($parentsName, $fatherCheck) === false) {
            jsonResponse([
                'success' => false,
                'message' => "The father's first name does not match our records. Please try again."
            ], 403);
        }
    } catch (PDOException $e) {
        error_log('Sacraments DB check error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Unable to verify parish records. Please try again later.'], 500);
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


function authForgotPassword(): void {
    $body = getJsonBody();
    $email          = trim(strtolower($body['email'] ?? ''));
    $name           = trim($body['name'] ?? '');
    $birthday       = trim($body['birthday'] ?? '');
    $fatherFirstName = trim($body['fatherFirstName'] ?? '');
    $newPassword    = $body['newPassword'] ?? '';

    if (!$email || !$name || !$birthday || !$fatherFirstName || !$newPassword) {
        jsonResponse(['success' => false, 'message' => 'All fields are required'], 400);
    }

    if (strlen($newPassword) < 8) {
        jsonResponse(['success' => false, 'message' => 'New password must be at least 8 characters'], 400);
    }

    if (!preg_match('/[A-Z]/', $newPassword) ||
        !preg_match('/[a-z]/', $newPassword) ||
        !preg_match('/\d/', $newPassword)) {
        jsonResponse(['success' => false, 'message' => 'Password must contain uppercase, lowercase and a number'], 400);
    }

    try {
        // Step 1: Verify user exists in main DB
        $db = getDB();
        $userStmt = $db->prepare('SELECT id, name FROM users WHERE email = ? AND is_active = 1 LIMIT 1');
        $userStmt->execute([$email]);
        $user = $userStmt->fetch();

        if (!$user) {
            jsonResponse(['success' => false, 'message' => 'No account found with this email address'], 404);
        }

        // Step 2: Verify identity against sacraments DB
        $sacDb = getSacramentsDB();

        // Convert birthday to DB format — handle multiple formats in DB
        $ts = strtotime($birthday);
        if ($ts === false) {
            jsonResponse(['success' => false, 'message' => 'Invalid birthday format'], 400);
        }
        $birthdayISO          = date('Y-m-d', $ts);
        $birthdayWithComma    = date('F j, Y', $ts);
        $birthdayWithoutComma = date('F j Y', $ts);

        // First try: match name + birthday
        $sacStmt = $sacDb->prepare(
            'SELECT id, parents_name FROM sacraments
             WHERE LOWER(name) = LOWER(?)
               AND (birthday = ? OR birthday = ? OR birthday = ?)
             LIMIT 1'
        );
        $sacStmt->execute([$name, $birthdayISO, $birthdayWithComma, $birthdayWithoutComma]);
        $sacRecord = $sacStmt->fetch();

        // Fallback: record exists with this name but no birthday
        if (!$sacRecord) {
            $fallbackStmt = $sacDb->prepare(
                "SELECT id, parents_name FROM sacraments
                 WHERE LOWER(name) = LOWER(?)
                   AND (birthday IS NULL OR birthday = '' OR birthday = '0000-00-00')
                 LIMIT 1"
            );
            $fallbackStmt->execute([$name]);
            $sacRecord = $fallbackStmt->fetch();
        }

        if (!$sacRecord) {
            jsonResponse(['success' => false, 'message' => 'Identity verification failed. Name and birthday do not match parish records.'], 403);
        }

        // Step 3: Verify father's first name
        $parentsName = strtolower($sacRecord['parents_name'] ?? '');
        $fatherCheck = strtolower($fatherFirstName);
        if (!$parentsName || strpos($parentsName, $fatherCheck) === false) {
            jsonResponse(['success' => false, 'message' => "Identity verification failed. Father's first name does not match."], 403);
        }

        // Step 4: Update password
        $hash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
        $db->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $user['id']]);

        // Audit log
        $db->prepare(
            'INSERT INTO audit_logs (id, user_id, action, ip_address) VALUES (?, ?, ?, ?)'
        )->execute([generateUuid(), $user['id'], 'forgot_password_reset', getClientIp()]);

        jsonResponse(['success' => true, 'message' => 'Password reset successfully. You can now log in with your new password.']);
    } catch (PDOException $e) {
        error_log('Forgot password error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
