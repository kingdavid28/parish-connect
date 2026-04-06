<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

function handleGroups(string $method, ?string $id, ?string $action): void {
    match (true) {
        $method === 'GET'    && !$id                          => listGroups(),
        $method === 'POST'   && !$id                          => createGroup(),
        $method === 'GET'    && !!$id && !$action             => getGroupMessages($id),
        $method === 'POST'   && !!$id && !$action             => sendGroupMessage($id),
        $method === 'POST'   && !!$id && $action === 'members' => addMembers($id),
        $method === 'DELETE' && !!$id && $action === 'leave'  => leaveGroup($id),
        $method === 'GET'    && !!$id && $action === 'members' => getMembers($id),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

function listGroups(): void {
    $user = authenticate();
    try {
        $db = getDB();
        $stmt = $db->prepare(
            "SELECT g.id, g.name, g.avatar, g.created_by,
                    (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count,
                    (SELECT gm3.content FROM group_messages gm3 WHERE gm3.group_id = g.id ORDER BY gm3.created_at DESC LIMIT 1) AS last_message,
                    (SELECT gm3.created_at FROM group_messages gm3 WHERE gm3.group_id = g.id ORDER BY gm3.created_at DESC LIMIT 1) AS last_message_at
             FROM group_chats g
             JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = ?
             ORDER BY last_message_at DESC"
        );
        $stmt->execute([$user['id']]);
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('List groups error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function createGroup(): void {
    $user = authenticate();
    $body = getJsonBody();
    $name = trim($body['name'] ?? '');
    $memberIds = $body['memberIds'] ?? [];

    if (!$name) {
        jsonResponse(['success' => false, 'message' => 'Group name is required'], 400);
    }

    try {
        $db = getDB();
        $groupId = generateUuid();

        $db->prepare('INSERT INTO group_chats (id, name, created_by) VALUES (?, ?, ?)')
           ->execute([$groupId, $name, $user['id']]);

        // Add creator as admin
        $db->prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)')
           ->execute([$groupId, $user['id'], 'admin']);

        // Add other members
        $memberStmt = $db->prepare('INSERT IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)');
        foreach ($memberIds as $memberId) {
            if ($memberId !== $user['id']) {
                $memberStmt->execute([$groupId, $memberId, 'member']);
            }
        }

        jsonResponse(['success' => true, 'data' => ['id' => $groupId]], 201);
    } catch (PDOException $e) {
        error_log('Create group error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function getGroupMessages(string $groupId): void {
    $user = authenticate();
    try {
        $db = getDB();
        // Verify membership
        $check = $db->prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1');
        $check->execute([$groupId, $user['id']]);
        if (!$check->fetch()) {
            jsonResponse(['success' => false, 'message' => 'Not a member of this group'], 403);
        }

        $stmt = $db->prepare(
            'SELECT gm.id, gm.sender_id, gm.content, gm.image_url, gm.created_at,
                    u.name AS sender_name, u.avatar AS sender_avatar
             FROM group_messages gm
             JOIN users u ON gm.sender_id = u.id
             WHERE gm.group_id = ?
             ORDER BY gm.created_at ASC
             LIMIT 200'
        );
        $stmt->execute([$groupId]);
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('Get group messages error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function sendGroupMessage(string $groupId): void {
    $user = authenticate();

    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains($contentType, 'multipart/form-data')) {
        $content = trim($_POST['content'] ?? '');
    } else {
        $body = getJsonBody();
        $content = trim($body['content'] ?? '');
    }

    // Handle image
    $imageUrl = null;
    if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES['image'];
        if ($file['size'] > 5 * 1024 * 1024) {
            jsonResponse(['success' => false, 'message' => 'Image too large. Max 5MB.'], 400);
        }
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);
        if (!in_array($mimeType, ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], true)) {
            jsonResponse(['success' => false, 'message' => 'Invalid image type.'], 400);
        }
        $ext = match ($mimeType) {
            'image/jpeg' => 'jpg', 'image/png' => 'png',
            'image/gif' => 'gif', 'image/webp' => 'webp', default => 'jpg',
        };
        $uploadDir = __DIR__ . '/../uploads/groups/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
        $filename = generateUuid() . '.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], $uploadDir . $filename)) {
            jsonResponse(['success' => false, 'message' => 'Failed to save image'], 500);
        }
        $imageUrl = '/parish-connect/api/uploads/groups/' . $filename;
    }

    if (!$content && !$imageUrl) {
        jsonResponse(['success' => false, 'message' => 'Message or image is required'], 400);
    }

    try {
        $db = getDB();
        $check = $db->prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1');
        $check->execute([$groupId, $user['id']]);
        if (!$check->fetch()) {
            jsonResponse(['success' => false, 'message' => 'Not a member of this group'], 403);
        }

        $id = generateUuid();
        $db->prepare('INSERT INTO group_messages (id, group_id, sender_id, content, image_url) VALUES (?, ?, ?, ?, ?)')
           ->execute([$id, $groupId, $user['id'], $content ?: '', $imageUrl]);

        jsonResponse(['success' => true, 'data' => [
            'id' => $id, 'sender_id' => $user['id'], 'content' => $content ?: '',
            'image_url' => $imageUrl, 'created_at' => date('Y-m-d H:i:s'),
            'sender_name' => '', 'sender_avatar' => '',
        ]], 201);
    } catch (PDOException $e) {
        error_log('Send group message error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function addMembers(string $groupId): void {
    $user = authenticate();
    $body = getJsonBody();
    $memberIds = $body['memberIds'] ?? [];

    if (empty($memberIds)) {
        jsonResponse(['success' => false, 'message' => 'No members to add'], 400);
    }

    try {
        $db = getDB();
        // Verify caller is group admin
        $check = $db->prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1");
        $check->execute([$groupId, $user['id']]);
        $membership = $check->fetch();
        if (!$membership || $membership['role'] !== 'admin') {
            jsonResponse(['success' => false, 'message' => 'Only group admins can add members'], 403);
        }

        $stmt = $db->prepare('INSERT IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)');
        foreach ($memberIds as $memberId) {
            $stmt->execute([$groupId, $memberId, 'member']);
        }

        jsonResponse(['success' => true, 'message' => 'Members added']);
    } catch (PDOException $e) {
        error_log('Add members error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function leaveGroup(string $groupId): void {
    $user = authenticate();
    try {
        $db = getDB();
        $db->prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
           ->execute([$groupId, $user['id']]);
        jsonResponse(['success' => true, 'message' => 'Left group']);
    } catch (PDOException $e) {
        error_log('Leave group error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function getMembers(string $groupId): void {
    authenticate();
    try {
        $db = getDB();
        $stmt = $db->prepare(
            'SELECT u.id, u.name, u.avatar, u.role AS user_role, gm.role AS group_role
             FROM group_members gm
             JOIN users u ON gm.user_id = u.id AND u.is_active = 1
             WHERE gm.group_id = ?
             ORDER BY gm.role ASC, u.name ASC'
        );
        $stmt->execute([$groupId]);
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('Get members error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
