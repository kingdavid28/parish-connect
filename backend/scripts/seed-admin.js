/**
 * Create the first superadmin account for a parish instance.
 *
 * Usage:
 *   npm run seed-admin -- --email=admin@parish.com --password='Secret123' --name="Parish Admin"
 *
 * Only runs if no active superadmin exists yet (safe to re-run — it will
 * just report that a superadmin already exists).
 */
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function arg(name, fallback) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=").slice(1).join("=") : fallback;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Create backend/.env first.");
    process.exit(1);
  }

  const email = arg("email", process.env.SEED_ADMIN_EMAIL || "");
  const password = arg("password", process.env.SEED_ADMIN_PASSWORD || "");
  const name = arg("name", process.env.SEED_ADMIN_NAME || "Super Administrator");
  const parishId = process.env.PARISH_ID || "parish";

  if (!email || !password) {
    console.error("Provide --email=... and --password=... (or SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env)");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  try {
    const { rows } = await pool.query(
      "SELECT id, email FROM users WHERE role = 'superadmin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1"
    );
    if (rows.length) {
      console.log(`A superadmin already exists (${rows[0].email}). Nothing to do.`);
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, parish_id, member_since)
       VALUES ($1, $2, $3, $4, 'superadmin', $5, CURRENT_DATE)`,
      [id, name, email.toLowerCase().trim(), hash, parishId]
    );
    console.log(`Superadmin created: ${email} (id ${id}). Log in and change the password if this was a temporary one.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
