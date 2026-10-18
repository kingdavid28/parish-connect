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
// All money math is done in integer cents to avoid floating-point drift.
function toCents(n) { return Math.round(Number(n || 0) * 100); }
function fromCents(c) { return Number(c) / 100; }
function monthStatus(expectedCents, paidTotalCents) {
  if (paidTotalCents <= 0) return "unpaid";
  if (expectedCents > 0 && paidTotalCents < expectedCents) return "partial";
  return "paid";
}

// Build a 12-month ledger for a donor from its payments rows.
// paid_total counts confirmed payments only; self-reported ones sit
// in pending_total until an admin approves them.
function buildLedger(year, expected, payments) {
  const expectedCents = toCents(expected);
  const byMonth = new Map();
  for (const p of payments) {
    if (!byMonth.has(p.month)) byMonth.set(p.month, []);
    byMonth.get(p.month).push(p);
  }
  const months = [];
  let annualExpectedCents = 0;
  let annualPaidCents = 0;
  let annualPendingCents = 0;
  for (let m = 1; m <= 12; m++) {
    const list = byMonth.get(m) || [];
    const paidTotalCents = list.reduce((s, p) => s + (p.status === "confirmed" ? toCents(p.amount) : 0), 0);
    const pendingTotalCents = list.reduce((s, p) => s + (p.status === "pending" ? toCents(p.amount) : 0), 0);
    annualExpectedCents += expectedCents;
    annualPaidCents += paidTotalCents;
    annualPendingCents += pendingTotalCents;
    const paidTotal = fromCents(paidTotalCents);
    const pendingTotal = fromCents(pendingTotalCents);
    months.push({
      month: m,
      expected,
      paid_total: paidTotal,
      pending_total: pendingTotal,
      balance: fromCents(Math.max(0, expectedCents - paidTotalCents)),
      status: monthStatus(expectedCents, paidTotalCents),
      payments: list,
    });
  }
  return {
    year,
    expected,
    months,
    annual_expected: fromCents(annualExpectedCents),
    annual_paid: fromCents(annualPaidCents),
    net_balance: fromCents(Math.max(0, annualExpectedCents - annualPaidCents)),
    total_pending: fromCents(annualPendingCents),
  };
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
    await withTransaction(async (client) => {
      const id = uuid();
      await client.query(
        `INSERT INTO donors (id, name, address, bec_id, gcash_number, user_id, expected_amount, notes, is_active, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, v.name, v.address, v.bec_id, v.gcash_number, v.user_id, v.expected_amount, v.notes, v.is_active, req.user.id]
      );
      await auditLog(req.user.id, "create_donor", "donor", id, getClientIp(req), client, {
        name: v.name, expected_amount: v.expected_amount, bec_id: v.bec_id, created_by: req.user.id,
      });
    });
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

// submittedBy (optional): also include the member's self-reported payments
// that haven't been matched to a donor yet (pending reports).
async function fetchLedger(donorId, year, submittedBy = null) {
  let donor = null;
  if (donorId) {
    const { rows: donorRows } = await pool.query(`${DONOR_SELECT} WHERE d.id = $1`, [donorId]);
    if (!donorRows[0]) return null;
    donor = donorRows[0];
  }
  const expected = donor ? Number(donor.expected_amount ?? donor.bec_expected ?? 0) : 0;
  const { rows: payments } = await pool.query(
    `SELECT id, month, amount, method, reference, receipt_url, receipt_no, status,
            voided_at, void_reason, voided_by, reversal_of, submitted_by, recorded_by, created_at
     FROM contribution_payments
     WHERE year = $2 AND (donor_id = $1 OR ($3::varchar IS NOT NULL AND submitted_by = $3))
     ORDER BY month, created_at`,
    [donorId, year, submittedBy]
  );
  const ledger = { donor, ...buildLedger(year, expected, payments) };
  const annualExpectedCents = toCents(expected) * 12;
  const annualPaidCents = payments.reduce((s, p) => s + (p.status === "confirmed" ? toCents(p.amount) : 0), 0);
  const totalPendingCents = payments.reduce((s, p) => s + (p.status === "pending" ? toCents(p.amount) : 0), 0);
  return {
    ...ledger,
    annual_expected: fromCents(annualExpectedCents),
    annual_paid: fromCents(annualPaidCents),
    net_balance: fromCents(Math.max(0, annualExpectedCents - annualPaidCents)),
    total_pending: fromCents(totalPendingCents),
  };
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

// GET /api/finance/donors/:id/statement?year= — itemized donor statement of account (CSV)
router.get("/donors/:id/statement", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const year = Number.parseInt(req.query.year || new Date().getFullYear(), 10);
  if (!validYear(year)) return badRequest(res, "year is required");
  try {
    const { rows: donorRows } = await pool.query(`${DONOR_SELECT} WHERE d.id = $1`, [req.params.id]);
    const donor = donorRows[0];
    if (!donor) {
      return res.status(404).json({ success: false, message: "Donor not found" });
    }
    const expected = Number(donor.expected_amount ?? donor.bec_expected ?? 0);
    const { rows: payments } = await pool.query(
      `SELECT c.id, c.month, c.amount, c.method, c.reference, c.receipt_url, c.receipt_no, c.status,
              c.voided_at, c.void_reason, c.reversal_of, c.created_at, u.name AS recorded_by_name
       FROM contribution_payments c
       LEFT JOIN users u ON u.id = c.recorded_by
       WHERE c.donor_id = $1 AND c.year = $2
       ORDER BY c.month, c.created_at`,
      [req.params.id, year]
    );

    // Monthly rollup
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const list = payments.filter((p) => p.month === m);
      const paidCents = list.reduce((s, p) => s + (p.status === "confirmed" ? toCents(p.amount) : 0), 0);
      const pendingCents = list.reduce((s, p) => s + (p.status === "pending" ? toCents(p.amount) : 0), 0);
      months.push({ month: m, expected, paid_total: fromCents(paidCents), pending_total: fromCents(pendingCents) });
    }
    const annualExpectedCents = toCents(expected) * 12;
    const annualPaidCents = payments.reduce((s, p) => s + (p.status === "confirmed" ? toCents(p.amount) : 0), 0);
    const totalPendingCents = payments.reduce((s, p) => s + (p.status === "pending" ? toCents(p.amount) : 0), 0);

    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const money = (n) => Number(n || 0).toFixed(2);
    const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    const lines = [];
    lines.push(`Statement of Account,${esc(donor.name)},${esc(donor.bec_name || "")},Year ${year}`);
    lines.push("");
    lines.push(`Annual Expected Due,${money(annualExpectedCents)}`);
    lines.push(`Annual Paid (confirmed),${money(annualPaidCents)}`);
    lines.push(`Pending Approval,${money(totalPendingCents)}`);
    lines.push(`Net Balance,${money(Math.max(0, annualExpectedCents - annualPaidCents))}`);
    lines.push("");
    lines.push("Month,Expected Due,Paid Total,Pending Total,Balance,Status");
    let runningPaidCents = 0;
    for (const m of months) {
      runningPaidCents += toCents(m.paid_total);
      lines.push([
        MONTH_NAMES[m.month - 1], money(m.expected), money(m.paid_total), money(m.pending_total),
        money(Math.max(0, toCents(m.expected) - runningPaidCents)), monthStatus(toCents(m.expected), toCents(m.paid_total)),
      ].join(","));
    }
    lines.push("");
    lines.push("Date,Month,Amount,Method,Reference,Receipt No.,Status,Recorded By,Void Reason");
    for (const p of payments) {
      const paidOn = new Date(p.created_at).toISOString().slice(0, 10);
      lines.push([
        paidOn, MONTH_NAMES[p.month - 1], money(p.amount), p.method,
        esc(p.reference || ""), p.receipt_no || "", p.status,
        esc(p.recorded_by_name || ""),
        p.status === "voided" ? esc(p.void_reason || "") : "",
      ].join(","));
    }

    const safeName = String(donor.name).replace(/[^A-Za-z0-9]+/g, "_");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="statement-${safeName}-${year}.csv"`);
    res.send(lines.join("\n"));
  } catch (err) {
    serverError(res, "Donor statement error", err);
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
    // No linked donor → still show the member's own pending reports
    const ledger = await fetchLedger(rows[0]?.id || null, year, req.user.id);
    res.json({ success: true, data: ledger });
  } catch (err) {
    serverError(res, "My ledger error", err);
  }
});

