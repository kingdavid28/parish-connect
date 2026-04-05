<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

function handleUsers(string $method, ?string $id): void {
    match (true) {
        $method === 'GET'    && !!$id => getUser($id),
        $method === 'GET'    && !$id  => listUsers(),
        $method === 'POST'   && !$id  => createUser(),
        $method === 'DELETE' && !!$id => deleteUser($id),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

/**
 * Check if a user is the "parent" (original) superadmin.
 * The parent superadmin has no created_by value (they were seeded/setup).
 */
function isParentSuperAdmin(array $user): bool {
    return $user['role'] === 'superadmin' && empty($user['created_by']);
}

function getUser(string $id): void {
    $user = authenticate();

    try {
        $db   = getDB();
        $stmt = $db->prepare(
            'SELECT id, name, email, role, parish_id, avatar, member_since, last_login, created_by, created_at
             FROM users WHERE id = ? AND is_active = 1 LIMIT 1'
        );
        $stmt->execute([$id]);
        $target = $stmt->fetch();

        if (!$target) {
            jsonResponse(['success' => false, 'message' => 'User not found'], 404);
        }

        // Non-admin users can only view their own profile
        if (!in_array($user['role'], ['admin', 'superadmin'], true) && $user['id'] !== $id) {
            jsonResponse(['success' => false, 'message' => 'Insufficient permissions'], 403);
        }

        jsonResponse(['success' => true, 'data' => $target]);
    } catch (PDOException $e) {
        error_log('Get user error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function listUsers(): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    try {
        $db = getDB();
        $sql = 'SELECT id, name, email, role, parish_id, avatar, member_since, last_login, created_by, created_at
                FROM users WHERE is_active = 1';

        // Admins cannot see superadmins
        if ($user['role'] === 'admin') {
            $sql .= " AND role != 'superadmin'";
        }

        // Child superadmins cannot see the parent superadmin
        if ($user['role'] === 'superadmin' && !empty($user['created_by'])) {
            $sql .= " AND NOT (role = 'superadmin' AND created_by IS NULL)";
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

    // Fetch full user record to check created_by
    $db = getDB();
    $selfStmt = $db->prepare('SELECT created_by FROM users WHERE id = ? LIMIT 1');
    $selfStmt->execute([$user['id']]);
    $selfRow = $selfStmt->fetch();
    $userCreatedBy = $selfRow['created_by'] ?? null;

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

    $validRoles = ['admin', 'parishioner'];
    // Only superadmins can create superadmin or admin accounts
    if ($user['role'] === 'superadmin') {
        $validRoles[] = 'superadmin';
    }

    if (!in_array($role, $validRoles, true)) {
        jsonResponse(['success' => false, 'message' => 'Invalid role'], 400);
    }

    // Only superadmin can create admins or superadmins
    if (in_array($role, ['admin', 'superadmin'], true) && $user['role'] !== 'superadmin') {
        jsonResponse(['success' => false, 'message' => 'Only super admin can create admin/superadmin users'], 403);
    }

    try {
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

    // Fetch full user record to check if current user is parent superadmin
    $db = getDB();
    $selfStmt = $db->prepare('SELECT created_by FROM users WHERE id = ? LIMIT 1');
    $selfStmt->execute([$user['id']]);
    $selfRow = $selfStmt->fetch();
    $isParent = $user['role'] === 'superadmin' && empty($selfRow['created_by']);

    try {
        $stmt = $db->prepare('SELECT id, role, created_by FROM users WHERE id = ? AND is_active = 1 LIMIT 1');
        $stmt->execute([$id]);
        $target = $stmt->fetch();

        if (!$target) {
            jsonResponse(['success' => false, 'message' => 'User not found'], 404);
        }

        // Only parent superadmin can delete other superadmins
        if ($target['role'] === 'superadmin' && !$isParent) {
            jsonResponse(['success' => false, 'message' => 'Only the parent super admin can delete super admin accounts'], 403);
        }

        // Parent superadmin cannot be deleted by anyone
        if ($target['role'] === 'superadmin' && empty($target['created_by'])) {
            jsonResponse(['success' => false, 'message' => 'The parent super admin account cannot be deleted'], 403);
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
