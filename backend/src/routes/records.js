const express = require("express");
const { v4: uuidv4 } = require("uuid");
const pool = require("../db/pool");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/records/baptism
router.get("/baptism", authenticate, async (req, res) => {
  const { search = "", year = "", page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let where = "WHERE 1=1";
    const params = [];

    if (search) {
      where += " AND (full_name LIKE ? OR father_name LIKE ? OR mother_name LIKE ? OR record_number LIKE ?)";
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    if (year) {
      where += " AND YEAR(baptism_date) = ?";
      params.push(parseInt(year));
    }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM baptism_records ${where}`, params);
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `SELECT * FROM baptism_records ${where} ORDER BY baptism_date DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: {
        items: rows,
        total,
        page: parseInt(page),
        pageSize: parseInt(limit),
        hasMore: offset + rows.length < total,
      },
    });
  } catch (err) {
    console.error("Get records error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/records/baptism — admin only
router.post("/baptism", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const { fullName, baptismDate, birthDate, fatherName, motherName, godfatherName, godmotherName, priest, location, recordNumber, notes } = req.body;

  if (!fullName || !baptismDate || !birthDate || !fatherName || !motherName || !godfatherName || !priest || !recordNumber) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  try {
    const [existing] = await pool.query("SELECT id FROM baptism_records WHERE record_number = ? LIMIT 1", [recordNumber]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "Record number already exists" });
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO baptism_records (id, full_name, baptism_date, birth_date, father_name, mother_name, godfather_name, godmother_name, priest, location, record_number, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, fullName, baptismDate, birthDate, fatherName, motherName, godfatherName, godmotherName || null, priest, location || "St. Mary's Catholic Church", recordNumber, req.user.id]
    );

    await pool.query(
      "INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address) VALUES (?, ?, 'create_record', 'baptism_record', ?, ?)",
      [uuidv4(), req.user.id, id, req.ip]
    );

    res.status(201).json({ success: true, data: { id }, message: "Record created" });
  } catch (err) {
    console.error("Create record error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
