const crypto = require("crypto");
const pool = require("../db/pool");

/** RFC 4122 UUID v4 */
function uuid() {
  return crypto.randomUUID();
}

/** Best-effort client IP (works behind proxies) */
function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "0.0.0.0";
}

/** PHP mb_strimwidth equivalent — truncate to max chars with ellipsis */
function strimwidth(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

/** Write an audit log entry (best-effort).
 *  When `client` is supplied the insert runs inside that client's transaction.
 *  `details` (JSON-serializable) captures before/after values for edits & voids.
 */
async function auditLog(userId, action, targetType, targetId, ip, client, details) {
  try {
    const q = client || pool;
    await q.query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [uuid(), userId, action, targetType || null, targetId || null,
       details ? JSON.stringify(details) : null, ip]
    );
  } catch (err) {
    console.error("auditLog error:", err.message);
  }
}

/** Escape user text for safe embedding in HTML emails */
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Philippine peso-style number format: 10000 -> "10,000" / 10.5 -> "10.50" */
function numFormat(n, decimals = 0) {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Run fn inside a DB transaction. Rolls back on throw.
 * fn receives a dedicated pg client.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { uuid, getClientIp, strimwidth, auditLog, esc, numFormat, withTransaction };
