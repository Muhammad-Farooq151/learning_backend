/**
 * Section 4 — GCS v4 signed read URLs (runbook name: streamUrl.js).
 * Delegates to signedUrl.js. Signed URLs use https://storage.googleapis.com/... as-is unless
 * MEDIA_CDN_REWRITE_SIGNED_URLS=true (see mediaCdnUrl.js + docs).
 */
const { generateSignedUrl, TTL_MS } = require('./signedUrl');

module.exports = {
  generateSignedUrl,
  TTL_MS,
};
