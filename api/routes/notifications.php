<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

function handleNotifications(string $method, ?string $id, ?string $action): void {
    match (true) {
        $method === 'GET'  && !$id                    => listNotifications(),
        $method === 'PUT'  && $id === 'read-all'      => markAllNotificationsRead(),
        $method === 'PUT'  && !!$id && $action === 'read' => markNotificationRead($id),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

function listNotifications(): void {
    $user = authenticate();

    $limit = min(50, max(1, (int)($_GET['limit'] ?? 25)));

    try {
        $db = getDB();

        $stmt = $db->prepare(
            'SELECT id, category, title, body, url, read_at, created_at
             FROM app_notifications WHERE user_id = ?
             ORDER BY created_at DESC LIMIT ?'
        );
        $stmt->execute([$user['id'], $limit]);
        $items = $stmt->fetchAll();

        $countStmt = $db->prepare(
            'SELECT COUNT(*) AS cnt FROM app_notifications WHERE user_id = ? AND read_at IS NULL'
        );
        $countStmt->execute([$user['id']]);
        $unread = (int)$countStmt->fetch()['cnt'];

        jsonResponse([
            'success' => true,
            'data'    => ['items' => $items, 'unread_count' => $unread],
        ]);
    } catch (PDOException $e) {
        error_log('List notifications error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Unable to load notifications'], 500);
    }
}

function markAllNotificationsRead(): void {
    $user = authenticate();

    try {
        getDB()->prepare(
            'UPDATE app_notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL'
        )->execute([$user['id']]);
        jsonResponse(['success' => true]);
    } catch (PDOException $e) {
        error_log('Mark all notifications read error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Unable to update notifications'], 500);
    }
}

function markNotificationRead(string $id): void {
    $user = authenticate();

    try {
        $stmt = getDB()->prepare(
            'UPDATE app_notifications SET read_at = COALESCE(read_at, NOW())
             WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $user['id']]);

        if ($stmt->rowCount() === 0) {
            jsonResponse(['success' => false, 'message' => 'Notification not found'], 404);
        }
        jsonResponse(['success' => true]);
    } catch (PDOException $e) {
        error_log('Mark notification read error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Unable to update notification'], 500);
    }
}
