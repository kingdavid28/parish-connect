const express = require("express");
const pool = require("../db/pool");
const { authenticate } = require("../middleware/auth");
const { awardPoints } = require("../lib/rewards");

const router = express.Router();

// POST /api/follows/:id — toggle follow
router.post("/:id", authenticate, async (req, res) => {
  const targetId = req.params.id;
  if (req.user.id === targetId) {
    return res.status(400).json({ success: false, message: "Cannot follow yourself" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 LIMIT 1",
      [req.user.id, targetId]
    );
    if (rows.length) {
      await pool.query("DELETE FROM follows WHERE follower_id = $1 AND following_id = $2", [req.user.id, targetId]);
      return res.json({ success: true, following: false });
    }
    await pool.query("INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)", [req.user.id, targetId]);
    await awardPoints(targetId, "follow_received", req.user.id);
    res.json({ success: true, following: true });
  } catch (err) {
    console.error("Toggle follow error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/follows/:id/status
router.get("/:id/status", authenticate, async (req, res) => {
  const targetId = req.params.id;
  try {
    const [isF, followers, following] = await Promise.all([
      pool.query("SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 LIMIT 1", [req.user.id, targetId]),
      pool.query("SELECT COUNT(*) AS c FROM follows WHERE following_id = $1", [targetId]),
      pool.query("SELECT COUNT(*) AS c FROM follows WHERE follower_id = $1", [targetId]),
    ]);
    res.json({
      success: true,
      data: {
        is_following: isF.rows.length > 0,
        followers: Number(followers.rows[0].c),
        following: Number(following.rows[0].c),
      },
    });
  } catch (err) {
    console.error("Follow status error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/follows/:id/followers
router.get("/:id/followers", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.role
       FROM follows f JOIN users u ON f.follower_id = u.id
       WHERE f.following_id = $1 AND u.is_active = 1
       ORDER BY f.created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("List followers error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/follows/:id/following
router.get("/:id/following", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.role
       FROM follows f JOIN users u ON f.following_id = u.id
       WHERE f.follower_id = $1 AND u.is_active = 1
       ORDER BY f.created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("List following error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
