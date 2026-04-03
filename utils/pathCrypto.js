/**
 * Doc §4.3 — AES-256-CBC opaque `t` for chunk URLs (optional; requires PATH_ENCRYPTION_KEY).
 */
const crypto = require('crypto');

function getKey() {
  const hex = process.env.PATH_ENCRYPTION_KEY;
  if (!hex || typeof hex !== 'string' || hex.length !== 64) {
    throw new Error('PATH_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

function encryptPath(gcsPath) {
  const KEY = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(gcsPath), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, enc]).toString('base64url');
}

function decryptPath(token) {
  const KEY = getKey();
  const buf = Buffer.from(String(token), 'base64url');
  if (buf.length < 17) throw new Error('bad token');
  const iv = buf.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
  return Buffer.concat([decipher.update(buf.subarray(16)), decipher.final()]).toString('utf8');
}

function pathCryptoEnabled() {
  const hex = process.env.PATH_ENCRYPTION_KEY;
  return typeof hex === 'string' && /^[a-fA-F0-9]{64}$/.test(hex);
}

module.exports = {
  encryptPath,
  decryptPath,
  pathCryptoEnabled,
};
