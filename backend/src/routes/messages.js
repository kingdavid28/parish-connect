const express = require("express");
const multer = require("multer");
const pool = require("../db/pool");
const config = require("../config");
const { authenticate } = require("../middleware/auth");
const { uuid } = require("../lib/helpers");
const { sendPushToUser } = require("../lib/push");
const { storeImage } = require("../lib/storage");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/messages — conversation list (latest message per partner)
router.get("/", authenticate, async (req, res) => {
  const uid = req.user.id;
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.role,
              m.content AS last_message, m.created_at AS last_message_at,
              (SELECT COUNT(*) FROM messages m2
               WHERE m2.sender_id = u.id AND m2.receiver_id = $1 AND m2.is_read = 0) AS unread_count
       FROM (
          SELECT CASE WHEN sender_id = $2 THEN receiver_id ELSE sender_id END AS partner_id,
                 MAX(created_at) AS max_at
          FROM messages
          WHERE sender_id = $3 OR receiver_id = $4
          GROUP BY partner_id
       ) conv
       JOIN users u ON u.id = conv.partner_id AND u.is_active = 1
       JOIN messages m ON m.created_at = conv.max_at
          AND ((m.sender_id = $5 AND m.receiver_id = u.id) OR (m.sender_id = u.id AND m.receiver_id = $6))
       ORDER BY conv.max_at DESC`,
      [uid, uid, uid, uid, uid, uid]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("List conversations error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/messages/:partnerId — full history; marks received as read
router.get("/:partnerId", authenticate, async (req, res) => {
  const partnerId = req.params.partnerId;
  try {
    const { rows } = await pool.query(
      `SELECT m.id, m.sender_id, m.receiver_id, m.content, m.image_url, m.is_read, m.created_at,
              u.name AS sender_name, u.avatar AS sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE (m.sender_id = $1 AND m.receiver_id = $2) OR (m.sender_id = $3 AND m.receiver_id = $4)
       ORDER BY m.created_at ASC
       LIMIT 100`,
      [req.user.id, partnerId, partnerId, req.user.id]
    );

    await pool.query(
      "UPDATE messages SET is_read = 1 WHERE sender_id = $1 AND receiver_id = $2 AND is_read = 0",
      [partnerId, req.user.id]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Get conversation error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/messages/:receiverId — JSON or multipart (optional image)
router.post("/:receiverId", authenticate, upload.single("image"), async (req, res) => {
  const receiverId = req.params.receiverId;
  const content = String(req.body?.content || "").trim();

  if (req.user.id === receiverId) {
    return res.status(400).json({ success: false, message: "Cannot message yourself" });
  }

  let imageUrl = null;
  if (req.file) {
    const result = await storeImage(req.file, "messages", 5 * 1024 * 1024);
    if (result.error) {
      return res.status(result.error.includes("not configured") ? 500 : 400).json({ success: false, message: result.error });
    }
    imageUrl = result.url;
  }

  if (!content && !imageUrl) {
    return res.status(400).json({ success: false, message: "Message content or image is required" });
  }
  if (content.length > 2000) {
    return res.status(400).json({ success: false, message: "Message must be under 2000 characters" });
  }

  try {
    const { rows: check } = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND is_active = 1 LIMIT 1",
      [receiverId]
    );
    if (!check.length) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const id = uuid();
    await pool.query(
      "INSERT INTO messages (id, sender_id, receiver_id, content, image_url) VALUES ($1, $2, $3, $4, $5)",
      [id, req.user.id, receiverId, content || "", imageUrl]
    );

    const preview = content ? (content.length > 80 ? content.slice(0, 80) + "…" : content) : "📷 Image";
    sendPushToUser(receiverId, {
      title: "New message from " + req.user.name,
      body: preview,
      tag: "message-" + req.user.id,
      url: `${config.appBasePath}/messages`,
    }).catch(() => {});

    res.status(201).json({
      success: true,
      data: {
        id, sender_id: req.user.id, receiver_id: receiverId,
        content: content || "", image_url: imageUrl, is_read: 0,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Send message error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/messages/:partnerId/read
router.put("/:partnerId/read", authenticate, async (req, res) => {
  try {
    await pool.query(
      "UPDATE messages SET is_read = 1 WHERE sender_id = $1 AND receiver_id = $2 AND is_read = 0",
      [req.params.partnerId, req.user.id]
    );
    res.json({ success: true, message: "Messages marked as read" });
  } catch (err) {
    console.error("Mark read error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
