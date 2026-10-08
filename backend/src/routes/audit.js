const express = require("express");
const pool = require("../db/pool");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/audit?page=&limit=&action=&user_id=&from=&to=
router.get("/", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 50, 10)));
  const offset = (page - 1) * limit;
  const action = String(req.query.action || "").trim();
  const userId = String(req.query.user_id || "").trim();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();

  try {
    const where = [];
    const params = [];

    if (action) {
      params.push(action);
      where.push(`al.action = $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      where.push(`al.user_id = $${params.length}`);
    }
    if (from) {
      params.push(from + " 00:00:00");
      where.push(`al.created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to + " 23:59:59");
      where.push(`al.created_at <= $${params.length}`);
    }

    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS c FROM audit_logs al ${whereSql}`,
      params
    );
    const total = parseInt(countRows[0].c, 10);

    params.push(limit, offset);
    const { rows: logs } = await pool.query(
      `SELECT al.id, al.action, al.target_type, al.target_id,
              al.ip_address, al.created_at,
              u.name AS user_name, u.email AS user_email, u.role AS user_role,
              t.name AS target_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN users t ON t.id = al.target_id AND al.target_type = 'user'
       ${whereSql}
       ORDER BY al.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: actionRows } = await pool.query("SELECT DISTINCT action FROM audit_logs ORDER BY action ASC");

    res.json({
      success: true,
      data: {
        logs,
        total,
        page,
        limit,
        hasMore: offset + logs.length < total,
        actions: actionRows.map((r) => r.action),
      },
    });
  } catch (err) {
    console.error("listAuditLogs error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
