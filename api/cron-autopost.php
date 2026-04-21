<?php
/**
 * Auto-Post Cron Script
 * 
 * Runs twice daily via Hostinger Cron Job:
 *   Morning:   0 6  * * *  php /path/to/public_html/parish-connect/api/cron-autopost.php
 *   Evening:   0 18 * * *  php /path/to/public_html/parish-connect/api/cron-autopost.php
 * 
 * Posts as the first active superadmin (parent admin account).
 * Uses a rotating pool of parish-themed content — no external AI API needed.
 */

declare(strict_types=1);

// Only allow CLI execution (not via HTTP)
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden: CLI only');
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

// ─── Post Template Pool ───────────────────────────────────────────────────────
// Organized by type: community, parish_event, research
// Add more entries to increase variety.

$templates = [
    [
        'type'    => 'community',
        'content' => "🙏 Good morning, parish family!\n\nLet us begin this day with gratitude and faith. Remember, every small act of kindness is a prayer in action.\n\n\"Give thanks to the Lord, for He is good; His love endures forever.\" — Psalm 107:1\n\n#ParishConnect #GBlessPoints #FaithCommunity",
    ],
    [
        'type'    => 'community',
        'content' => "✨ Evening reflection:\n\nHow did you share God's love today? Whether through a kind word, a helping hand, or a simple smile — every act matters.\n\nEarn GBless Points by engaging with your parish community. Like, comment, and encourage one another! 💛\n\n#ParishConnect #Community",
    ],
    [
        'type'    => 'parish_event',
        'content' => "📅 Reminder: Sunday Mass is a beautiful opportunity to gather as one parish family.\n\nIf you haven't already, connect with fellow parishioners here on Parish Connect. Share your faith journey, join a ministry, or simply say hello! 👋\n\n#SundayMass #ParishFamily",
    ],
    [
        'type'    => 'community',
        'content' => "💛 Did you know?\n\nYou can earn GBless Points by:\n• Publishing a post ✍️ (+10 pts)\n• Leaving a comment 💬 (+5 pts)\n• Receiving a like ❤️ (+2 pts)\n• Daily login ☀️ (+5 pts)\n• Giving praise to others 💛 (+15 pts to them!)\n\nStart engaging and climb the parish leaderboard! 🏆\n\n#GBlessPoints #Rewards",
    ],
    [
        'type'    => 'community',
        'content' => "🕊️ A thought for today:\n\n\"Faith is not the absence of doubt, but the courage to move forward despite it.\"\n\nShare your faith story with our parish community. Your testimony might be exactly what someone else needs to hear today. 🙏\n\n#Faith #ParishConnect",
    ],
    [
        'type'    => 'community',
        'content' => "👨‍👩‍👧‍👦 Family is at the heart of our parish.\n\nHave you joined or created a Family Group on Parish Connect yet? Connect with your household, track your parish journey together, and grow in faith as one.\n\nVisit the Membership tab to get started! 💙\n\n#FamilyGroups #ParishFamily",
    ],
    [
        'type'    => 'parish_event',
        'content' => "⛪ Our parish ministries need YOU!\n\nFrom the choir to the youth group, there are many ways to serve. Browse available ministries in the Membership section and join one that speaks to your heart.\n\nService is love made visible. 🙏\n\n#Ministry #Serve #ParishConnect",
    ],
    [
        'type'    => 'community',
        'content' => "🌅 Morning prayer intention:\n\nLet us pray today for all the families of our parish — for healing, unity, and God's abundant blessing over every home.\n\nFeel free to share your own prayer intentions in the comments below. We pray together as one community. 🙏💛\n\n#PrayerIntention #ParishFamily",
    ],
    [
        'type'    => 'community',
        'content' => "📖 Scripture of the day:\n\n\"For where two or three gather in my name, there am I with them.\" — Matthew 18:20\n\nThis is exactly why Parish Connect exists — to bring our community together in faith, even beyond the church walls.\n\nShare this with a fellow parishioner today! 🙏\n\n#Scripture #Faith",
    ],
    [
        'type'    => 'research',
        'content' => "🔍 Genealogy Corner:\n\nDid you know our parish keeps detailed sacramental records? Baptisms, confirmations, and marriages are all documented.\n\nVisit the Parish Records section to explore your family's faith history. You might discover something beautiful about your roots! 📜\n\n#ParishRecords #Genealogy #FamilyHistory",
    ],
    [
        'type'    => 'community',
        'content' => "💬 Community spotlight:\n\nEvery parishioner has a story worth sharing. Whether it's a moment of grace, an answered prayer, or a simple blessing — your story matters.\n\nPost it on Parish Connect and inspire someone today. Your words have power! ✨\n\n#CommunitySpotlight #ShareYourStory",
    ],
    [
        'type'    => 'parish_event',
        'content' => "🎉 Welcome to all new members of Parish Connect!\n\nWe're so glad you're here. This is your digital home within our parish family.\n\nTips to get started:\n1. Complete your profile 👤\n2. Follow fellow parishioners 🤝\n3. Join a ministry or family group 💛\n4. Start earning GBless Points! 🏆\n\n#Welcome #NewMembers",
    ],
    [
        'type'    => 'community',
        'content' => "🌿 Mid-week encouragement:\n\nWhen life feels heavy, remember — you are not alone. Our parish community is here for you.\n\nReach out through Messages, join a group, or simply read through the Feed. Sometimes knowing others care makes all the difference. 💙\n\n#YouAreNotAlone #ParishCommunity",
    ],
    [
        'type'    => 'community',
        'content' => "🏆 Leaderboard update!\n\nAre you on the GBless Points leaderboard? The most active parishioners earn recognition and rewards.\n\nCheck the Rewards tab to see your rank and discover how to earn more points. Every interaction counts! ⚡\n\n#GBlessPoints #Leaderboard #Rewards",
    ],
];

