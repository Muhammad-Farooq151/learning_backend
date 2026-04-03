/**
 * Parse https://storage.googleapis.com/{bucket}/{object...}
 */
function parseGcsHttpsUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.hostname !== 'storage.googleapis.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const bucketName = parts[0];
    const objectName = parts.slice(1).join('/');
    return { bucketName, objectName };
  } catch {
    return null;
  }
}

module.exports = {
  parseGcsHttpsUrl,
};
