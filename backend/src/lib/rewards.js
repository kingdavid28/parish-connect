const pool = require("../db/pool");
const config = require("../config");
const { uuid } = require("./helpers");
const { sendPushToUser } = require("./push");

const POINTS = {
  post_created: 10,
  comment_added: 5,
  like_received: 2,
  kudos_received: 15,
  follow_received: 3,
  daily_login: 5,
};

const BADGES = [
  { slug: "first_post", name: "First Post", description: "Published your first post", icon: "✍️", threshold: 1, metric: "posts" },
  { slug: "active_member", name: "Active Member", description: "Reached 100 points", icon: "⭐", threshold: 100, metric: "points" },
  { slug: "community_pillar", name: "Community Pillar", description: "Reached 500 points", icon: "🏛️", threshold: 500, metric: "points" },
  { slug: "beloved", name: "Beloved", description: "Received 10 praises from parishioners", icon: "💛", threshold: 10, metric: "kudos" },
  { slug: "connector", name: "Connector", description: "Has 10 followers", icon: "🤝", threshold: 10, metric: "followers" },
  { slug: "storyteller", name: "Storyteller", description: "Published 10 posts", icon: "📖", threshold: 10, metric: "posts" },
];

/** Award points to a user for an action. Idempotent for daily_login. Best-effort. */
async function awardPoints(userId, action, refId = null) {
  const points = POINTS[action] || 0;
  if (points <= 0) return;
  try {
    if (action === "daily_login") {
      const { rows } = await pool.query(
        "SELECT id FROM point_transactions WHERE user_id = $1 AND action = 'daily_login' AND created_at::date = CURRENT_DATE LIMIT 1",
        [userId]
      );
      if (rows.length) return;
    }

    await pool.query(
      "INSERT INTO point_transactions (id, user_id, action, points, ref_id) VALUES ($1, $2, $3, $4, $5)",
      [uuid(), userId, action, points, refId]
    );

    await pool.query(
      `INSERT INTO user_points (user_id, total_points) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET total_points = user_points.total_points + $2, updated_at = NOW()`,
      [userId, points]
    );

    await checkAndAwardBadges(userId);
  } catch (err) {
    console.error("awardPoints error:", err.message);
  }
}

/** Check badge thresholds and award newly earned badges. Best-effort. */
async function checkAndAwardBadges(userId) {
  try {
    const [pts, posts, kudos, followers] = await Promise.all([
      pool.query("SELECT total_points FROM user_points WHERE user_id = $1", [userId]),
      pool.query("SELECT COUNT(*) AS c FROM posts WHERE user_id = $1", [userId]),
      pool.query(
        "SELECT COUNT(*) AS c FROM point_transactions WHERE user_id = $1 AND action = 'kudos_received'",
        [userId]
      ),
      pool.query("SELECT COUNT(*) AS c FROM follows WHERE following_id = $1", [userId]),
    ]);

    const metrics = {
      points: parseInt(pts.rows[0]?.total_points || 0, 10),
      posts: parseInt(posts.rows[0]?.c || 0, 10),
      kudos: parseInt(kudos.rows[0]?.c || 0, 10),
      followers: parseInt(followers.rows[0]?.c || 0, 10),
    };

    for (const badge of BADGES) {
      if ((metrics[badge.metric] || 0) < badge.threshold) continue;

      const { rows } = await pool.query(
        "SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_slug = $2 LIMIT 1",
        [userId, badge.slug]
      );
      if (rows.length) continue;

      await pool.query(
        "INSERT INTO user_badges (id, user_id, badge_slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [uuid(), userId, badge.slug]
      );

      sendPushToUser(userId, {
        title: `New Badge Earned! ${badge.icon}`,
        body: `You earned the "${badge.name}" badge.`,
        tag: `badge-${badge.slug}`,
        url: `${config.appBasePath}/rewards`,
      });
    }
  } catch (err) {
    console.error("checkAndAwardBadges error:", err.message);
  }
}

module.exports = { POINTS, BADGES, awardPoints, checkAndAwardBadges };
