const express = require("express");
const { v4: uuidv4 } = require("uuid");
const pool = require("../db/pool");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/posts
router.get("/", authenticate, async (req, res) => {
  try {
    const [posts] = await pool.query(`
      SELECT p.*, u.name AS author_name, u.avatar AS author_avatar, u.role AS author_role,
        (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments,
        (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ?) AS is_liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_approved = 1
      ORDER BY p.is_pinned DESC, p.created_at DESC
      LIMIT 50
    `, [req.user.id]);

    res.json({ success: true, data: posts });
  } catch (err) {
    console.error("Get posts error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/posts
router.post("/", authenticate, async (req, res) => {
  const { content, type, eventDate, eventLocation, baptismYear } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, message: "Content is required" });
  }

  if (content.length > 2000) {
    return res.status(400).json({ success: false, message: "Content must be under 2000 characters" });
  }

  const validTypes = ["community", "baptism_anniversary", "parish_event", "research"];
  if (type && !validTypes.includes(type)) {
    return res.status(400).json({ success: false, message: "Invalid post type" });
  }

  try {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO posts (id, user_id, content, type, event_date, event_location, baptism_year)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, content.trim(), type || "community", eventDate || null, eventLocation || null, baptismYear || null]
    );

    res.status(201).json({ success: true, data: { id }, message: "Post created" });
  } catch (err) {
    console.error("Create post error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/posts/:id
router.delete("/:id", authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query("SELECT user_id FROM posts WHERE id = ? LIMIT 1", [id]);
    const post = rows[0];

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    const isOwner = post.user_id === req.user.id;
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this post" });
    }

    await pool.query("DELETE FROM posts WHERE id = ?", [id]);
    res.json({ success: true, message: "Post deleted" });
  } catch (err) {
    console.error("Delete post error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/posts/:id/like
router.post("/:id/like", authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const [existing] = await pool.query(
      "SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ? LIMIT 1",
      [id, req.user.id]
    );

    if (existing.length > 0) {
      await pool.query("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?", [id, req.user.id]);
      return res.json({ success: true, liked: false });
    }

    await pool.query("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)", [id, req.user.id]);
    res.json({ success: true, liked: true });
  } catch (err) {
    console.error("Like post error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
