/**
 * Allowed GCS/CDN URL prefixes for media proxies (comma-separated env).
 */

function parsePrefixList(raw, fallback) {
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return fallback;
}

function getHlsAllowPrefixes() {
  return parsePrefixList(process.env.HLS_PROXY_ALLOW_PREFIXES, [
    'https://storage.googleapis.com/vixhunter-processed-videos/',
  ]);
}

function getFileAllowPrefixes() {
  return parsePrefixList(process.env.FILE_PROXY_ALLOW_PREFIXES, [
    'https://storage.googleapis.com/vixhunter-processed-videos/',
    'https://storage.googleapis.com/vixhunter-static-assets/',
  ]);
}

module.exports = {
  getHlsAllowPrefixes,
  getFileAllowPrefixes,
};
