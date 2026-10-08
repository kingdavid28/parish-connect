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

// GET /api/groups — groups the caller belongs to
router.get("/", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.id, g.name, g.avatar, g.created_by,
              (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count,
              (SELECT gm3.content FROM group_messages gm3 WHERE gm3.group_id = g.id ORDER BY gm3.created_at DESC LIMIT 1) AS last_message,
              (SELECT gm3.created_at FROM group_messages gm3 WHERE gm3.group_id = g.id ORDER BY gm3.created_at DESC LIMIT 1) AS last_message_at
       FROM group_chats g
       JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = $1
       ORDER BY last_message_at DESC NULLS LAST`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("List groups error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/groups — create group, caller becomes admin
router.post("/", authenticate, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const memberIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];

  if (!name) {
    return res.status(400).json({ success: false, message: "Group name is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const groupId = uuid();
    await client.query(
      "INSERT INTO group_chats (id, name, created_by) VALUES ($1, $2, $3)",
      [groupId, name, req.user.id]
    );
    await client.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'admin')",
      [groupId, req.user.id]
    );
    for (const memberId of memberIds) {
      if (memberId !== req.user.id) {
        await client.query(
          "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (group_id, user_id) DO NOTHING",
          [groupId, memberId]
        );
      }
    }
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: { id: groupId } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create group error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    client.release();
  }
});

async function isMember(groupId, userId) {
  const { rows } = await pool.query(
    "SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 LIMIT 1",
    [groupId, userId]
  );
  return rows.length > 0;
}

// GET /api/groups/:id — message history (members only)
router.get("/:id", authenticate, async (req, res) => {
  const groupId = req.params.id;
  try {
    if (!(await isMember(groupId, req.user.id))) {
      return res.status(403).json({ success: false, message: "Not a member of this group" });
    }
    const { rows } = await pool.query(
      `SELECT gm.id, gm.sender_id, gm.content, gm.image_url, gm.created_at,
              u.name AS sender_name, u.avatar AS sender_avatar
       FROM group_messages gm
       JOIN users u ON gm.sender_id = u.id
       WHERE gm.group_id = $1
       ORDER BY gm.created_at ASC
       LIMIT 200`,
      [groupId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Get group messages error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/groups/:id — send message (JSON or multipart with image)
router.post("/:id", authenticate, upload.single("image"), async (req, res) => {
  const groupId = req.params.id;
  const content = String(req.body?.content || "").trim();

  let imageUrl = null;
  if (req.file) {
    const result = await storeImage(req.file, "groups", 5 * 1024 * 1024);
    if (result.error) {
      return res.status(result.error.includes("not configured") ? 500 : 400).json({ success: false, message: result.error });
    }
    imageUrl = result.url;
  }

  if (!content && !imageUrl) {
    return res.status(400).json({ success: false, message: "Message or image is required" });
  }

  try {
    if (!(await isMember(groupId, req.user.id))) {
      return res.status(403).json({ success: false, message: "Not a member of this group" });
    }

    const id = uuid();
    await pool.query(
      "INSERT INTO group_messages (id, group_id, sender_id, content, image_url) VALUES ($1, $2, $3, $4, $5)",
      [id, groupId, req.user.id, content || "", imageUrl]
    );

    const { rows: senderRows } = await pool.query("SELECT name, avatar FROM users WHERE id = $1 LIMIT 1", [req.user.id]);
    const sender = senderRows[0] || {};

    // Notify other members (best-effort)
    const { rows: members } = await pool.query(
      "SELECT user_id FROM group_members WHERE group_id = $1 AND user_id != $2",
      [groupId, req.user.id]
    );
    const { rows: groupRows } = await pool.query("SELECT name FROM group_chats WHERE id = $1 LIMIT 1", [groupId]);
    const preview = content ? (content.length > 80 ? content.slice(0, 80) + "…" : content) : "📷 Image";
    for (const m of members) {
      sendPushToUser(m.user_id, {
        title: `${sender.name || "Someone"} in ${groupRows[0]?.name || "group"}`,
        body: preview,
        tag: "group-" + groupId,
        url: `${config.appBasePath}/messages`,
      }).catch(() => {});
    }

    res.status(201).json({
      success: true,
      data: {
        id, sender_id: req.user.id, content: content || "",
        image_url: imageUrl, created_at: new Date().toISOString(),
        sender_name: sender.name || "", sender_avatar: sender.avatar || "",
      },
    });
  } catch (err) {
    console.error("Send group message error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/groups/:id/members — group admin adds members
router.post("/:id/members", authenticate, async (req, res) => {
  const groupId = req.params.id;
  const memberIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];

  if (!memberIds.length) {
    return res.status(400).json({ success: false, message: "No members to add" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2 LIMIT 1",
      [groupId, req.user.id]
    );
    if (!rows[0] || rows[0].role !== "admin") {
      return res.status(403).json({ success: false, message: "Only group admins can add members" });
    }

    for (const memberId of memberIds) {
      await pool.query(
        "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (group_id, user_id) DO NOTHING",
        [groupId, memberId]
      );
    }
    res.json({ success: true, message: "Members added" });
  } catch (err) {
    console.error("Add members error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/groups/:id/members
router.get("/:id/members", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.role AS user_role, gm.role AS group_role
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id AND u.is_active = 1
       WHERE gm.group_id = $1
       ORDER BY gm.role ASC, u.name ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Get members error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/groups/:id/leave
router.delete("/:id/leave", authenticate, async (req, res) => {
  try {
    await pool.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true, message: "Left group" });
  } catch (err) {
    console.error("Leave group error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
