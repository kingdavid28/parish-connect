const express = require("express");
const pool = require("../db/pool");
const config = require("../config");
const { uuid } = require("../lib/helpers");
const { sendPushToUser } = require("../lib/push");

const router = express.Router();

/**
 * GET|POST /api/cron/autopost
 * Called by an external scheduler (cron-job.org, GitHub Actions, etc.)
 * twice daily to publish a community post as the parent superadmin.
 * Auth: x-cron-secret header (preferred — keeps the secret out of URL
 * access logs) or ?token=CRON_SECRET query param for simple GET pings.
 */
async function autopost(req, res) {
  const token = req.get("x-cron-secret") || req.query.token;
  if (!config.cronSecret || token !== config.cronSecret) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, name FROM users WHERE role = 'superadmin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1"
    );
    const admin = rows[0];
    if (!admin) {
      return res.status(500).json({ success: false, message: "No active superadmin found" });
    }

    const { rows: recent } = await pool.query(
      "SELECT content FROM posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 7",
      [admin.id]
    );
    const recentContents = recent.map((r) => r.content);

    let post = await generatePostWithGroq();
    let source = "Groq AI";
    if (!post) {
      post = getFallbackTemplate(recentContents);
      source = "Fallback template";
    }

    const postId = uuid();
    await pool.query(
      "INSERT INTO posts (id, user_id, content, type, is_approved, created_at) VALUES ($1, $2, $3, $4, 1, NOW())",
      [postId, admin.id, post.content, post.type]
    );

    console.log(`[AutoPost] Posted as '${admin.name}' (source: ${source}, type: ${post.type})`);
    res.json({ success: true, data: { id: postId, type: post.type, source } });
  } catch (err) {
    console.error("[AutoPost] Error:", err.message);
    res.status(500).json({ success: false, message: "Auto-post failed" });
  }
}

router.get("/autopost", autopost);
router.post("/autopost", autopost);

/**
 * GET|POST /api/cron/contribution-reminder[?year=&month=]
 * Pushes a reminder to every active donor linked to a user account who has
 * no contribution row for the target month (defaults to last month — run
 * on the ~5th of each month so it always means "previous month dues").
 * Same auth as /autopost.
 */
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

async function contributionReminder(req, res) {
  const token = req.get("x-cron-secret") || req.query.token;
  if (!config.cronSecret || token !== config.cronSecret) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  if (config.features.finance === false) {
    return res.json({ success: true, data: { sent: 0, skipped: "finance disabled" } });
  }

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // previous month (JS month is 0-based → this is last month)
  if (month === 0) { month = 12; year -= 1; }
  if (req.query.year && req.query.month) {
    year = parseInt(req.query.year, 10);
    month = parseInt(req.query.month, 10);
  }

  try {
    const { rows: unpaid } = await pool.query(
      `SELECT d.id, d.name, d.user_id FROM donors d
       WHERE d.is_active = 1 AND d.user_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM contributions c
           WHERE c.donor_id = d.id AND c.year = $1 AND c.month = $2
         )`,
      [year, month]
    );

    const label = `${MONTH_NAMES[month - 1]} ${year}`;
    let sent = 0;
    for (const donor of unpaid) {
      await sendPushToUser(donor.user_id, {
        title: "Monthly Contribution Reminder",
        body: `Friendly reminder: your ${label} contribution for ${donor.name} hasn't been recorded yet.`,
        tag: `contrib-${year}-${month}-${donor.id}`,
        url: `${config.appUrl}${config.appBasePath}/`,
      });
      sent++;
    }
    console.log(`[ContribReminder] ${label}: pushed ${sent} reminder(s)`);
    res.json({ success: true, data: { year, month, sent } });
  } catch (err) {
    console.error("[ContribReminder] Error:", err.message);
    res.status(500).json({ success: false, message: "Reminder job failed" });
  }
}

router.get("/contribution-reminder", contributionReminder);
router.post("/contribution-reminder", contributionReminder);

// ─── Groq AI generator — all parish specifics come from env config ────────────

