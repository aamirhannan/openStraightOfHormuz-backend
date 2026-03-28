const express = require("express");

const router = express.Router();

// GET /api/health — server health check
router.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

module.exports = router;
