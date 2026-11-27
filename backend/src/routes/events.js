const express = require("express");
const pool = require("../db/pool");
const { authenticate, requireRole } = require("../middleware/auth");
const { uuid, getClientIp, auditLog } = require("../lib/helpers");
const config = require("../config");

const router = express.Router();
router.use(authenticate);

const EVENT_TYPES = new Set(["mass", "meeting", "wedding", "fiesta", "celebration", "other"]);
const RECURRENCES = new Set(["none", "daily", "weekly", "monthly", "yearly"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseEventBody(req, res) {
  const b = req.body || {};
  const title = String(b.title || "").trim().slice(0, 200);
  if (!title) {
    res.status(400).json({ success: false, message: "Title is required" });
    return null;
  }
  const eventDate = String(b.event_date || "").trim();
  if (!DATE_RE.test(eventDate)) {
    res.status(400).json({ success: false, message: "event_date must be YYYY-MM-DD" });
    return null;
  }
  const recurrence = RECURRENCES.has(b.recurrence) ? b.recurrence : "none";
  const recurrenceEnd = DATE_RE.test(String(b.recurrence_end || "")) ? String(b.recurrence_end).trim() : null;
  if (recurrence !== "none" && recurrenceEnd && recurrenceEnd < eventDate) {
    res.status(400).json({ success: false, message: "recurrence_end cannot be before event_date" });
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
    recurrence,
    recurrence_end: recurrence === "none" ? null : recurrenceEnd,
  };
}

const dayMs = 24 * 60 * 60 * 1000;
const iso = (d) => d.toISOString().slice(0, 10);

/**
 * Expand a recurring event into concrete occurrences within [from, to].
 * The anchor event_date supplies the weekday / day-of-month / month+day rule.
 * Occurrences keep the parent id so edits apply to the whole series.
 */
function expandOccurrences(ev, from, to) {
  const start = String(ev.event_date).slice(0, 10);
  const end = ev.recurrence_end ? String(ev.recurrence_end).slice(0, 10) : null;
  const lo = start > from ? start : from;
  const hi = end && end < to ? end : to;
  if (hi < lo) return [];

  const anchor = new Date(`${start}T00:00:00Z`);
  const cur = new Date(`${lo}T00:00:00Z`);
  const stop = new Date(`${hi}T00:00:00Z`);
  const out = [];
  const MAX = 370;
  const push = (d) => out.push({ ...ev, event_date: iso(d) });

  if (ev.recurrence === "daily") {
    while (cur <= stop && out.length < MAX) { push(cur); cur.setUTCDate(cur.getUTCDate() + 1); }
  } else if (ev.recurrence === "weekly") {
    // snap forward to the anchor weekday
    cur.setUTCDate(cur.getUTCDate() + ((anchor.getUTCDay() - cur.getUTCDay() + 7) % 7));
    while (cur <= stop && out.length < MAX) { push(cur); cur.setUTCDate(cur.getUTCDate() + 7); }
  } else if (ev.recurrence === "monthly") {
    const dom = anchor.getUTCDate();
    while (cur <= stop && out.length < MAX) {
      if (cur.getUTCDate() === dom && cur >= new Date(`${start}T00:00:00Z`)) push(cur);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  } else if (ev.recurrence === "yearly") {
    const m = anchor.getUTCMonth();
    const dom = anchor.getUTCDate();
    while (cur <= stop && out.length < MAX) {
      if (cur.getUTCMonth() === m && cur.getUTCDate() === dom && cur >= anchor) push(cur);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  return out;
}

// GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD — parish events for all members
router.get("/", async (req, res) => {
  try {
    const from = DATE_RE.test(String(req.query.from || "")) ? String(req.query.from) : "0001-01-01";
    const to = DATE_RE.test(String(req.query.to || "")) ? String(req.query.to) : "9999-12-31";
    const { rows } = await pool.query(
      `SELECT e.*, u.name AS created_by_name
       FROM parish_events e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.parish_id = $1 AND (
         (e.recurrence = 'none' AND e.event_date >= $2 AND e.event_date <= $3)
         OR (e.recurrence <> 'none' AND e.event_date <= $3
             AND (e.recurrence_end IS NULL OR e.recurrence_end >= $2))
       )
       ORDER BY e.event_date ASC, e.start_time ASC NULLS FIRST`,
      [config.parish.id, from, to]
    );
    const expanded = rows.flatMap((ev) =>
      ev.recurrence === "none" ? [ev] : expandOccurrences(ev, from, to)
    );
    expanded.sort((a, b) =>
      String(a.event_date).localeCompare(String(b.event_date))
      || String(a.start_time || "").localeCompare(String(b.start_time || ""))
      || String(a.title).localeCompare(String(b.title)));
    res.json({ success: true, data: expanded });
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
         (id, parish_id, title, description, event_type, event_date, start_time, end_time, location, is_all_day,
          recurrence, recurrence_end, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [id, config.parish.id, v.title, v.description, v.event_type, v.event_date,
       v.start_time, v.end_time, v.location, v.is_all_day,
       v.recurrence, v.recurrence_end, req.user.id]
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
         start_time=$6, end_time=$7, location=$8, is_all_day=$9,
         recurrence=$10, recurrence_end=$11, updated_at=now()
       WHERE id=$1 AND parish_id=$12
       RETURNING *`,
      [req.params.id, v.title, v.description, v.event_type, v.event_date,
       v.start_time, v.end_time, v.location, v.is_all_day,
       v.recurrence, v.recurrence_end, config.parish.id]
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
