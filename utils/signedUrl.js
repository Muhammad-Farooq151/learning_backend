/**
 * Doc §2 — v4 signed read URLs with TTL by content kind.
 */
const { getStorage } = require('../config/gcsStorage');

const TTL_MS = {
  chunk: 10 * 60 * 1000,
  playlist: 30 * 60 * 1000,
  thumbnail: 24 * 60 * 60 * 1000,
  pdf: 60 * 60 * 1000,
  caption: 4 * 60 * 60 * 1000,
  certificate: 7 * 24 * 60 * 60 * 1000,
};

/**
 * @param {'chunk'|'playlist'|'thumbnail'|'pdf'|'caption'|'certificate'} kind
 * @param {string} bucketName
 * @param {string} objectKey — path inside bucket
 */
async function generateSignedUrl(kind, bucketName, objectKey) {
  const ttl = TTL_MS[kind] || TTL_MS.chunk;
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectKey.replace(/^\/+/, ''));
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + ttl,
  });
  return url;
}

module.exports = {
  generateSignedUrl,
  TTL_MS,
};
