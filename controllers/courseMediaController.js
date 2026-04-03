const { Readable } = require('stream');
const Course = require('../models/Course');
const { getBearerToken, assertMediaAccess } = require('../utils/secureMediaAccess');
const { getFileAllowPrefixes } = require('../utils/mediaProxyPrefixes');
const { resolveCourseThumbnailTargetUrl } = require('../utils/redactCourseMediaUrls');

const FORWARD_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'last-modified',
  'etag',
];

/**
 * GET /api/courses/:courseId/media/thumbnail
 * Streams cover image after JWT + same rules as file-proxy. No GCS URL appears in public course JSON.
 */
async function streamCourseThumbnail(req, res) {
  const secureDisabled = process.env.SECURE_MEDIA_DISABLED === 'true';
  const { courseId } = req.params;

  try {
    const course = await Course.findById(courseId)
      .select('thumbnailUrl thumbnailPublicId status')
      .lean();

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const targetUrl = resolveCourseThumbnailTargetUrl(course);
    if (!targetUrl) {
      return res.status(404).json({ message: 'No thumbnail' });
    }

    const allowPrefixes = getFileAllowPrefixes();
    if (!allowPrefixes.some((p) => targetUrl.startsWith(p))) {
      return res.status(403).json({ message: 'Forbidden URL' });
    }

    const token = getBearerToken(req);

    if (!secureDisabled) {
      const access = await assertMediaAccess(targetUrl, token);
      if (!access.ok) {
        return res.status(access.status).json({ message: access.message });
      }
    }

    const range = req.headers.range;
    const upstreamHeaders = {};
    if (range) upstreamHeaders.Range = range;

    let upstream;
    try {
      upstream = await fetch(targetUrl, { headers: upstreamHeaders, cache: 'no-store' });
    } catch {
      return res.status(502).json({ message: 'Upstream fetch failed' });
    }

    FORWARD_HEADERS.forEach((name) => {
      const v = upstream.headers.get(name);
      if (v) res.setHeader(name, v);
    });
    res.setHeader('Cache-Control', 'private, no-store');

    res.status(upstream.status);

    if (!upstream.body) {
      return res.end();
    }

    if (typeof Readable.fromWeb === 'function') {
      const nodeStream = Readable.fromWeb(upstream.body);
      nodeStream.on('error', (err) => {
        console.error('[course-thumbnail] stream error', err);
        if (!res.headersSent) res.status(500);
        res.end();
      });
      return nodeStream.pipe(res);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (e) {
    console.error('[course-thumbnail]', e);
    return res.status(500).json({ message: e.message || 'Server error' });
  }
}

module.exports = {
  streamCourseThumbnail,
};
