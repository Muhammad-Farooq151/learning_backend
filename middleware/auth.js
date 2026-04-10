/**
 * Section 6 — JWT verification + user load (runbook name: `middleware/auth.js`).
 * httpOnly cookie + Authorization Bearer via `getJwtStringFromRequest`.
 */
const { auth } = require('./authMiddleware');

module.exports = { auth, authMiddleware: auth };
