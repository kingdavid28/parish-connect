const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const pool = require("../db/pool");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email = ? AND is_active = 1 LIMIT 1",
      [email.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Update last login
    await pool.query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);

    // Log the action
    await pool.query(
      "INSERT INTO audit_logs (id, user_id, action, ip_address) VALUES (?, ?, 'login', ?)",
      [uuidv4(), user.id, req.ip]
    );

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, parishId: user.parish_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    const { password_hash, ...safeUser } = user;

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: safeUser.id,
          name: safeUser.name,
          email: safeUser.email,
          role: safeUser.role,
          parishId: safeUser.parish_id,
          avatar: safeUser.avatar,
          memberSince: safeUser.member_since,
          lastLogin: safeUser.last_login,
        },
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/auth/me — verify token and return current user
router.get("/me", authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, role, parish_id, avatar, member_since, last_login FROM users WHERE id = ? AND is_active = 1 LIMIT 1",
      [req.user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = rows[0];
    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        parishId: user.parish_id,
        avatar: user.avatar,
        memberSince: user.member_since,
        lastLogin: user.last_login,
      },
    });
  } catch (err) {
    console.error("Auth me error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
