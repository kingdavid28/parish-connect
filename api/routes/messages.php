<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

function handleMessages(string $method, ?string $id, ?string $action): void {
    match (true) {
        $method === 'GET'  && !$id              => listConversations(),
        $method === 'GET'  && !!$id             => getConversation($id),
        $method === 'POST' && !!$id             => sendMessage($id),
        $method === 'PUT'  && !!$id && $action === 'read' => markRead($id),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

function listConversations(): void {
    $user = authenticate();
    try {
        $db = getDB();
        // Get latest message per conversation partner
        $stmt = $db->prepare(
            "SELECT u.id, u.name, u.avatar, u.role,
                    m.content AS last_message, m.created_at AS last_message_at,
                    (SELECT COUNT(*) FROM messages m2
                     WHERE m2.sender_id = u.id AND m2.receiver_id = ? AND m2.is_read = 0) AS unread_count
             FROM (
                SELECT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS partner_id,
                       MAX(created_at) AS max_at
                FROM messages
                WHERE sender_id = ? OR receiver_id = ?
                GROUP BY partner_id
             ) conv
             JOIN users u ON u.id = conv.partner_id AND u.is_active = 1
             JOIN messages m ON m.created_at = conv.max_at
                AND ((m.sender_id = ? AND m.receiver_id = u.id) OR (m.sender_id = u.id AND m.receiver_id = ?))
             ORDER BY conv.max_at DESC"
        );
        $uid = $user['id'];
        $stmt->execute([$uid, $uid, $uid, $uid, $uid, $uid]);
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('List conversations error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function getConversation(string $partnerId): void {
    $user = authenticate();
    try {
        $db = getDB();
        $stmt = $db->prepare(
            'SELECT m.id, m.sender_id, m.receiver_id, m.content, m.is_read, m.created_at,
                    u.name AS sender_name, u.avatar AS sender_avatar
             FROM messages m
             JOIN users u ON m.sender_id = u.id
             WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
             ORDER BY m.created_at ASC
             LIMIT 100'
        );
        $stmt->execute([$user['id'], $partnerId, $partnerId, $user['id']]);

        // Mark received messages as read
        $db->prepare('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0')
           ->execute([$partnerId, $user['id']]);

        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('Get conversation error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function sendMessage(string $receiverId): void {
    $user = authenticate();
    $body = getJsonBody();
    $content = trim($body['content'] ?? '');

    if (!$content) {
        jsonResponse(['success' => false, 'message' => 'Message content is required'], 400);
    }
    if (strlen($content) > 2000) {
        jsonResponse(['success' => false, 'message' => 'Message must be under 2000 characters'], 400);
    }
    if ($user['id'] === $receiverId) {
        jsonResponse(['success' => false, 'message' => 'Cannot message yourself'], 400);
    }

    try {
        $db = getDB();
        // Verify receiver exists
        $check = $db->prepare('SELECT id FROM users WHERE id = ? AND is_active = 1 LIMIT 1');
        $check->execute([$receiverId]);
        if (!$check->fetch()) {
            jsonResponse(['success' => false, 'message' => 'User not found'], 404);
        }

        $id = generateUuid();
        $db->prepare('INSERT INTO messages (id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)')
           ->execute([$id, $user['id'], $receiverId, $content]);

        jsonResponse(['success' => true, 'data' => [
            'id' => $id, 'sender_id' => $user['id'], 'receiver_id' => $receiverId,
            'content' => $content, 'is_read' => 0, 'created_at' => date('Y-m-d H:i:s'),
        ]], 201);
    } catch (PDOException $e) {
        error_log('Send message error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function markRead(string $partnerId): void {
    $user = authenticate();
    try {
        $db = getDB();
        $db->prepare('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0')
           ->execute([$partnerId, $user['id']]);
        jsonResponse(['success' => true, 'message' => 'Messages marked as read']);
    } catch (PDOException $e) {
        error_log('Mark read error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
