const { Readable } = require('stream');
const { getBearerToken, assertMediaAccess } = require('./secureMediaAccess');

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

const FORWARD_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'last-modified',
  'etag',
];

/**
 * Express handler: GET with query u=encoded GCS URL
 * @param {string} proxyPathname - '/api/hls-proxy' or '/api/file-proxy' (rewritten playlist segment URLs)
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

  const range = req.headers.range;
  const upstreamHeaders = {};
  if (range) upstreamHeaders.Range = range;

  let upstream;
  try {
    upstream = await fetch(target, { headers: upstreamHeaders, cache: 'no-store' });
  } catch {
    return res.status(502).json({ message: 'Upstream fetch failed' });
  }

  const ct = upstream.headers.get('content-type') || '';
  const looksLikePlaylist =
    target.includes('.m3u8') ||
    ct.includes('application/vnd.apple.mpegurl') ||
    ct.includes('application/x-mpegURL');

  const origin = getRequestOrigin(req);

  if (looksLikePlaylist && upstream.ok) {
    const text = await upstream.text();
    const rewritten = rewritePlaylistBody(
      text,
      target,
      origin,
      proxyPathname,
      token,
      allowPrefixes
    );
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(rewritten);
  }

  FORWARD_HEADERS.forEach((name) => {
    const v = upstream.headers.get(name);
    if (v) res.setHeader(name, v);
  });

  res.status(upstream.status);

  if (!upstream.body) {
    return res.end();
  }

  try {
    if (typeof Readable.fromWeb === 'function') {
      const nodeStream = Readable.fromWeb(upstream.body);
      nodeStream.on('error', (err) => {
        console.error('[media-proxy] stream error', err);
        if (!res.headersSent) res.status(500);
        res.end();
      });
      return nodeStream.pipe(res);
    }
  } catch (e) {
    console.error('[media-proxy] fromWeb failed', e);
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  return res.send(buf);
}

module.exports = {
  handleMediaProxyGet,
};