// POST /api/finance/my/contributions — member self-reports a contribution
// (multipart w/ optional `receipt`, or JSON). Creates a pending payment
// against the donor record linked to their account; admin approves.
router.post("/my/contributions", authenticate, upload.single("receipt"), async (req, res) => {
  if (!financeEnabled(res)) return;
  const body = req.body || {};
  const now = new Date();
  const year = Number.parseInt(body.year || now.getFullYear(), 10);
  const month = Number.parseInt(body.month || now.getMonth() + 1, 10);
  const amount = parseFloat(body.amount);
  const method = VALID_METHODS.includes(String(body.method)) ? String(body.method) : "gcash";
  const reference = String(body.reference || "").trim() || null;

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
    const { rows } = await pool.query(
      "SELECT id FROM donors WHERE user_id = $1 AND is_active = 1 ORDER BY created_at ASC LIMIT 1",
      [req.user.id]
    );
    // Unlinked members can still report — admin matches a donor on approve
    const id = uuid();
    await pool.query(
      `INSERT INTO contribution_payments (id, donor_id, year, month, amount, method, reference, receipt_url, status, submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)`,
      [id, rows[0]?.id || null, year, month, amount, method, reference, receiptUrl, req.user.id]
    );
    await auditLog(req.user.id, "report_contribution", "contribution_payment", id, getClientIp(req));
    res.status(201).json({ success: true, message: "Contribution reported — pending admin approval", data: { id } });
  } catch (err) {
    serverError(res, "Contribution report error", err);
  }
});

