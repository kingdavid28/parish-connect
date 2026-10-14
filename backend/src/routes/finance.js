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

const VALID_METHODS = ["cash", "gcash", "bank", "other"];
const EXPECTED_SQL = "COALESCE(d.expected_amount, b.expected_amount, 0)::float";

function financeEnabled(res) {
  if (config.features.finance === false) {
    res.status(404).json({ success: false, message: "Finance module is not enabled for this parish" });
    return false;
  }
  return true;
}

const validMonth = (m) => Number.isInteger(m) && m >= 1 && m <= 12;
const validYear = (y) => Number.isInteger(y) && y >= 1900 && y <= 2200;
const badRequest = (res, message) => res.status(400).json({ success: false, message });
const serverError = (res, tag, err) => {
  console.error(`${tag}:`, err.message);
  return res.status(500).json({ success: false, message: "Internal server error" });
};

// paid_total vs expected → "unpaid" | "partial" | "paid"
function monthStatus(expected, paidTotal) {
  if (paidTotal <= 0) return "unpaid";
  if (expected > 0 && paidTotal < expected) return "partial";
  return "paid";
}

// Build a 12-month ledger for a donor from its payments rows.
function buildLedger(year, expected, payments) {
  const byMonth = new Map();
  for (const p of payments) {
    if (!byMonth.has(p.month)) byMonth.set(p.month, []);
    byMonth.get(p.month).push(p);
  }
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const list = byMonth.get(m) || [];
    const paidTotal = list.reduce((s, p) => s + Number(p.amount), 0);
    months.push({
      month: m,
      expected,
      paid_total: paidTotal,
      balance: Math.max(0, expected - paidTotal),
      status: monthStatus(expected, paidTotal),
      payments: list,
    });
  }
  return { year, expected, months };
}

// ─── BECs ────────────────────────────────────────────────────────────────────

// GET /api/finance/becs — list BECs with donor counts (admin)
router.get("/becs", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.name, b.expected_amount, COUNT(d.id)::int AS donor_count
       FROM becs b LEFT JOIN donors d ON d.bec_id = b.id AND d.is_active = 1
       GROUP BY b.id ORDER BY b.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    serverError(res, "BEC list error", err);
  }
});

// POST /api/finance/becs
router.post("/becs", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const name = String(req.body?.name || "").trim();
  const expected = req.body?.expected_amount === undefined || req.body?.expected_amount === null || req.body?.expected_amount === ""
    ? null : parseFloat(req.body.expected_amount);
  if (!name || name.length > 150) {
    return badRequest(res, "name is required (max 150 chars)");
  }
  if (expected !== null && !(expected >= 0)) {
    return badRequest(res, "expected_amount must be >= 0");
  }
  try {
    const id = uuid();
    await pool.query("INSERT INTO becs (id, name, expected_amount) VALUES ($1, $2, $3)", [id, name, expected]);
    await auditLog(req.user.id, "create_bec", "bec", id, getClientIp(req));
    res.status(201).json({ success: true, message: "BEC created", data: { id } });
  } catch (err) {
    if (String(err.code) === "23505") {
      return res.status(409).json({ success: false, message: "A BEC with that name already exists" });
    }
    serverError(res, "BEC create error", err);
  }
});

// PUT /api/finance/becs/:id — update name / expected_amount
router.put("/becs/:id", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const name = String(req.body?.name || "").trim();
  const expected = req.body?.expected_amount === undefined || req.body?.expected_amount === null || req.body?.expected_amount === ""
    ? null : parseFloat(req.body.expected_amount);
  if (!name || name.length > 150) {
    return badRequest(res, "name is required (max 150 chars)");
  }
  try {
    const result = await pool.query(
      "UPDATE becs SET name=$1, expected_amount=$2 WHERE id=$3",
      [name, expected, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "BEC not found" });
    }
    await auditLog(req.user.id, "update_bec", "bec", req.params.id, getClientIp(req));
    res.json({ success: true, message: "BEC updated" });
  } catch (err) {
    if (String(err.code) === "23505") {
      return res.status(409).json({ success: false, message: "A BEC with that name already exists" });
    }
    serverError(res, "BEC update error", err);
  }
});

// ─── Donors ──────────────────────────────────────────────────────────────────

