/**
 * Section 6 — purchase / enrollment gate before signed media URLs.
 * Stream and chunk handlers use this via `assertMediaAccess` → `assertSecureMediaAccess`.
 */
const { assertSecureMediaAccess } = require('../services/mediaAuthorizationService');

/**
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
async function assertEnrollmentForMediaUrl(targetUrl, token) {
  return assertSecureMediaAccess(targetUrl, token);
}

module.exports = {
  assertEnrollmentForMediaUrl,
};
