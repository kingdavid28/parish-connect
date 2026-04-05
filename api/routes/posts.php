<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

function handlePosts(string $method, ?string $id, ?string $action): void {
    match (true) {
        $method === 'GET'  && !$id                        => listPosts(),
        $method === 'POST' && !$id                        => createPost(),
        $method === 'DELETE' && !!$id                     => deletePost($id),
        $method === 'POST' && !!$id && $action === 'like' => toggleLike($id),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

function listPosts(): void {
    $user = authenticate();

    try {
        $db   = getDB();
        $stmt = $db->prepare(
            'SELECT p.*,
                    u.name   AS author_name,
                    u.avatar AS author_avatar,
                    u.role   AS author_role,
                    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes,
                    (SELECT COUNT(*) FROM comments  c  WHERE c.post_id  = p.id) AS comments,
                    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ?) AS is_liked
             FROM posts p
             JOIN users u ON p.user_id = u.id
             WHERE p.is_approved = 1
             ORDER BY p.is_pinned DESC, p.created_at DESC
             LIMIT 50'
        );
        $stmt->execute([$user['id']]);

        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('List posts error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function createPost(): void {
    $user = authenticate();
    $body = getJsonBody();

    $content     = trim($body['content'] ?? '');
    $type        = $body['type'] ?? 'community';
    $eventDate   = $body['eventDate'] ?? null;
    $eventLoc    = $body['eventLocation'] ?? null;
    $baptismYear = isset($body['baptismYear']) ? (int)$body['baptismYear'] : null;

    if (!$content) {
        jsonResponse(['success' => false, 'message' => 'Content is required'], 400);
    }

    if (strlen($content) > 2000) {
        jsonResponse(['success' => false, 'message' => 'Content must be under 2000 characters'], 400);
    }

    $validTypes = ['community', 'baptism_anniversary', 'parish_event', 'research'];
    if (!in_array($type, $validTypes, true)) {
        jsonResponse(['success' => false, 'message' => 'Invalid post type'], 400);
    }

    try {
        $id = generateUuid();
        getDB()->prepare(
            'INSERT INTO posts (id, user_id, content, type, event_date, event_location, baptism_year)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$id, $user['id'], $content, $type, $eventDate, $eventLoc, $baptismYear]);

        jsonResponse(['success' => true, 'message' => 'Post created', 'data' => ['id' => $id]], 201);
    } catch (PDOException $e) {
        error_log('Create post error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function deletePost(string $id): void {
    $user = authenticate();

    try {
        $db   = getDB();
        $stmt = $db->prepare('SELECT user_id FROM posts WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $post = $stmt->fetch();

        if (!$post) {
            jsonResponse(['success' => false, 'message' => 'Post not found'], 404);
        }

        $isOwner = $post['user_id'] === $user['id'];
        $isSuperAdmin = $user['role'] === 'superadmin';

        // Check if the post belongs to a superadmin
        $ownerStmt = $db->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
        $ownerStmt->execute([$post['user_id']]);
        $postOwner = $ownerStmt->fetch();

        // Admins cannot delete superadmin posts
        if (!$isOwner && $user['role'] === 'admin' && $postOwner && $postOwner['role'] === 'superadmin') {
            jsonResponse(['success' => false, 'message' => 'Admins cannot delete super admin posts'], 403);
        }

        // Only owner, admin (for non-superadmin posts), or superadmin can delete
        if (!$isOwner && !in_array($user['role'], ['admin', 'superadmin'], true)) {
            jsonResponse(['success' => false, 'message' => 'Not authorized to delete this post'], 403);
        }

        $db->prepare('DELETE FROM posts WHERE id = ?')->execute([$id]);
        jsonResponse(['success' => true, 'message' => 'Post deleted']);
    } catch (PDOException $e) {
        error_log('Delete post error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function toggleLike(string $id): void {
    $user = authenticate();

    try {
        $db   = getDB();
        $stmt = $db->prepare(
            'SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $user['id']]);

        if ($stmt->fetch()) {
            $db->prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?')
               ->execute([$id, $user['id']]);
            jsonResponse(['success' => true, 'liked' => false]);
        } else {
            $db->prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)')
               ->execute([$id, $user['id']]);
            jsonResponse(['success' => true, 'liked' => true]);
        }
    } catch (PDOException $e) {
        error_log('Toggle like error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
