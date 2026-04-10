/**
 * Shared limiter for HLS playlist + signed chunk traffic (Section 6).
 */
const rateLimit = require('express-rate-limit');

const hlsTrafficLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

module.exports = { hlsTrafficLimiter };