function donorValues(body) {
  const exp = body.expected_amount;
  return {
    name: String(body.name || "").trim() || null,
    address: String(body.address || "").trim() || null,
    bec_id: String(body.bec_id || "").trim() || null,
    gcash_number: String(body.gcash_number || "").trim() || null,
    user_id: String(body.user_id || "").trim() || null,
    expected_amount: exp === undefined || exp === null || exp === "" ? null : parseFloat(exp),
    notes: String(body.notes || "").trim() || null,
    is_active: body.is_active === undefined ? 1 : (body.is_active ? 1 : 0),
  };
}

const DONOR_SELECT = `
  SELECT d.*, b.name AS bec_name, b.expected_amount AS bec_expected,
         u.name AS linked_user_name
  FROM donors d
  LEFT JOIN becs b ON b.id = d.bec_id
  LEFT JOIN users u ON u.id = d.user_id`;

// GET /api/finance/donors?search=&bec_id=&page=&limit= (admin)
router.get("/donors", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const search = String(req.query.search || "").trim();
  const becId = String(req.query.bec_id || "").trim();
  const page = Math.max(1, Number.parseInt(req.query.page || 1, 10));
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || 20, 10)));
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
    const total = Number.parseInt(countRows[0].total, 10);

    params.push(limit, offset);
    const { rows: items } = await pool.query(
      `${DONOR_SELECT} ${whereSql} ORDER BY d.name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({
      success: true,
      data: { items, total, page, pageSize: limit, hasMore: offset + items.length < total },
    });
  } catch (err) {
    serverError(res, "Donor list error", err);
  }
});

// POST /api/finance/donors
router.post("/donors", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const v = donorValues(req.body || {});
  if (!v.name || v.name.length > 200) {
    return badRequest(res, "name is required (max 200 chars)");
  }
  try {
    const id = uuid();
    await pool.query(
      `INSERT INTO donors (id, name, address, bec_id, gcash_number, user_id, expected_amount, notes, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, v.name, v.address, v.bec_id, v.gcash_number, v.user_id, v.expected_amount, v.notes, v.is_active, req.user.id]
    );
    await auditLog(req.user.id, "create_donor", "donor", id, getClientIp(req));
    res.status(201).json({ success: true, message: "Donor created", data: { id } });
  } catch (err) {
    serverError(res, "Donor create error", err);
  }
});

// POST /api/finance/donors/bulk — {rows:[{name,address,bec_name,gcash_number,expected_amount}]}
router.post("/donors/bulk", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return badRequest(res, "rows is required");
  if (rows.length > 500) return badRequest(res, "Maximum 500 rows per import");

  try {
    const { rows: becRows } = await pool.query("SELECT id, name FROM becs");
    const becByName = new Map(becRows.map((b) => [b.name.toLowerCase(), b.id]));

    const results = { imported: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const name = String(r.name || "").trim();
      if (!name) {
        results.errors.push({ row: i + 1, message: "name is required" });
        continue;
      }
      let becId = null;
      const becName = String(r.bec_name || "").trim();
      if (becName) {
        becId = becByName.get(becName.toLowerCase());
        if (!becId) {
          // Auto-create the BEC so imports don't fail on new community names
          becId = uuid();
          try {
            await pool.query("INSERT INTO becs (id, name) VALUES ($1, $2)", [becId, becName]);
            becByName.set(becName.toLowerCase(), becId);
          } catch (e) {
            if (String(e.code) === "23505") {
              const { rows: again } = await pool.query("SELECT id FROM becs WHERE name = $1", [becName]);
              becId = again[0]?.id || null;
              if (becId) becByName.set(becName.toLowerCase(), becId);
            } else { throw e; }
          }
        }
      }
      const exp = r.expected_amount === undefined || r.expected_amount === null || r.expected_amount === ""
        ? null : parseFloat(r.expected_amount);
      if (exp !== null && !Number.isFinite(exp)) {
        results.errors.push({ row: i + 1, message: "expected_amount must be a number" });
        continue;
      }
      const id = uuid();
      await pool.query(
        `INSERT INTO donors (id, name, address, bec_id, gcash_number, expected_amount, notes, is_active, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8)`,
        [id, name, String(r.address || "").trim() || null, becId,
         String(r.gcash_number || "").trim() || null, exp,
         String(r.notes || "").trim() || null, req.user.id]
      );
      results.imported++;
    }
    await auditLog(req.user.id, "bulk_import_donors", "donor", null, getClientIp(req));
    res.status(201).json({ success: true, message: `Imported ${results.imported} donor(s)`, data: results });
  } catch (err) {
    serverError(res, "Donor bulk import error", err);
  }
});

