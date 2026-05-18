<?php
/**
 * Auto-Post Cron Script — AI-powered via Groq API
 *
 * Runs twice daily via Hostinger Cron Job:
 *   Morning:   0 6  * * *  wget -q -O /dev/null "https://sanvicenteferrerparish-franciscan.com/parish-connect/api/cron-autopost?token=parish_cron_2024_svf"
 *   Evening:   0 18 * * *  wget -q -O /dev/null "https://sanvicenteferrerparish-franciscan.com/parish-connect/api/cron-autopost?token=parish_cron_2024_svf"
 *
 * Posts as the parent superadmin account.
 * Uses Groq (free tier) to generate unique parish content each run.
 * Falls back to hardcoded templates if Groq is unavailable.
 */

declare(strict_types=1);

// Security: block direct browser access — allow CLI or secret token only
$cronSecret = 'parish_cron_2024_svf';
$isCli      = in_array(PHP_SAPI, ['cli', 'cli-server'], true);
$hasToken   = ($_GET['token'] ?? '') === $cronSecret;

if (!$isCli && !$hasToken) {
    http_response_code(403);
    exit('Forbidden');
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

    $hour      = (int) date('H');
    $isMorning = $hour < 12;

    $topics = $isMorning ? [
        'a morning prayer and scripture reflection for the Cebuano parish community',
        'encouraging parishioners in Cebu City to attend Sunday Mass and connect with each other',
        'the importance of family prayer and faith at home in the Cebuano Catholic tradition',
        'how small acts of kindness reflect God\'s love in daily life in Cebu',
        'a motivational faith message inspired by the Cebuano devotion to Santo Nino',
    ] : [
        'an evening reflection on gratitude and God\'s blessings, in Cebuano and English',
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
- Located in Cebu City, Philippines — a deeply Catholic city known for the Sinulog festival and devotion to the Santo Nino
- The parish is served by Franciscan friars
- Local Catholic traditions: novenas, fiestas, processions, Simbang Gabi, Visita Iglesia
- Common Cebuano faith expressions: "Dios Magtabang" (God help us), "Salamat sa Ginoo" (Thank God), "Amping" (take care/God bless), "Maayong buntag" (good morning), "Maayong gabii" (good evening), "Atong" (our), "Kita" (we/us)

Language Rules:
- Write ONLY in Cebuano (Bisaya) and English — do NOT use Tagalog or Filipino words
- Mix Cebuano and English naturally in the same post, the way Cebuanos actually speak
- Example of correct style: "Maayong buntag, parish family! Let us start our day with prayer and faith. Dios Magtabang sa atong tanan."

Content Rules:
- Keep posts between 80-180 words
- Include 1-2 relevant emojis naturally within the text
- End with 2-3 relevant hashtags like #ParishConnect #GBlessPoints #CebuParish #SanVicenteFerrer
- Do NOT use markdown formatting like ** or ##
- Sound genuine, local, and human — not corporate
- Occasionally mention Parish Connect features: GBless Points, Rewards, Membership, Family Groups, Ministries, Parish Records
- NEVER include specific times (e.g. "7:00 AM", "6 PM"), specific dates (e.g. "January 15", "this Friday"), or event schedules — these are auto-generated posts and invented details could mislead parishioners
- NEVER announce specific events, meetings, or gatherings with made-up details
- Use general phrases instead: "join us at Mass", "attend our parish activities", "check the parish bulletin for schedules"
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

    $response  = curl_exec($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
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

    $data    = json_decode($response, true);
    $content = trim($data['choices'][0]['message']['content'] ?? '');

    if (empty($content)) {
        echo "[AutoPost] Groq returned empty content.\n";
        return null;
    }

    return ['type' => $type, 'content' => $content];
}

// ─── Fallback Template Pool (Cebuano + English) ───────────────────────────────

function getFallbackTemplate(array $recentContents): array
{
    $templates = [
        [
            'type'    => 'community',
            'content' => "Maayong buntag, parish family! 🙏\n\nSugdan nato kining adlaw sa pag-ampo ug pasalamat. Ang matag gamay nga buhat sa kaayo usa ka pag-ampo sa aksyon.\n\n\"Salamat sa Ginoo, kay Siya maayo; ang Iyang gugma walay katapusan.\" — Salmo 107:1\n\nAmping kanunay, mga higala!\n\n#ParishConnect #GBlessPoints #CebuParish",
        ],
        [
            'type'    => 'community',
            'content' => "Maayong gabii, pamilya sa simbahan! ✨\n\nUnsa man ang imong nahimo para ipakita ang gugma sa Ginoo karong adlawa? Bisan usa ka matamis nga pahiyom o usa ka buhat sa tabang — kining tanan importante.\n\nEarn GBless Points by engaging with your parish community. Like, comment, and encourage one another! 💛\n\n#ParishConnect #SanVicenteFerrer",
        ],
        [
            'type'    => 'parish_event',
            'content' => "Ang Misa sa Domingo usa ka maayong higayon para magtipon kita isip usa ka pamilya sa simbahan. ⛪\n\nConnect with your fellow parishioners here on Parish Connect. Share your faith journey, join a ministry, or simply say hello! Dios Magtabang sa atong tanan.\n\n#SundayMass #CebuParish #ParishConnect",
        ],
        [
            'type'    => 'community',
            'content' => "Nahibalo ka ba? 💛\n\nMakakuha ka og GBless Points pinaagi sa:\n• Pag-post ✍️ (+10 pts)\n• Pag-comment 💬 (+5 pts)\n• Pagdawat og like ❤️ (+2 pts)\n• Daily login ☀️ (+5 pts)\n\nSugdi na ang pag-engage ug makita nato kung kinsa ang naa sa tuktok sa leaderboard! 🏆\n\n#GBlessPoints #Rewards #ParishConnect",
        ],
        [
            'type'    => 'community',
            'content' => "Usa ka hunahuna para karong adlawa: 🕊️\n\n\"Ang pagtuo dili ang kawala sa pagduha-duha, kondili ang kaisog sa pagpadayon bisan adunay pagduha-duha.\"\n\nIpaambit ang imong istorya sa pagtuo sa atong komunidad. Ang imong testimonya mahimong eksakto ang gikinahanglan sa uban karong adlawa. Salamat sa Ginoo!\n\n#Faith #CebuParish #ParishConnect",
        ],
        [
            'type'    => 'parish_event',
            'content' => "Ang atong mga ministeryo sa simbahan nagkinahanglan sa IMONG tabang! ⛪\n\nFrom the choir to the youth group, daghan ang mga paagi para mag-alagad. Browse available ministries in the Membership section and join one that speaks to your heart.\n\nAng serbisyo mao ang gugma nga gipakita. Amping!\n\n#Ministry #CebuParish #SanVicenteFerrer",
        ],
        [
            'type'    => 'research',
            'content' => "Nahibalo ka ba nga ang atong simbahan adunay detalyadong rekord sa mga sakramento? 📜\n\nBaptisms, confirmations, ug marriages — tanan dokumentado.\n\nVisit the Parish Records section to explore your family's faith history here in Cebu. Makapaikag kaayo ang imong makit-an!\n\n#ParishRecords #CebuParish #FamilyHistory",
        ],
        [
            'type'    => 'community',
            'content' => "Pulong sa Dios para karong adlawa: 📖\n\n\"Kay diin ang duha o tulo nagtigom sa akong ngalan, anaa ako sa ilang taliwala.\" — Mateo 18:20\n\nMao kini ang rason ngano nga ang Parish Connect gihimo — para magtipon kita sa pagtuo, bisan gawas sa mga pader sa simbahan. Dios Magtabang!\n\n#Scripture #CebuParish #ParishConnect",
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
    $post   = generatePostWithGroq();
    $source = 'Groq AI';

    if (!$post) {
        $post   = getFallbackTemplate($recentContents);
        $source = 'Fallback template';
    }

    // Insert post
    $postId = generateUuid();
    $db->prepare(
        "INSERT INTO posts (id, user_id, content, type, is_approved, created_at)
         VALUES (?, ?, ?, ?, 1, NOW())"
    )->execute([$postId, $admin['id'], $post['content'], $post['type']]);

    echo "[AutoPost] Posted successfully as '{$admin['name']}'\n";
    echo "[AutoPost] Source: {$source}\n";
    echo "[AutoPost] Type: {$post['type']}\n";
    echo "[AutoPost] Preview: " . substr($post['content'], 0, 100) . "...\n";

} catch (Exception $e) {
    echo "[AutoPost] Error: " . $e->getMessage() . "\n";
    exit(1);
}
