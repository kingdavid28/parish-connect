<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/push.php';
require_once __DIR__ . '/rewards.php';

function handlePosts(string $method, ?string $id, ?string $action): void {
    match (true) {
        $method === 'GET'  && !$id                            => listPosts(),
        $method === 'POST' && !$id                            => createPost(),
        $method === 'DELETE' && !!$id && !$action             => deletePost($id),
        $method === 'POST' && !!$id && $action === 'like'     => toggleLike($id),
        $method === 'GET'  && !!$id && $action === 'comments' => listComments($id),
        $method === 'POST' && !!$id && $action === 'comments' => addComment($id),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

function listPosts(): void {
    $user = authenticate();

    $page  = max(1, (int)($_GET['page']  ?? 1));
    $limit = min(50, max(1, (int)($_GET['limit'] ?? 20)));
    $offset = ($page - 1) * $limit;

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
             LIMIT ? OFFSET ?'
        );
        $stmt->execute([$user['id'], $limit, $offset]);

        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('List posts error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function createPost(): void {
    $user = authenticate();

    // Support both JSON and multipart/form-data (for image uploads)
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains($contentType, 'multipart/form-data')) {
        $content     = trim($_POST['content'] ?? '');
        $type        = $_POST['type'] ?? 'community';
    } else {
        $body = getJsonBody();
        $content     = trim($body['content'] ?? '');
        $type        = $body['type'] ?? 'community';
    }

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

    // Handle image upload
    $imageUrl = null;
    if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES['image'];
        $maxSize = 5 * 1024 * 1024; // 5MB

        if ($file['size'] > $maxSize) {
            jsonResponse(['success' => false, 'message' => 'Image too large. Max 5MB.'], 400);
        }

        $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        if (!in_array($mimeType, $allowedTypes, true)) {
            jsonResponse(['success' => false, 'message' => 'Invalid image type. Allowed: JPG, PNG, GIF, WebP'], 400);
        }

        $ext = match ($mimeType) {
            'image/jpeg' => 'jpg', 'image/png' => 'png',
            'image/gif' => 'gif', 'image/webp' => 'webp', default => 'jpg',
        };

        $uploadDir = __DIR__ . '/../uploads/posts/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $filename = generateUuid() . '.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], $uploadDir . $filename)) {
            jsonResponse(['success' => false, 'message' => 'Failed to save image'], 500);
        }
        $imageUrl = '/parish-connect/api/uploads/posts/' . $filename;
    }

    try {
        $id = generateUuid();
        getDB()->prepare(
            'INSERT INTO posts (id, user_id, content, type, image_url)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$id, $user['id'], $content, $type, $imageUrl]);

        // Notify followers of the post author
        $db = getDB();
        $followers = $db->prepare(
            'SELECT follower_id FROM follows WHERE following_id = ?'
        );
        $followers->execute([$user['id']]);
        $preview = mb_strimwidth($content, 0, 80, '…');
        foreach ($followers->fetchAll() as $row) {
            sendPushToUser($row['follower_id'], [
                'title' => $user['name'] . ' posted',
                'body'  => $preview,
                'tag'   => 'new-post-' . $id,
                'url'   => '/parish-connect/',
            ]);
        }

        // Award points to post author
        awardPoints($user['id'], 'post_created', $id);

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
            // Award points to post author for receiving a like
            $authorStmt = $db->prepare('SELECT user_id FROM posts WHERE id = ? LIMIT 1');
            $authorStmt->execute([$id]);
            $postRow = $authorStmt->fetch();
            if ($postRow && $postRow['user_id'] !== $user['id']) {
                awardPoints($postRow['user_id'], 'like_received', $id);
            }
            jsonResponse(['success' => true, 'liked' => true]);
        }
    } catch (PDOException $e) {
        error_log('Toggle like error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}


function listComments(string $postId): void {
    authenticate();

    try {
        $db = getDB();
        $stmt = $db->prepare(
            'SELECT c.id, c.content, c.created_at, c.user_id,
                    u.name AS author_name, u.avatar AS author_avatar
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.post_id = ?
             ORDER BY c.created_at ASC'
        );
        $stmt->execute([$postId]);
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('List comments error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function addComment(string $postId): void {
    $user = authenticate();
    $body = getJsonBody();
    $content = trim($body['content'] ?? '');

    if (!$content) {
        jsonResponse(['success' => false, 'message' => 'Content is required'], 400);
    }

    if (strlen($content) > 1000) {
        jsonResponse(['success' => false, 'message' => 'Comment must be under 1000 characters'], 400);
    }

    try {
        $db = getDB();

        // Verify post exists
        $check = $db->prepare('SELECT id FROM posts WHERE id = ? LIMIT 1');
        $check->execute([$postId]);
        if (!$check->fetch()) {
            jsonResponse(['success' => false, 'message' => 'Post not found'], 404);
        }

        $id = generateUuid();
        $db->prepare(
            'INSERT INTO comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)'
        )->execute([$id, $postId, $user['id'], $content]);

        // Fetch the created comment with author info
        $stmt = $db->prepare(
            'SELECT c.id, c.content, c.created_at, c.user_id,
                    u.name AS author_name, u.avatar AS author_avatar
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.id = ?'
        );
        $stmt->execute([$id]);

        // Notify the post author (if not the commenter)
        $postAuthor = $db->prepare('SELECT user_id FROM posts WHERE id = ? LIMIT 1');
        $postAuthor->execute([$postId]);
        $post = $postAuthor->fetch();
        if ($post && $post['user_id'] !== $user['id']) {
            $preview = mb_strimwidth($content, 0, 80, '…');
            sendPushToUser($post['user_id'], [
                'title' => $user['name'] . ' commented',
                'body'  => $preview,
                'tag'   => 'comment-' . $id,
                'url'   => '/parish-connect/',
            ]);
        }

        // Award points to commenter
        awardPoints($user['id'], 'comment_added', $id);

        jsonResponse(['success' => true, 'data' => $stmt->fetch()], 201);
    } catch (PDOException $e) {
        error_log('Add comment error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