// PUT /api/finance/donors/:id
router.put("/donors/:id", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const v = donorValues(req.body || {});
  if (!v.name) {
    return badRequest(res, "name is required");
  }
  try {
    const result = await pool.query(
      `UPDATE donors SET name=$1, address=$2, bec_id=$3, gcash_number=$4,
       user_id=$5, expected_amount=$6, notes=$7, is_active=$8, updated_at=NOW() WHERE id=$9`,
      [v.name, v.address, v.bec_id, v.gcash_number, v.user_id, v.expected_amount, v.notes, v.is_active, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Donor not found" });
    }
    await auditLog(req.user.id, "update_donor", "donor", req.params.id, getClientIp(req));
    res.json({ success: true, message: "Donor updated" });
  } catch (err) {
    serverError(res, "Donor update error", err);
  }
});

// DELETE /api/finance/donors/:id — cascades to payments (destructive)
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
    serverError(res, "Donor delete error", err);
  }
});

// ─── Ledgers ─────────────────────────────────────────────────────────────────

async function fetchLedger(donorId, year) {
  const { rows: donorRows } = await pool.query(`${DONOR_SELECT} WHERE d.id = $1`, [donorId]);
  if (!donorRows[0]) return null;
  const donor = donorRows[0];
  const expected = Number(donor.expected_amount ?? donor.bec_expected ?? 0);
  const { rows: payments } = await pool.query(
    `SELECT id, month, amount, method, reference, receipt_url, recorded_by, created_at
     FROM contribution_payments WHERE donor_id = $1 AND year = $2 ORDER BY month, created_at`,
    [donorId, year]
  );
  return { donor, ...buildLedger(year, expected, payments) };
}

// GET /api/finance/donors/:id/ledger?year= (admin)
router.get("/donors/:id/ledger", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const year = Number.parseInt(req.query.year || new Date().getFullYear(), 10);
  try {
    const ledger = await fetchLedger(req.params.id, year);
    if (!ledger) {
      return res.status(404).json({ success: false, message: "Donor not found" });
    }
    res.json({ success: true, data: ledger });
  } catch (err) {
    serverError(res, "Donor ledger error", err);
  }
});

// GET /api/finance/my/ledger?year= — parishioner's own record (linked via donors.user_id)
router.get("/my/ledger", authenticate, async (req, res) => {
  if (!financeEnabled(res)) return;
  const year = Number.parseInt(req.query.year || new Date().getFullYear(), 10);
  try {
    const { rows } = await pool.query(
      "SELECT id FROM donors WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1",
      [req.user.id]
    );
    if (!rows[0]) {
      return res.json({ success: true, data: { donor: null, year, expected: 0, months: [] } });
    }
    const ledger = await fetchLedger(rows[0].id, year);
    res.json({ success: true, data: ledger });
  } catch (err) {
    serverError(res, "My ledger error", err);
  }
});

// ─── Payments ────────────────────────────────────────────────────────────────

// GET /api/finance/contributions?year=&month=&bec_id=&page=&limit= (admin)
router.get("/contributions", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const year = Number.parseInt(req.query.year || 0, 10);
  const month = Number.parseInt(req.query.month || 0, 10);
  const becId = String(req.query.bec_id || "").trim();
  const page = Math.max(1, Number.parseInt(req.query.page || 1, 10));
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || 50, 10)));
  const offset = (page - 1) * limit;

  try {
    const where = [];
    const params = [];
    if (validYear(year)) { params.push(year); where.push(`c.year = $${params.length}`); }
    if (validMonth(month)) { params.push(month); where.push(`c.month = $${params.length}`); }
    if (becId) { params.push(becId); where.push(`d.bec_id = $${params.length}`); }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM contribution_payments c JOIN donors d ON d.id = c.donor_id ${whereSql}`,
      params
    );
    const total = Number.parseInt(countRows[0].total, 10);

    params.push(limit, offset);
    const { rows: items } = await pool.query(
      `SELECT c.*, d.name AS donor_name, b.name AS bec_name, u.name AS recorded_by_name
       FROM contribution_payments c
       JOIN donors d ON d.id = c.donor_id
       LEFT JOIN becs b ON b.id = d.bec_id
       LEFT JOIN users u ON u.id = c.recorded_by
       ${whereSql} ORDER BY c.year DESC, c.month DESC, c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({
      success: true,
      data: { items, total, page, pageSize: limit, hasMore: offset + items.length < total },
    });
  } catch (err) {
    serverError(res, "Payment list error", err);
  }
});

