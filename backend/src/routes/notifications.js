const express = require("express");
const pool = require("../db/pool");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || "25", 10) || 25));
  try {
    const [notifications, unread] = await Promise.all([
      pool.query(
        `SELECT id, category, title, body, url, read_at, created_at
         FROM app_notifications WHERE user_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [req.user.id, limit]
      ),
      pool.query(
        "SELECT COUNT(*) AS count FROM app_notifications WHERE user_id = $1 AND read_at IS NULL",
        [req.user.id]
      ),
    ]);
    res.json({
      success: true,
      data: {
        items: notifications.rows,
        unread_count: Number.parseInt(unread.rows[0].count, 10),
      },
    });
  } catch (err) {
    console.error("List notifications error:", err.message);
    res.status(500).json({ success: false, message: "Unable to load notifications" });
  }
});

router.put("/read-all", authenticate, async (req, res) => {
  try {
    await pool.query(
      "UPDATE app_notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL",
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Mark all notifications read error:", err.message);
    res.status(500).json({ success: false, message: "Unable to update notifications" });
  }
});

router.put("/:id/read", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE app_notifications SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Mark notification read error:", err.message);
    res.status(500).json({ success: false, message: "Unable to update notification" });
  }
});

module.exports = router;