// ─── Payments ────────────────────────────────────────────────────────────────

// GET /api/finance/contributions/pending — member-reported payments awaiting review (admin)
router.get("/contributions/pending", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.year, c.month, c.amount, c.method, c.reference, c.receipt_url, c.created_at,
              d.id AS donor_id, d.name AS donor_name, b.name AS bec_name, u.name AS submitted_by_name
       FROM contribution_payments c
       LEFT JOIN donors d ON d.id = c.donor_id
       LEFT JOIN becs b ON b.id = d.bec_id
       LEFT JOIN users u ON u.id = c.submitted_by
       WHERE c.status = 'pending'
       ORDER BY c.created_at ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    serverError(res, "Pending list error", err);
  }
});

// POST /api/finance/payments/:id/approve — confirm a member-reported payment (admin)
// Body: { donor_id } to match an existing donor, or { new_donor_name } to
// create one (auto-linked to the member who reported).
router.post("/payments/:id/approve", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  try {
    const newDonorName = String(req.body?.new_donor_name || "").trim();
    let payment;
    let donorId;
    let missingDonor = false;

    await withTransaction(async (client) => {
      const { rows } = await client.query(
        "SELECT id, donor_id, submitted_by, year FROM contribution_payments WHERE id = $1 AND status = 'pending' FOR UPDATE",
        [req.params.id]
      );
      payment = rows[0];
      if (!payment) return;

      // Resolve which donor this payment belongs to while holding its row lock.
      donorId = payment.donor_id || String(req.body?.donor_id || "").trim() || null;
      if (!donorId && !newDonorName) {
        missingDonor = true;
        return;
      }

      if (!donorId && newDonorName) {
        donorId = uuid();
        await client.query(
          `INSERT INTO donors (id, name, user_id, is_active, created_by) VALUES ($1,$2,$3,1,$4)`,
          [donorId, newDonorName, payment.submitted_by, req.user.id]
        );
        await auditLog(req.user.id, "create_donor", "donor", donorId, getClientIp(req), client, {
          name: newDonorName, user_id: payment.submitted_by, created_by: req.user.id,
        });
      }

      await client.query(
        `UPDATE contribution_payments SET donor_id=$2, status='confirmed', recorded_by=$3, updated_at=NOW()
         WHERE id=$1`,
        [req.params.id, donorId, req.user.id]
      );
      let receiptNo = null;
      try {
        receiptNo = await ensureReceiptNo(client, {
          id: req.params.id, year: payment.year,
          status: "confirmed", receipt_no: null,
        });
      } catch (err) {
        console.error("ensureReceiptNo error (non-fatal):", err.message);
      }
      await auditLog(req.user.id, "approve_payment", "contribution_payment", req.params.id, getClientIp(req), client, {
        before: { status: "pending", donor_id: payment.donor_id },
        after: { status: "confirmed", donor_id, recorded_by: req.user.id, receipt_no: receiptNo },
      });
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: "Pending payment not found" });
    }
    if (missingDonor) {
      return badRequest(res, "Select a donor for this report (donor_id or new_donor_name)");
    }
    res.json({ success: true, message: "Contribution approved", data: { donor_id: donorId } });
  } catch (err) {
    serverError(res, "Payment approve error", err);
  }
});