async function generatePostWithGroq() {
  if (!config.groqApiKey) return null;

  const isMorning = new Date().getHours() < 12;
  const p = config.parish;
  const loc = p.location || "the Philippines";

  const topics = isMorning
    ? [
        `a morning prayer and scripture reflection for the ${p.shortName} community`,
        `encouraging parishioners in ${loc} to attend Sunday Mass and connect with each other`,
        `the importance of family prayer and faith at home in our Catholic tradition`,
        `how small acts of kindness reflect God's love in daily life in ${loc}`,
        "a motivational faith message for our parish family",
      ]
    : [
        "an evening reflection on gratitude and God's blessings",
        `encouraging parishioners to join a parish ministry or family group at ${p.name}`,
        `the value of community and belonging in our parish family in ${loc}`,
        "how the GBless Points rewards system encourages parish engagement",
        "exploring parish records and family faith history",
      ];

  const topic = topics[Math.floor(Math.random() * topics.length)];
  const types = ["community", "community", "community", "parish_event", "research"];
  const type = types[Math.floor(Math.random() * types.length)];

  const systemPrompt = `You are the official social media voice of ${p.name}, a Catholic parish community located in ${loc}.
Your tone is warm, faith-filled, encouraging, and community-focused.
You write short social media posts for the Parish Connect app — a platform where parishioners connect, earn GBless Points, and manage their parish life.

Language Rules:
- ${p.languageNotes}
- Sound genuine, local, and human — not corporate.

Content Rules:
- Keep posts between 80-180 words
- Include 1-2 relevant emojis naturally within the text
- End with 2-3 relevant hashtags including ${p.hashtags}
- Do NOT use markdown formatting like ** or ##
- Occasionally mention Parish Connect features: GBless Points, Rewards, Membership, Family Groups, Ministries, Parish Records
- NEVER include specific times, dates, or event schedules — these are auto-generated posts and invented details could mislead parishioners
- NEVER announce specific events, meetings, or gatherings with made-up details
- Use general phrases instead: "join us at Mass", "attend our parish activities", "check the parish bulletin for schedules"`;

  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Write a parish community post about: ${topic}` },
        ],
        temperature: 0.85,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.error(`[AutoPost] Groq HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    const content = String(data?.choices?.[0]?.message?.content || "").trim();
    return content ? { type, content } : null;
  } catch (err) {
    console.error("[AutoPost] Groq error:", err.message);
    return null;
  }
}

// ─── Generic fallback templates (parish name/hashtags via config) ─────────────

function getFallbackTemplate(recentContents) {
  const p = config.parish;
  const tags = p.hashtags;
  const templates = [
    {
      type: "community",
      content: `Good day, parish family! 🙏\n\nLet us begin this day with prayer and gratitude. Every small act of goodness is a prayer in action.\n\n"Give thanks to the Lord, for he is good; his love endures forever." — Psalm 107:1\n\nTake care, friends!\n\n${tags}`,
    },
    {
      type: "community",
      content: `Good evening, church family! ✨\n\nWhat did you do today to show God's love? Even a warm smile or a helping hand matters.\n\nEarn GBless Points by engaging with your parish community. Like, comment, and encourage one another! 💛\n\n${tags}`,
    },
    {
      type: "parish_event",
      content: `Sunday Mass is a wonderful time for us to gather as one church family. ⛪\n\nConnect with your fellow parishioners here on Parish Connect. Share your faith journey, join a ministry, or simply say hello!\n\n#SundayMass ${tags}`,
    },
    {
      type: "community",
      content: `Did you know? 💛\n\nYou can earn GBless Points by:\n• Posting ✍️ (+10 pts)\n• Commenting 💬 (+5 pts)\n• Receiving likes ❤️ (+2 pts)\n• Daily login ☀️ (+5 pts)\n\nStart engaging and let's see who's at the top of the leaderboard! 🏆\n\n#GBlessPoints ${tags}`,
    },
    {
      type: "community",
      content: `A thought for today: 🕊️\n\n"Faith is not the absence of doubt, but the courage to continue despite it."\n\nShare your faith story in our community. Your testimony might be exactly what someone needs today!\n\n#Faith ${tags}`,
    },
    {
      type: "parish_event",
      content: `Our parish ministries need YOUR help! ⛪\n\nFrom the choir to the youth group, there are many ways to serve. Browse available ministries in the Membership section and join one that speaks to your heart.\n\nService is love made visible!\n\n#Ministry ${tags}`,
    },
    {
      type: "research",
      content: `Did you know our parish keeps detailed sacramental records? 📜\n\nBaptisms, confirmations, and marriages — all documented.\n\nVisit the Parish Records section to explore your family's faith history at ${p.name}!\n\n#ParishRecords #FamilyHistory ${tags}`,
    },
    {
      type: "community",
      content: `A word from God for today: 📖\n\n"For where two or three gather in my name, there am I with them." — Matthew 18:20\n\nThis is why Parish Connect was made — so we can gather in faith, even beyond the walls of the church!\n\n#Scripture ${tags}`,
    },
  ];

  const available = templates.filter(
    (t) => !recentContents.some((r) => t.content.slice(0, 50) === String(r).slice(0, 50))
  );
  const poolArr = available.length ? available : templates;
  return poolArr[Math.floor(Math.random() * poolArr.length)];
}

module.exports = router;
