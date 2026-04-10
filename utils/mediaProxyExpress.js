const { getHlsPlaylistCacheTtlMs } = require('../config/mediaStreamingConfig');
const { getBearerToken, assertMediaAccess } = require('./secureMediaAccess');
const { parseGcsHttpsUrl } = require('../services/gcsUrlParser');
const {
  downloadObjectAsString,
  getObjectMeta,
  parseRangeHeader,
  createObjectReadStream,
} = require('../services/gcsStreamService');

function isAllowedUrl(url, allowPrefixes) {
  return allowPrefixes.some((p) => url.startsWith(p));
}

function getRequestOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return 'http://localhost:5000';
  return `${proto}://${host}`;
}

function toProxyUrl(origin, proxyPathname, absoluteUrl, jwtToken) {
  const base = `${origin}${proxyPathname}?u=${encodeURIComponent(absoluteUrl)}`;
  if (jwtToken) {
    return `${base}&token=${encodeURIComponent(jwtToken)}`;
  }
  return base;
}

function rewritePlaylistBody(text, playlistUrlString, origin, proxyPathname, jwtToken, allowPrefixes) {
  let playlistUrl;
  try {
    playlistUrl = new URL(playlistUrlString);
  } catch {
    return text;
  }
  const baseDir = playlistUrl.href.slice(0, playlistUrl.href.lastIndexOf('/') + 1);

  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('#')) {
        const uriMatch = trimmed.match(/URI="([^"]+)"/);
        if (uriMatch) {
          const inner = uriMatch[1];
          const abs =
            inner.startsWith('http://') || inner.startsWith('https://')
              ? inner
              : new URL(inner, baseDir).href;
          if (isAllowedUrl(abs, allowPrefixes)) {
            return line.replace(
              uriMatch[0],
              `URI="${toProxyUrl(origin, proxyPathname, abs, jwtToken)}"`
            );
          }
        }
        return line;
      }

      if (!trimmed) return line;

      const abs =
        trimmed.startsWith('http://') || trimmed.startsWith('https://')
          ? trimmed
          : new URL(trimmed, baseDir).href;

      if (isAllowedUrl(abs, allowPrefixes)) {
        return toProxyUrl(origin, proxyPathname, abs, jwtToken);
      }
      return line;
    })
    .join('\n');
}

/** Raw playlist text cache (rewrite still per-request with JWT in URLs). */
const playlistCache = new Map();
const PLAYLIST_TTL_MS = getHlsPlaylistCacheTtlMs();
const PLAYLIST_MAX = 200;

function getCachedPlaylist(cacheKey) {
  const e = playlistCache.get(cacheKey);
  if (!e) return null;
  if (Date.now() > e.exp) {
    playlistCache.delete(cacheKey);
    return null;
  }
  return e.text;
}

function setCachedPlaylist(cacheKey, text) {
  if (playlistCache.size >= PLAYLIST_MAX) {
    const k = playlistCache.keys().next().value;
    playlistCache.delete(k);
  }
  playlistCache.set(cacheKey, { text, exp: Date.now() + PLAYLIST_TTL_MS });
}

function isPlaylistTarget(target, objectName) {
  return (
    target.includes('.m3u8') ||
    objectName.toLowerCase().endsWith('.m3u8')
  );
}

function guessContentType(objectName, metaContentType) {
  const ext = objectName.split('.').pop()?.toLowerCase();
  if (ext === 'ts') return 'video/mp2t';
  if (ext === 'm3u8') return 'application/vnd.apple.mpegurl';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return metaContentType || 'application/octet-stream';
}

/**
 * Stream from private GCS via SDK (no public HTTP to storage.googleapis.com).
 */
async function streamBinaryFromGcs(req, res, bucketName, objectName, targetUrl) {
  let meta;
  try {
    meta = await getObjectMeta(bucketName, objectName);
  } catch (e) {
    const code = e.code || e?.errors?.[0]?.reason;
    if (code === 404 || String(e.message).includes('No such object')) {
      return res.status(404).json({ message: 'Object not found' });
    }
    console.error('[media-proxy] getObjectMeta', e);
    return res.status(502).json({ message: 'Storage error' });
  }

  const size = meta.size || 0;
  const ct = guessContentType(objectName, meta.contentType);

  const rangeHeader = req.headers.range;
  const parsed = parseRangeHeader(rangeHeader, size);

  if (parsed) {
    const chunk = parsed.end - parsed.start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${parsed.start}-${parsed.end}/${size}`);
    res.setHeader('Content-Length', chunk);
  } else {
    res.status(200);
    if (size > 0) res.setHeader('Content-Length', size);
  }

  res.setHeader('Content-Type', ct);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');

  const stream = createObjectReadStream(
    bucketName,
    objectName,
    parsed ? { start: parsed.start, end: parsed.end } : null
  );

  stream.on('error', (err) => {
    console.error('[media-proxy] GCS read stream', err.message || err);
    if (!res.headersSent) res.status(500);
    res.end();
  });

  stream.pipe(res);
}

/**
 * Express handler: GET ?u=<encoded GCS HTTPS URL> — auth + GCS SDK streaming only.
 */
async function handleMediaProxyGet(req, res, allowPrefixes, proxyPathname = '/api/hls-proxy') {
  const secureDisabled = process.env.SECURE_MEDIA_DISABLED === 'true';

  const u = req.query.u;
  if (!u || typeof u !== 'string') {
    return res.status(400).json({ message: 'Missing URL' });
  }

  let target;
  try {
    target = decodeURIComponent(u);
  } catch {
    return res.status(400).json({ message: 'Bad URL' });
  }

  if (!target.startsWith('http://') && !target.startsWith('https://')) {
    return res.status(400).json({ message: 'Invalid URL' });
  }

  if (!isAllowedUrl(target, allowPrefixes)) {
    return res.status(403).json({ message: 'Forbidden URL' });
  }

  const parsed = parseGcsHttpsUrl(target);
  if (!parsed) {
    return res.status(400).json({ message: 'Not a storage.googleapis.com URL' });
  }

  const { bucketName, objectName } = parsed;

  const token = getBearerToken(req);

  if (!secureDisabled) {
    try {
      const access = await assertMediaAccess(target, token);
      if (!access.ok) {
        return res.status(access.status).json({ message: access.message });
      }
    } catch (e) {
      console.error('[media-proxy]', e);
      return res.status(500).json({ message: e.message || 'Server error' });
    }
  }

  const origin = getRequestOrigin(req);

  if (isPlaylistTarget(target, objectName)) {
    try {
      const cacheKey = `${bucketName}::${objectName}`;
      let text = getCachedPlaylist(cacheKey);
      if (!text) {
        text = await downloadObjectAsString(bucketName, objectName);
        setCachedPlaylist(cacheKey, text);
      }
      const rewritten = rewritePlaylistBody(
        text,
        target,
        origin,
        proxyPathname,
        token,
        allowPrefixes
      );
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).send(rewritten);
    } catch (e) {
      console.error('[media-proxy] playlist', e.message || e);
      if (e.code === 404 || String(e.message).includes('No such object')) {
        return res.status(404).json({ message: 'Playlist not found' });
      }
      return res.status(502).json({ message: 'Failed to read playlist' });
    }
  }

  return streamBinaryFromGcs(req, res, bucketName, objectName, target);
}

module.exports = {
  handleMediaProxyGet,
  streamBinaryFromGcs,
};
