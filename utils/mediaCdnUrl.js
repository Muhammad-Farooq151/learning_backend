/**
 * Rewrite GCS v4 signed URLs to use Cloud CDN / LB hostname when MEDIA_CDN_BASE_URL is set.
 * Path-style: https://storage.googleapis.com/bucket/key → https://cdn/bucket/key
 * Virtual-hosted: https://bucket.storage.googleapis.com/key → https://cdn/bucket/key
 *
 * Default: OFF (Section 4 — signed URLs stay on storage.googleapis.com; swapping host can cause
 * SignatureDoesNotMatch). Set MEDIA_CDN_REWRITE_SIGNED_URLS=true only if your LB/backend bucket accepts it.
 */
function shouldRewriteSignedUrlToCdn() {
  return String(process.env.MEDIA_CDN_REWRITE_SIGNED_URLS || '').toLowerCase() === 'true';
}

function rewriteGcsSignedUrlToCdn(signedUrl) {
  if (!shouldRewriteSignedUrlToCdn()) return signedUrl;
  const raw = (process.env.MEDIA_CDN_BASE_URL || '').trim();
  if (!raw || !signedUrl || typeof signedUrl !== 'string') return signedUrl;

  const base = raw.replace(/\/$/, '');

  if (signedUrl.startsWith('https://storage.googleapis.com')) {
    return signedUrl.replace('https://storage.googleapis.com', base);
  }
  if (signedUrl.startsWith('http://storage.googleapis.com')) {
    return signedUrl.replace('http://storage.googleapis.com', base);
  }

  const vh = /^https:\/\/([a-z0-9._-]+)\.storage\.googleapis\.com(\/.*|$)/i;
  const m = signedUrl.match(vh);
  if (m) {
    const bucket = m[1];
    const rest = m[2] || '';
    return `${base}/${bucket}${rest}`;
  }

  return signedUrl;
}

/** Same transform for any GCS HTTPS URL string (signed or unsigned path). */
function rewriteGcsStorageUrlToCdn(url) {
  return rewriteGcsSignedUrlToCdn(url);
}

module.exports = {
  shouldRewriteSignedUrlToCdn,
  rewriteGcsSignedUrlToCdn,
  rewriteGcsStorageUrlToCdn,
};
