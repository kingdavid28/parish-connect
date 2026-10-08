const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const pool = require("../db/pool");
const config = require("../config");
const { authenticate, requireRole } = require("../middleware/auth");
const { uuid, getClientIp, auditLog } = require("../lib/helpers");
const { storeImage } = require("../lib/storage");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Is the given user the parent (earliest-created) superadmin? */
async function isParentSuperAdmin(user) {
  if (user.role !== "superadmin") return false;
  const { rows } = await pool.query(
    "SELECT id FROM users WHERE role = 'superadmin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1"
  );
  return !!rows[0] && rows[0].id === user.id;
}

// GET /api/users/search?q=...|all=1 — any authenticated user
router.get("/search", authenticate, async (req, res) => {
  const q = String(req.query.search || req.query.q || "").trim();
  const all = req.query.all === "1";
  try {
    let rows;
    if (all || q.length === 0) {
      ({ rows } = await pool.query(
        `SELECT id, name, avatar, role, email, created_at, member_since
         FROM users WHERE is_active = 1 AND id != $1 ORDER BY name ASC LIMIT 200`,
        [req.user.id]
      ));
    } else {
      if (q.length < 2) return res.json({ success: true, data: [] });
      ({ rows } = await pool.query(
        `SELECT id, name, avatar, role FROM users
         WHERE is_active = 1 AND id != $1 AND name ILIKE $2
         ORDER BY name ASC LIMIT 10`,
        [req.user.id, `%${q}%`]
      ));
    }
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Search users error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/users — admin list (with parent-superadmin visibility rules)
router.get("/", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    let sql = `SELECT id, name, email, role, parish_id, avatar, member_since, last_login, created_by, created_at
               FROM users WHERE is_active = 1`;
    const params = [];

    if (req.user.role === "admin") sql += " AND role != 'superadmin'";

    const { rows: parentRows } = await pool.query(
      "SELECT id FROM users WHERE role = 'superadmin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1"
    );
    const parentId = parentRows[0]?.id || null;
    if (req.user.role !== "superadmin" && parentId) {
      params.push(parentId);
      sql += " AND id != $1";
    }

    sql += " ORDER BY created_at DESC";
    const { rows } = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("List users error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/users — admin creates a user
router.post("/", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "");
  const parishId = String(req.body?.parishId || config.parish.id);

  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: "name, email, password and role are required" });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, message: "Invalid email address" });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
  }

  const validRoles = ["admin", "parishioner"];
  if (req.user.role === "superadmin") validRoles.push("superadmin");
  if (!validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }
  if (["admin", "superadmin"].includes(role) && req.user.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Only super admin can create admin/superadmin users" });
  }

  try {
    const { rows: dup } = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
    if (dup.length) {
      return res.status(409).json({ success: false, message: "Email already in use" });
    }

    const id = uuid();
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, parish_id, created_by, member_since)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)`,
      [id, name, email, hash, role, parishId, req.user.id]
    );
    await auditLog(req.user.id, "create_user", "user", id, getClientIp(req));

    res.status(201).json({ success: true, message: "User created successfully", data: { id } });
  } catch (err) {
    console.error("Create user error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/users/:id — profile (limited fields for non-admin non-self)
router.get("/:id", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, parish_id, avatar, member_since, last_login, created_by, created_at
       FROM users WHERE id = $1 AND is_active = 1 LIMIT 1`,
      [req.params.id]
    );
    const target = rows[0];
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!["admin", "superadmin"].includes(req.user.role) && req.user.id !== req.params.id) {
      return res.json({
        success: true,
        data: {
          id: target.id, name: target.name, email: target.email, role: target.role,
          avatar: target.avatar, member_since: target.member_since, created_at: target.created_at,
        },
      });
    }
    res.json({ success: true, data: target });
  } catch (err) {
    console.error("Get user error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/users/:id — self name change; superadmin role changes
router.put("/:id", authenticate, async (req, res) => {
  const id = req.params.id;
  const isSelf = req.user.id === id;
  const isSuperAdmin = req.user.role === "superadmin";

  if (!isSelf && !isSuperAdmin) {
    return res.status(403).json({ success: false, message: "Insufficient permissions" });
  }

  let newRole = req.body?.role || null;
  const newName = req.body?.name != null ? String(req.body.name).trim() : null;
  if (newRole && !isSuperAdmin) newRole = null;
  if (!newRole && !newName) {
    return res.status(400).json({ success: false, message: "Nothing to update" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, role, created_by FROM users WHERE id = $1 AND is_active = 1 LIMIT 1",
      [id]
    );
    const target = rows[0];
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (isSelf && newRole) {
      return res.status(400).json({ success: false, message: "You cannot change your own role" });
    }

    const isParent = await isParentSuperAdmin(req.user);
    const { rows: parentRows } = await pool.query(
      "SELECT id FROM users WHERE role = 'superadmin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1"
    );
    const targetIsParent = !!parentRows[0] && target.id === parentRows[0].id;
    if (targetIsParent && !isParent) {
      return res.status(403).json({ success: false, message: "Cannot modify the parent super admin" });
    }
    if (target.role === "superadmin" && !isParent) {
      return res.status(403).json({ success: false, message: "Only the parent super admin can modify super admin accounts" });
    }

    if (newRole) {
      if (!["admin", "parishioner", "superadmin"].includes(newRole)) {
        return res.status(400).json({ success: false, message: "Invalid role" });
      }
      if (newRole === "superadmin" && !isParent) {
        return res.status(403).json({ success: false, message: "Only the parent super admin can assign super admin role" });
      }
    }

    const updates = [];
    const params = [];
    if (newName) { params.push(newName); updates.push(`name = $${params.length}`); }
    if (newRole) { params.push(newRole); updates.push(`role = $${params.length}`); }
    params.push(id);
    await pool.query(`UPDATE users SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`, params);

    await auditLog(req.user.id, "update_user", "user", id, getClientIp(req));
    res.json({ success: true, message: "User updated successfully" });
  } catch (err) {
    console.error("Update user error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/users/:id — soft delete with superadmin hierarchy rules
router.delete("/:id", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const id = req.params.id;
  if (id === req.user.id) {
    return res.status(400).json({ success: false, message: "You cannot delete your own account" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, role, created_by FROM users WHERE id = $1 AND is_active = 1 LIMIT 1",
      [id]
    );
    const target = rows[0];
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isParent = await isParentSuperAdmin(req.user);
    if (target.role === "superadmin" && !isParent) {
      return res.status(403).json({ success: false, message: "Only the parent super admin can delete super admin accounts" });
    }

    const { rows: parentRows } = await pool.query(
      "SELECT id FROM users WHERE role = 'superadmin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1"
    );
    if (parentRows[0] && target.id === parentRows[0].id) {
      return res.status(403).json({ success: false, message: "The parent super admin account cannot be deleted" });
    }
    if (target.role === "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({ success: false, message: "Only super admin can delete admin users" });
    }

    await pool.query("UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = $1", [id]);
    await auditLog(req.user.id, "delete_user", "user", id, getClientIp(req));
    res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete user error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/users/:id/avatar — multipart avatar upload → R2
router.post("/:id/avatar", authenticate, upload.single("avatar"), async (req, res) => {
  const id = req.params.id;
  if (req.user.id !== id && !["admin", "superadmin"].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded or upload error" });
  }

  const { url, error } = await storeImage(req.file, "avatars", 2 * 1024 * 1024);
  if (error) {
    return res.status(error.includes("not configured") ? 500 : 400).json({ success: false, message: error });
  }

  try {
    await pool.query("UPDATE users SET avatar = $1, updated_at = NOW() WHERE id = $2", [url, id]);
    res.json({ success: true, message: "Avatar updated", data: { avatar: url } });
  } catch (err) {
    console.error("Avatar upload error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
