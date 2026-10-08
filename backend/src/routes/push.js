const express = require("express");
const pool = require("../db/pool");
const config = require("../config");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// GET /api/push/vapid-key — public
router.get("/vapid-key", (req, res) => {
  res.json({ success: true, data: { publicKey: config.vapid.publicKey } });
});

// POST /api/push/subscribe
router.post("/subscribe", authenticate, async (req, res) => {
  const endpoint = String(req.body?.endpoint || "");
  const p256dh = String(req.body?.keys?.p256dh || "");
  const auth = String(req.body?.keys?.auth || "");

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ success: false, message: "Invalid subscription data" });
  }

  try {
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, endpoint)
       DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = NOW()`,
      [req.user.id, endpoint, p256dh, auth]
    );
    res.json({ success: true, message: "Subscribed to push notifications" });
  } catch (err) {
    console.error("Push subscribe error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/push/subscribe
router.delete("/subscribe", authenticate, async (req, res) => {
  const endpoint = String(req.body?.endpoint || "");
  try {
    await pool.query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [req.user.id, endpoint]);
    res.json({ success: true, message: "Unsubscribed" });
  } catch (err) {
    console.error("Push unsubscribe error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
