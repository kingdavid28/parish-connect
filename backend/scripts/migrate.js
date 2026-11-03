/**
 * Apply schema.pg.sql to the configured DATABASE_URL.
 * Usage: npm run migrate
 * Idempotent — safe to run repeatedly.
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Create backend/.env first.");
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, "..", "src", "db", "schema.pg.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");

  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log("Applying schema to", url.replace(/:[^:@]+@/, ":***@"), "…");
    await pool.query(sql);
    console.log("Schema applied successfully.");

    // One-way data migration: legacy `contributions` (one row per
    // donor/month) → `contribution_payments` (multi-payment ledger).
    // Schema always creates `contributions` empty when absent, so this is
    // a no-op on fresh installs; safe to re-run.
    const moved = await pool.query(
      `INSERT INTO contribution_payments
         (id, donor_id, year, month, amount, method, reference, receipt_url, recorded_by, created_at, updated_at)
       SELECT id, donor_id, year, month, amount, method, reference, receipt_url, recorded_by, created_at, updated_at
       FROM contributions
       ON CONFLICT (id) DO NOTHING`
    );
    if (moved.rowCount > 0) {
      console.log(`Migrated ${moved.rowCount} contribution(s) into contribution_payments.`);
    }
    await pool.query("DROP TABLE IF EXISTS contributions");

    // One-shot URL rewrite: stored pub-*.r2.dev URLs → API proxy URLs so
    // images serve through /api/files even if the bucket's public URL is
    // unreachable or disabled. Idempotent — REPLACE is a no-op on rerun.
    const r2Base = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
    const apiBase = (process.env.API_PUBLIC_URL || "").replace(/\/$/, "");
    if (r2Base && apiBase) {
      const columns = [
        ["users", "avatar"],
        ["posts", "image_url"],
        ["messages", "image_url"],
        ["group_chats", "avatar"],
        ["group_messages", "image_url"],
        ["contribution_payments", "receipt_url"],
        ["gbless_topup_requests", "receipt_url"],
      ];
      let rewritten = 0;
      for (const [table, col] of columns) {
        const r = await pool.query(
          `UPDATE ${table} SET ${col} = REPLACE(${col}, $1, $2) WHERE ${col} LIKE $3`,
          [r2Base, `${apiBase}/api/files`, `${r2Base}/%`]
        );
        rewritten += r.rowCount;
      }
      if (rewritten > 0) {
        console.log(`Rewrote ${rewritten} stored image URL(s) to the /api/files proxy.`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
