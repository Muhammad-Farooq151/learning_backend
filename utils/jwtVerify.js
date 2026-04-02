const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'default_dev_jwt_secret_change_me';

/** Doc §3 — only HS256 to avoid algorithm confusion */
function verifyJwtToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

module.exports = {
  JWT_SECRET,
  verifyJwtToken,
};
