const express = require("express");
const pool = require("../db/pool");
const { authenticate, requireRole } = require("../middleware/auth");
const { uuid, getClientIp, auditLog } = require("../lib/helpers");
const config = require("../config");

const router = express.Router();

// GET /api/records/baptism?search=&year=&page=&limit=
router.get("/baptism", authenticate, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const year = parseInt(req.query.year || 0, 10);
  const page = Math.max(1, parseInt(req.query.page || 1, 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || 20, 10)));
  const offset = (page - 1) * limit;

  try {
    const where = ["parish_id = $1"];
    const params = [config.parish.id];

    if (search) {
      const like = `%${search}%`;
      params.push(like, like, like, like);
      where.push(`(full_name ILIKE $${params.length - 3} OR father_name ILIKE $${params.length - 2} OR mother_name ILIKE $${params.length - 1} OR record_number ILIKE $${params.length})`);
    }
    if (year > 0) {
      params.push(year);
      where.push(`EXTRACT(YEAR FROM baptism_date) = $${params.length}`);
    }

    const whereSql = "WHERE " + where.join(" AND ");

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM baptism_records ${whereSql}`,
      params
    );
    const total = parseInt(countRows[0].total, 10);

    params.push(limit, offset);
    const { rows: items } = await pool.query(
      `SELECT * FROM baptism_records ${whereSql} ORDER BY baptism_date DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: { items, total, page, pageSize: limit, hasMore: offset + items.length < total },
    });
  } catch (err) {
    console.error("List records error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/records/baptism — admin only
router.post("/baptism", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const body = req.body || {};
  const required = ["fullName", "baptismDate", "birthDate", "fatherName", "motherName", "godfatherName", "priest", "recordNumber"];
  for (const field of required) {
    if (!body[field]) {
      return res.status(400).json({ success: false, message: `Missing required field: ${field}` });
    }
  }

  try {
    const { rows: dup } = await pool.query(
      "SELECT id FROM baptism_records WHERE record_number = $1 LIMIT 1",
      [body.recordNumber]
    );
    if (dup.length) {
      return res.status(409).json({ success: false, message: "Record number already exists" });
    }

    const id = uuid();
    await pool.query(
      `INSERT INTO baptism_records
       (id, full_name, baptism_date, birth_date, father_name, mother_name,
        godfather_name, godmother_name, priest, location, record_number, parish_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id, body.fullName, body.baptismDate, body.birthDate, body.fatherName,
        body.motherName, body.godfatherName, body.godmotherName || null,
        body.priest, body.location || config.parish.name, body.recordNumber,
        config.parish.id, req.user.id,
      ]
    );

    await auditLog(req.user.id, "create_record", "baptism_record", id, getClientIp(req));
    res.status(201).json({ success: true, message: "Record created", data: { id } });
  } catch (err) {
    console.error("Create record error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
