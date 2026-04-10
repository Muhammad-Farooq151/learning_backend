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

function appendCdnBases(prefixes) {
  const out = [...prefixes];
  const seen = new Set(out);
  for (const key of ['MEDIA_CDN_BASE_URL', 'GCS_PUBLIC_CDN_BASE_URL']) {
    const raw = process.env[key];
    if (!raw || !String(raw).trim()) continue;
    let base = String(raw).trim().replace(/\/$/, '');
    if (!base.startsWith('http://') && !base.startsWith('https://')) continue;
    const withSlash = `${base}/`;
    if (!seen.has(withSlash)) {
      seen.add(withSlash);
      out.push(withSlash);
    }
  }
  return out;
}

function getFileAllowPrefixes() {
  const defaults = [
    'https://storage.googleapis.com/vixhunter-processed-videos/',
    'https://storage.googleapis.com/vixhunter-static-assets/',
  ];
  const fromEnv = parsePrefixList(process.env.FILE_PROXY_ALLOW_PREFIXES, []);
  const base = fromEnv.length ? fromEnv : defaults;
  return appendCdnBases(base);
}

module.exports = {
  getHlsAllowPrefixes,
  getFileAllowPrefixes,
};
