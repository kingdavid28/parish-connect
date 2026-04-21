<?php
/**
 * Auto-Post Cron Script — AI-powered via Groq API
 *
 * Runs twice daily via Hostinger Cron Job:
 *   Morning:   0 6  * * *  php /home/USERNAME/public_html/parish-connect/api/cron-autopost.php
 *   Evening:   0 18 * * *  php /home/USERNAME/public_html/parish-connect/api/cron-autopost.php
 *
 * Posts as the parent superadmin account.
 * Uses Groq (free tier) to generate unique parish content each run.
 * Falls back to hardcoded templates if Groq is unavailable.
 */

declare(strict_types=1);

// Only allow CLI execution
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden: CLI only');
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

// ─── Groq AI Content Generator ────────────────────────────────────────────────

function generatePostWithGroq(): ?array
{
    $apiKey = defined('GROQ_API_KEY') ? GROQ_API_KEY : (getenv('GROQ_API_KEY') ?: null);

    if (!$apiKey) {
        echo "[AutoPost] No GROQ_API_KEY set, using fallback templates.\n";
        return null;
    }

    // Rotate post topics so morning and evening feel different
    $hour = (int) date('H');
    $isMorning = $hour < 12;

    $topics = $isMorning ? [
        'a morning prayer and scripture reflection for the Cebuano parish community',
        'encouraging parishioners in Cebu City to attend Sunday Mass and connect with each other',
        'the importance of family prayer and faith at home in the Filipino Catholic tradition',
        'how small acts of kindness reflect God\'s love in daily life in Cebu',
        'a motivational faith message inspired by the Cebuano devotion to Santo Niño',
    ] : [
        'an evening reflection on gratitude and God\'s blessings, with a Cebuano touch',
        'encouraging parishioners to join a parish ministry or family group at San Vicente Ferrer Parish',
        'the value of community and belonging in a Cebu City parish family',
        'how the GBless Points rewards system encourages parish engagement in the community',
        'exploring parish genealogy records and family faith history in Cebu',
    ];

    $topic = $topics[array_rand($topics)];

    $types = ['community', 'community', 'community', 'parish_event', 'research'];
    $type  = $types[array_rand($types)];

    $systemPrompt = <<<PROMPT
You are the official social media voice of San Vicente Ferrer Parish (Franciscan), a Catholic parish community located in Cebu City, Philippines.
Your tone is warm, faith-filled, encouraging, and community-focused — reflecting the vibrant Catholic culture of Cebu.
You write short social media posts for the Parish Connect app — a platform where parishioners connect, earn GBless Points, and manage their parish life.

Context about the community:
- Located in Cebu City, Philippines — a deeply Catholic city known for the Sinulog festival and devotion to the Santo Niño
- Parishioners speak Filipino (Cebuano/Bisaya) and English
- Common local faith expressions: "Dios Magtabang" (God help us), "Salamat sa Ginoo" (Thank God), "Amping" (take care / God bless)
- Local Catholic traditions: novenas, fiestas, processions, Simbang Gabi, Visita Iglesia
- The parish is served by Franciscan friars

Rules:
- Write primarily in English but naturally include 1–2 Cebuano/Bisaya or Filipino words or phrases where they fit
- Keep posts between 80–180 words
- Include 1–2 relevant emojis naturally within the text
- End with 2–3 relevant hashtags like #ParishConnect #GBlessPoints #CebuParish #SanVicenteFerrer
- Do NOT use markdown formatting like ** or ##
- Sound genuine, local, and human — not corporate
- Occasionally mention Parish Connect features: GBless Points, Rewards, Membership, Family Groups, Ministries, Parish Records
PROMPT;

    $userPrompt = "Write a parish community post about: {$topic}";

    $payload = json_encode([
        'model'       => 'llama-3.1-8b-instant',
        'messages'    => [
            ['role' => 'system', 'content' => $systemPrompt],
            ['role' => 'user',   'content' => $userPrompt],
        ],
        'temperature' => 0.85,
        'max_tokens'  => 300,
    ]);

    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey,
        ],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        echo "[AutoPost] cURL error: {$curlError}\n";
        return null;
    }

    if ($httpCode !== 200) {
        echo "[AutoPost] Groq API returned HTTP {$httpCode}: {$response}\n";
        return null;
    }

    $data = json_decode($response, true);
    $content = trim($data['choices'][0]['message']['content'] ?? '');

    if (empty($content)) {
        echo "[AutoPost] Groq returned empty content.\n";
        return null;
    }

    return ['type' => $type, 'content' => $content];
}

