const express = require("express");
const router = express.Router();
const { getFile } = require("../lib/storage");

const VALID_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_-]*\.[a-zA-Z0-9]+$/;

// GET /api/files/*  -> stream an object from R2 by its key
router.get("/*", async (req, res) => {
  const key = (req.params[0] || "").replace(/^\/+/, "");
  // folder/uuid.ext only — no traversal, no nested weirdness
  if (!key || !VALID_KEY.test(key) || key.includes("..")) {
    return res.status(400).json({ success: false, message: "Invalid file key" });
  }

  const result = await getFile(key);
  if (result.error) {
    return res.status(500).json({ success: false, message: result.error });
  }
  if (result.notFound) {
    return res.status(404).json({ success: false, message: "File not found" });
  }
  // Everything stored via storeImage is an image — refuse anything else
  if (!String(result.contentType || "").startsWith("image/")) {
    return res.status(403).json({ success: false, message: "Unsupported file type" });
  }

  res.setHeader("Content-Type", result.contentType);
  if (result.contentLength) res.setHeader("Content-Length", result.contentLength);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");

  result.body.pipe(res);
  result.body.on("error", (err) => {
    console.error("File stream error:", err.message);
    if (!res.headersSent) res.status(500).end();
  });
});

module.exports = router;