// ─── Main Logic ───────────────────────────────────────────────────────────────

try {
    $db = getDB();

    // Get the parent superadmin (earliest created_at)
    $stmt = $db->prepare(
        "SELECT id, name FROM users 
         WHERE role = 'superadmin' AND is_active = 1 
         ORDER BY created_at ASC 
         LIMIT 1"
    );
    $stmt->execute();
    $admin = $stmt->fetch();

    if (!$admin) {
        echo "[AutoPost] No active superadmin found. Aborting.\n";
        exit(1);
    }

    // Pick a template that hasn't been used recently (avoid repeats)
    // Get the last 7 post contents by this admin to avoid repeating
    $recentStmt = $db->prepare(
        "SELECT content FROM posts 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT 7"
    );
    $recentStmt->execute([$admin['id']]);
    $recentContents = array_column($recentStmt->fetchAll(), 'content');

    // Filter out recently used templates
    $available = array_filter($templates, function ($t) use ($recentContents) {
        foreach ($recentContents as $recent) {
            // Compare first 50 chars to detect duplicates
            if (substr($t['content'], 0, 50) === substr($recent, 0, 50)) {
                return false;
            }
        }
        return true;
    });

    // If all templates were recently used, reset and use all
    if (empty($available)) {
        $available = $templates;
    }

    // Pick randomly from available
    $available = array_values($available);
    $chosen    = $available[array_rand($available)];

    // Insert the post
    $postId = generateUuid();
    $db->prepare(
        "INSERT INTO posts (id, user_id, content, type, is_approved, created_at)
         VALUES (?, ?, ?, ?, 1, NOW())"
    )->execute([
        $postId,
        $admin['id'],
        $chosen['content'],
        $chosen['type'],
    ]);

    echo "[AutoPost] ✅ Posted successfully as '{$admin['name']}' (ID: {$admin['id']})\n";
    echo "[AutoPost] Type: {$chosen['type']}\n";
    echo "[AutoPost] Preview: " . substr($chosen['content'], 0, 80) . "...\n";

} catch (Exception $e) {
    echo "[AutoPost] ❌ Error: " . $e->getMessage() . "\n";
    exit(1);
}
