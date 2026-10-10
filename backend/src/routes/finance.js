const express = require("express");
const multer = require("multer");
const pool = require("../db/pool");
const config = require("../config");
const { authenticate, requireRole } = require("../middleware/auth");
const { uuid, getClientIp, auditLog } = require("../lib/helpers");
const { storeImage } = require("../lib/storage");

const router = express.Router();
const adminOnly = [authenticate, requireRole("admin", "superadmin")];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function financeEnabled(res) {
  if (config.features.finance === false) {
    res.status(404).json({ success: false, message: "Finance module is not enabled for this parish" });
    return false;
  }
  return true;
}

const MONTHS = "month must be 1-12";
const validMonth = (m) => Number.isInteger(m) && m >= 1 && m <= 12;
const validYear = (y) => Number.isInteger(y) && y >= 1900 && y <= 2200;

// ─── BECs ────────────────────────────────────────────────────────────────────

// GET /api/finance/becs — list BECs with donor counts
router.get("/becs", authenticate, async (req, res) => {
  if (!financeEnabled(res)) return;
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.name, COUNT(d.id)::int AS donor_count
       FROM becs b LEFT JOIN donors d ON d.bec_id = b.id AND d.is_active = 1
       GROUP BY b.id ORDER BY b.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("BEC list error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/finance/becs — admin creates a BEC
router.post("/becs", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const name = String(req.body?.name || "").trim();
  if (!name || name.length > 150) {
    return res.status(400).json({ success: false, message: "name is required (max 150 chars)" });
  }
  try {
    const id = uuid();
    await pool.query("INSERT INTO becs (id, name) VALUES ($1, $2)", [id, name]);
    await auditLog(req.user.id, "create_bec", "bec", id, getClientIp(req));
    res.status(201).json({ success: true, message: "BEC created", data: { id } });
  } catch (err) {
    if (String(err.code) === "23505") {
      return res.status(409).json({ success: false, message: "A BEC with that name already exists" });
    }
    console.error("BEC create error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Donors ──────────────────────────────────────────────────────────────────

const DONOR_FIELDS = ["name", "address", "bec_id", "gcash_number", "user_id", "notes", "is_active"];

function donorValues(body) {
  return {
    name: String(body.name || "").trim() || null,
    address: String(body.address || "").trim() || null,
    bec_id: String(body.bec_id || "").trim() || null,
    gcash_number: String(body.gcash_number || "").trim() || null,
    user_id: String(body.user_id || "").trim() || null,
    notes: String(body.notes || "").trim() || null,
    is_active: body.is_active === undefined ? 1 : (body.is_active ? 1 : 0),
  };
}

// GET /api/finance/donors?search=&bec_id=&page=&limit=
router.get("/donors", authenticate, async (req, res) => {
  if (!financeEnabled(res)) return;
  const search = String(req.query.search || "").trim();
  const becId = String(req.query.bec_id || "").trim();
  const page = Math.max(1, parseInt(req.query.page || 1, 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || 20, 10)));
  const offset = (page - 1) * limit;

  try {
    const where = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(d.name ILIKE $${params.length} OR d.address ILIKE $${params.length})`);
    }
    if (becId) {
      params.push(becId);
      where.push(`d.bec_id = $${params.length}`);
    }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM donors d ${whereSql}`, params
    );
    const total = parseInt(countRows[0].total, 10);

    params.push(limit, offset);
    const { rows: items } = await pool.query(
      `SELECT d.*, b.name AS bec_name,
              u.name AS linked_user_name
       FROM donors d
       LEFT JOIN becs b ON b.id = d.bec_id
       LEFT JOIN users u ON u.id = d.user_id
       ${whereSql} ORDER BY d.name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({
      success: true,
      data: { items, total, page, pageSize: limit, hasMore: offset + items.length < total },
    });
  } catch (err) {
    console.error("Donor list error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/finance/donors — admin creates a donor
router.post("/donors", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const v = donorValues(req.body || {});
  if (!v.name || v.name.length > 200) {
    return res.status(400).json({ success: false, message: "name is required (max 200 chars)" });
  }
  try {
    const id = uuid();
    await pool.query(
      `INSERT INTO donors (id, name, address, bec_id, gcash_number, user_id, notes, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, v.name, v.address, v.bec_id, v.gcash_number, v.user_id, v.notes, v.is_active, req.user.id]
    );
    await auditLog(req.user.id, "create_donor", "donor", id, getClientIp(req));
    res.status(201).json({ success: true, message: "Donor created", data: { id } });
  } catch (err) {
    console.error("Donor create error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/finance/donors/:id
router.put("/donors/:id", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const v = donorValues(req.body || {});
  if (!v.name) {
    return res.status(400).json({ success: false, message: "name is required" });
  }
  try {
    const result = await pool.query(
      `UPDATE donors SET name=$1, address=$2, bec_id=$3, gcash_number=$4,
       user_id=$5, notes=$6, is_active=$7, updated_at=NOW() WHERE id=$8`,
      [v.name, v.address, v.bec_id, v.gcash_number, v.user_id, v.notes, v.is_active, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Donor not found" });
    }
    await auditLog(req.user.id, "update_donor", "donor", req.params.id, getClientIp(req));
    res.json({ success: true, message: "Donor updated" });
  } catch (err) {
    console.error("Donor update error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/finance/donors/:id — cascades to contributions
router.delete("/donors/:id", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  try {
    const result = await pool.query("DELETE FROM donors WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Donor not found" });
    }
    await auditLog(req.user.id, "delete_donor", "donor", req.params.id, getClientIp(req));
    res.json({ success: true, message: "Donor deleted" });
  } catch (err) {
    console.error("Donor delete error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/finance/donors/:id/ledger?year= — donor + its 12 monthly rows
router.get("/donors/:id/ledger", authenticate, async (req, res) => {
  if (!financeEnabled(res)) return;
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  try {
    const { rows: donorRows } = await pool.query(
      `SELECT d.*, b.name AS bec_name, u.name AS linked_user_name
       FROM donors d
       LEFT JOIN becs b ON b.id = d.bec_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (!donorRows[0]) {
      return res.status(404).json({ success: false, message: "Donor not found" });
    }
    const { rows: contributions } = await pool.query(
      `SELECT id, month, amount, method, reference, receipt_url, recorded_by, created_at
       FROM contributions WHERE donor_id = $1 AND year = $2 ORDER BY month`,
      [req.params.id, year]
    );
    res.json({ success: true, data: { donor: donorRows[0], year, contributions } });
  } catch (err) {
    console.error("Donor ledger error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Contributions ───────────────────────────────────────────────────────────

// GET /api/finance/contributions?year=&month=&bec_id=&page=&limit=
router.get("/contributions", authenticate, async (req, res) => {
  if (!financeEnabled(res)) return;
  const year = parseInt(req.query.year || 0, 10);
  const month = parseInt(req.query.month || 0, 10);
  const becId = String(req.query.bec_id || "").trim();
  const page = Math.max(1, parseInt(req.query.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 50, 10)));
  const offset = (page - 1) * limit;

  try {
    const where = [];
    const params = [];
    if (validYear(year)) { params.push(year); where.push(`c.year = $${params.length}`); }
    if (validMonth(month)) { params.push(month); where.push(`c.month = $${params.length}`); }
    if (becId) { params.push(becId); where.push(`d.bec_id = $${params.length}`); }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM contributions c JOIN donors d ON d.id = c.donor_id ${whereSql}`,
      params
    );
    const total = parseInt(countRows[0].total, 10);

    params.push(limit, offset);
    const { rows: items } = await pool.query(
      `SELECT c.*, d.name AS donor_name, b.name AS bec_name, u.name AS recorded_by_name
       FROM contributions c
       JOIN donors d ON d.id = c.donor_id
       LEFT JOIN becs b ON b.id = d.bec_id
       LEFT JOIN users u ON u.id = c.recorded_by
       ${whereSql} ORDER BY c.year DESC, c.month DESC, d.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({
      success: true,
      data: { items, total, page, pageSize: limit, hasMore: offset + items.length < total },
    });
  } catch (err) {
    console.error("Contribution list error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/finance/contributions — record/overwrite a donor's monthly amount.
// multipart/form-data with optional `receipt` image, or JSON body.
router.post("/contributions", ...adminOnly, upload.single("receipt"), async (req, res) => {
  if (!financeEnabled(res)) return;
  const body = req.body || {};
  const donorId = String(body.donor_id || "").trim();
  const year = parseInt(body.year, 10);
  const month = parseInt(body.month, 10);
  const amount = parseFloat(body.amount);
  const method = ["cash", "gcash", "bank", "other"].includes(String(body.method)) ? String(body.method) : "cash";
  const reference = String(body.reference || "").trim() || null;

  if (!donorId) return res.status(400).json({ success: false, message: "donor_id is required" });
  if (!validYear(year)) return res.status(400).json({ success: false, message: "year is required" });
  if (!validMonth(month)) return res.status(400).json({ success: false, message: MONTHS });
  if (!(amount > 0)) return res.status(400).json({ success: false, message: "amount must be > 0" });

  let receiptUrl = null;
  if (req.file) {
    const uploaded = await storeImage(req.file, "receipts", 5 * 1024 * 1024);
    if (uploaded.error) {
      return res.status(400).json({ success: false, message: uploaded.error });
    }
    receiptUrl = uploaded.url;
  }

  try {
    const id = uuid();
    await pool.query(
      `INSERT INTO contributions (id, donor_id, year, month, amount, method, reference, receipt_url, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (donor_id, year, month) DO UPDATE SET
         amount = EXCLUDED.amount, method = EXCLUDED.method,
         reference = EXCLUDED.reference,
         receipt_url = COALESCE(EXCLUDED.receipt_url, contributions.receipt_url),
         recorded_by = EXCLUDED.recorded_by, updated_at = NOW()`,
      [id, donorId, year, month, amount, method, reference, receiptUrl, req.user.id]
    );
    await auditLog(req.user.id, "record_contribution", "contribution", `${donorId}:${year}-${month}`, getClientIp(req));
    res.status(201).json({ success: true, message: "Contribution recorded" });
  } catch (err) {
    console.error("Contribution record error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/finance/contributions/:id
router.delete("/contributions/:id", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  try {
    const result = await pool.query("DELETE FROM contributions WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Contribution not found" });
    }
    await auditLog(req.user.id, "delete_contribution", "contribution", req.params.id, getClientIp(req));
    res.json({ success: true, message: "Contribution deleted" });
  } catch (err) {
    console.error("Contribution delete error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Reports ─────────────────────────────────────────────────────────────────

// GET /api/finance/summary?year=&month= — per-BEC totals + paid/unpaid counts
router.get("/summary", authenticate, async (req, res) => {
  if (!financeEnabled(res)) return;
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = parseInt(req.query.month || new Date().getMonth() + 1, 10);
  if (!validMonth(month)) return res.status(400).json({ success: false, message: MONTHS });
  try {
    const { rows } = await pool.query(
      `SELECT b.id AS bec_id, b.name AS bec_name,
              COUNT(d.id)::int AS donors,
              COUNT(c.id)::int AS paid,
              COUNT(d.id) - COUNT(c.id) AS unpaid,
              COALESCE(SUM(c.amount), 0)::float AS collected
       FROM becs b
       LEFT JOIN donors d ON d.bec_id = b.id AND d.is_active = 1
       LEFT JOIN contributions c ON c.donor_id = d.id AND c.year = $1 AND c.month = $2
       GROUP BY b.id, b.name
       UNION ALL
       SELECT NULL, '(No BEC)',
              COUNT(d.id)::int,
              COUNT(c.id)::int,
              COUNT(d.id) - COUNT(c.id),
              COALESCE(SUM(c.amount), 0)::float
       FROM donors d
       LEFT JOIN contributions c ON c.donor_id = d.id AND c.year = $1 AND c.month = $2
       WHERE d.bec_id IS NULL AND d.is_active = 1
       ORDER BY bec_name`,
      [year, month]
    );
    res.json({ success: true, data: { year, month, becs: rows } });
  } catch (err) {
    console.error("Finance summary error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/finance/unpaid?year=&month= — active donors with no contribution that month
router.get("/unpaid", authenticate, async (req, res) => {
  if (!financeEnabled(res)) return;
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = parseInt(req.query.month || new Date().getMonth() + 1, 10);
  if (!validMonth(month)) return res.status(400).json({ success: false, message: MONTHS });
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.name, d.gcash_number, d.user_id, b.name AS bec_name
       FROM donors d
       LEFT JOIN becs b ON b.id = d.bec_id
       WHERE d.is_active = 1
         AND NOT EXISTS (
           SELECT 1 FROM contributions c
           WHERE c.donor_id = d.id AND c.year = $1 AND c.month = $2
         )
       ORDER BY b.name NULLS LAST, d.name`,
      [year, month]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Unpaid list error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
