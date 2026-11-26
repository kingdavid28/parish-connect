const express = require("express");
const pool = require("../db/pool");
const { authenticate, requireRole } = require("../middleware/auth");
const { uuid, getClientIp, auditLog, activeUserExists } = require("../lib/helpers");
const config = require("../config");

const router = express.Router();

// GET /api/records/baptism?search=&year=&page=&limit=
router.get("/baptism", authenticate, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const year = Number.parseInt(req.query.year || 0, 10);
  const page = Math.max(1, Number.parseInt(req.query.page || 1, 10));
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || 20, 10)));
  const offset = (page - 1) * limit;

  const canSeeAll = ["admin", "superadmin"].includes(req.user.role);

  try {
    const where = ["b.parish_id = $1"];
    const params = [config.parish.id];

    if (!canSeeAll) {
      // Members see records linked to their account, falling back to the
      // legacy exact-name match while records are still unlinked.
      params.push(req.user.id, req.user.name);
      where.push(
        `(b.user_id = $${params.length - 1} OR (b.user_id IS NULL AND LOWER(b.full_name) = LOWER($${params.length})))`
      );
    } else if (search) {
      const like = `%${search}%`;
      params.push(like, like, like, like);
      where.push(`(b.full_name ILIKE $${params.length - 3} OR b.father_name ILIKE $${params.length - 2} OR b.mother_name ILIKE $${params.length - 1} OR b.record_number ILIKE $${params.length})`);
    }
    if (year > 0) {
      params.push(year);
      where.push(`EXTRACT(YEAR FROM b.baptism_date) = $${params.length}`);
    }

    const whereSql = "WHERE " + where.join(" AND ");

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM baptism_records b ${whereSql}`,
      params
    );
    const total = Number.parseInt(countRows[0].total, 10);

    params.push(limit, offset);
    const { rows: items } = await pool.query(
      `SELECT b.*, u.name AS linked_user_name
       FROM baptism_records b LEFT JOIN users u ON u.id = b.user_id
       ${whereSql} ORDER BY b.baptism_date DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
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

    const userId = String(body.user_id || "").trim() || null;
    if (userId && !(await activeUserExists(userId))) {
      return res.status(400).json({ success: false, message: "user_id does not match an active user account" });
    }
    const id = uuid();
    await pool.query(
      `INSERT INTO baptism_records
       (id, full_name, baptism_date, birth_date, father_name, mother_name,
        godfather_name, godmother_name, priest, location, record_number, user_id, parish_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id, body.fullName, body.baptismDate, body.birthDate, body.fatherName,
        body.motherName, body.godfatherName, body.godmotherName || null,
        body.priest, body.location || config.parish.name, body.recordNumber,
        userId, config.parish.id, req.user.id,
      ]
    );

    await auditLog(req.user.id, "create_record", "baptism_record", id, getClientIp(req));
    res.status(201).json({ success: true, message: "Record created", data: { id } });
  } catch (err) {
    console.error("Create record error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/records/certificates — admin audit-logs a certificate issuance.
// The PDF itself is generated client-side; this endpoint only records the event.
const CERT_TYPES = new Set(["baptism", "confirmation", "marriage", "death"]);
router.post("/certificates", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const type = String(req.body?.type || "").trim();
  const recordId = String(req.body?.record_id || "").trim();
  if (!CERT_TYPES.has(type) || !recordId) {
    return res.status(400).json({ success: false, message: "type and record_id are required" });
  }
  try {
    await auditLog(req.user.id, `issue_${type}_certificate`, `${type}_record`, recordId, getClientIp(req));
    res.json({ success: true, message: "Issuance logged" });
  } catch (err) {
    console.error("Certificate log error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/records/my — the member's own linked records across all registries
router.get("/my", authenticate, async (req, res) => {
  try {
    const uid = req.user.id;
    const parish = config.parish.id;
    const [baptism, sacraments, marriage, death] = await Promise.all([
      pool.query(
        "SELECT * FROM baptism_records WHERE user_id = $1 AND parish_id = $2 ORDER BY baptism_date DESC",
        [uid, parish]
      ),
      pool.query(
        "SELECT * FROM sacramental_records WHERE user_id = $1 ORDER BY name",
        [uid]
      ),
      pool.query(
        "SELECT * FROM marriage_records WHERE (user_id = $1 OR spouse_user_id = $1) AND parish_id = $2 ORDER BY marriage_date DESC",
        [uid, parish]
      ),
      pool.query(
        "SELECT * FROM death_records WHERE user_id = $1 AND parish_id = $2 ORDER BY death_date DESC",
        [uid, parish]
      ),
    ]);
    res.json({
      success: true,
      data: {
        baptism: baptism.rows,
        sacraments: sacraments.rows,
        marriage: marriage.rows,
        death: death.rows,
      },
    });
  } catch (err) {
    console.error("My records error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Typed registries (marriage / death) — shared handlers ───────────────────
// Each config declares columns, required fields, and searchable columns; the
// factory below generates list/create/update/delete/bulk routes identically.
const TYPED_REGISTRIES = {
  marriage: {
    table: "marriage_records",
    dateCol: "marriage_date",
    searchCols: ["groom_name", "bride_name", "record_number", "contract_no"],
    fields: [
      { col: "groom_name", req: true, max: 200 },
      { col: "bride_name", req: true, max: 200 },
      { col: "marriage_date", req: true, type: "date" },
      { col: "groom_father_name", max: 200 },
      { col: "groom_mother_name", max: 200 },
      { col: "bride_father_name", max: 200 },
      { col: "bride_mother_name", max: 200 },
      { col: "sponsors_names", max: 400 },
      { col: "priest", req: true, max: 200 },
      { col: "location", max: 255 },
      { col: "record_number", req: true, max: 50 },
      { col: "contract_no", max: 100 },
      { col: "notes", max: 2000 },
      { col: "user_id", max: 36, user: true },
      { col: "spouse_user_id", max: 36, user: true },
    ],
    selfCols: ["user_id", "spouse_user_id"],
  },
  death: {
    table: "death_records",
    dateCol: "death_date",
    searchCols: ["full_name", "spouse_name", "informant_name", "record_number"],
    fields: [
      { col: "full_name", req: true, max: 200 },
      { col: "death_date", req: true, type: "date" },
      { col: "birth_date", type: "date" },
      { col: "age", type: "int" },
      { col: "residence", max: 255 },
      { col: "spouse_name", max: 200 },
      { col: "informant_name", max: 200 },
      { col: "cause_of_death", max: 255 },
      { col: "cemetery", max: 255 },
      { col: "priest", max: 200 },
      { col: "record_number", req: true, max: 50 },
      { col: "notes", max: 2000 },
      { col: "user_id", max: 36, user: true },
    ],
    selfCols: ["user_id"],
  },
};

function sanitizeField(f, raw) {
  const v = raw[f.col];
  if (v === undefined || v === null || String(v).trim() === "") {
    return f.req ? { error: `Missing required field: ${f.col}` } : { value: null };
  }
  if (f.type === "date") {
    const s = String(v).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
      return { error: `${f.col} must be a date (YYYY-MM-DD)` };
    }
    return { value: s };
  }
  if (f.type === "int") {
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0 || n > 150) return { error: `${f.col} must be a valid age` };
    return { value: n };
  }
  const s = String(v).trim();
  if (f.max && s.length > f.max) return { error: `${f.col} is too long (max ${f.max})` };
  return { value: s };
}

function sanitizeTypedRecord(cfg, raw) {
  const values = {};
  for (const f of cfg.fields) {
    const { value, error } = sanitizeField(f, raw);
    if (error) return { error };
    values[f.col] = value;
  }
  return { values };
}

// Verify every linked-account field references an active user.
async function linkedUserError(cfg, values) {
  for (const f of cfg.fields) {
    if (f.user && values[f.col] && !(await activeUserExists(values[f.col]))) {
      return `${f.col} does not match an active user account`;
    }
  }
  return null;
}

function registerTypedRoutes(key, cfg) {
  const cols = cfg.fields.map((f) => f.col);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");

  // GET /api/records/:type?search=&year=&page=&limit=
  // Non-admins see only records linked to their account.
  router.get(`/${key}`, authenticate, async (req, res) => {
    const search = String(req.query.search || "").trim();
    const year = Number.parseInt(req.query.year || 0, 10);
    const page = Math.max(1, Number.parseInt(req.query.page || 1, 10));
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || 20, 10)));
    const offset = (page - 1) * limit;
    const canSeeAll = ["admin", "superadmin"].includes(req.user.role);

    try {
      const where = ["t.parish_id = $1"];
      const params = [config.parish.id];
      if (!canSeeAll) {
        params.push(req.user.id);
        const selfWhere = cfg.selfCols.map((c) => `t.${c} = $${params.length}`).join(" OR ");
        where.push(`(${selfWhere})`);
      } else if (search) {
        const like = `%${search}%`;
        const ors = cfg.searchCols.map((c) => {
          params.push(like);
          return `t.${c} ILIKE $${params.length}`;
        });
        where.push(`(${ors.join(" OR ")})`);
      }
      if (year > 0) {
        params.push(year);
        where.push(`EXTRACT(YEAR FROM t.${cfg.dateCol}) = $${params.length}`);
      }
      const whereSql = "WHERE " + where.join(" AND ");
      const joinSql = cfg.selfCols.map((c, i) => `LEFT JOIN users u${i} ON u${i}.id = t.${c}`).join(" ");
      const linkCols = cfg.selfCols.map((c, i) => `u${i}.name AS linked_${c.replace(/_id$/, "")}_name`).join(", ");
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) AS total FROM ${cfg.table} t ${whereSql}`, params);
      const total = Number.parseInt(countRows[0].total, 10);
      params.push(limit, offset);
      const { rows: items } = await pool.query(
        `SELECT t.*, ${linkCols} FROM ${cfg.table} t ${joinSql}
         ${whereSql} ORDER BY t.${cfg.dateCol} DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params);
      res.json({ success: true, data: { items, total, page, pageSize: limit, hasMore: offset + items.length < total } });
    } catch (err) {
      console.error(`List ${key} records error:`, err.message);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  // POST /api/records/:type — admin only
  router.post(`/${key}`, authenticate, requireRole("admin", "superadmin"), async (req, res) => {
    const { values, error } = sanitizeTypedRecord(cfg, req.body || {});
    if (error) return res.status(400).json({ success: false, message: error });
    const linkError = await linkedUserError(cfg, values);
    if (linkError) return res.status(400).json({ success: false, message: linkError });
    try {
      const { rows: dup } = await pool.query(
        `SELECT id FROM ${cfg.table} WHERE record_number = $1 LIMIT 1`, [values.record_number]);
      if (dup.length) return res.status(409).json({ success: false, message: "Record number already exists" });
      const id = uuid();
      await pool.query(
        `INSERT INTO ${cfg.table} (${cols.join(", ")}, id, parish_id, created_by)
         VALUES (${placeholders}, $${cols.length + 1}, $${cols.length + 2}, $${cols.length + 3})`,
        [...cols.map((c) => values[c]), id, config.parish.id, req.user.id]);
      await auditLog(req.user.id, `create_${key}_record`, `${key}_record`, id, getClientIp(req));
      res.status(201).json({ success: true, message: "Record created", data: { id } });
    } catch (err) {
      console.error(`Create ${key} record error:`, err.message);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  // PUT /api/records/:type/:id — admin only
  router.put(`/${key}/:id`, authenticate, requireRole("admin", "superadmin"), async (req, res) => {
    const { values, error } = sanitizeTypedRecord(cfg, req.body || {});
    if (error) return res.status(400).json({ success: false, message: error });
    const linkError = await linkedUserError(cfg, values);
    if (linkError) return res.status(400).json({ success: false, message: linkError });
    try {
      const { rows: dup } = await pool.query(
        `SELECT id FROM ${cfg.table} WHERE record_number = $1 AND id <> $2 LIMIT 1`,
        [values.record_number, req.params.id]);
      if (dup.length) return res.status(409).json({ success: false, message: "Record number already exists" });
      const { rowCount } = await pool.query(
        `UPDATE ${cfg.table} SET ${setClause}, updated_at = NOW()
         WHERE id = $${cols.length + 1} AND parish_id = $${cols.length + 2}`,
        [...cols.map((c) => values[c]), req.params.id, config.parish.id]);
      if (!rowCount) return res.status(404).json({ success: false, message: "Record not found" });
      await auditLog(req.user.id, `update_${key}_record`, `${key}_record`, req.params.id, getClientIp(req));
      res.json({ success: true, message: "Record updated" });
    } catch (err) {
      console.error(`Update ${key} record error:`, err.message);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  // DELETE /api/records/:type/:id — admin only
  router.delete(`/${key}/:id`, authenticate, requireRole("admin", "superadmin"), async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM ${cfg.table} WHERE id = $1 AND parish_id = $2`, [req.params.id, config.parish.id]);
      if (!rowCount) return res.status(404).json({ success: false, message: "Record not found" });
      await auditLog(req.user.id, `delete_${key}_record`, `${key}_record`, req.params.id, getClientIp(req));
      res.json({ success: true, message: "Record deleted" });
    } catch (err) {
      console.error(`Delete ${key} record error:`, err.message);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  // POST /api/records/:type/bulk — admin CSV import. Body: { records: [{row?, ...}] }
  router.post(`/${key}/bulk`, authenticate, requireRole("admin", "superadmin"), async (req, res) => {
    const items = Array.isArray(req.body?.records) ? req.body.records : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No records provided" });
    if (items.length > 5000) return res.status(400).json({ success: false, message: "Too many records (max 5000)" });

    const results = await Promise.all(items.map(async (raw, i) => {
      const rowLabel = raw.row || i + 2;
      const { values, error } = sanitizeTypedRecord(cfg, raw);
      if (error) return { row: rowLabel, message: error };
      try {
        await pool.query(
          `INSERT INTO ${cfg.table} (${cols.join(", ")}, id, parish_id, created_by)
           VALUES (${placeholders}, $${cols.length + 1}, $${cols.length + 2}, $${cols.length + 3})
           ON CONFLICT (record_number) DO NOTHING`,
          [...cols.map((c) => values[c]), uuid(), config.parish.id, req.user.id]);
        return null;
      } catch (err) {
        return { row: rowLabel, message: err.message };
      }
    }));
    const errors = results.filter(Boolean);
    const imported = items.length - errors.length;
    if (imported > 0) {
      await auditLog(req.user.id, `import_${key}_records`, `${key}_record`, String(imported), getClientIp(req));
    }
    res.json({ success: true, data: { imported, failed: errors.length, errors: errors.slice(0, 50) } });
  });
}

for (const [key, cfg] of Object.entries(TYPED_REGISTRIES)) registerTypedRoutes(key, cfg);

module.exports = router;