// ─── Fallback Template Pool ───────────────────────────────────────────────────

function getFallbackTemplate(array $recentContents): array
{
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
            'content' => "📅 Reminder: Sunday Mass is a beautiful opportunity to gather as one parish family.\n\nConnect with fellow parishioners here on Parish Connect. Share your faith journey, join a ministry, or simply say hello! 👋\n\n#SundayMass #ParishFamily",
        ],
        [
            'type'    => 'community',
            'content' => "💛 Did you know?\n\nYou can earn GBless Points by:\n• Publishing a post ✍️ (+10 pts)\n• Leaving a comment 💬 (+5 pts)\n• Receiving a like ❤️ (+2 pts)\n• Daily login ☀️ (+5 pts)\n\nStart engaging and climb the parish leaderboard! 🏆\n\n#GBlessPoints #Rewards",
        ],
        [
            'type'    => 'community',
            'content' => "🕊️ A thought for today:\n\n\"Faith is not the absence of doubt, but the courage to move forward despite it.\"\n\nShare your faith story with our parish community. Your testimony might be exactly what someone else needs to hear today. 🙏\n\n#Faith #ParishConnect",
        ],
        [
            'type'    => 'parish_event',
            'content' => "⛪ Our parish ministries need YOU!\n\nFrom the choir to the youth group, there are many ways to serve. Browse available ministries in the Membership section and join one that speaks to your heart.\n\nService is love made visible. 🙏\n\n#Ministry #Serve #ParishConnect",
        ],
        [
            'type'    => 'research',
            'content' => "🔍 Genealogy Corner:\n\nDid you know our parish keeps detailed sacramental records? Baptisms, confirmations, and marriages are all documented.\n\nVisit the Parish Records section to explore your family's faith history. 📜\n\n#ParishRecords #Genealogy #FamilyHistory",
        ],
        [
            'type'    => 'community',
            'content' => "📖 Scripture of the day:\n\n\"For where two or three gather in my name, there am I with them.\" — Matthew 18:20\n\nThis is exactly why Parish Connect exists — to bring our community together in faith, even beyond the church walls. 🙏\n\n#Scripture #Faith",
        ],
    ];

    $available = array_filter($templates, function ($t) use ($recentContents) {
        foreach ($recentContents as $recent) {
            if (substr($t['content'], 0, 50) === substr($recent, 0, 50)) {
                return false;
            }
        }
        return true;
    });

    if (empty($available)) {
        $available = $templates;
    }

    $available = array_values($available);
    return $available[array_rand($available)];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

try {
    $db = getDB();

    // Get parent superadmin
    $stmt = $db->prepare(
        "SELECT id, name FROM users
         WHERE role = 'superadmin' AND is_active = 1
         ORDER BY created_at ASC LIMIT 1"
    );
    $stmt->execute();
    $admin = $stmt->fetch();

    if (!$admin) {
        echo "[AutoPost] No active superadmin found. Aborting.\n";
        exit(1);
    }

    // Get recent post contents to avoid repeats
    $recentStmt = $db->prepare(
        "SELECT content FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 7"
    );
    $recentStmt->execute([$admin['id']]);
    $recentContents = array_column($recentStmt->fetchAll(), 'content');

    // Try Groq first, fall back to templates
    $post = generatePostWithGroq();
    $source = 'Groq AI';

    if (!$post) {
        $post = getFallbackTemplate($recentContents);
        $source = 'Fallback template';
    }

    // Insert post
    $postId = generateUuid();
    $db->prepare(
        "INSERT INTO posts (id, user_id, content, type, is_approved, created_at)
         VALUES (?, ?, ?, ?, 1, NOW())"
    )->execute([$postId, $admin['id'], $post['content'], $post['type']]);

    echo "[AutoPost] ✅ Posted successfully as '{$admin['name']}'\n";
    echo "[AutoPost] Source: {$source}\n";
    echo "[AutoPost] Type: {$post['type']}\n";
    echo "[AutoPost] Preview: " . substr($post['content'], 0, 100) . "...\n";

} catch (Exception $e) {
    echo "[AutoPost] ❌ Error: " . $e->getMessage() . "\n";
    exit(1);
}
