const { getJwtStringFromRequest } = require('../utils/authRequest');
const { verifyJwtToken } = require('../utils/jwtVerify');

/**
 * Attaches req.authUser when a valid JWT (cookie or Bearer) is present; does not fail if missing/invalid.
 */
function optionalAuth(req, res, next) {
  req.authUser = null;
  const token = getJwtStringFromRequest(req);
  if (!token) {
    return next();
  }
  const decoded = verifyJwtToken(token);
  if (decoded) {
    req.authUser = decoded;
  }
  next();
}

module.exports = { optionalAuth };
