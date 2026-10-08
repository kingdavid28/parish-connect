const express = require("express");
const multer = require("multer");
const pool = require("../db/pool");
const config = require("../config");
const { authenticate } = require("../middleware/auth");
const { uuid, getClientIp, auditLog } = require("../lib/helpers");
const { awardPoints } = require("../lib/rewards");
const { sendPushToUser } = require("../lib/push");
const { storeImage } = require("../lib/storage");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const VALID_TYPES = ["community", "baptism_anniversary", "parish_event", "research"];

// GET /api/posts?page=&limit=
router.get("/", authenticate, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || 1, 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || 20, 10)));
  const offset = (page - 1) * limit;

  try {
    const { rows } = await pool.query(
      `SELECT p.*,
              u.name   AS author_name,
              u.avatar AS author_avatar,
              u.role   AS author_role,
              (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes,
              (SELECT COUNT(*) FROM comments  c  WHERE c.post_id  = p.id) AS comments,
              (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $1) AS is_liked
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.is_approved = 1
       ORDER BY p.is_pinned DESC, p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("List posts error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/posts — JSON or multipart (optional image)
router.post("/", authenticate, upload.single("image"), async (req, res) => {
  const content = String(req.body?.content || "").trim();
  const type = String(req.body?.type || "community");

  if (!content) {
    return res.status(400).json({ success: false, message: "Content is required" });
  }
  if (content.length > 2000) {
    return res.status(400).json({ success: false, message: "Content must be under 2000 characters" });
  }
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: "Invalid post type" });
  }

  let imageUrl = null;
  if (req.file) {
    const result = await storeImage(req.file, "posts", 5 * 1024 * 1024);
    if (result.error) {
      return res.status(result.error.includes("not configured") ? 500 : 400).json({ success: false, message: result.error });
    }
    imageUrl = result.url;
  }

  try {
    const id = uuid();
    await pool.query(
      "INSERT INTO posts (id, user_id, content, type, image_url) VALUES ($1, $2, $3, $4, $5)",
      [id, req.user.id, content, type, imageUrl]
    );

    // Notify followers of the post author (best-effort)
    const { rows: followers } = await pool.query(
      "SELECT follower_id FROM follows WHERE following_id = $1",
      [req.user.id]
    );
    const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;
    for (const f of followers) {
      sendPushToUser(f.follower_id, {
        title: `${req.user.name} posted`,
        body: preview,
        tag: "new-post-" + id,
        url: `${config.appBasePath}/`,
      }).catch(() => {});
    }

    await awardPoints(req.user.id, "post_created", id);
    await auditLog(req.user.id, "create_post", "post", id, getClientIp(req));

    res.status(201).json({ success: true, message: "Post created", data: { id } });
  } catch (err) {
    console.error("Create post error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/posts/:id — owner, admin (not for superadmin posts), superadmin
router.delete("/:id", authenticate, async (req, res) => {
  const id = req.params.id;
  try {
    const { rows } = await pool.query("SELECT user_id FROM posts WHERE id = $1 LIMIT 1", [id]);
    const post = rows[0];
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    const isOwner = post.user_id === req.user.id;

    const { rows: ownerRows } = await pool.query("SELECT role FROM users WHERE id = $1 LIMIT 1", [post.user_id]);
    const postOwner = ownerRows[0];

    if (!isOwner && req.user.role === "admin" && postOwner && postOwner.role === "superadmin") {
      return res.status(403).json({ success: false, message: "Admins cannot delete super admin posts" });
    }
    if (!isOwner && !["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this post" });
    }

    await pool.query("DELETE FROM posts WHERE id = $1", [id]);
    await auditLog(req.user.id, "delete_post", "post", id, getClientIp(req));
    res.json({ success: true, message: "Post deleted" });
  } catch (err) {
    console.error("Delete post error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/posts/:id/like — toggle
router.post("/:id/like", authenticate, async (req, res) => {
  const id = req.params.id;
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2 LIMIT 1",
      [id, req.user.id]
    );

    if (rows.length) {
      await pool.query("DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2", [id, req.user.id]);
      return res.json({ success: true, liked: false });
    }

    await pool.query("INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)", [id, req.user.id]);

    // Award points to post author for receiving a like (not for self-likes)
    const { rows: postRows } = await pool.query("SELECT user_id FROM posts WHERE id = $1 LIMIT 1", [id]);
    if (postRows[0] && postRows[0].user_id !== req.user.id) {
      await awardPoints(postRows[0].user_id, "like_received", id);
    }

    res.json({ success: true, liked: true });
  } catch (err) {
    console.error("Toggle like error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/posts/:id/comments
router.get("/:id/comments", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.content, c.created_at, c.user_id,
              u.name AS author_name, u.avatar AS author_avatar
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("List comments error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/posts/:id/comments — JSON
router.post("/:id/comments", authenticate, async (req, res) => {
  const postId = req.params.id;
  const content = String(req.body?.content || "").trim();

  if (!content) {
    return res.status(400).json({ success: false, message: "Content is required" });
  }
  if (content.length > 1000) {
    return res.status(400).json({ success: false, message: "Comment must be under 1000 characters" });
  }

  try {
    const { rows: check } = await pool.query("SELECT id, user_id FROM posts WHERE id = $1 LIMIT 1", [postId]);
    const post = check[0];
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    const id = uuid();
    await pool.query(
      "INSERT INTO comments (id, post_id, user_id, content) VALUES ($1, $2, $3, $4)",
      [id, postId, req.user.id, content]
    );

    const { rows } = await pool.query(
      `SELECT c.id, c.content, c.created_at, c.user_id,
              u.name AS author_name, u.avatar AS author_avatar
       FROM comments c JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [id]
    );

    if (post.user_id !== req.user.id) {
      const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;
      sendPushToUser(post.user_id, {
        title: `${req.user.name} commented`,
        body: preview,
        tag: "comment-" + id,
        url: `${config.appBasePath}/`,
      }).catch(() => {});
    }

    await awardPoints(req.user.id, "comment_added", id);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Add comment error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
