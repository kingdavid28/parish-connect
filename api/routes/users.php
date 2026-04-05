<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

function handleUsers(string $method, ?string $id): void {
    match (true) {
        $method === 'GET'    && !!$id => getUser($id),
        $method === 'GET'    && !$id  => listUsers(),
        $method === 'POST'   && !$id  => createUser(),
        $method === 'PUT'    && !!$id => updateUser($id),
        $method === 'DELETE' && !!$id => deleteUser($id),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

/**
 * Check if a user is the "parent" (original) superadmin.
 * The parent is the superadmin with the earliest created_at.
 */
function isParentSuperAdmin(array $user): bool {
    if ($user['role'] !== 'superadmin') return false;
    $db = getDB();
    $stmt = $db->prepare("SELECT id FROM users WHERE role = 'superadmin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1");
    $stmt->execute();
    $row = $stmt->fetch();
    return $row && $row['id'] === $user['id'];
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

        // Check if current user is the parent (original) superadmin
        // The parent is the superadmin with the earliest created_at
        $isParentSuperAdmin = false;
        if ($user['role'] === 'superadmin') {
            $parentStmt = $db->prepare(
                "SELECT id FROM users WHERE role = 'superadmin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1"
            );
            $parentStmt->execute();
            $parentRow = $parentStmt->fetch();
            $isParentSuperAdmin = $parentRow && $parentRow['id'] === $user['id'];
        }

        $sql = 'SELECT id, name, email, role, parish_id, avatar, member_since, last_login, created_by, created_at
                FROM users WHERE is_active = 1';

        // Admins cannot see superadmins
        if ($user['role'] === 'admin') {
            $sql .= " AND role != 'superadmin'";
        }

        // Find the parent superadmin ID to hide them from everyone else
        $parentId = null;
        $parentIdStmt = $db->prepare(
            "SELECT id FROM users WHERE role = 'superadmin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1"
        );
        $parentIdStmt->execute();
        $parentIdRow = $parentIdStmt->fetch();
        if ($parentIdRow) $parentId = $parentIdRow['id'];

        // Parent superadmin is invisible to everyone except themselves
        if (!$isParentSuperAdmin && $parentId) {
            $sql .= " AND id != ?";
        }

        $sql .= ' ORDER BY created_at DESC';
        $stmt = $db->prepare($sql);
        if (!$isParentSuperAdmin && $parentId) {
            $stmt->execute([$parentId]);
        } else {
            $stmt->execute();
        }

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

function updateUser(string $id): void {
    $user = authenticate();

    // Users can update their own name; only superadmin can change roles
    $isSelf = $user['id'] === $id;
    $isSuperAdmin = $user['role'] === 'superadmin';

    if (!$isSelf && !$isSuperAdmin) {
        jsonResponse(['success' => false, 'message' => 'Insufficient permissions'], 403);
    }

    $db = getDB();
    $isParent = isParentSuperAdmin($user);

    $body = getJsonBody();
    $newRole = $body['role'] ?? null;
    $newName = isset($body['name']) ? trim($body['name']) : null;

    // Non-superadmins cannot change roles
    if ($newRole && !$isSuperAdmin) {
        $newRole = null;
    }

    if (!$newRole && !$newName) {
        jsonResponse(['success' => false, 'message' => 'Nothing to update'], 400);
    }

    try {
        $stmt = $db->prepare('SELECT id, role, created_by FROM users WHERE id = ? AND is_active = 1 LIMIT 1');
        $stmt->execute([$id]);
        $target = $stmt->fetch();

        if (!$target) {
            jsonResponse(['success' => false, 'message' => 'User not found'], 404);
        }

        // Cannot edit own role
        if ($id === $user['id'] && $newRole) {
            jsonResponse(['success' => false, 'message' => 'You cannot change your own role'], 400);
        }

        // Cannot edit parent superadmin (unless you ARE the parent)
        $parentCheck = $db->prepare("SELECT id FROM users WHERE role = 'superadmin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1");
        $parentCheck->execute();
        $parentCheckRow = $parentCheck->fetch();
        $targetIsParent = $parentCheckRow && $target['id'] === $parentCheckRow['id'];
        if ($targetIsParent && !$isParent) {
            jsonResponse(['success' => false, 'message' => 'Cannot modify the parent super admin'], 403);
        }

        // Child superadmins cannot change another superadmin's role
        if ($target['role'] === 'superadmin' && !$isParent) {
            jsonResponse(['success' => false, 'message' => 'Only the parent super admin can modify super admin accounts'], 403);
        }

        if ($newRole) {
            $validRoles = ['admin', 'parishioner', 'superadmin'];
            if (!in_array($newRole, $validRoles, true)) {
                jsonResponse(['success' => false, 'message' => 'Invalid role'], 400);
            }
            // Only parent superadmin can assign superadmin role
            if ($newRole === 'superadmin' && !$isParent) {
                jsonResponse(['success' => false, 'message' => 'Only the parent super admin can assign super admin role'], 403);
            }
        }

        $updates = [];
        $params  = [];

        if ($newName) {
            $updates[] = 'name = ?';
            $params[]  = $newName;
        }
        if ($newRole) {
            $updates[] = 'role = ?';
            $params[]  = $newRole;
        }

        $params[] = $id;
        $db->prepare('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($params);

        $db->prepare(
            'INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([generateUuid(), $user['id'], 'update_user', 'user', $id, getClientIp()]);

        jsonResponse(['success' => true, 'message' => 'User updated successfully']);
    } catch (PDOException $e) {
        error_log('Update user error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function deleteUser(string $id): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    if ($id === $user['id']) {
        jsonResponse(['success' => false, 'message' => 'You cannot delete your own account'], 400);
    }

    $db = getDB();
    $isParent = isParentSuperAdmin($user);

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
        $parentStmt = $db->prepare("SELECT id FROM users WHERE role = 'superadmin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1");
        $parentStmt->execute();
        $parentRow = $parentStmt->fetch();
        if ($parentRow && $target['id'] === $parentRow['id']) {
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


function handleAvatarUpload(string $id): void {
    $user = authenticate();

    // Users can only upload their own avatar, admins/superadmins can upload for anyone
    if ($user['id'] !== $id && !in_array($user['role'], ['admin', 'superadmin'], true)) {
        jsonResponse(['success' => false, 'message' => 'Not authorized'], 403);
    }

    if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
        jsonResponse(['success' => false, 'message' => 'No file uploaded or upload error'], 400);
    }

    $file = $_FILES['avatar'];
    $maxSize = 2 * 1024 * 1024; // 2MB

    if ($file['size'] > $maxSize) {
        jsonResponse(['success' => false, 'message' => 'File too large. Max 2MB.'], 400);
    }

    $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mimeType, $allowedTypes, true)) {
        jsonResponse(['success' => false, 'message' => 'Invalid file type. Allowed: JPG, PNG, GIF, WebP'], 400);
    }

    $ext = match ($mimeType) {
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/gif'  => 'gif',
        'image/webp' => 'webp',
        default      => 'jpg',
    };

    $uploadDir = __DIR__ . '/../uploads/avatars/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $filename = $id . '-' . time() . '.' . $ext;
    $filepath = $uploadDir . $filename;

    if (!move_uploaded_file($file['tmp_name'], $filepath)) {
        jsonResponse(['success' => false, 'message' => 'Failed to save file'], 500);
    }

    // Build the public URL
    $avatarUrl = '/parish-connect/api/uploads/avatars/' . $filename;

    try {
        $db = getDB();
        // Delete old avatar file if exists
        $stmt = $db->prepare('SELECT avatar FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $oldUser = $stmt->fetch();
        if ($oldUser && $oldUser['avatar']) {
            $oldPath = __DIR__ . '/..' . str_replace('/parish-connect/api', '', $oldUser['avatar']);
            if (file_exists($oldPath)) {
                unlink($oldPath);
            }
        }

        $db->prepare('UPDATE users SET avatar = ? WHERE id = ?')->execute([$avatarUrl, $id]);

        jsonResponse(['success' => true, 'message' => 'Avatar updated', 'data' => ['avatar' => $avatarUrl]]);
    } catch (PDOException $e) {
        error_log('Avatar upload error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
