require("dotenv").config();

/**
 * Central configuration — every per-parish value comes from env vars
 * so a new parish deployment requires no code changes.
 */
module.exports = {
  // Server
  port: parseInt(process.env.PORT || "3000", 10),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  // App identity / URL
  appUrl: (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, ""),
  appBasePath: process.env.APP_BASE_PATH || "", // e.g. "/parish-connect" — "" when at domain root

  // Database (CockroachDB / PostgreSQL connection string)
  databaseUrl: process.env.DATABASE_URL || "",

  // Auth
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  jwtExpiresSeconds: parseInt(process.env.JWT_EXPIRES_SECONDS || "604800", 10),

  // Web Push / VAPID
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
    privateKey: process.env.VAPID_PRIVATE_KEY || "",
    email: process.env.VAPID_EMAIL || "mailto:admin@parish.local",
  },

  // Email (SMTP)
  mail: {
    host: process.env.MAIL_HOST || "",
    port: parseInt(process.env.MAIL_PORT || "587", 10),
    username: process.env.MAIL_USERNAME || "",
    password: process.env.MAIL_PASSWORD || "",
    fromAddress: process.env.MAIL_FROM_ADDRESS || "",
    fromName: process.env.MAIL_FROM_NAME || "Parish Connect",
  },

  // Groq AI (auto-post cron)
  groqApiKey: process.env.GROQ_API_KEY || "",
  cronSecret: process.env.CRON_SECRET || "",

  // ── Per-parish branding ──────────────────────────────────────────────────
  parish: {
    id: process.env.PARISH_ID || "parish",
    name: process.env.PARISH_NAME || "Parish Connect",
    shortName: process.env.PARISH_SHORT_NAME || "Parish",
    location: process.env.PARISH_LOCATION || "",
    tagline: process.env.PARISH_TAGLINE || "Your parish community app",
    accentColor: process.env.PARISH_ACCENT_COLOR || "#2563eb",
    logoUrl: process.env.PARISH_LOGO_URL || "",
    backgroundUrl: process.env.PARISH_BACKGROUND_URL || "",
    hashtags: process.env.PARISH_HASHTAGS || "#ParishConnect",
    languageNotes:
      process.env.PARISH_LANGUAGE_NOTES ||
      "Write in a mix of Cebuano (Bisaya) and English, the way locals actually speak.",
  },

  // GCash parish info (shown to users for manual top-up)
  gcash: {
    number: process.env.GCASH_NUMBER || "",
    name: process.env.GCASH_NAME || "",
    qrUrl: process.env.GCASH_QR_URL || "",
  },

  // Feature flags
  features: {
    records: process.env.RECORDS_MODE || "internal", // "internal" | "off"
    wallet: process.env.FEATURE_WALLET !== "0",
    rewards: process.env.FEATURE_REWARDS !== "0",
    finance: process.env.FEATURE_FINANCE !== "0",
  },

  // Cloudflare R2 (S3-compatible) file storage for uploads
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    bucket: process.env.R2_BUCKET || "",
    publicUrl: (process.env.R2_PUBLIC_URL || "").replace(/\/$/, ""),
  },

  // Registration identity verification: when RECORDS_MODE=internal, new users
  // are verified against the internal sacramental_records table. Set to "0"
  // to disable verification (open registration).
  verifyParishRecords: process.env.VERIFY_PARISH_RECORDS !== "0",
};
