const { getJwtStringFromRequest } = require('./authRequest');
const { assertSecureMediaAccess } = require('../services/mediaAuthorizationService');

function getBearerToken(req) {
  return getJwtStringFromRequest(req);
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
async function assertMediaAccess(targetUrl, token) {
  return assertSecureMediaAccess(targetUrl, token);
}

module.exports = {
  getBearerToken,
  assertMediaAccess,
};
