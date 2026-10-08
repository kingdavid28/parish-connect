const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const config = require("../config");
const { authenticate } = require("../middleware/auth");
const { uuid, getClientIp, auditLog, esc } = require("../lib/helpers");
const { awardPoints } = require("../lib/rewards");
const { sendEmail } = require("../lib/mailer");
const { findSacramentRecord } = require("../lib/sacramentLookup");

const router = express.Router();

// ── Brute-force protection: max 10 failed attempts per IP+email per 15 min ──
const loginFails = new Map(); // key -> { count, resetAt }
function failKey(req, email) {
  const ip = getClientIp(req);
  return `${ip}|${email}`;
}
function tooManyFails(key) {
  const rec = loginFails.get(key);
  return !!rec && rec.count >= 10 && rec.resetAt > Date.now();
}
function recordFail(key) {
  const rec = loginFails.get(key);
  if (!rec || rec.resetAt <= Date.now()) {
    loginFails.set(key, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  } else {
    rec.count++;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_OK = (p) => p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p);

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  parishId: u.parish_id,
  avatar: u.avatar,
  memberSince: u.member_since,
  lastLogin: u.last_login,
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  const key = failKey(req, email);
  if (tooManyFails(key)) {
    return res.status(429).json({ success: false, message: "Too many failed attempts. Please try again in 15 minutes." });
  }

  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND is_active = 1 LIMIT 1",
      [email]
    );
    const user = rows[0];

    // PHP password_hash produces $2y$ hashes — bcryptjs wants $2a$/$2b$
    const ok = user && (await bcrypt.compare(password, user.password_hash.replace(/^\$2y\$/, "$2b$")));

    if (!ok) {
      recordFail(key);
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    loginFails.delete(key);

    await pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);
    await awardPoints(user.id, "daily_login");
    await auditLog(user.id, "login", null, null, getClientIp(req));

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, parishId: user.parish_id },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresSeconds }
    );

    res.json({ success: true, data: { token, user: publicUser(user) } });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const birthday = String(req.body?.birthday || "").trim();
  const fatherFirstName = String(req.body?.fatherFirstName || "").trim();

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Name, email and password are required" });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, message: "Invalid email address" });
  }
  if (!PASSWORD_OK(password)) {
    return res.status(400).json({ success: false, message: "Password must contain uppercase, lowercase and a number" });
  }

  // Identity verification against sacramental records (if enabled)
  if (config.verifyParishRecords && config.features.records === "internal") {
    if (!fatherFirstName) {
      return res.status(400).json({ success: false, message: "Father's first name is required for verification" });
    }
    try {
      const sacRecord = await findSacramentRecord(name, birthday);
      if (!sacRecord) {
        return res.status(403).json({
          success: false,
          message: "Your name was not found in the parish records. Please use the exact name as it appears in the sacramental records.",
        });
      }
      const parentsName = String(sacRecord.parents_name || "").toLowerCase();
      if (!parentsName || !parentsName.includes(fatherFirstName.toLowerCase())) {
        return res.status(403).json({
          success: false,
          message: "The father's first name does not match our records. Please try again.",
        });
      }
    } catch (err) {
      console.error("Sacrament verification error:", err.message);
      return res.status(500).json({ success: false, message: "Unable to verify parish records. Please try again later." });
    }
  }

  try {
    const { rows: dup } = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
    if (dup.length) {
      return res.status(409).json({ success: false, message: "An account with this email already exists" });
    }

    const id = uuid();
    const hash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, parish_id, member_since)
       VALUES ($1, $2, $3, $4, 'parishioner', $5, CURRENT_DATE)`,
      [id, name, email, hash, config.parish.id]
    );

    await auditLog(id, "register", null, null, getClientIp(req));

    res.status(201).json({ success: true, message: "Account created successfully" });

    // Welcome email (best-effort, non-blocking)
    sendEmail(
      email,
      "Welcome to Parish Connect 🙏",
      `<p>Dear ${esc(name)},</p>` +
        `<p>Welcome to <strong>Parish Connect</strong> — your ${esc(config.parish.name)} community app.</p>` +
        `<p>You can now log in and connect with fellow parishioners, view sacramental records, earn GBless points, and more.</p>` +
        `<p>God bless you!</p><p>— ${esc(config.parish.name)}</p>`,
      name
    ).catch(() => {});
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/auth/me
router.get("/me", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, role, parish_id, avatar, member_since, last_login FROM users WHERE id = $1 AND is_active = 1 LIMIT 1",
      [req.user.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: publicUser(rows[0]) });
  } catch (err) {
    console.error("Auth me error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/auth/password — change own password
router.post("/password", authenticate, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: "Current and new password are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: "New password must be at least 8 characters" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1 AND is_active = 1 LIMIT 1",
      [req.user.id]
    );
    const ok = rows[0] && (await bcrypt.compare(currentPassword, rows[0].password_hash.replace(/^\$2y\$/, "$2b$")));
    if (!ok) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [hash, req.user.id]);
    await auditLog(req.user.id, "change_password", null, null, getClientIp(req));

    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/auth/forgot-password — reset via sacramental-record identity check
router.post("/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const name = String(req.body?.name || "").trim();
  const birthday = String(req.body?.birthday || "").trim();
  const fatherFirstName = String(req.body?.fatherFirstName || "").trim();
  const newPassword = String(req.body?.newPassword || "");

  if (!email || !name || !birthday || !fatherFirstName || !newPassword) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }
  if (!PASSWORD_OK(newPassword)) {
    return res.status(400).json({ success: false, message: "Password must contain uppercase, lowercase and a number" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, name FROM users WHERE email = $1 AND is_active = 1 LIMIT 1",
      [email]
    );
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ success: false, message: "No account found with this email address" });
    }

    if (isNaN(new Date(birthday).getTime())) {
      return res.status(400).json({ success: false, message: "Invalid birthday format" });
    }

    const sacRecord = await findSacramentRecord(name, birthday);
    if (!sacRecord) {
      return res.status(403).json({ success: false, message: "Identity verification failed. Name and birthday do not match parish records." });
    }
    const parentsName = String(sacRecord.parents_name || "").toLowerCase();
    if (!parentsName || !parentsName.includes(fatherFirstName.toLowerCase())) {
      return res.status(403).json({ success: false, message: "Identity verification failed. Father's first name does not match." });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [hash, user.id]);
    await auditLog(user.id, "forgot_password_reset", null, null, getClientIp(req));

    res.json({ success: true, message: "Password reset successfully. You can now log in with your new password." });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
