const express = require("express");
const pool = require("../db/pool");
const config = require("../config");
const { authenticate, requireRole } = require("../middleware/auth");
const { uuid, getClientIp, auditLog } = require("../lib/helpers");

const router = express.Router();

const RECORD_FIELDS = [
  "name", "birthday", "parents_name", "baptized_by", "canonical_book",
  "baptismal_date", "godparents_name", "confirmed_by", "confirmbook_no",
  "confirmed_date", "confirm_sponsor",
];

/** Expand a yyyy-MM-dd birthday into the text formats used in legacy records. */
function birthdayVariants(birthday) {
  const d = new Date(birthday);
  if (isNaN(d.getTime())) return null;
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const iso = d.toISOString().slice(0, 10);
  const withComma = `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  const withoutComma = `${months[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
  return [iso, withComma, withoutComma];
}

function recordsEnabled(res) {
  if (config.features.records === "off") {
    res.status(404).json({ success: false, message: "Sacramental records are not enabled for this parish" });
    return false;
  }
  return true;
}

// GET /api/sacraments?search=&birthday=&page=&limit=
// Parishioners see only records matching their own name; admin/superadmin search all.
router.get("/", authenticate, async (req, res) => {
  if (!recordsEnabled(res)) return;

  const search = String(req.query.search || "").trim();
  const birthday = String(req.query.birthday || "").trim();
  const page = Math.max(1, parseInt(req.query.page || 1, 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || 20, 10)));
  const offset = (page - 1) * limit;

  const canSeeAll = ["admin", "superadmin"].includes(req.user.role);

  try {
    const where = [];
    const params = [];

    if (!canSeeAll) {
      params.push(req.user.name);
      where.push(`LOWER(name) = LOWER($${params.length})`);
    } else {
      if (search) {
        params.push(`%${search}%`);
        where.push(`name ILIKE $${params.length}`);
      }
      if (birthday) {
        const variants = birthdayVariants(birthday);
        if (variants) {
          params.push(variants[0], variants[1], variants[2]);
          where.push(`(birthday = $${params.length - 2} OR birthday = $${params.length - 1} OR birthday = $${params.length})`);
        }
      }
    }

    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM sacramental_records ${whereSql}`,
      params
    );
    const total = parseInt(countRows[0].total, 10);

    params.push(limit, offset);
    const { rows: items } = await pool.query(
      `SELECT id, name, birthday, parents_name, baptized_by, canonical_book,
              baptismal_date, godparents_name, confirmed_by, confirmbook_no,
              confirmed_date, confirm_sponsor
       FROM sacramental_records ${whereSql}
       ORDER BY name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: { items, total, page, pageSize: limit, hasMore: offset + items.length < total },
    });
  } catch (err) {
    console.error("Sacraments search error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/sacraments/:id
router.get("/:id", authenticate, async (req, res) => {
  if (!recordsEnabled(res)) return;
  try {
    const { rows } = await pool.query("SELECT * FROM sacramental_records WHERE id = $1 LIMIT 1", [req.params.id]);
    const record = rows[0];
    if (!record) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    if (!["admin", "superadmin"].includes(req.user.role)) {
      if ((record.name || "").toLowerCase() !== req.user.name.toLowerCase()) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }

    res.json({ success: true, data: record });
  } catch (err) {
    console.error("Get sacrament error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/sacraments — admin creates a record
router.post("/", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  if (!recordsEnabled(res)) return;
  const body = req.body || {};
  if (!String(body.name || "").trim()) {
    return res.status(400).json({ success: false, message: "name is required" });
  }
  try {
    const id = uuid();
    const values = RECORD_FIELDS.map((f) => (body[f] != null && String(body[f]).trim() !== "" ? String(body[f]).trim() : null));
    await pool.query(
      `INSERT INTO sacramental_records (${RECORD_FIELDS.join(", ")}, id, created_by)
       VALUES (${RECORD_FIELDS.map((_, i) => `$${i + 1}`).join(", ")}, $${RECORD_FIELDS.length + 1}, $${RECORD_FIELDS.length + 2})`,
      [...values, id, req.user.id]
    );
    await auditLog(req.user.id, "create_sacrament_record", "sacramental_record", id, getClientIp(req));
    res.status(201).json({ success: true, message: "Record created", data: { id } });
  } catch (err) {
    console.error("Create sacrament error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/sacraments/:id — admin updates a record
router.put("/:id", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  if (!recordsEnabled(res)) return;
  const body = req.body || {};
  const sets = [];
  const params = [];
  for (const f of RECORD_FIELDS) {
    if (body[f] !== undefined) {
      params.push(String(body[f]).trim() || null);
      sets.push(`${f} = $${params.length}`);
    }
  }
  if (!sets.length) {
    return res.status(400).json({ success: false, message: "Nothing to update" });
  }
  try {
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE sacramental_records SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`,
      params
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
    await auditLog(req.user.id, "update_sacrament_record", "sacramental_record", req.params.id, getClientIp(req));
    res.json({ success: true, message: "Record updated" });
  } catch (err) {
    console.error("Update sacrament error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/sacraments/:id — admin deletes a record
router.delete("/:id", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  if (!recordsEnabled(res)) return;
  try {
    const result = await pool.query("DELETE FROM sacramental_records WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
    await auditLog(req.user.id, "delete_sacrament_record", "sacramental_record", req.params.id, getClientIp(req));
    res.json({ success: true, message: "Record deleted" });
  } catch (err) {
    console.error("Delete sacrament error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
