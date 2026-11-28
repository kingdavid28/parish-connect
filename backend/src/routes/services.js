const express = require("express");
const pool = require("../db/pool");
const { authenticate, requireRole } = require("../middleware/auth");
const { uuid, getClientIp, auditLog } = require("../lib/helpers");
const { createInAppNotification, sendWebPushToUser } = require("../lib/push");
const config = require("../config");

const router = express.Router();
router.use(authenticate);

const TYPES = new Set(["mass_intention", "baptism", "confirmation", "marriage", "funeral", "blessing", "other"]);
const INTENTION_CATEGORIES = new Set(["thanksgiving", "deceased", "healing", "special"]);
const STATUSES = new Set(["pending", "approved", "scheduled", "completed", "declined"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const TYPE_LABELS = {
  mass_intention: "Mass Intention",
  baptism: "Baptism",
  confirmation: "Confirmation",
  marriage: "Marriage",
  funeral: "Funeral Service",
  blessing: "Blessing",
  other: "Service Request",
};

function parseRequestBody(req, res) {
  const b = req.body || {};
  const type = String(b.type || "").trim();
  if (!TYPES.has(type)) {
    res.status(400).json({ success: false, message: "Invalid request type" });
    return null;
  }
  const personName = String(b.person_name || "").trim().slice(0, 200);
  const intentionText = String(b.intention_text || "").trim().slice(0, 1000);
  const preferredDate = DATE_RE.test(String(b.preferred_date || "")) ? String(b.preferred_date) : null;
  const preferredTime = TIME_RE.test(String(b.preferred_time || "")) ? String(b.preferred_time).slice(0, 5) : null;
  const contactPhone = String(b.contact_phone || "").trim().slice(0, 32) || null;
  const notes = String(b.notes || "").trim().slice(0, 1000) || null;
  let intentionCategory = null;

  if (type === "mass_intention") {
    intentionCategory = INTENTION_CATEGORIES.has(b.intention_category) ? b.intention_category : null;
    if (!intentionCategory) {
      res.status(400).json({ success: false, message: "Intention category is required" });
      return null;
    }
    if (!personName) {
      res.status(400).json({ success: false, message: "Enter who the mass is offered for" });
      return null;
    }
  } else if (!personName) {
    res.status(400).json({ success: false, message: "Person/subject name is required" });
    return null;
  }
  if (!preferredDate) {
    res.status(400).json({ success: false, message: "Preferred date is required" });
    return null;
  }
  return { type, intention_category: intentionCategory, person_name: personName, intention_text: intentionText || null, preferred_date: preferredDate, preferred_time: preferredTime, contact_phone: contactPhone, notes };
}

// POST /api/services — member submits a mass intention / service request
router.post("/", async (req, res) => {
  const v = parseRequestBody(req, res);
  if (!v) return;
  try {
    const id = uuid();
    const { rows } = await pool.query(
      `INSERT INTO service_requests
         (id, parish_id, user_id, type, intention_category, person_name, intention_text, preferred_date, preferred_time, contact_phone, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [id, config.parish.id, req.user.id, v.type, v.intention_category, v.person_name,
       v.intention_text, v.preferred_date, v.preferred_time, v.contact_phone, v.notes]
    );
    await auditLog(req.user.id, "submit_service_request", "service_request", id, getClientIp(req));
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Submit service request error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/services/my — the member's own requests
router.get("/my", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.name AS reviewed_by_name
       FROM service_requests r
       LEFT JOIN users u ON u.id = r.reviewed_by
       WHERE r.user_id = $1 AND r.parish_id = $2
       ORDER BY r.created_at DESC`,
      [req.user.id, config.parish.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("My service requests error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/services?status=&type= — admin review queue
router.get("/", requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const where = ["r.parish_id = $1"];
    const params = [config.parish.id];
    if (STATUSES.has(req.query.status)) {
      params.push(req.query.status);
      where.push(`r.status = $${params.length}`);
    }
    if (TYPES.has(req.query.type)) {
      params.push(req.query.type);
      where.push(`r.type = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT r.*, u.name AS requester_name, u.email AS requester_email, u2.name AS reviewed_by_name
       FROM service_requests r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN users u2 ON u2.id = r.reviewed_by
       WHERE ${where.join(" AND ")}
       ORDER BY r.created_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("List service requests error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/services/:id — admin updates status/admin notes; notifies the requester
router.put("/:id", requireRole("admin", "superadmin"), async (req, res) => {
  const status = String(req.body?.status || "").trim();
  if (!STATUSES.has(status) || status === "pending") {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }
  const adminNotes = String(req.body?.admin_notes || "").trim().slice(0, 1000) || null;
  try {
    const { rows } = await pool.query(
      `UPDATE service_requests SET
         status=$2, admin_notes=COALESCE($3, admin_notes), reviewed_by=$4, reviewed_at=now(), updated_at=now()
       WHERE id=$1 AND parish_id=$5
       RETURNING *`,
      [req.params.id, status, adminNotes, req.user.id, config.parish.id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ success: false, message: "Request not found" });
    await auditLog(req.user.id, `service_request_${status}`, "service_request", row.id, getClientIp(req));

    // Notify the requester — in-app + push, best-effort.
    try {
      const label = TYPE_LABELS[row.type] || "Service request";
      const payload = {
        category: "services",
        title: `${label} ${status}`,
        body: `${label} for ${row.person_name || "your request"} is now ${status}.${row.admin_notes ? ` Note: ${row.admin_notes}` : ""}`.slice(0, 500),
        url: "/services",
      };
      await createInAppNotification(row.user_id, payload);
      await sendWebPushToUser(row.user_id, payload);
    } catch (notifyErr) {
      console.error("Service notification error:", notifyErr.message);
    }
    res.json({ success: true, data: row });
  } catch (err) {
    console.error("Update service request error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/services/:id — member cancels their own pending request
router.delete("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM service_requests
       WHERE id = $1 AND parish_id = $2 AND ((status = 'pending' AND user_id = $3) OR $4 IN ('admin','superadmin'))
       RETURNING id`,
      [req.params.id, config.parish.id, req.user.id, req.user.role]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: "Request not found or already reviewed" });
    await auditLog(req.user.id, "delete_service_request", "service_request", req.params.id, getClientIp(req));
    res.json({ success: true, message: "Request cancelled" });
  } catch (err) {
    console.error("Delete service request error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
