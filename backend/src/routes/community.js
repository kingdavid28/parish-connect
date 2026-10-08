const express = require("express");
const pool = require("../db/pool");
const { authenticate, requireRole } = require("../middleware/auth");
const { uuid } = require("../lib/helpers");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ═══ FAMILY GROUPS ═══

// GET /api/community/families
router.get("/families", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT fg.id, fg.name, fg.description, fg.created_by, fg.created_at,
              u.name AS created_by_name,
              COUNT(fgm.user_id) AS member_count,
              MAX(CASE WHEN fgm.user_id = $1 THEN 1 ELSE 0 END) AS is_member
       FROM family_groups fg
       JOIN users u ON u.id = fg.created_by
       LEFT JOIN family_group_members fgm ON fgm.group_id = fg.id
       GROUP BY fg.id, u.name
       ORDER BY fg.name ASC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("listFamilyGroups error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/community/families — admin only
router.post("/families", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const desc = String(req.body?.description || "").trim().slice(0, 500);
  if (!name) {
    return res.status(400).json({ success: false, message: "Group name is required" });
  }
  try {
    const id = uuid();
    await pool.query(
      "INSERT INTO family_groups (id, name, description, created_by) VALUES ($1, $2, $3, $4)",
      [id, name, desc || null, req.user.id]
    );
    res.status(201).json({ success: true, message: "Family group created", data: { id } });
  } catch (err) {
    console.error("createFamilyGroup error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/community/families/:id
router.get("/families/:id", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT fg.*, u.name AS created_by_name FROM family_groups fg
       JOIN users u ON u.id = fg.created_by WHERE fg.id = $1 LIMIT 1`,
      [req.params.id]
    );
    const data = rows[0];
    if (!data) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }
    const { rows: members } = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.role, fgm.relationship, fgm.joined_at
       FROM family_group_members fgm
       JOIN users u ON u.id = fgm.user_id AND u.is_active = 1
       WHERE fgm.group_id = $1
       ORDER BY fgm.joined_at ASC`,
      [req.params.id]
    );
    data.members = members;
    res.json({ success: true, data });
  } catch (err) {
    console.error("getFamilyGroup error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/community/families/:id — admin only
router.put("/families/:id", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const desc = String(req.body?.description || "").trim().slice(0, 500);
  if (!name) {
    return res.status(400).json({ success: false, message: "Group name is required" });
  }
  try {
    await pool.query("UPDATE family_groups SET name = $1, description = $2 WHERE id = $3", [name, desc || null, req.params.id]);
    res.json({ success: true, message: "Family group updated" });
  } catch (err) {
    console.error("updateFamilyGroup error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/community/families/:id — admin only
router.delete("/families/:id", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM family_groups WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: "Family group deleted" });
  } catch (err) {
    console.error("deleteFamilyGroup error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

const VALID_RELATIONSHIPS = ["parent", "child", "spouse", "sibling", "grandparent", "grandchild", "relative", "other"];

// POST /api/community/families/:id/members — admin only
router.post("/families/:id/members", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const memberId = String(req.body?.user_id || "").trim();
  const relationship = String(req.body?.relationship || "").trim();

  if (!memberId) {
    return res.status(400).json({ success: false, message: "user_id is required" });
  }
  if (relationship && !VALID_RELATIONSHIPS.includes(relationship)) {
    return res.status(400).json({ success: false, message: "Invalid relationship" });
  }
  try {
    await pool.query(
      `INSERT INTO family_group_members (group_id, user_id, relationship) VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [req.params.id, memberId, relationship || "other"]
    );
    res.json({ success: true, message: "Member added to family group" });
  } catch (err) {
    console.error("addFamilyMember error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/community/families/:id/members — admin only
router.delete("/families/:id/members", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const memberId = String(req.body?.user_id || "").trim();
  if (!memberId) {
    return res.status(400).json({ success: false, message: "user_id is required" });
  }
  try {
    await pool.query("DELETE FROM family_group_members WHERE group_id = $1 AND user_id = $2", [req.params.id, memberId]);
    res.json({ success: true, message: "Member removed from family group" });
  } catch (err) {
    console.error("removeFamilyMember error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ═══ MINISTRIES ═══

// GET /api/community/ministries
router.get("/ministries", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.id, m.name, m.description, m.schedule, m.contact_name, m.contact_email,
              m.created_by, m.created_at,
              COUNT(mm.user_id) AS member_count,
              MAX(CASE WHEN mm.user_id = $1 THEN 1 ELSE 0 END) AS is_member
       FROM ministries m
       LEFT JOIN ministry_members mm ON mm.ministry_id = m.id
       GROUP BY m.id
       ORDER BY m.name ASC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("listMinistries error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/community/ministries — admin only
router.post("/ministries", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const desc = String(req.body?.description || "").trim().slice(0, 1000);
  const schedule = String(req.body?.schedule || "").trim().slice(0, 255);
  const contactName = String(req.body?.contact_name || "").trim().slice(0, 100);
  const contactEmail = String(req.body?.contact_email || "").trim();

  if (!name) {
    return res.status(400).json({ success: false, message: "Ministry name is required" });
  }
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    return res.status(400).json({ success: false, message: "Invalid contact email" });
  }
  try {
    const id = uuid();
    await pool.query(
      `INSERT INTO ministries (id, name, description, schedule, contact_name, contact_email, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, name, desc || null, schedule || null, contactName || null, contactEmail || null, req.user.id]
    );
    res.status(201).json({ success: true, message: "Ministry created", data: { id } });
  } catch (err) {
    console.error("createMinistry error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/community/ministries/:id
router.get("/ministries/:id", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM ministries WHERE id = $1 LIMIT 1", [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: "Ministry not found" });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("getMinistry error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/community/ministries/:id — admin only
router.put("/ministries/:id", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const desc = String(req.body?.description || "").trim().slice(0, 1000);
  const schedule = String(req.body?.schedule || "").trim().slice(0, 255);
  const contactName = String(req.body?.contact_name || "").trim().slice(0, 100);
  const contactEmail = String(req.body?.contact_email || "").trim();

  if (!name) {
    return res.status(400).json({ success: false, message: "Ministry name is required" });
  }
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    return res.status(400).json({ success: false, message: "Invalid contact email" });
  }
  try {
    await pool.query(
      "UPDATE ministries SET name=$1, description=$2, schedule=$3, contact_name=$4, contact_email=$5 WHERE id=$6",
      [name, desc || null, schedule || null, contactName || null, contactEmail || null, req.params.id]
    );
    res.json({ success: true, message: "Ministry updated" });
  } catch (err) {
    console.error("updateMinistry error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/community/ministries/:id — admin only
router.delete("/ministries/:id", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM ministries WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: "Ministry deleted" });
  } catch (err) {
    console.error("deleteMinistry error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/community/ministries/:id/join
router.post("/ministries/:id/join", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id FROM ministries WHERE id = $1 LIMIT 1", [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: "Ministry not found" });
    }
    await pool.query(
      "INSERT INTO ministry_members (ministry_id, user_id) VALUES ($1, $2) ON CONFLICT (ministry_id, user_id) DO NOTHING",
      [req.params.id, req.user.id]
    );
    res.json({ success: true, message: "Joined ministry" });
  } catch (err) {
    console.error("joinMinistry error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/community/ministries/:id/leave
router.delete("/ministries/:id/leave", authenticate, async (req, res) => {
  try {
    await pool.query("DELETE FROM ministry_members WHERE ministry_id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true, message: "Left ministry" });
  } catch (err) {
    console.error("leaveMinistry error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/community/ministries/:id/members
router.get("/ministries/:id/members", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.role, mm.joined_at
       FROM ministry_members mm
       JOIN users u ON u.id = mm.user_id AND u.is_active = 1
       WHERE mm.ministry_id = $1
       ORDER BY mm.joined_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("getMinistryMembers error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
