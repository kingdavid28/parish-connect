<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../vendor/autoload.php';

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

function handlePush(string $method, ?string $action): void {
    match (true) {
        $method === 'POST' && $action === 'subscribe'   => subscribePush(),
        $method === 'DELETE' && $action === 'subscribe' => unsubscribePush(),
        $method === 'GET'  && $action === 'vapid-key'   => getVapidKey(),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

function getVapidKey(): void {
    jsonResponse(['success' => true, 'data' => ['publicKey' => VAPID_PUBLIC_KEY]]);
}

function subscribePush(): void {
    $user = authenticate();
    $body = getJsonBody();

    $endpoint = $body['endpoint'] ?? '';
    $p256dh   = $body['keys']['p256dh'] ?? '';
    $auth     = $body['keys']['auth'] ?? '';

    if (!$endpoint || !$p256dh || !$auth) {
        jsonResponse(['success' => false, 'message' => 'Invalid subscription data'], 400);
    }

    try {
        $db = getDB();
        // Upsert subscription
        $db->prepare(
            'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth), updated_at = NOW()'
        )->execute([$user['id'], $endpoint, $p256dh, $auth]);

        jsonResponse(['success' => true, 'message' => 'Subscribed to push notifications']);
    } catch (PDOException $e) {
        error_log('Push subscribe error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function unsubscribePush(): void {
    $user = authenticate();
    $body = getJsonBody();
    $endpoint = $body['endpoint'] ?? '';

    try {
        $db = getDB();
        $db->prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
           ->execute([$user['id'], $endpoint]);
        jsonResponse(['success' => true, 'message' => 'Unsubscribed']);
    } catch (PDOException $e) {
        error_log('Push unsubscribe error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

/**
 * Send a push notification to a specific user.
 * Call this from other routes (posts, messages, etc.)
 */
function sendPushToUser(string $userId, array $payload): void {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?');
        $stmt->execute([$userId]);
        $subs = $stmt->fetchAll();

        if (empty($subs)) return;

        $webPush = new WebPush([
            'VAPID' => [
                'subject'    => VAPID_EMAIL ?: 'mailto:admin@parish.com',
                'publicKey'  => VAPID_PUBLIC_KEY,
                'privateKey' => VAPID_PRIVATE_KEY,
            ],
        ]);

        foreach ($subs as $sub) {
            $subscription = Subscription::create([
                'endpoint' => $sub['endpoint'],
                'keys'     => ['p256dh' => $sub['p256dh'], 'auth' => $sub['auth']],
            ]);
            $webPush->queueNotification($subscription, json_encode($payload));
        }

        foreach ($webPush->flush() as $report) {
            if ($report->isSubscriptionExpired()) {
                // Remove expired subscription
                $db->prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
                   ->execute([$report->getRequest()->getUri()->__toString()]);
            }
        }
    } catch (\Exception $e) {
        error_log('Push send error: ' . $e->getMessage());
    }
}
