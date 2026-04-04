const express = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const pool = require("../db/pool");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/users — list users (admin+)
router.get("/", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    let query = `
      SELECT id, name, email, role, parish_id, avatar, member_since, last_login, created_by, is_active
      FROM users WHERE is_active = 1
    `;
    const params = [];

    // Regular admins cannot see superadmin
    if (req.user.role === "admin") {
      query += " AND role != 'superadmin'";
    }

    query += " ORDER BY created_at DESC";

    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Get users error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/users — create user (admin+)
router.post("/", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const { name, email, password, role, parishId } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: "name, email, password and role are required" });
  }

  // Only superadmin can create admins
  if (role === "admin" && req.user.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Only super admin can create admin users" });
  }

  if (!["admin", "parishioner"].includes(role)) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
  }

  try {
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email.toLowerCase().trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = uuidv4();

    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, parish_id, created_by, member_since)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [id, name.trim(), email.toLowerCase().trim(), passwordHash, role, parishId || "st-marys", req.user.id]
    );

    await pool.query(
      "INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address) VALUES (?, ?, 'create_user', 'user', ?, ?)",
      [uuidv4(), req.user.id, id, req.ip]
    );

    res.status(201).json({ success: true, message: "User created successfully", data: { id } });
  } catch (err) {
    console.error("Create user error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/users/:id — delete user (admin+)
router.delete("/:id", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const { id } = req.params;

  if (id === req.user.id) {
    return res.status(400).json({ success: false, message: "You cannot delete your own account" });
  }

  try {
    const [rows] = await pool.query("SELECT id, role FROM users WHERE id = ? AND is_active = 1 LIMIT 1", [id]);
    const target = rows[0];

    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Cannot delete superadmin
    if (target.role === "superadmin") {
      return res.status(403).json({ success: false, message: "Cannot delete super admin" });
    }

    // Admin cannot delete other admins
    if (target.role === "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({ success: false, message: "Only super admin can delete admin users" });
    }

    // Soft delete
    await pool.query("UPDATE users SET is_active = 0 WHERE id = ?", [id]);

    await pool.query(
      "INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address) VALUES (?, ?, 'delete_user', 'user', ?, ?)",
      [uuidv4(), req.user.id, id, req.ip]
    );

    res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete user error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
