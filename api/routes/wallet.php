<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/push.php';
require_once __DIR__ . '/rewards.php';

// ─── Exchange rate ─────────────────────────────────────────────────────────────
// 1,000,000 GBless = ₱100  →  10,000 GBless per ₱1
const GBLESS_PER_PHP = 10000;
const CASHOUT_MIN    = 1000000; // minimum GBless to request cash-out

function handleWallet(string $method, ?string $id, ?string $action): void {
    match (true) {
        // User endpoints
        $method === 'GET'  && !$id                                  => getWalletSummary(),
        $method === 'GET'  && $id === 'gcash-info'                  => getGcashInfo(),
        $method === 'POST' && $id === 'topup'                       => submitTopup(),
        $method === 'POST' && $id === 'cashout'                     => submitCashout(),
        $method === 'POST' && $id === 'gift'                        => sendGift(),
        $method === 'GET'  && $id === 'history'                     => getHistory(),

        // Admin endpoints
        $method === 'GET'  && $id === 'admin' && $action === 'topups'    => adminListTopups(),
        $method === 'GET'  && $id === 'admin' && $action === 'cashouts'  => adminListCashouts(),
        $method === 'POST' && $id === 'admin' && $action === 'topup'     => adminReviewTopup(),
        $method === 'POST' && $id === 'admin' && $action === 'cashout'   => adminReviewCashout(),

        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBalance(string $userId): int {
    $db   = getDB();
    $stmt = $db->prepare('SELECT total_points FROM user_points WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    return (int)($stmt->fetchColumn() ?: 0);
}

/**
 * Deduct GBless from a user's balance. Throws on insufficient funds.
 */
function deductPoints(string $userId, int $amount, string $action, ?string $refId = null): void {
    $db = getDB();
    $db->beginTransaction();
    try {
        // Lock the row
        $stmt = $db->prepare('SELECT total_points FROM user_points WHERE user_id = ? FOR UPDATE');
        $stmt->execute([$userId]);
        $current = (int)($stmt->fetchColumn() ?: 0);

        if ($current < $amount) {
            $db->rollBack();
            throw new \RuntimeException('Insufficient GBless balance');
        }

        $db->prepare(
            'UPDATE user_points SET total_points = total_points - ? WHERE user_id = ?'
        )->execute([$amount, $userId]);

        $db->prepare(
            'INSERT INTO point_transactions (id, user_id, action, points, ref_id)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([generateUuid(), $userId, $action, -$amount, $refId]);

        $db->commit();
    } catch (\Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

/**
 * Credit GBless to a user's balance.
 */
function creditPoints(string $userId, int $amount, string $action, ?string $refId = null): void {
    $db = getDB();
    $db->prepare(
        'INSERT INTO point_transactions (id, user_id, action, points, ref_id)
         VALUES (?, ?, ?, ?, ?)'
    )->execute([generateUuid(), $userId, $action, $amount, $refId]);

    $db->prepare(
        'INSERT INTO user_points (user_id, total_points)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE total_points = total_points + VALUES(total_points)'
    )->execute([$userId, $amount]);
}

// ─── User: wallet summary ─────────────────────────────────────────────────────

function getWalletSummary(): void {
    $user = authenticate();
    $db   = getDB();

    $balance = getBalance($user['id']);

    // Pending requests
    $pendingTopup = $db->prepare(
        "SELECT COUNT(*) FROM gbless_topup_requests WHERE user_id = ? AND status = 'pending'"
    );
    $pendingTopup->execute([$user['id']]);

    $pendingCashout = $db->prepare(
        "SELECT COUNT(*) FROM gbless_cashout_requests WHERE user_id = ? AND status = 'pending'"
    );
    $pendingCashout->execute([$user['id']]);

    jsonResponse(['success' => true, 'data' => [
        'balance'           => $balance,
        'balance_php'       => round($balance / GBLESS_PER_PHP, 2),
        'cashout_min'       => CASHOUT_MIN,
        'cashout_min_php'   => CASHOUT_MIN / GBLESS_PER_PHP,
        'gbless_per_php'    => GBLESS_PER_PHP,
        'pending_topups'    => (int)$pendingTopup->fetchColumn(),
        'pending_cashouts'  => (int)$pendingCashout->fetchColumn(),
        'can_cashout'       => $balance >= CASHOUT_MIN,
    ]]);
}

// ─── User: GCash info (parish number + QR) ───────────────────────────────────

function getGcashInfo(): void {
    authenticate();
    jsonResponse(['success' => true, 'data' => [
        'gcash_number' => GCASH_NUMBER,
        'gcash_name'   => GCASH_NAME,
        'gcash_qr_url' => GCASH_QR_URL,
        'rate_label'   => '₱1 = ' . number_format(GBLESS_PER_PHP) . ' GBless',
        'note'         => 'Send your GCash payment to the number above, then submit your reference number below. Admin will credit your GBless within 24 hours.',
    ]]);
}

// ─── User: submit top-up request ─────────────────────────────────────────────

function submitTopup(): void {
    $user = authenticate();

    // Accept multipart/form-data (with optional receipt image) or JSON
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains($contentType, 'multipart/form-data')) {
        $gcashRef    = trim($_POST['gcash_ref']    ?? '');
        $gcashSender = trim($_POST['gcash_sender'] ?? '');
        $amountPhp   = (float)($_POST['amount_php'] ?? 0);
    } else {
        $body        = getJsonBody();
        $gcashRef    = trim($body['gcash_ref']    ?? '');
        $gcashSender = trim($body['gcash_sender'] ?? '');
        $amountPhp   = (float)($body['amount_php'] ?? 0);
    }

    if (!$gcashRef || !$gcashSender) {
        jsonResponse(['success' => false, 'message' => 'GCash reference number and sender name are required'], 400);
    }
    if ($amountPhp < 1) {
        jsonResponse(['success' => false, 'message' => 'Minimum top-up is ₱1'], 400);
    }
    if ($amountPhp > 10000) {
        jsonResponse(['success' => false, 'message' => 'Maximum single top-up is ₱10,000'], 400);
    }

    $gblessAmount = (int)round($amountPhp * GBLESS_PER_PHP);

    // ── Handle optional receipt screenshot upload ──────────────────────────────
    $receiptUrl = null;
    if (isset($_FILES['receipt']) && $_FILES['receipt']['error'] === UPLOAD_ERR_OK) {
        $file    = $_FILES['receipt'];
        $maxSize = 5 * 1024 * 1024; // 5 MB

        if ($file['size'] > $maxSize) {
            jsonResponse(['success' => false, 'message' => 'Receipt image too large. Max 5MB.'], 400);
        }

        $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        $finfo        = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType     = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        if (!in_array($mimeType, $allowedTypes, true)) {
            jsonResponse(['success' => false, 'message' => 'Invalid receipt image type. Use JPG, PNG, or WebP.'], 400);
        }

        $ext       = match ($mimeType) {
            'image/jpeg' => 'jpg', 'image/png' => 'png',
            'image/gif'  => 'gif', 'image/webp' => 'webp', default => 'jpg',
        };
        $uploadDir = __DIR__ . '/../uploads/receipts/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $filename = generateUuid() . '.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], $uploadDir . $filename)) {
            jsonResponse(['success' => false, 'message' => 'Failed to save receipt image'], 500);
        }
        $receiptUrl = '/parish-connect/api/uploads/receipts/' . $filename;
    }

    try {
        $db = getDB();

        // Prevent duplicate reference numbers
        $dupCheck = $db->prepare(
            "SELECT id FROM gbless_topup_requests WHERE gcash_ref = ? AND status != 'rejected' LIMIT 1"
        );
        $dupCheck->execute([$gcashRef]);
        if ($dupCheck->fetch()) {
            jsonResponse(['success' => false, 'message' => 'This GCash reference number has already been submitted'], 409);
        }

        $id = generateUuid();
        $db->prepare(
            'INSERT INTO gbless_topup_requests
             (id, user_id, gcash_ref, gcash_sender, amount_php, gbless_amount, receipt_url)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$id, $user['id'], $gcashRef, $gcashSender, $amountPhp, $gblessAmount, $receiptUrl]);

        // Notify admins via push (best-effort)
        $admins = $db->prepare(
            "SELECT id FROM users WHERE role IN ('admin','superadmin') AND is_active = 1"
        );
        $admins->execute();
        foreach ($admins->fetchAll() as $admin) {
            sendPushToUser($admin['id'], [
                'title' => '💰 New Top-up Request',
                'body'  => $user['name'] . ' submitted ₱' . number_format($amountPhp, 2) . ' top-up' . ($receiptUrl ? ' with receipt' : ''),
                'tag'   => 'topup-' . $id,
                'url'   => '/parish-connect/admin/wallet',
            ]);
        }

        jsonResponse(['success' => true, 'message' => 'Top-up request submitted! Admin will review within 24 hours.', 'data' => ['id' => $id]], 201);
    } catch (\Exception $e) {
        error_log('submitTopup error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

// ─── User: submit cash-out request ───────────────────────────────────────────

function submitCashout(): void {
    $user = authenticate();
    $body = getJsonBody();

    $gblessAmount = (int)($body['gbless_amount'] ?? 0);
    $gcashNumber  = trim($body['gcash_number']  ?? '');
    $gcashName    = trim($body['gcash_name']    ?? '');

    if ($gblessAmount < CASHOUT_MIN) {
        jsonResponse(['success' => false, 'message' => 'Minimum cash-out is ' . number_format(CASHOUT_MIN) . ' GBless (₱' . (CASHOUT_MIN / GBLESS_PER_PHP) . ')'], 400);
    }
    if (!$gcashNumber || !$gcashName) {
        jsonResponse(['success' => false, 'message' => 'GCash number and registered name are required'], 400);
    }
    if (!preg_match('/^(09|\+639)\d{9}$/', $gcashNumber)) {
        jsonResponse(['success' => false, 'message' => 'Invalid GCash number format (e.g. 09XXXXXXXXX)'], 400);
    }

    $balance = getBalance($user['id']);
    if ($balance < $gblessAmount) {
        jsonResponse(['success' => false, 'message' => 'Insufficient GBless balance'], 400);
    }

    try {
        $db = getDB();

        // Only 1 pending cashout at a time
        $pending = $db->prepare(
            "SELECT id FROM gbless_cashout_requests WHERE user_id = ? AND status = 'pending' LIMIT 1"
        );
        $pending->execute([$user['id']]);
        if ($pending->fetch()) {
            jsonResponse(['success' => false, 'message' => 'You already have a pending cash-out request'], 409);
        }

        $amountPhp = round($gblessAmount / GBLESS_PER_PHP, 2);
        $id        = generateUuid();

        // Reserve (deduct) the GBless immediately so balance can't be double-spent
        deductPoints($user['id'], $gblessAmount, 'cashout_reserved', $id);

        $db->prepare(
            'INSERT INTO gbless_cashout_requests
             (id, user_id, gbless_amount, amount_php, gcash_number, gcash_name)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$id, $user['id'], $gblessAmount, $amountPhp, $gcashNumber, $gcashName]);

        // Notify admins
        $admins = $db->prepare(
            "SELECT id FROM users WHERE role IN ('admin','superadmin') AND is_active = 1"
        );
        $admins->execute();
        foreach ($admins->fetchAll() as $admin) {
            sendPushToUser($admin['id'], [
                'title' => '💸 Cash-out Request',
                'body'  => $user['name'] . ' wants to cash out ₱' . number_format($amountPhp, 2),
                'tag'   => 'cashout-' . $id,
                'url'   => '/parish-connect/admin/wallet',
            ]);
        }

        jsonResponse(['success' => true, 'message' => 'Cash-out request submitted! Admin will process within 24–48 hours.', 'data' => ['id' => $id]], 201);
    } catch (\RuntimeException $e) {
        jsonResponse(['success' => false, 'message' => $e->getMessage()], 400);
    } catch (\Exception $e) {
        error_log('submitCashout error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

// ─── User: send GBless gift to another user ───────────────────────────────────

function sendGift(): void {
    $sender = authenticate();
    $body   = getJsonBody();

    $receiverId   = trim($body['receiver_id']   ?? '');
    $gblessAmount = (int)($body['gbless_amount'] ?? 0);
    $message      = mb_substr(trim($body['message'] ?? ''), 0, 255);

    if ($sender['id'] === $receiverId) {
        jsonResponse(['success' => false, 'message' => 'You cannot gift GBless to yourself'], 400);
    }
    if ($gblessAmount < 100) {
        jsonResponse(['success' => false, 'message' => 'Minimum gift is 100 GBless'], 400);
    }

    try {
        $db = getDB();

        $receiverStmt = $db->prepare('SELECT id, name FROM users WHERE id = ? AND is_active = 1 LIMIT 1');
        $receiverStmt->execute([$receiverId]);
        $receiver = $receiverStmt->fetch();
        if (!$receiver) {
            jsonResponse(['success' => false, 'message' => 'Recipient not found'], 404);
        }

        // Deduct from sender
        deductPoints($sender['id'], $gblessAmount, 'gift_sent', $receiverId);

        // Credit receiver
        creditPoints($receiverId, $gblessAmount, 'gift_received', $sender['id']);
        checkAndAwardBadges($receiverId);

        // Log the gift
        $giftId = generateUuid();
        $db->prepare(
            'INSERT INTO gbless_gifts (id, sender_id, receiver_id, gbless_amount, message)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$giftId, $sender['id'], $receiverId, $gblessAmount, $message ?: null]);

        // Notify receiver
        sendPushToUser($receiverId, [
            'title' => '🎁 GBless Gift from ' . $sender['name'],
            'body'  => $sender['name'] . ' sent you ' . number_format($gblessAmount) . ' GBless!' . ($message ? ' "' . $message . '"' : ''),
            'tag'   => 'gift-' . $giftId,
            'url'   => '/parish-connect/wallet',
        ]);

        jsonResponse(['success' => true, 'message' => number_format($gblessAmount) . ' GBless sent to ' . $receiver['name'] . '!']);
    } catch (\RuntimeException $e) {
        jsonResponse(['success' => false, 'message' => $e->getMessage()], 400);
    } catch (\Exception $e) {
        error_log('sendGift error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

// ─── User: transaction history ────────────────────────────────────────────────

function getHistory(): void {
    $user = authenticate();
    $db   = getDB();

    $txStmt = $db->prepare(
        'SELECT pt.action, pt.points, pt.ref_id, pt.created_at,
                u.name AS ref_name
         FROM point_transactions pt
         LEFT JOIN users u ON u.id = pt.ref_id
         WHERE pt.user_id = ?
         ORDER BY pt.created_at DESC
         LIMIT 50'
    );
    $txStmt->execute([$user['id']]);
    $transactions = $txStmt->fetchAll();

    $topups = $db->prepare(
        'SELECT id, gcash_ref, amount_php, gbless_amount, status, admin_note, created_at
         FROM gbless_topup_requests WHERE user_id = ?
         ORDER BY created_at DESC LIMIT 20'
    );
    $topups->execute([$user['id']]);

    $cashouts = $db->prepare(
        'SELECT id, gbless_amount, amount_php, gcash_number, status, admin_note, created_at
         FROM gbless_cashout_requests WHERE user_id = ?
         ORDER BY created_at DESC LIMIT 20'
    );
    $cashouts->execute([$user['id']]);

    jsonResponse(['success' => true, 'data' => [
        'transactions' => $transactions,
        'topups'       => $topups->fetchAll(),
        'cashouts'     => $cashouts->fetchAll(),
    ]]);
}

// ─── Admin: list pending top-ups ─────────────────────────────────────────────

function adminListTopups(): void {
    $admin = authenticate();
    requireRole($admin, 'admin', 'superadmin');

    $db   = getDB();
    $stmt = $db->prepare(
        "SELECT t.id, t.user_id, t.gcash_ref, t.gcash_sender, t.amount_php,
                t.gbless_amount, t.receipt_url, t.status, t.admin_note, t.created_at,
                u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar
         FROM gbless_topup_requests t
         JOIN users u ON u.id = t.user_id
         WHERE t.status = 'pending'
         ORDER BY t.created_at ASC"
    );
    $stmt->execute();
    jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
}

// ─── Admin: list pending cash-outs ───────────────────────────────────────────

function adminListCashouts(): void {
    $admin = authenticate();
    requireRole($admin, 'admin', 'superadmin');

    $db   = getDB();
    $stmt = $db->prepare(
        "SELECT c.*, u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar
         FROM gbless_cashout_requests c
         JOIN users u ON u.id = c.user_id
         WHERE c.status = 'pending'
         ORDER BY c.created_at ASC"
    );
    $stmt->execute();
    jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
}

// ─── Admin: approve or reject a top-up ───────────────────────────────────────

function adminReviewTopup(): void {
    $admin = authenticate();
    requireRole($admin, 'admin', 'superadmin');

    $body      = getJsonBody();
    $requestId = trim($body['request_id'] ?? '');
    $decision  = trim($body['decision']   ?? ''); // 'approved' | 'rejected'
    $note      = mb_substr(trim($body['note'] ?? ''), 0, 500);

    if (!$requestId || !in_array($decision, ['approved', 'rejected'], true)) {
        jsonResponse(['success' => false, 'message' => 'request_id and decision (approved|rejected) are required'], 400);
    }

    try {
        $db = getDB();
        $db->beginTransaction();

        $req = $db->prepare(
            "SELECT * FROM gbless_topup_requests WHERE id = ? AND status = 'pending' LIMIT 1"
        );
        $req->execute([$requestId]);
        $topup = $req->fetch();

        if (!$topup) {
            $db->rollBack();
            jsonResponse(['success' => false, 'message' => 'Request not found or already reviewed'], 404);
        }

        $db->prepare(
            'UPDATE gbless_topup_requests
             SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
             WHERE id = ?'
        )->execute([$decision, $note ?: null, $admin['id'], $requestId]);

        if ($decision === 'approved') {
            creditPoints($topup['user_id'], (int)$topup['gbless_amount'], 'topup_approved', $requestId);
            checkAndAwardBadges($topup['user_id']);

            sendPushToUser($topup['user_id'], [
                'title' => '✅ Top-up Approved!',
                'body'  => number_format((int)$topup['gbless_amount']) . ' GBless has been added to your wallet.',
                'tag'   => 'topup-approved-' . $requestId,
                'url'   => '/parish-connect/wallet',
            ]);
        } else {
            sendPushToUser($topup['user_id'], [
                'title' => '❌ Top-up Rejected',
                'body'  => 'Your top-up request was rejected.' . ($note ? ' Reason: ' . $note : ''),
                'tag'   => 'topup-rejected-' . $requestId,
                'url'   => '/parish-connect/wallet',
            ]);
        }

        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Request ' . $decision]);
    } catch (\Exception $e) {
        $db->rollBack();
        error_log('adminReviewTopup error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

// ─── Admin: approve or reject a cash-out ─────────────────────────────────────

function adminReviewCashout(): void {
    $admin = authenticate();
    requireRole($admin, 'admin', 'superadmin');

    $body      = getJsonBody();
    $requestId = trim($body['request_id'] ?? '');
    $decision  = trim($body['decision']   ?? '');
    $note      = mb_substr(trim($body['note'] ?? ''), 0, 500);

    if (!$requestId || !in_array($decision, ['approved', 'rejected'], true)) {
        jsonResponse(['success' => false, 'message' => 'request_id and decision are required'], 400);
    }

    try {
        $db = getDB();
        $db->beginTransaction();

        $req = $db->prepare(
            "SELECT * FROM gbless_cashout_requests WHERE id = ? AND status = 'pending' LIMIT 1"
        );
        $req->execute([$requestId]);
        $cashout = $req->fetch();

        if (!$cashout) {
            $db->rollBack();
            jsonResponse(['success' => false, 'message' => 'Request not found or already reviewed'], 404);
        }

        $db->prepare(
            'UPDATE gbless_cashout_requests
             SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
             WHERE id = ?'
        )->execute([$decision, $note ?: null, $admin['id'], $requestId]);

        if ($decision === 'rejected') {
            // Refund the reserved GBless back to user
            creditPoints($cashout['user_id'], (int)$cashout['gbless_amount'], 'cashout_refunded', $requestId);

            sendPushToUser($cashout['user_id'], [
                'title' => '❌ Cash-out Rejected',
                'body'  => 'Your cash-out was rejected. GBless has been refunded.' . ($note ? ' Reason: ' . $note : ''),
                'tag'   => 'cashout-rejected-' . $requestId,
                'url'   => '/parish-connect/wallet',
            ]);
        } else {
            // Approved — GBless was already deducted at request time, just notify
            sendPushToUser($cashout['user_id'], [
                'title' => '✅ Cash-out Approved!',
                'body'  => '₱' . number_format((float)$cashout['amount_php'], 2) . ' will be sent to your GCash ' . $cashout['gcash_number'] . ' shortly.',
                'tag'   => 'cashout-approved-' . $requestId,
                'url'   => '/parish-connect/wallet',
            ]);
        }

        $db->commit();
        jsonResponse(['success' => true, 'message' => 'Cash-out ' . $decision]);
    } catch (\Exception $e) {
        $db->rollBack();
        error_log('adminReviewCashout error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
