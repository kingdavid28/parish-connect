const express = require("express");
const config = require("../config");

const router = express.Router();

/**
 * GET /api/config — public parish configuration consumed by the frontend
 * at boot (branding, base path, feature flags). Never expose secrets here.
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      parish: {
        id: config.parish.id,
        name: config.parish.name,
        shortName: config.parish.shortName,
        location: config.parish.location,
        tagline: config.parish.tagline,
        accentColor: config.parish.accentColor,
        logoUrl: config.parish.logoUrl,
        backgroundUrl: config.parish.backgroundUrl,
      },
      appUrl: config.appUrl,
      basePath: config.appBasePath,
      features: config.features,
      verifyParishRecords: config.verifyParishRecords,
      vapidPublicKey: config.vapid.publicKey || null,
    },
  });
});

module.exports = router;
