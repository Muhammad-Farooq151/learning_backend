/**
 * Doc §3.5 — token from httpOnly cookie first, then Authorization, then ?token= (media).
 */
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'auth_token';

function getJwtStringFromRequest(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    const c = String(req.cookies[COOKIE_NAME]).trim();
    if (c) return c;
  }
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const t = auth.substring(7).trim();
    if (t) return t;
  }
  const q = req.query && req.query.token;
  return typeof q === 'string' && q.trim() ? q.trim() : null;
}

module.exports = {
  COOKIE_NAME,
  getJwtStringFromRequest,
};
