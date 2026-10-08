const { Pool } = require("pg");
const config = require("../config");

// CockroachDB Serverless / PostgreSQL connection pool.
// Small pool size — serverless-friendly.
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("Unexpected PG pool error:", err.message);
});

module.exports = pool;
