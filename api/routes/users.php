<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

function handleUsers(string $method, ?string $id): void {
    match (true) {
        $method === 'GET'    && !$id => listUsers(),
        $method === 'POST'   && !$id => createUser(),
        $method === 'DELETE' && !!$id => deleteUser($id),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

function listUsers(): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    try {
        $db = getDB();
        $sql = 'SELECT id, name, email, role, parish_id, avatar, member_since, last_login, created_by
                FROM users WHERE is_active = 1';

        // Admins cannot see superadmin
        if ($user['role'] === 'admin') {
            $sql .= " AND role != 'superadmin'";
        }

        $sql .= ' ORDER BY created_at DESC';
        $stmt = $db->query($sql);

        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('List users error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function createUser(): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    $body     = getJsonBody();
    $name     = trim($body['name'] ?? '');
    $email    = trim(strtolower($body['email'] ?? ''));
    $password = $body['password'] ?? '';
    $role     = $body['role'] ?? '';
    $parishId = $body['parishId'] ?? 'st-marys';

    if (!$name || !$email || !$password || !$role) {
        jsonResponse(['success' => false, 'message' => 'name, email, password and role are required'], 400);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => 'Invalid email address'], 400);
    }

    if (strlen($password) < 8) {
        jsonResponse(['success' => false, 'message' => 'Password must be at least 8 characters'], 400);
    }

    if (!in_array($role, ['admin', 'parishioner'], true)) {
        jsonResponse(['success' => false, 'message' => 'Invalid role'], 400);
    }

    // Only superadmin can create admins
    if ($role === 'admin' && $user['role'] !== 'superadmin') {
        jsonResponse(['success' => false, 'message' => 'Only super admin can create admin users'], 403);
    }

    try {
        $db = getDB();

        $check = $db->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $check->execute([$email]);
        if ($check->fetch()) {
            jsonResponse(['success' => false, 'message' => 'Email already in use'], 409);
        }

        $id   = generateUuid();
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        $db->prepare(
            'INSERT INTO users (id, name, email, password_hash, role, parish_id, created_by, member_since)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())'
        )->execute([$id, $name, $email, $hash, $role, $parishId, $user['id']]);

        $db->prepare(
            'INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([generateUuid(), $user['id'], 'create_user', 'user', $id, getClientIp()]);

        jsonResponse(['success' => true, 'message' => 'User created successfully', 'data' => ['id' => $id]], 201);
    } catch (PDOException $e) {
        error_log('Create user error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function deleteUser(string $id): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    if ($id === $user['id']) {
        jsonResponse(['success' => false, 'message' => 'You cannot delete your own account'], 400);
    }

    try {
        $db   = getDB();
        $stmt = $db->prepare('SELECT id, role FROM users WHERE id = ? AND is_active = 1 LIMIT 1');
        $stmt->execute([$id]);
        $target = $stmt->fetch();

        if (!$target) {
            jsonResponse(['success' => false, 'message' => 'User not found'], 404);
        }

        if ($target['role'] === 'superadmin') {
            jsonResponse(['success' => false, 'message' => 'Cannot delete super admin'], 403);
        }

        if ($target['role'] === 'admin' && $user['role'] !== 'superadmin') {
            jsonResponse(['success' => false, 'message' => 'Only super admin can delete admin users'], 403);
        }

        // Soft delete
        $db->prepare('UPDATE users SET is_active = 0 WHERE id = ?')->execute([$id]);

        $db->prepare(
            'INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([generateUuid(), $user['id'], 'delete_user', 'user', $id, getClientIp()]);

        jsonResponse(['success' => true, 'message' => 'User deleted successfully']);
    } catch (PDOException $e) {
        error_log('Delete user error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
