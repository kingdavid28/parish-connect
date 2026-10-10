require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const config = require("./config");
const pool = require("./db/pool");

const app = express();

// Security headers
app.use(helmet());
app.set("trust proxy", 1); // behind Render/CF proxy — needed for correct client IP

// CORS — only allow configured frontend origins
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// Body parsing (receipts/images come via multipart; JSON stays small)
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// Global rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later" },
}));

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: "Too many login attempts, please try again later" },
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/config", require("./routes/configRoute"));
app.use("/api/auth", authLimiter, require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/posts", require("./routes/posts"));
app.use("/api/follows", require("./routes/follows"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/groups", require("./routes/groups"));
app.use("/api/push", require("./routes/push"));
app.use("/api/community", require("./routes/community"));
app.use("/api/rewards", require("./routes/rewards"));
app.use("/api/wallet", require("./routes/wallet"));
app.use("/api/sacraments", require("./routes/sacraments"));
app.use("/api/finance", require("./routes/finance"));
app.use("/api/records", require("./routes/records"));
app.use("/api/audit", require("./routes/audit"));
app.use("/api/cron", require("./routes/cron"));

// Health check — also verifies DB connectivity
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, message: `${config.parish.name} API is running` });
  } catch (err) {
    res.status(503).json({ success: false, message: "Database unavailable" });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  if (err && err.message === "Not allowed by CORS") {
    return res.status(403).json({ success: false, message: "Origin not allowed" });
  }
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ success: false, message: "File too large" });
  }
  console.error("Unhandled error:", err.message);
  res.status(500).json({ success: false, message: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`Parish Connect API (${config.parish.name}) running on port ${config.port}`);
});
