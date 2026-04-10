/**
 * GET /api/media/signed-read-url — GCS v4 signed read URL (optional CDN path; see .env.example).
 * Feature-flag: GCS_SIGN_FOR_CDN=true. Does not replace /api/hls-proxy or /api/file-proxy.
 *
 * HLS (.m3u8): returns useProxy: true — playlists still go through the proxy (segment signing).
 * MP4 / other files: returns time-limited signed URL; if MEDIA_CDN_BASE_URL is set, host is rewritten from storage.googleapis.com to that CDN/LB origin.
 */
const { parseGcsHttpsUrl } = require('../services/gcsUrlParser');
const { getBearerToken, assertMediaAccess } = require('../utils/secureMediaAccess');
const { getHlsAllowPrefixes, getFileAllowPrefixes } = require('../utils/mediaProxyPrefixes');
const { generateSignedUrl } = require('../utils/streamUrl');
const { rewriteGcsSignedUrlToCdn } = require('../utils/mediaCdnUrl');

function isAllowedMediaUrl(target) {
  const hls = getHlsAllowPrefixes();
  const file = getFileAllowPrefixes();
  return [...hls, ...file].some((p) => target.startsWith(p));
}

async function getSignedReadUrl(req, res) {
  if (String(process.env.GCS_SIGN_FOR_CDN || '').toLowerCase() !== 'true') {
    return res.status(404).json({
      success: false,
      message: 'GCS signed read URLs are disabled (set GCS_SIGN_FOR_CDN=true)',
    });
  }

  const u = req.query.u;
  if (!u || typeof u !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing u (encoded GCS HTTPS URL)' });
  }

  let target;
  try {
    target = decodeURIComponent(u);
  } catch {
    return res.status(400).json({ success: false, message: 'Bad URL' });
  }

  if (!target.startsWith('http://') && !target.startsWith('https://')) {
    return res.status(400).json({ success: false, message: 'Invalid URL' });
  }

  if (!isAllowedMediaUrl(target)) {
    return res.status(403).json({ success: false, message: 'Forbidden URL' });
  }

  const token = getBearerToken(req);
  const secureDisabled = process.env.SECURE_MEDIA_DISABLED === 'true';

  if (!secureDisabled) {
    try {
      const access = await assertMediaAccess(target, token);
      if (!access.ok) {
        return res.status(access.status).json({ success: false, message: access.message });
      }
    } catch (e) {
      console.error('[signed-read-url] assertMediaAccess', e);
      return res.status(500).json({ success: false, message: e.message || 'Server error' });
    }
  }

  const parsed = parseGcsHttpsUrl(target);
  if (!parsed) {
    return res.status(400).json({ success: false, message: 'Not a storage.googleapis.com URL' });
  }

  const { bucketName, objectName } = parsed;
  const type = String(req.query.type || '').toLowerCase();
  const lower = objectName.toLowerCase();
  const isHlsPlaylist = lower.endsWith('.m3u8') || type === 'hls';

  if (isHlsPlaylist) {
    return res.status(200).json({
      success: true,
      useProxy: true,
      url: null,
      message: 'Use existing /api/hls-proxy for HLS until CDN playlist signing is configured',
    });
  }

  try {
    const signed = await generateSignedUrl('chunk', bucketName, objectName);
    const url = rewriteGcsSignedUrlToCdn(signed);
    const body = {
      success: true,
      useProxy: false,
      url,
    };
    if (process.env.MEDIA_CDN_BASE_URL?.trim() && url !== signed) {
      body.cdnRewritten = true;
    }
    return res.status(200).json(body);
  } catch (e) {
    console.error('[signed-read-url] generateSignedUrl', e);
    return res.status(500).json({ success: false, message: e.message || 'Failed to generate signed URL' });
  }
}

module.exports = {
  getSignedReadUrl,
};
