<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/push.php';

function handleRewards(string $method, ?string $id, ?string $action): void {
    match (true) {
        $method === 'GET'  && !$id                              => getMyRewards(),
        $method === 'GET'  && $id === 'leaderboard'             => getLeaderboard(),
        $method === 'GET'  && !!$id && !$action                 => getUserRewards($id),
        $method === 'POST' && !!$id && $action === 'kudos'      => givePraise($id),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

// ─── Point values ─────────────────────────────────────────────────────────────
const POINTS = [
    'post_created'    => 10,
    'comment_added'   => 5,
    'like_received'   => 2,
    'kudos_received'  => 15,
    'follow_received' => 3,
    'daily_login'     => 5,
];

// ─── Badge definitions ────────────────────────────────────────────────────────
const BADGES = [
    ['slug' => 'first_post',      'name' => 'First Post',       'description' => 'Published your first post',          'icon' => '✍️',  'threshold' => 1,   'metric' => 'posts'],
    ['slug' => 'active_member',   'name' => 'Active Member',    'description' => 'Reached 100 points',                 'icon' => '⭐',  'threshold' => 100, 'metric' => 'points'],
    ['slug' => 'community_pillar','name' => 'Community Pillar', 'description' => 'Reached 500 points',                 'icon' => '🏛️', 'threshold' => 500, 'metric' => 'points'],
    ['slug' => 'beloved',         'name' => 'Beloved',          'description' => 'Received 10 praises from parishioners','icon' => '💛',  'threshold' => 10,  'metric' => 'kudos'],
    ['slug' => 'connector',       'name' => 'Connector',        'description' => 'Has 10 followers',                   'icon' => '🤝',  'threshold' => 10,  'metric' => 'followers'],
    ['slug' => 'storyteller',     'name' => 'Storyteller',      'description' => 'Published 10 posts',                 'icon' => '📖',  'threshold' => 10,  'metric' => 'posts'],
];

// ─── Public helpers (called from other routes) ────────────────────────────────

/**
 * Award points to a user for an action. Idempotent for daily_login.
 */
function awardPoints(string $userId, string $action, ?string $refId = null): void {
    $points = POINTS[$action] ?? 0;
    if ($points <= 0) return;

    try {
        $db = getDB();

        // Prevent duplicate daily_login awards
        if ($action === 'daily_login') {
            $check = $db->prepare(
                "SELECT id FROM point_transactions
                 WHERE user_id = ? AND action = 'daily_login' AND DATE(created_at) = CURDATE() LIMIT 1"
            );
            $check->execute([$userId]);
            if ($check->fetch()) return;
        }

        $db->prepare(
            'INSERT INTO point_transactions (id, user_id, action, points, ref_id)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([generateUuid(), $userId, $action, $points, $refId]);

        // Upsert totals
        $db->prepare(
            'INSERT INTO user_points (user_id, total_points)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE total_points = total_points + VALUES(total_points)'
        )->execute([$userId, $points]);

        checkAndAwardBadges($userId);
    } catch (\Exception $e) {
        error_log('awardPoints error: ' . $e->getMessage());
    }
}

/**
 * Check badge thresholds and award any newly earned badges.
 */
function checkAndAwardBadges(string $userId): void {
    try {
        $db = getDB();

        // Gather metrics
        $pts = (int)($db->prepare('SELECT total_points FROM user_points WHERE user_id = ?')
            ->execute([$userId]) ? $db->query("SELECT total_points FROM user_points WHERE user_id = '$userId' LIMIT 1")->fetchColumn() : 0);

        $ptStmt = $db->prepare('SELECT total_points FROM user_points WHERE user_id = ? LIMIT 1');
        $ptStmt->execute([$userId]);
        $pts = (int)($ptStmt->fetchColumn() ?: 0);

        $postStmt = $db->prepare('SELECT COUNT(*) FROM posts WHERE user_id = ?');
        $postStmt->execute([$userId]);
        $posts = (int)$postStmt->fetchColumn();

        $kudosStmt = $db->prepare(
            "SELECT COUNT(*) FROM point_transactions WHERE user_id = ? AND action = 'kudos_received'"
        );
        $kudosStmt->execute([$userId]);
        $kudos = (int)$kudosStmt->fetchColumn();

        $followerStmt = $db->prepare('SELECT COUNT(*) FROM follows WHERE following_id = ?');
        $followerStmt->execute([$userId]);
        $followers = (int)$followerStmt->fetchColumn();

        $metrics = [
            'points'    => $pts,
            'posts'     => $posts,
            'kudos'     => $kudos,
            'followers' => $followers,
        ];

        foreach (BADGES as $badge) {
            $value = $metrics[$badge['metric']] ?? 0;
            if ($value < $badge['threshold']) continue;

            // Already earned?
            $has = $db->prepare('SELECT 1 FROM user_badges WHERE user_id = ? AND badge_slug = ? LIMIT 1');
            $has->execute([$userId, $badge['slug']]);
            if ($has->fetch()) continue;

            $db->prepare(
                'INSERT INTO user_badges (id, user_id, badge_slug) VALUES (?, ?, ?)'
            )->execute([generateUuid(), $userId, $badge['slug']]);

            // Push notification for new badge
            sendPushToUser($userId, [
                'title' => 'New Badge Earned! ' . $badge['icon'],
                'body'  => 'You earned the "' . $badge['name'] . '" badge.',
                'tag'   => 'badge-' . $badge['slug'],
                'url'   => '/parish-connect/rewards',
            ]);
        }
    } catch (\Exception $e) {
        error_log('checkAndAwardBadges error: ' . $e->getMessage());
    }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

function getMyRewards(): void {
    $user = authenticate();
    getUserRewardsById($user['id']);
}

function getUserRewards(string $id): void {
    authenticate();
    getUserRewardsById($id);
}

function getUserRewardsById(string $userId): void {
    try {
        $db = getDB();

        $ptStmt = $db->prepare('SELECT total_points FROM user_points WHERE user_id = ? LIMIT 1');
        $ptStmt->execute([$userId]);
        $totalPoints = (int)($ptStmt->fetchColumn() ?: 0);

        // Recent transactions (last 20)
        $txStmt = $db->prepare(
            'SELECT action, points, ref_id, created_at
             FROM point_transactions WHERE user_id = ?
             ORDER BY created_at DESC LIMIT 20'
        );
        $txStmt->execute([$userId]);
        $transactions = $txStmt->fetchAll();

        // Earned badges
        $badgeStmt = $db->prepare(
            'SELECT badge_slug, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at ASC'
        );
        $badgeStmt->execute([$userId]);
        $earnedSlugs = $badgeStmt->fetchAll();

        // Merge badge definitions
        $earnedMap = [];
        foreach ($earnedSlugs as $row) {
            $earnedMap[$row['badge_slug']] = $row['earned_at'];
        }
        $badges = array_map(function ($b) use ($earnedMap) {
            return array_merge($b, [
                'earned'    => isset($earnedMap[$b['slug']]),
                'earned_at' => $earnedMap[$b['slug']] ?? null,
            ]);
        }, BADGES);

        // Rank
        $rankStmt = $db->prepare(
            'SELECT COUNT(*) + 1 AS rank FROM user_points WHERE total_points > (
                SELECT COALESCE(total_points, 0) FROM user_points WHERE user_id = ?
            )'
        );
        $rankStmt->execute([$userId]);
        $rank = (int)($rankStmt->fetchColumn() ?: 1);

        jsonResponse(['success' => true, 'data' => [
            'total_points' => $totalPoints,
            'rank'         => $rank,
            'badges'       => $badges,
            'transactions' => $transactions,
        ]]);
    } catch (\Exception $e) {
        error_log('getUserRewards error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function getLeaderboard(): void {
    authenticate();
    try {
        $db = getDB();
        $stmt = $db->prepare(
            'SELECT u.id, u.name, u.avatar, u.role,
                    COALESCE(up.total_points, 0) AS total_points,
                    (SELECT COUNT(*) FROM user_badges ub WHERE ub.user_id = u.id) AS badge_count
             FROM users u
             LEFT JOIN user_points up ON up.user_id = u.id
             WHERE u.is_active = 1
             ORDER BY total_points DESC, u.created_at ASC
             LIMIT 20'
        );
        $stmt->execute();
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (\Exception $e) {
        error_log('getLeaderboard error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function givePraise(string $receiverId): void {
    $giver = authenticate();

    if ($giver['id'] === $receiverId) {
        jsonResponse(['success' => false, 'message' => 'You cannot praise yourself'], 400);
    }

    // Praise cost — same as what the receiver earns
    $praiseCost = POINTS['kudos_received']; // 15 GBless

    try {
        $db = getDB();

        // Rate limit: 1 praise per giver→receiver per day
        $check = $db->prepare(
            "SELECT id FROM point_transactions
             WHERE user_id = ? AND action = 'kudos_received' AND ref_id = ? AND DATE(created_at) = CURDATE()
             LIMIT 1"
        );
        $check->execute([$receiverId, $giver['id']]);
        if ($check->fetch()) {
            jsonResponse(['success' => false, 'message' => 'You already praised this person today'], 429);
        }

        // Verify receiver exists
        $userCheck = $db->prepare('SELECT id, name FROM users WHERE id = ? AND is_active = 1 LIMIT 1');
        $userCheck->execute([$receiverId]);
        $receiver = $userCheck->fetch();
        if (!$receiver) {
            jsonResponse(['success' => false, 'message' => 'User not found'], 404);
        }

        // Check giver has enough GBless
        $balStmt = $db->prepare('SELECT total_points FROM user_points WHERE user_id = ? LIMIT 1');
        $balStmt->execute([$giver['id']]);
        $giverBalance = (int)($balStmt->fetchColumn() ?: 0);

        if ($giverBalance < $praiseCost) {
            jsonResponse([
                'success' => false,
                'message' => 'You need at least ' . $praiseCost . ' GBless to give praise. Earn more by posting and engaging!',
                'code'    => 'insufficient_balance',
            ], 400);
        }

        // Atomic transaction: deduct from giver, credit receiver
        $db->beginTransaction();
        try {
            // Deduct from giver
            $db->prepare(
                'UPDATE user_points SET total_points = total_points - ? WHERE user_id = ?'
            )->execute([$praiseCost, $giver['id']]);

            $db->prepare(
                'INSERT INTO point_transactions (id, user_id, action, points, ref_id)
                 VALUES (?, ?, ?, ?, ?)'
            )->execute([generateUuid(), $giver['id'], 'kudos_sent', -$praiseCost, $receiverId]);

            // Credit receiver
            $db->prepare(
                'INSERT INTO user_points (user_id, total_points) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE total_points = total_points + VALUES(total_points)'
            )->execute([$receiverId, $praiseCost]);

            $db->prepare(
                'INSERT INTO point_transactions (id, user_id, action, points, ref_id)
                 VALUES (?, ?, ?, ?, ?)'
            )->execute([generateUuid(), $receiverId, 'kudos_received', $praiseCost, $giver['id']]);

            $db->commit();
        } catch (\Exception $e) {
            $db->rollBack();
            throw $e;
        }

        checkAndAwardBadges($receiverId);

        // Notify receiver
        sendPushToUser($receiverId, [
            'title' => '💛 Praise from ' . $giver['name'],
            'body'  => $giver['name'] . ' praised you with ' . $praiseCost . ' GBless!',
            'tag'   => 'praise-' . $giver['id'],
            'url'   => '/parish-connect/rewards',
        ]);

        jsonResponse(['success' => true, 'message' => 'Praise given! ' . $praiseCost . ' GBless sent to ' . $receiver['name'] . '.']);
    } catch (\Exception $e) {
        error_log('givePraise error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
