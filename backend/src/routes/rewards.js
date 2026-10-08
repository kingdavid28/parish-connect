const express = require("express");
const pool = require("../db/pool");
const config = require("../config");
const { authenticate } = require("../middleware/auth");
const { uuid } = require("../lib/helpers");
const { POINTS, BADGES, checkAndAwardBadges } = require("../lib/rewards");
const { sendPushToUser } = require("../lib/push");

const router = express.Router();

async function getUserRewardsById(userId, res) {
  try {
    const [pt, tx, badgeRows, rank] = await Promise.all([
      pool.query("SELECT total_points FROM user_points WHERE user_id = $1 LIMIT 1", [userId]),
      pool.query(
        "SELECT action, points, ref_id, created_at FROM point_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
        [userId]
      ),
      pool.query("SELECT badge_slug, earned_at FROM user_badges WHERE user_id = $1 ORDER BY earned_at ASC", [userId]),
      pool.query(
        "SELECT COUNT(*) + 1 AS rank FROM user_points WHERE total_points > (SELECT COALESCE(total_points, 0) FROM user_points WHERE user_id = $1)",
        [userId]
      ),
    ]);

    const earnedMap = Object.fromEntries(badgeRows.rows.map((r) => [r.badge_slug, r.earned_at]));
    const badges = BADGES.map((b) => ({
      ...b,
      earned: b.slug in earnedMap,
      earned_at: earnedMap[b.slug] || null,
    }));

    res.json({
      success: true,
      data: {
        total_points: parseInt(pt.rows[0]?.total_points || 0, 10),
        rank: parseInt(rank.rows[0]?.rank || 1, 10),
        badges,
        transactions: tx.rows,
      },
    });
  } catch (err) {
    console.error("getUserRewards error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

// GET /api/rewards
router.get("/", authenticate, (req, res) => getUserRewardsById(req.user.id, res));

// GET /api/rewards/leaderboard
router.get("/leaderboard", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.role,
              COALESCE(up.total_points, 0) AS total_points,
              (SELECT COUNT(*) FROM user_badges ub WHERE ub.user_id = u.id) AS badge_count
       FROM users u
       LEFT JOIN user_points up ON up.user_id = u.id
       WHERE u.is_active = 1
       ORDER BY total_points DESC, u.created_at ASC
       LIMIT 20`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("getLeaderboard error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/rewards/:id
router.get("/:id", authenticate, (req, res) => getUserRewardsById(req.params.id, res));

// POST /api/rewards/:id/kudos — transfer GBless as praise
router.post("/:id/kudos", authenticate, async (req, res) => {
  const receiverId = req.params.id;
  if (req.user.id === receiverId) {
    return res.status(400).json({ success: false, message: "You cannot praise yourself" });
  }

  const praiseCost = POINTS.kudos_received; // 15 GBless

  try {
    const { rows: dup } = await pool.query(
      `SELECT id FROM point_transactions
       WHERE user_id = $1 AND action = 'kudos_received' AND ref_id = $2 AND created_at::date = CURRENT_DATE
       LIMIT 1`,
      [receiverId, req.user.id]
    );
    if (dup.length) {
      return res.status(429).json({ success: false, message: "You already praised this person today" });
    }

    const { rows: userRows } = await pool.query(
      "SELECT id, name FROM users WHERE id = $1 AND is_active = 1 LIMIT 1",
      [receiverId]
    );
    const receiver = userRows[0];
    if (!receiver) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { rows: balRows } = await pool.query("SELECT total_points FROM user_points WHERE user_id = $1 LIMIT 1", [req.user.id]);
    const giverBalance = parseInt(balRows[0]?.total_points || 0, 10);
    if (giverBalance < praiseCost) {
      return res.status(400).json({
        success: false,
        message: `You need at least ${praiseCost} GBless to give praise. Earn more by posting and engaging!`,
        code: "insufficient_balance",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE user_points SET total_points = total_points - $1 WHERE user_id = $2", [praiseCost, req.user.id]);
      await client.query(
        "INSERT INTO point_transactions (id, user_id, action, points, ref_id) VALUES ($1, $2, 'kudos_sent', $3, $4)",
        [uuid(), req.user.id, -praiseCost, receiverId]
      );
      await client.query(
        `INSERT INTO user_points (user_id, total_points) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET total_points = user_points.total_points + $2, updated_at = NOW()`,
        [receiverId, praiseCost]
      );
      await client.query(
        "INSERT INTO point_transactions (id, user_id, action, points, ref_id) VALUES ($1, $2, 'kudos_received', $3, $4)",
        [uuid(), receiverId, praiseCost, req.user.id]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    await checkAndAwardBadges(receiverId);

    sendPushToUser(receiverId, {
      title: `💛 Praise from ${req.user.name}`,
      body: `${req.user.name} praised you with ${praiseCost} GBless!`,
      tag: "praise-" + req.user.id,
      url: `${config.appBasePath}/rewards`,
    }).catch(() => {});

    res.json({ success: true, message: `Praise given! ${praiseCost} GBless sent to ${receiver.name}.` });
  } catch (err) {
    console.error("givePraise error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
