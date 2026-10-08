const express = require("express");
const multer = require("multer");
const pool = require("../db/pool");
const config = require("../config");
const { authenticate, requireRole } = require("../middleware/auth");
const { uuid, esc } = require("../lib/helpers");
const { checkAndAwardBadges } = require("../lib/rewards");
const { sendPushToUser } = require("../lib/push");
const { sendEmail } = require("../lib/mailer");
const { storeImage } = require("../lib/storage");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const GBLESS_PER_PHP = 10000;   // ₱1 = 10,000 GBless
const CASHOUT_MIN = 1000000;    // minimum GBless to cash out (₱100)

const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtPhp = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function getBalance(userId) {
  const { rows } = await pool.query("SELECT total_points FROM user_points WHERE user_id = $1 LIMIT 1", [userId]);
  return parseInt(rows[0]?.total_points || 0, 10);
}

/** Deduct GBless atomically. Throws Error('Insufficient GBless balance'). */
async function deductPoints(userId, amount, action, refId = null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT total_points FROM user_points WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    const current = parseInt(rows[0]?.total_points || 0, 10);
    if (current < amount) {
      throw new Error("Insufficient GBless balance");
    }
    await client.query("UPDATE user_points SET total_points = total_points - $1, updated_at = NOW() WHERE user_id = $2", [amount, userId]);
    await client.query(
      "INSERT INTO point_transactions (id, user_id, action, points, ref_id) VALUES ($1, $2, $3, $4, $5)",
      [uuid(), userId, action, -amount, refId]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Credit GBless. If `client` is given, participates in its transaction. */
async function creditPoints(userId, amount, action, refId = null, client = pool) {
  await client.query(
    "INSERT INTO point_transactions (id, user_id, action, points, ref_id) VALUES ($1, $2, $3, $4, $5)",
    [uuid(), userId, action, amount, refId]
  );
  await client.query(
    `INSERT INTO user_points (user_id, total_points) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET total_points = user_points.total_points + $2, updated_at = NOW()`,
    [userId, amount]
  );
}

async function notifyAdmins(payload) {
  const { rows } = await pool.query(
    "SELECT id FROM users WHERE role IN ('admin','superadmin') AND is_active = 1"
  );
  for (const a of rows) {
    sendPushToUser(a.id, payload).catch(() => {});
  }
}

// ─── User endpoints ───────────────────────────────────────────────────────────

// GET /api/wallet
router.get("/", authenticate, async (req, res) => {
  try {
    const balance = await getBalance(req.user.id);
    const [t, c] = await Promise.all([
      pool.query("SELECT COUNT(*) AS c FROM gbless_topup_requests WHERE user_id = $1 AND status = 'pending'", [req.user.id]),
      pool.query("SELECT COUNT(*) AS c FROM gbless_cashout_requests WHERE user_id = $1 AND status = 'pending'", [req.user.id]),
    ]);
    res.json({
      success: true,
      data: {
        balance,
        balance_php: Math.round((balance / GBLESS_PER_PHP) * 100) / 100,
        cashout_min: CASHOUT_MIN,
        cashout_min_php: CASHOUT_MIN / GBLESS_PER_PHP,
        gbless_per_php: GBLESS_PER_PHP,
        pending_topups: parseInt(t.rows[0].c, 10),
        pending_cashouts: parseInt(c.rows[0].c, 10),
        can_cashout: balance >= CASHOUT_MIN,
      },
    });
  } catch (err) {
    console.error("getWalletSummary error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/wallet/gcash-info
router.get("/gcash-info", authenticate, (req, res) => {
  res.json({
    success: true,
    data: {
      gcash_number: config.gcash.number,
      gcash_name: config.gcash.name,
      gcash_qr_url: config.gcash.qrUrl,
      rate_label: `₱1 = ${fmt(GBLESS_PER_PHP)} GBless`,
      note: "Send your GCash payment to the number above, then submit your reference number below. Admin will credit your GBless within 24 hours.",
    },
  });
});

// POST /api/wallet/topup — JSON or multipart (optional receipt image)
router.post("/topup", authenticate, upload.single("receipt"), async (req, res) => {
  const gcashRef = String(req.body?.gcash_ref || "").trim();
  const gcashSender = String(req.body?.gcash_sender || "").trim();
  const amountPhp = parseFloat(req.body?.amount_php || 0);

  if (!gcashRef || !gcashSender) {
    return res.status(400).json({ success: false, message: "GCash reference number and sender name are required" });
  }
  if (amountPhp < 1) {
    return res.status(400).json({ success: false, message: "Minimum top-up is ₱1" });
  }
  if (amountPhp > 10000) {
    return res.status(400).json({ success: false, message: "Maximum single top-up is ₱10,000" });
  }

  let receiptUrl = null;
  if (req.file) {
    const result = await storeImage(req.file, "receipts", 5 * 1024 * 1024);
    if (result.error) {
      return res.status(result.error.includes("not configured") ? 500 : 400).json({ success: false, message: result.error });
    }
    receiptUrl = result.url;
  }

  const gblessAmount = Math.round(amountPhp * GBLESS_PER_PHP);

  try {
    const { rows: dup } = await pool.query(
      "SELECT id FROM gbless_topup_requests WHERE gcash_ref = $1 AND status != 'rejected' LIMIT 1",
      [gcashRef]
    );
    if (dup.length) {
      return res.status(409).json({ success: false, message: "This GCash reference number has already been submitted" });
    }

    const id = uuid();
    await pool.query(
      `INSERT INTO gbless_topup_requests (id, user_id, gcash_ref, gcash_sender, amount_php, gbless_amount, receipt_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, req.user.id, gcashRef, gcashSender, amountPhp, gblessAmount, receiptUrl]
    );

    await notifyAdmins({
      title: "💰 New Top-up Request",
      body: `${req.user.name} submitted ₱${fmtPhp(amountPhp)} top-up${receiptUrl ? " with receipt" : ""}`,
      tag: "topup-" + id,
      url: `${config.appBasePath}/admin/wallet`,
    });

    res.status(201).json({ success: true, message: "Top-up request submitted! Admin will review within 24 hours.", data: { id } });
  } catch (err) {
    console.error("submitTopup error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/wallet/cashout
router.post("/cashout", authenticate, async (req, res) => {
  const gblessAmount = parseInt(req.body?.gbless_amount || 0, 10);
  const gcashNumber = String(req.body?.gcash_number || "").trim();
  const gcashName = String(req.body?.gcash_name || "").trim();

  if (gblessAmount < CASHOUT_MIN) {
    return res.status(400).json({ success: false, message: `Minimum cash-out is ${fmt(CASHOUT_MIN)} GBless (₱${CASHOUT_MIN / GBLESS_PER_PHP})` });
  }
  if (!gcashNumber || !gcashName) {
    return res.status(400).json({ success: false, message: "GCash number and registered name are required" });
  }
  if (!/^(09|\+639)\d{9}$/.test(gcashNumber)) {
    return res.status(400).json({ success: false, message: "Invalid GCash number format (e.g. 09XXXXXXXXX)" });
  }

  try {
    const balance = await getBalance(req.user.id);
    if (balance < gblessAmount) {
      return res.status(400).json({ success: false, message: "Insufficient GBless balance" });
    }

    const { rows: pending } = await pool.query(
      "SELECT id FROM gbless_cashout_requests WHERE user_id = $1 AND status = 'pending' LIMIT 1",
      [req.user.id]
    );
    if (pending.length) {
      return res.status(409).json({ success: false, message: "You already have a pending cash-out request" });
    }

    const amountPhp = Math.round((gblessAmount / GBLESS_PER_PHP) * 100) / 100;
    const id = uuid();

    // Reserve the GBless immediately so it can't be double-spent
    await deductPoints(req.user.id, gblessAmount, "cashout_reserved", id);

    await pool.query(
      `INSERT INTO gbless_cashout_requests (id, user_id, gbless_amount, amount_php, gcash_number, gcash_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, req.user.id, gblessAmount, amountPhp, gcashNumber, gcashName]
    );

    await notifyAdmins({
      title: "💸 Cash-out Request",
      body: `${req.user.name} wants to cash out ₱${fmtPhp(amountPhp)}`,
      tag: "cashout-" + id,
      url: `${config.appBasePath}/admin/wallet`,
    });

    res.status(201).json({ success: true, message: "Cash-out request submitted! Admin will process within 24–48 hours.", data: { id } });
  } catch (err) {
    if (err.message === "Insufficient GBless balance") {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error("submitCashout error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/wallet/gift — send GBless to another user
router.post("/gift", authenticate, async (req, res) => {
  const receiverId = String(req.body?.receiver_id || "").trim();
  const gblessAmount = parseInt(req.body?.gbless_amount || 0, 10);
  const message = String(req.body?.message || "").trim().slice(0, 255);

  if (req.user.id === receiverId) {
    return res.status(400).json({ success: false, message: "You cannot gift GBless to yourself" });
  }
  if (gblessAmount < 100) {
    return res.status(400).json({ success: false, message: "Minimum gift is 100 GBless" });
  }

  try {
    const { rows } = await pool.query("SELECT id, name FROM users WHERE id = $1 AND is_active = 1 LIMIT 1", [receiverId]);
    const receiver = rows[0];
    if (!receiver) {
      return res.status(404).json({ success: false, message: "Recipient not found" });
    }

    await deductPoints(req.user.id, gblessAmount, "gift_sent", receiverId);
    await creditPoints(receiverId, gblessAmount, "gift_received", req.user.id);
    await checkAndAwardBadges(receiverId);

    const giftId = uuid();
    await pool.query(
      "INSERT INTO gbless_gifts (id, sender_id, receiver_id, gbless_amount, message) VALUES ($1, $2, $3, $4, $5)",
      [giftId, req.user.id, receiverId, gblessAmount, message || null]
    );

    sendPushToUser(receiverId, {
      title: `🎁 GBless Gift from ${req.user.name}`,
      body: `${req.user.name} sent you ${fmt(gblessAmount)} GBless!${message ? ` "${message}"` : ""}`,
      tag: "gift-" + giftId,
      url: `${config.appBasePath}/wallet`,
    }).catch(() => {});

    res.json({ success: true, message: `${fmt(gblessAmount)} GBless sent to ${receiver.name}!` });
  } catch (err) {
    if (err.message === "Insufficient GBless balance") {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error("sendGift error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/wallet/history
router.get("/history", authenticate, async (req, res) => {
  try {
    const [tx, topups, cashouts] = await Promise.all([
      pool.query(
        `SELECT pt.action, pt.points, pt.ref_id, pt.created_at, u.name AS ref_name
         FROM point_transactions pt
         LEFT JOIN users u ON u.id = pt.ref_id
         WHERE pt.user_id = $1
         ORDER BY pt.created_at DESC LIMIT 50`,
        [req.user.id]
      ),
      pool.query(
        `SELECT id, gcash_ref, amount_php, gbless_amount, status, admin_note, created_at
         FROM gbless_topup_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.user.id]
      ),
      pool.query(
        `SELECT id, gbless_amount, amount_php, gcash_number, status, admin_note, created_at
         FROM gbless_cashout_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.user.id]
      ),
    ]);
    res.json({ success: true, data: { transactions: tx.rows, topups: topups.rows, cashouts: cashouts.rows } });
  } catch (err) {
    console.error("getHistory error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Admin endpoints ──────────────────────────────────────────────────────────

// GET /api/wallet/admin/topups — pending only
router.get("/admin/topups", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.user_id, t.gcash_ref, t.gcash_sender, t.amount_php,
              t.gbless_amount, t.receipt_url, t.status, t.admin_note, t.created_at,
              u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar
       FROM gbless_topup_requests t
       JOIN users u ON u.id = t.user_id
       WHERE t.status = 'pending'
       ORDER BY t.created_at ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("adminListTopups error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/wallet/admin/cashouts — pending only
router.get("/admin/cashouts", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar
       FROM gbless_cashout_requests c
       JOIN users u ON u.id = c.user_id
       WHERE c.status = 'pending'
       ORDER BY c.created_at ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("adminListCashouts error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/wallet/admin/topup — approve|reject
router.post("/admin/topup", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const requestId = String(req.body?.request_id || "").trim();
  const decision = String(req.body?.decision || "").trim();
  const note = String(req.body?.note || "").trim().slice(0, 500);

  if (!requestId || !["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ success: false, message: "request_id and decision (approved|rejected) are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM gbless_topup_requests WHERE id = $1 AND status = 'pending' LIMIT 1 FOR UPDATE",
      [requestId]
    );
    const topup = rows[0];
    if (!topup) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Request not found or already reviewed" });
    }
    if (topup.user_id === req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ success: false, message: "You cannot review your own top-up request" });
    }

    await client.query(
      "UPDATE gbless_topup_requests SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4",
      [decision, note || null, req.user.id, requestId]
    );

    if (decision === "approved") {
      await creditPoints(topup.user_id, parseInt(topup.gbless_amount, 10), "topup_approved", requestId, client);
    }
    await client.query("COMMIT");

    if (decision === "approved") {
      await checkAndAwardBadges(topup.user_id);
      sendPushToUser(topup.user_id, {
        title: "✅ Top-up Approved!",
        body: `${fmt(topup.gbless_amount)} GBless has been added to your wallet.`,
        tag: "topup-approved-" + requestId,
        url: `${config.appBasePath}/wallet`,
      }).catch(() => {});
    } else {
      sendPushToUser(topup.user_id, {
        title: "❌ Top-up Rejected",
        body: `Your top-up request was rejected.${note ? " Reason: " + note : ""}`,
        tag: "topup-rejected-" + requestId,
        url: `${config.appBasePath}/wallet`,
      }).catch(() => {});
    }

    // Email notification (best-effort)
    const { rows: uRows } = await pool.query("SELECT name, email FROM users WHERE id = $1 LIMIT 1", [topup.user_id]);
    const recipient = uRows[0];
    if (recipient) {
      const approved = decision === "approved";
      sendEmail(
        recipient.email,
        approved ? "✅ Your GBless Top-up Has Been Approved" : "❌ Your GBless Top-up Was Not Approved",
        `<p>Hi ${esc(recipient.name)},</p>` +
          (approved
            ? `<p>Your top-up request of <strong>₱${fmtPhp(topup.amount_php)}</strong> has been approved.</p>` +
              `<p><strong>${fmt(topup.gbless_amount)} GBless</strong> has been added to your wallet.</p>` +
              `<p>Thank you for your contribution to the parish community!</p>`
            : `<p>Unfortunately your top-up request of <strong>₱${fmtPhp(topup.amount_php)}</strong> was not approved.</p>` +
              (note ? `<p>Reason: ${esc(note)}</p>` : "") +
              `<p>Please contact the parish office if you have questions.</p>`) +
          `<p>— Parish Connect</p>`,
        recipient.name
      ).catch(() => {});
    }

    res.json({ success: true, message: `Request ${decision}` });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("adminReviewTopup error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    client.release();
  }
});

// POST /api/wallet/admin/cashout — approve|reject (reject refunds reservation)
router.post("/admin/cashout", authenticate, requireRole("admin", "superadmin"), async (req, res) => {
  const requestId = String(req.body?.request_id || "").trim();
  const decision = String(req.body?.decision || "").trim();
  const note = String(req.body?.note || "").trim().slice(0, 500);

  if (!requestId || !["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ success: false, message: "request_id and decision are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM gbless_cashout_requests WHERE id = $1 AND status = 'pending' LIMIT 1 FOR UPDATE",
      [requestId]
    );
    const cashout = rows[0];
    if (!cashout) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Request not found or already reviewed" });
    }
    if (cashout.user_id === req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ success: false, message: "You cannot review your own cash-out request" });
    }

    await client.query(
      "UPDATE gbless_cashout_requests SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4",
      [decision, note || null, req.user.id, requestId]
    );

    if (decision === "rejected") {
      // Refund the reserved GBless
      await creditPoints(cashout.user_id, parseInt(cashout.gbless_amount, 10), "cashout_refunded", requestId, client);
    }
    await client.query("COMMIT");

    sendPushToUser(cashout.user_id, decision === "rejected"
      ? {
          title: "❌ Cash-out Rejected",
          body: `Your cash-out was rejected. GBless has been refunded.${note ? " Reason: " + note : ""}`,
          tag: "cashout-rejected-" + requestId,
          url: `${config.appBasePath}/wallet`,
        }
      : {
          title: "✅ Cash-out Approved!",
          body: `₱${fmtPhp(cashout.amount_php)} will be sent to your GCash ${cashout.gcash_number} shortly.`,
          tag: "cashout-approved-" + requestId,
          url: `${config.appBasePath}/wallet`,
        }
    ).catch(() => {});

    res.json({ success: true, message: `Cash-out ${decision}` });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("adminReviewCashout error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    client.release();
  }
});

module.exports = router;
