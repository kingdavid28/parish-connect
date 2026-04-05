<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

function handleFollows(string $method, ?string $id, ?string $action): void {
    match (true) {
        $method === 'POST'   && !!$id && !$action  => toggleFollow($id),
        $method === 'GET'    && !!$id && $action === 'status' => followStatus($id),
        $method === 'GET'    && !!$id && $action === 'followers' => listFollowers($id),
        $method === 'GET'    && !!$id && $action === 'following' => listFollowing($id),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

function toggleFollow(string $targetId): void {
    $user = authenticate();

    if ($user['id'] === $targetId) {
        jsonResponse(['success' => false, 'message' => 'Cannot follow yourself'], 400);
    }

    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ? LIMIT 1');
        $stmt->execute([$user['id'], $targetId]);

        if ($stmt->fetch()) {
            $db->prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?')
               ->execute([$user['id'], $targetId]);
            jsonResponse(['success' => true, 'following' => false]);
        } else {
            $db->prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)')
               ->execute([$user['id'], $targetId]);
            jsonResponse(['success' => true, 'following' => true]);
        }
    } catch (PDOException $e) {
        error_log('Toggle follow error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function followStatus(string $targetId): void {
    $user = authenticate();
    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ? LIMIT 1');
        $stmt->execute([$user['id'], $targetId]);
        $isFollowing = (bool)$stmt->fetch();

        $followers = $db->prepare('SELECT COUNT(*) AS c FROM follows WHERE following_id = ?');
        $followers->execute([$targetId]);
        $followerCount = (int)$followers->fetch()['c'];

        $following = $db->prepare('SELECT COUNT(*) AS c FROM follows WHERE follower_id = ?');
        $following->execute([$targetId]);
        $followingCount = (int)$following->fetch()['c'];

        jsonResponse(['success' => true, 'data' => [
            'is_following' => $isFollowing,
            'followers' => $followerCount,
            'following' => $followingCount,
        ]]);
    } catch (PDOException $e) {
        error_log('Follow status error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function listFollowers(string $userId): void {
    authenticate();
    try {
        $db = getDB();
        $stmt = $db->prepare(
            'SELECT u.id, u.name, u.avatar, u.role
             FROM follows f JOIN users u ON f.follower_id = u.id
             WHERE f.following_id = ? AND u.is_active = 1
             ORDER BY f.created_at DESC'
        );
        $stmt->execute([$userId]);
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('List followers error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function listFollowing(string $userId): void {
    authenticate();
    try {
        $db = getDB();
        $stmt = $db->prepare(
            'SELECT u.id, u.name, u.avatar, u.role
             FROM follows f JOIN users u ON f.following_id = u.id
             WHERE f.follower_id = ? AND u.is_active = 1
             ORDER BY f.created_at DESC'
        );
        $stmt->execute([$userId]);
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('List following error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