// POST /api/finance/payments — record a payment (multipart w/ optional `receipt`, or JSON)
router.post("/payments", ...adminOnly, upload.single("receipt"), async (req, res) => {
  if (!financeEnabled(res)) return;
  const body = req.body || {};
  const donorId = String(body.donor_id || "").trim();
  const year = Number.parseInt(body.year, 10);
  const month = Number.parseInt(body.month, 10);
  const amount = parseFloat(body.amount);
  const method = VALID_METHODS.includes(String(body.method)) ? String(body.method) : "cash";
  const reference = String(body.reference || "").trim() || null;

  if (!donorId) return badRequest(res, "donor_id is required");
  if (!validYear(year)) return badRequest(res, "year is required");
  if (!validMonth(month)) return badRequest(res, "month must be 1-12");
  if (!(amount > 0) || amount >= 1000000) {
    return badRequest(res, "amount must be between 0 and 1,000,000");
  }

  let receiptUrl = null;
  if (req.file) {
    const uploaded = await storeImage(req.file, "receipts", 5 * 1024 * 1024);
    if (uploaded.error) {
      return badRequest(res, uploaded.error);
    }
    receiptUrl = uploaded.url;
  }

  try {
    const id = uuid();
    await pool.query(
      `INSERT INTO contribution_payments (id, donor_id, year, month, amount, method, reference, receipt_url, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, donorId, year, month, amount, method, reference, receiptUrl, req.user.id]
    );
    await auditLog(req.user.id, "record_payment", "contribution_payment", id, getClientIp(req));
    res.status(201).json({ success: true, message: "Payment recorded", data: { id } });
  } catch (err) {
    serverError(res, "Payment record error", err);
  }
});

// PUT /api/finance/payments/:id — edit amount/method/reference (receipt immutable)
router.put("/payments/:id", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const amount = parseFloat(req.body?.amount);
  const method = VALID_METHODS.includes(String(req.body?.method)) ? String(req.body.method) : null;
  const reference = String(req.body?.reference || "").trim() || null;

  if (!(amount > 0) || amount >= 1000000) {
    return badRequest(res, "amount must be between 0 and 1,000,000");
  }
  try {
    const result = await pool.query(
      `UPDATE contribution_payments SET amount=$1,
       method=COALESCE($2, method), reference=$3, updated_at=NOW() WHERE id=$4`,
      [amount, method, reference, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }
    await auditLog(req.user.id, "update_payment", "contribution_payment", req.params.id, getClientIp(req));
    res.json({ success: true, message: "Payment updated" });
  } catch (err) {
    serverError(res, "Payment update error", err);
  }
});

// DELETE /api/finance/payments/:id
router.delete("/payments/:id", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  try {
    const result = await pool.query("DELETE FROM contribution_payments WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }
    await auditLog(req.user.id, "delete_payment", "contribution_payment", req.params.id, getClientIp(req));
    res.json({ success: true, message: "Payment deleted" });
  } catch (err) {
    serverError(res, "Payment delete error", err);
  }
});

// ─── Reports ─────────────────────────────────────────────────────────────────

// GET /api/finance/summary?year=&month= — per-BEC dues status (admin)
router.get("/summary", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const year = Number.parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = Number.parseInt(req.query.month || new Date().getMonth() + 1, 10);
  if (!validMonth(month)) return badRequest(res, "month must be 1-12");
  try {
    // Per-BEC rollup: expected = per-donor expected (donor ?? bec ?? 0), paid = SUM(payments)
    const { rows: becRows } = await pool.query(
      `SELECT b.id AS bec_id, b.name AS bec_name,
              COUNT(d.id)::int AS donors,
              COALESCE(SUM(COALESCE(d.expected_amount, b.expected_amount, 0)), 0)::float AS expected_due,
              COALESCE(SUM(p.paid), 0)::float AS collected,
              COUNT(d.id) FILTER (WHERE COALESCE(p.paid,0) >= COALESCE(d.expected_amount, b.expected_amount, 0)
                                  AND (COALESCE(d.expected_amount, b.expected_amount, 0) > 0 OR COALESCE(p.paid,0) > 0))::int AS paid,
              COUNT(d.id) FILTER (WHERE COALESCE(p.paid,0) > 0
                                  AND COALESCE(d.expected_amount, b.expected_amount, 0) > 0
                                  AND COALESCE(p.paid,0) < COALESCE(d.expected_amount, b.expected_amount, 0))::int AS partial,
              COUNT(d.id) FILTER (WHERE COALESCE(p.paid,0) <= 0)::int AS unpaid
       FROM becs b
       LEFT JOIN donors d ON d.bec_id = b.id AND d.is_active = 1
       LEFT JOIN (
         SELECT donor_id, SUM(amount) AS paid
         FROM contribution_payments WHERE year = $1 AND month = $2
         GROUP BY donor_id
       ) p ON p.donor_id = d.id
       GROUP BY b.id, b.name
       UNION ALL
       SELECT NULL, '(No BEC)',
              COUNT(d.id)::int,
              COALESCE(SUM(COALESCE(d.expected_amount, 0)), 0)::float,
              COALESCE(SUM(p.paid), 0)::float,
              COUNT(d.id) FILTER (WHERE COALESCE(p.paid,0) >= COALESCE(d.expected_amount, 0)
                                  AND (COALESCE(d.expected_amount, 0) > 0 OR COALESCE(p.paid,0) > 0))::int,
              COUNT(d.id) FILTER (WHERE COALESCE(p.paid,0) > 0
                                  AND COALESCE(d.expected_amount, 0) > 0
                                  AND COALESCE(p.paid,0) < COALESCE(d.expected_amount, 0))::int,
              COUNT(d.id) FILTER (WHERE COALESCE(p.paid,0) <= 0)::int
       FROM donors d
       LEFT JOIN (
         SELECT donor_id, SUM(amount) AS paid
         FROM contribution_payments WHERE year = $1 AND month = $2
         GROUP BY donor_id
       ) p ON p.donor_id = d.id
       WHERE d.bec_id IS NULL AND d.is_active = 1
       ORDER BY bec_name`,
      [year, month]
    );
    res.json({ success: true, data: { year, month, becs: becRows } });
  } catch (err) {
    serverError(res, "Finance summary error", err);
  }
});

// GET /api/finance/unpaid?year=&month= — active donors still owing (admin)
router.get("/unpaid", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const year = Number.parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = Number.parseInt(req.query.month || new Date().getMonth() + 1, 10);
  if (!validMonth(month)) return badRequest(res, "month must be 1-12");
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.name, d.gcash_number, d.user_id, b.name AS bec_name,
              ${EXPECTED_SQL} AS expected,
              COALESCE(p.paid, 0)::float AS paid_total,
              GREATEST(${EXPECTED_SQL} - COALESCE(p.paid, 0), 0)::float AS balance
       FROM donors d
       LEFT JOIN becs b ON b.id = d.bec_id
       LEFT JOIN (
         SELECT donor_id, SUM(amount) AS paid
         FROM contribution_payments WHERE year = $1 AND month = $2
         GROUP BY donor_id
       ) p ON p.donor_id = d.id
       WHERE d.is_active = 1
         AND COALESCE(p.paid, 0) < GREATEST(${EXPECTED_SQL}, 0.000001)
       ORDER BY b.name NULLS LAST, d.name`,
      [year, month]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    serverError(res, "Unpaid list error", err);
  }
});

// GET /api/finance/export?year=&month= — CSV dues ledger (admin)
router.get("/export", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const year = Number.parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = Number.parseInt(req.query.month || 0, 10);
  try {
    const params = [year];
    let monthSql = "";
    if (validMonth(month)) {
      params.push(month);
      monthSql = " AND p.month = $2";
    }
    const { rows } = await pool.query(
      `SELECT d.name AS donor, b.name AS bec,
              COALESCE(d.expected_amount, b.expected_amount, 0)::float AS expected,
              COALESCE(SUM(p.amount), 0)::float AS paid,
              COUNT(p.id)::int AS payment_count
       FROM donors d
       LEFT JOIN becs b ON b.id = d.bec_id
       LEFT JOIN contribution_payments p ON p.donor_id = d.id AND p.year = $1${monthSql}
       WHERE d.is_active = 1
       GROUP BY d.id, d.name, b.name, d.expected_amount, b.expected_amount
       ORDER BY b.name NULLS LAST, d.name`,
      params
    );
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = ["donor,bec,expected_due,paid_total,balance,status,payments"];
    for (const r of rows) {
      const paid = Number(r.paid);
      const expected = Number(r.expected);
      lines.push([
        esc(r.donor), esc(r.bec || ""), expected.toFixed(2), paid.toFixed(2),
        Math.max(0, expected - paid).toFixed(2), monthStatus(expected, paid), r.payment_count,
      ].join(","));
    }
    const suffix = validMonth(month) ? `-${String(month).padStart(2, "0")}` : "";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="dues-${year}${suffix}.csv"`);
    res.send(lines.join("\n"));
  } catch (err) {
    serverError(res, "Export error", err);
  }
});

module.exports = router;
