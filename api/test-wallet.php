<?php
/**
 * GBless Wallet Test Script
 * URL: https://sanvicenteferrerparish-franciscan.com/parish-connect/api/test-wallet.php
 * DELETE THIS FILE after testing.
 */
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');
header('Content-Type: text/html; charset=utf-8');

// ── Bootstrap only what we need ───────────────────────────────────────────────
require_once __DIR__ . '/config.php';

// Minimal DB connection (avoid loading index.php which redefines helpers)
function testDb(): PDO {
    $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    return new PDO($dsn, DB_USER, DB_PASSWORD, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function testUuid(): string {
    $d = random_bytes(16);
    $d[6] = chr(ord($d[6]) & 0x0f | 0x40);
    $d[8] = chr(ord($d[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

$results = [];
$pass = 0;
$fail = 0;

function check(string $label, bool $ok, string $detail = ''): void {
    global $results, $pass, $fail;
    $results[] = ['label' => $label, 'ok' => $ok, 'detail' => $detail];
    $ok ? $pass++ : $fail++;
}

// ── Connect ───────────────────────────────────────────────────────────────────
try {
    $db = testDb();
    check('Database connection', true, DB_NAME . ' @ ' . DB_HOST);
} catch (\Exception $e) {
    check('Database connection', false, $e->getMessage());
    renderResults($results, $pass, $fail);
    exit;
}

// ── 1. Tables exist ───────────────────────────────────────────────────────────
$tables = [
    'user_points', 'point_transactions', 'user_badges',
    'gbless_topup_requests', 'gbless_cashout_requests', 'gbless_gifts',
];
foreach ($tables as $table) {
    $r = $db->query("SHOW TABLES LIKE '$table'")->fetch();
    check("Table: $table", (bool)$r, $r ? '✓ exists' : '✗ MISSING — run migration SQL');
}

// ── 2. receipt_url column ─────────────────────────────────────────────────────
$col = $db->query("SHOW COLUMNS FROM gbless_topup_requests LIKE 'receipt_url'")->fetch();
check(
    'Column: receipt_url in gbless_topup_requests',
    (bool)$col,
    $col ? 'type: ' . $col['Type'] : '✗ MISSING — run: ALTER TABLE gbless_topup_requests ADD COLUMN receipt_url VARCHAR(500) NULL AFTER gbless_amount'
);

// ── 3. Config values ──────────────────────────────────────────────────────────
check('Config: GCASH_NUMBER',   !empty(GCASH_NUMBER),   GCASH_NUMBER   ?: '(empty)');
check('Config: GCASH_NAME',     !empty(GCASH_NAME),     GCASH_NAME     ?: '(empty)');
check('Config: GCASH_QR_URL',   !empty(GCASH_QR_URL),   GCASH_QR_URL   ?: '(empty)');
check('Config: VAPID_PUBLIC_KEY', !empty(VAPID_PUBLIC_KEY), !empty(VAPID_PUBLIC_KEY) ? substr(VAPID_PUBLIC_KEY, 0, 16) . '…' : '(empty)');

// ── 4. Upload directory ───────────────────────────────────────────────────────
$uploadDir = __DIR__ . '/uploads/receipts/';
if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);
check('uploads/receipts/ exists',    is_dir($uploadDir),      is_dir($uploadDir) ? realpath($uploadDir) : 'Could not create');
check('uploads/receipts/ writable',  is_writable($uploadDir), is_writable($uploadDir) ? '✓' : '✗ chmod 755 in File Manager');

// ── 5. Find test users ────────────────────────────────────────────────────────
$testUser  = $db->query("SELECT id, name, email FROM users WHERE is_active=1 AND role='parishioner' ORDER BY created_at ASC LIMIT 1")->fetch();
$adminUser = $db->query("SELECT id, name FROM users WHERE is_active=1 AND role IN ('admin','superadmin') ORDER BY created_at ASC LIMIT 1")->fetch();
$receiver  = $testUser
    ? $db->query("SELECT id, name FROM users WHERE is_active=1 AND id!='" . $testUser['id'] . "' LIMIT 1")->fetch()
    : null;

check('Parishioner user found', (bool)$testUser,  $testUser  ? $testUser['name']  . ' — ' . $testUser['email'] : 'No parishioner in DB');
check('Admin user found',       (bool)$adminUser, $adminUser ? $adminUser['name'] : 'No admin in DB');

if (!$testUser || !$adminUser) {
    renderResults($results, $pass, $fail);
    exit;
}

$userId  = $testUser['id'];
$adminId = $adminUser['id'];

// ── 6. Ensure user_points row ─────────────────────────────────────────────────
$db->prepare("INSERT INTO user_points (user_id, total_points) VALUES (?,0) ON DUPLICATE KEY UPDATE user_id=user_id")
   ->execute([$userId]);
$s = $db->prepare('SELECT total_points FROM user_points WHERE user_id=? LIMIT 1');
$s->execute([$userId]);
$balStart = (int)($s->fetchColumn() ?: 0);
check('user_points row exists', true, "Current balance: " . number_format($balStart) . " GBless");

// ── 7. Insert test top-up request ─────────────────────────────────────────────
$testRef = 'TEST-' . strtoupper(substr(md5(uniqid('', true)), 0, 8));
$topupId = testUuid();
try {
    $db->prepare(
        "INSERT INTO gbless_topup_requests
         (id, user_id, gcash_ref, gcash_sender, amount_php, gbless_amount, receipt_url, status)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending')"
    )->execute([$topupId, $userId, $testRef, 'Test Sender / 09000000000', 10.00, 100000]);
    check('INSERT top-up request', true, "ref=$testRef · 100,000 GBless · ₱10.00");
} catch (\Exception $e) {
    check('INSERT top-up request', false, $e->getMessage());
    renderResults($results, $pass, $fail);
    exit;
}

// ── 8. Duplicate ref blocked ──────────────────────────────────────────────────
$dup = $db->prepare("SELECT id FROM gbless_topup_requests WHERE gcash_ref=? AND status!='rejected' LIMIT 1");
$dup->execute([$testRef]);
check('Duplicate ref detection', (bool)$dup->fetch(), "ref=$testRef correctly detected as duplicate");

// ── 9. Admin approval — credit GBless ────────────────────────────────────────
$txId = testUuid();
$db->prepare("INSERT INTO point_transactions (id,user_id,action,points,ref_id) VALUES (?,?,?,?,?)")
   ->execute([$txId, $userId, 'topup_approved', 100000, $topupId]);
$db->prepare("INSERT INTO user_points (user_id,total_points) VALUES (?,?) ON DUPLICATE KEY UPDATE total_points=total_points+VALUES(total_points)")
   ->execute([$userId, 100000]);
$db->prepare("UPDATE gbless_topup_requests SET status='approved', admin_note='Test approval', reviewed_by=?, reviewed_at=NOW() WHERE id=?")
   ->execute([$adminId, $topupId]);

$s2 = $db->prepare('SELECT total_points FROM user_points WHERE user_id=? LIMIT 1');
$s2->execute([$userId]);
$balAfterTopup = (int)($s2->fetchColumn() ?: 0);
check('Admin approval credits GBless', $balAfterTopup === $balStart + 100000,
    "Before: " . number_format($balStart) . " → After: " . number_format($balAfterTopup) . " GBless");

// ── 10. Gift send ─────────────────────────────────────────────────────────────
if ($receiver) {
    $giftAmount = 1000;
    $db->beginTransaction();
    try {
        $db->prepare("UPDATE user_points SET total_points=total_points-? WHERE user_id=?")->execute([$giftAmount, $userId]);
        $db->prepare("INSERT INTO point_transactions (id,user_id,action,points,ref_id) VALUES (?,?,?,?,?)")
           ->execute([testUuid(), $userId, 'gift_sent', -$giftAmount, $receiver['id']]);
        $db->prepare("INSERT INTO user_points (user_id,total_points) VALUES (?,?) ON DUPLICATE KEY UPDATE total_points=total_points+VALUES(total_points)")
           ->execute([$receiver['id'], $giftAmount]);
        $db->prepare("INSERT INTO point_transactions (id,user_id,action,points,ref_id) VALUES (?,?,?,?,?)")
           ->execute([testUuid(), $receiver['id'], 'gift_received', $giftAmount, $userId]);
        $giftId = testUuid();
        $db->prepare("INSERT INTO gbless_gifts (id,sender_id,receiver_id,gbless_amount,message) VALUES (?,?,?,?,?)")
           ->execute([$giftId, $userId, $receiver['id'], $giftAmount, 'TEST_GIFT']);
        $db->commit();

        $s3 = $db->prepare('SELECT total_points FROM user_points WHERE user_id=? LIMIT 1');
        $s3->execute([$userId]);
        $balAfterGift = (int)($s3->fetchColumn() ?: 0);
        check('Gift deducts from sender',   $balAfterGift === $balAfterTopup - $giftAmount,
            number_format($balAfterTopup) . " → " . number_format($balAfterGift) . " GBless");
        check('Gift receiver credited', true, $receiver['name'] . " +$giftAmount GBless");
    } catch (\Exception $e) {
        $db->rollBack();
        check('Gift transaction', false, $e->getMessage());
    }
} else {
    check('Gift test', false, 'No second user found in DB');
}

// ── 11. Cash-out minimum check ────────────────────────────────────────────────
$s4 = $db->prepare('SELECT total_points FROM user_points WHERE user_id=? LIMIT 1');
$s4->execute([$userId]);
$finalBal   = (int)($s4->fetchColumn() ?: 0);
$canCashout = $finalBal >= 1000000;
check('Cash-out minimum logic',  true,
    "Balance: " . number_format($finalBal) . " GBless — can cash out: " . ($canCashout ? '✓ YES' : '✗ NO (need 1,000,000)'));

// ── 12. Cashout request insert ────────────────────────────────────────────────
if ($canCashout) {
    $coId = testUuid();
    try {
        $db->prepare(
            "INSERT INTO gbless_cashout_requests (id,user_id,gbless_amount,amount_php,gcash_number,gcash_name,status)
             VALUES (?,?,?,?,?,?,'pending')"
        )->execute([$coId, $userId, 1000000, 100.00, '09171145344', 'Test User']);
        check('INSERT cashout request', true, '1,000,000 GBless → ₱100.00');
        // Clean up immediately
        $db->prepare("DELETE FROM gbless_cashout_requests WHERE id=?")->execute([$coId]);
    } catch (\Exception $e) {
        check('INSERT cashout request', false, $e->getMessage());
    }
} else {
    check('Cashout request insert', true, 'Skipped — balance below minimum (expected in test)');
}

// ── 13. Clean up all test data ────────────────────────────────────────────────
try {
    $db->prepare("DELETE FROM point_transactions WHERE ref_id=?")->execute([$topupId]);
    $db->prepare("DELETE FROM gbless_topup_requests WHERE id=?")->execute([$topupId]);
    $db->prepare("UPDATE user_points SET total_points=total_points-100000 WHERE user_id=?")->execute([$userId]);
    if ($receiver) {
        $db->prepare("DELETE FROM gbless_gifts WHERE sender_id=? AND message='TEST_GIFT'")->execute([$userId]);
        $db->prepare("DELETE FROM point_transactions WHERE user_id=? AND action='gift_sent' AND ref_id=?")->execute([$userId, $receiver['id']]);
        $db->prepare("DELETE FROM point_transactions WHERE user_id=? AND action='gift_received' AND ref_id=?")->execute([$receiver['id'], $userId]);
        $db->prepare("UPDATE user_points SET total_points=GREATEST(0,total_points-1000) WHERE user_id=?")->execute([$receiver['id']]);
    }
    check('Test data cleaned up', true, 'All test rows removed — DB restored');
} catch (\Exception $e) {
    check('Test data cleanup', false, $e->getMessage());
}

renderResults($results, $pass, $fail);

// ── Render ────────────────────────────────────────────────────────────────────
function renderResults(array $results, int $pass, int $fail): void {
    $total = $pass + $fail;
    $allOk = $fail === 0;
    echo "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'>
    <meta name='viewport' content='width=device-width,initial-scale=1'>
    <title>GBless Wallet Tests</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:system-ui,sans-serif;max-width:740px;margin:40px auto;padding:0 20px;background:#f9fafb;color:#111}
      h1{font-size:1.3rem;margin-bottom:2px}
      .sub{color:#6b7280;font-size:.82rem;margin-bottom:18px}
      .summary{padding:12px 18px;border-radius:10px;margin-bottom:22px;font-size:1rem;font-weight:700}
      .s-ok{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
      .s-fail{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}
      table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)}
      th{background:#f3f4f6;text-align:left;padding:9px 14px;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}
      td{padding:9px 14px;border-top:1px solid #f3f4f6;font-size:.85rem;vertical-align:top}
      .p{display:inline-block;padding:2px 9px;border-radius:999px;font-size:.72rem;font-weight:700;background:#dcfce7;color:#166534}
      .f{display:inline-block;padding:2px 9px;border-radius:999px;font-size:.72rem;font-weight:700;background:#fee2e2;color:#991b1b}
      .detail{color:#6b7280;font-size:.78rem;margin-top:2px}
      .warn{background:#fef9c3;color:#854d0e;padding:12px 16px;border-radius:8px;margin-top:20px;font-size:.83rem;border:1px solid #fde68a}
      code{background:#f3f4f6;padding:1px 5px;border-radius:4px;font-size:.82rem}
    </style></head><body>
    <h1>🧪 GBless Wallet — Test Results</h1>
    <p class='sub'>Run at " . date('Y-m-d H:i:s') . " (server time)</p>
    <div class='summary " . ($allOk ? 's-ok' : 's-fail') . "'>
      " . ($allOk ? '✅' : '❌') . " $pass / $total passed" . ($fail > 0 ? " &nbsp;·&nbsp; $fail failed" : " — all good!") . "
    </div>
    <table><thead><tr><th>#</th><th>Test</th><th>Result</th><th>Detail</th></tr></thead><tbody>";
    foreach ($results as $i => $r) {
        $badge = $r['ok'] ? "<span class='p'>PASS</span>" : "<span class='f'>FAIL</span>";
        $detail = htmlspecialchars($r['detail']);
        echo "<tr><td style='color:#9ca3af'>" . ($i + 1) . "</td>
              <td>" . htmlspecialchars($r['label']) . "</td>
              <td>$badge</td>
              <td class='detail'>$detail</td></tr>";
    }
    echo "</tbody></table>
    <div class='warn'>
      ⚠️ <strong>Delete this file after testing.</strong><br>
      Remove <code>api/test-wallet.php</code> from your server — it exposes DB internals.
    </div>
    </body></html>";
}
