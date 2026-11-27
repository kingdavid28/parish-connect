const express = require("express");
const pool = require("../db/pool");
const { authenticate, requireRole } = require("../middleware/auth");
const { uuid, getClientIp, auditLog } = require("../lib/helpers");
const config = require("../config");

const router = express.Router();
router.use(authenticate);

const EVENT_TYPES = new Set(["mass", "meeting", "wedding", "fiesta", "celebration", "other"]);

function parseEventBody(req, res) {
  const b = req.body || {};
  const title = String(b.title || "").trim().slice(0, 200);
  if (!title) {
    res.status(400).json({ success: false, message: "Title is required" });
    return null;
  }
  const eventDate = String(b.event_date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    res.status(400).json({ success: false, message: "event_date must be YYYY-MM-DD" });
    return null;
  }
  const eventType = EVENT_TYPES.has(b.event_type) ? b.event_type : "other";
  const timeOk = (t) => t == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const startTime = b.start_time ? String(b.start_time).slice(0, 5) : null;
  const endTime = b.end_time ? String(b.end_time).slice(0, 5) : null;
  if (!timeOk(startTime) || !timeOk(endTime)) {
    res.status(400).json({ success: false, message: "Times must be HH:MM (24h)" });
    return null;
  }
  const isAllDay = Boolean(b.is_all_day) || !startTime;
  return {
    title,
    description: String(b.description || "").trim().slice(0, 2000) || null,
    event_type: eventType,
    event_date: eventDate,
    start_time: isAllDay ? null : startTime,
    end_time: isAllDay ? null : endTime,
    location: String(b.location || "").trim().slice(0, 200) || null,
    is_all_day: isAllDay,
  };
}

// GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD — parish events for all members
router.get("/", async (req, res) => {
  try {
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const params = [config.parish.id];
    let where = "parish_id = $1";
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      params.push(from);
      where += ` AND event_date >= $${params.length}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      params.push(to);
      where += ` AND event_date <= $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT e.*, u.name AS created_by_name
       FROM parish_events e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE ${where}
       ORDER BY e.event_date ASC, e.start_time ASC NULLS FIRST`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("List events error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/events — admin only
router.post("/", requireRole("admin", "superadmin"), async (req, res) => {
  const v = parseEventBody(req, res);
  if (!v) return;
  try {
    const id = uuid();
    const { rows } = await pool.query(
      `INSERT INTO parish_events
         (id, parish_id, title, description, event_type, event_date, start_time, end_time, location, is_all_day, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [id, config.parish.id, v.title, v.description, v.event_type, v.event_date,
       v.start_time, v.end_time, v.location, v.is_all_day, req.user.id]
    );
    await auditLog(req.user.id, "create_event", "parish_event", id, getClientIp(req));
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Create event error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/events/:id — admin only
router.put("/:id", requireRole("admin", "superadmin"), async (req, res) => {
  const v = parseEventBody(req, res);
  if (!v) return;
  try {
    const { rows } = await pool.query(
      `UPDATE parish_events SET
         title=$2, description=$3, event_type=$4, event_date=$5,
         start_time=$6, end_time=$7, location=$8, is_all_day=$9, updated_at=now()
       WHERE id=$1 AND parish_id=$10
       RETURNING *`,
      [req.params.id, v.title, v.description, v.event_type, v.event_date,
       v.start_time, v.end_time, v.location, v.is_all_day, config.parish.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: "Event not found" });
    await auditLog(req.user.id, "update_event", "parish_event", req.params.id, getClientIp(req));
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Update event error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/events/:id — admin only
router.delete("/:id", requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM parish_events WHERE id = $1 AND parish_id = $2",
      [req.params.id, config.parish.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: "Event not found" });
    await auditLog(req.user.id, "delete_event", "parish_event", req.params.id, getClientIp(req));
    res.json({ success: true, message: "Event deleted" });
  } catch (err) {
    console.error("Delete event error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