// POST /api/finance/payments/:id/reject — reject a member-reported payment (admin)
router.post("/payments/:id/reject", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  try {
    const existing = await fetchPayment(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Pending payment not found" });
    }
    let updateResult;
    await withTransaction(async (client) => {
      updateResult = await client.query(
        "UPDATE contribution_payments SET status='rejected', updated_at=NOW() WHERE id=$1 AND status='pending'",
        [req.params.id]
      );
      await auditLog(req.user.id, "reject_payment", "contribution_payment", req.params.id, getClientIp(req), client, {
        before: { status: existing.status },
        after: { status: "rejected" },
      });
    });
    if (updateResult.rowCount === 0) {
      return res.status(409).json({ success: false, message: "Payment is no longer pending" });
    }
    res.json({ success: true, message: "Contribution rejected" });
  } catch (err) {
    serverError(res, "Payment reject error", err);
  }
});

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
    await withTransaction(async (client) => {
      const id = uuid();
      await client.query(
        `INSERT INTO contribution_payments (id, donor_id, year, month, amount, method, reference, receipt_url, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, donorId, year, month, amount, method, reference, receiptUrl, req.user.id]
      );
      const receiptNo = await ensureReceiptNo(client, { id, year, month, status: "confirmed", receipt_no: null });
      await auditLog(req.user.id, "record_payment", "contribution_payment", id, getClientIp(req), client, {
        amount, method, reference, receipt_no: receiptNo,
      });
    });
    res.status(201).json({ success: true, message: "Payment recorded", data: { id } });
  } catch (err) {
    serverError(res, "Payment record error", err);
  }
});

// Fetch a single payment by id (for edit / void / delete).
async function fetchPayment(id) {
  const { rows } = await pool.query(
    `SELECT id, donor_id, year, month, amount, method, reference, receipt_url, status,
            voided_at, void_reason, voided_by, reversal_of, submitted_by, recorded_by, created_at
     FROM contribution_payments WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Helper: run a set of queries inside a single transaction.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// --- receipt numbers ---------------------------------------------------------
// Formatted transaction reference for confirmed payments: RCPT-YYYY-NNNNNN
const RECEIPT_PREFIX = "RCPT";

async function nextReceiptNo(client, year) {
  const { rows } = await client.query(
    `SELECT receipt_no FROM contribution_payments
     WHERE receipt_no LIKE $1 ORDER BY receipt_no DESC LIMIT 1`,
    [`${RECEIPT_PREFIX}-${year}-%`]
  );
  let seq = 1;
  const last = rows[0]?.receipt_no;
  if (last) {
    const tail = String(last).split("-").pop();
    const n = Number.parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${RECEIPT_PREFIX}-${year}-${String(seq).padStart(6, "0")}`;
}

// Assign a receipt_no to a confirmed payment that does not have one yet.
async function ensureReceiptNo(client, payment) {
  if (payment.status !== "confirmed" || payment.receipt_no) return null;
  const receiptNo = await nextReceiptNo(client, payment.year);
  await client.query(
    `UPDATE contribution_payments SET receipt_no = $1, updated_at = NOW() WHERE id = $2`,
    [receiptNo, payment.id]
  );
  return receiptNo;
}

// Terminal statuses that must never be overwritten or re-voided.
const TERMINAL_STATUSES = new Set(["rejected", "voided"]);

// PUT /api/finance/payments/:id — correct a payment immutably.
// Confirmed payments are never overwritten: the original is voided and a
// replacement payment is recorded (linked via reversal_of). Pending payments
// may still be updated in place since they are not yet final.
router.put("/payments/:id", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const amount = parseFloat(req.body?.amount);
  const method = VALID_METHODS.includes(String(req.body?.method)) ? String(req.body.method) : null;
  const reference = String(req.body?.reference || "").trim() || null;
  const voidReason = String(req.body?.void_reason || "").trim() || null;

  if (!(amount > 0) || amount >= 1000000) {
    return badRequest(res, "amount must be between 0 and 1,000,000");
  }
  if (!method) {
    return badRequest(res, "method is required");
  }

  try {
    const existing = await fetchPayment(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    // Pending (not yet confirmed) may be corrected in place.
    if (existing.status === "pending") {
      let updateResult;
      await withTransaction(async (client) => {
        updateResult = await client.query(
          `UPDATE contribution_payments SET amount=$1, method=$2, reference=$3, updated_at=NOW()
           WHERE id=$4 AND status='pending'`,
          [amount, method, reference, req.params.id]
        );
        await auditLog(req.user.id, "correct_pending_payment", "contribution_payment", req.params.id, getClientIp(req), client, {
          before: { status: existing.status, amount: existing.amount, method: existing.method, reference: existing.reference },
          after: { status: "pending", amount, method, reference },
        });
      });
      if (updateResult.rowCount === 0) {
        return res.status(409).json({ success: false, message: "Payment no longer editable" });
      }
      return res.json({ success: true, message: "Pending payment corrected", data: { id: req.params.id } });
    }

    // Confirmed payments: void the original + record a replacement (immutable audit trail).
    if (existing.status === "confirmed") {
      if (!voidReason) {
        return badRequest(res, "void_reason is required when correcting a confirmed payment");
      }
      return withTransaction(async (client) => {
        // 1. Void the original payment (soft delete — never hard-deleted).
        await client.query(
          `UPDATE contribution_payments
           SET status='voided', voided_at=NOW(), void_reason=$1, voided_by=$2, updated_at=NOW()
           WHERE id=$3 AND status='confirmed'`,
          [voidReason, req.user.id, req.params.id]
        );
        await auditLog(req.user.id, "void_payment", "contribution_payment", req.params.id, getClientIp(req), client, {
          before: { status: "confirmed", amount: existing.amount, method: existing.method, reference: existing.reference },
          after: { status: "voided", void_reason: voidReason, voided_by: req.user.id },
        });
        // 2. Record the replacement payment (links back to the voided original).
        const newId = uuid();
        const { rows } = await client.query(
          `INSERT INTO contribution_payments
            (id, donor_id, year, month, amount, method, reference, receipt_url, status,
             recorded_by, reversal_of, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10,NOW(),NOW())
           RETURNING id, donor_id, year, month, amount, method, reference, receipt_url, status,
                     reversal_of, created_at, updated_at`,
          [newId, existing.donor_id, existing.year, existing.month, amount, method, reference,
           existing.receipt_url, req.user.id, req.params.id]
        );
        const receiptNo = await ensureReceiptNo(client, { id: newId, year: existing.year, status: "confirmed", receipt_no: null });
        const replacement = { ...rows[0], receipt_no: receiptNo || rows[0].receipt_no };
        await auditLog(req.user.id, "correct_payment", "contribution_payment", newId, getClientIp(req), client, {
          before: { reversal_of: req.params.id },
          after: { status: "confirmed", amount, method, reference, receipt_no: replacement.receipt_no },
        });
        return res.json({
          success: true,
          message: "Confirmed payment corrected — original voided, replacement recorded",
          data: { voided_id: req.params.id, replacement },
        });
      });
    }

    // Rejected or already-voided payments are terminal and immutable.
    return res.status(409).json({
      success: false,
      message: `Payment is ${existing.status} and cannot be edited`,
    });
  } catch (err) {
    serverError(res, "Payment update error", err);
  }
});

// DELETE /api/finance/payments/:id — soft-void a payment (never hard-delete).
router.delete("/payments/:id", ...adminOnly, async (req, res) => {
  if (!financeEnabled(res)) return;
  const voidReason = String(req.body?.void_reason || "").trim() || null;
  if (!voidReason) {
    return badRequest(res, "void_reason is required");
  }
  try {
    const existing = await fetchPayment(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }
    if (TERMINAL_STATUSES.has(existing.status)) {
      return res.status(409).json({
        success: false,
        message: `Payment is ${existing.status} and cannot be voided`,
      });
    }
    let voidResult;
    await withTransaction(async (client) => {
      voidResult = await client.query(
        `UPDATE contribution_payments
         SET status='voided', voided_at=NOW(), void_reason=$1, voided_by=$2, updated_at=NOW()
         WHERE id=$3 AND status IN ('confirmed','pending')`,
        [voidReason, req.user.id, req.params.id]
      );
      await auditLog(req.user.id, "void_payment", "contribution_payment", req.params.id, getClientIp(req), client, {
        before: { status: existing.status, void_reason: existing.void_reason },
        after: { status: "voided", void_reason: voidReason, voided_by: req.user.id },
      });
    });
    if (voidResult.rowCount === 0) {
      return res.status(409).json({ success: false, message: "Payment could not be voided" });
    }
    res.json({ success: true, message: "Payment voided", data: { id: req.params.id } });
  } catch (err) {
    serverError(res, "Payment void error", err);
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
         FROM contribution_payments WHERE year = $1 AND month = $2 AND status = 'confirmed'
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
         FROM contribution_payments WHERE year = $1 AND month = $2 AND status = 'confirmed'
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
         FROM contribution_payments WHERE year = $1 AND month = $2 AND status = 'confirmed'
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
       LEFT JOIN contribution_payments p ON p.donor_id = d.id AND p.year = $1${monthSql} AND p.status = 'confirmed'
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

// GET /api/finance/my/ledger?year= — authenticated donor's own ledger
router.get("/my/ledger", authenticate, async (req, res) => {
  if (!financeEnabled(res)) return;
  const year = Number.parseInt(req.query.year || new Date().getFullYear(), 10);
  if (!validYear(year)) return badRequest(res, "year must be 1900-2200");
  try {
    const { rows: donorRows } = await pool.query(
      `SELECT d.id, d.name, d.expected_amount, d.bec_id, b.name AS bec_name
       FROM donors d
       LEFT JOIN becs b ON b.id = d.bec_id
       WHERE d.user_id = $1 AND d.is_active = 1`,
      [req.user.id]
    );
    if (donorRows.length === 0) {
      return res.json({ success: true, data: null });
    }
    const donor = donorRows[0];
    const { rows: payments } = await pool.query(
      `SELECT id, donor_id, submitted_by, year, month, amount, method, reference,
              receipt_url, receipt_no, status, void_reason, voided_at, voided_by, created_at
       FROM contribution_payments
       WHERE donor_id = $1 AND year = $2
       ORDER BY month, created_at`,
      [donor.id, year]
    );
    const ledger = buildLedger(year, donor.expected_amount, payments);
    ledger.donor = {
      id: donor.id,
      name: donor.name,
      bec_name: donor.bec_name || null,
    };
    res.json({ success: true, data: ledger });
  } catch (err) {
    serverError(res, "My ledger error", err);
  }
});

module.exports = router;
