const { getStorage } = require('../config/gcsStorage');

function getFileRef(bucketName, objectName) {
  const storage = getStorage();
  return storage.bucket(bucketName).file(objectName.replace(/^\/+/, ''));
}

/**
 * Full object download as UTF-8 string (playlists are small).
 */
async function downloadObjectAsString(bucketName, objectName) {
  const file = getFileRef(bucketName, objectName);
  const [buf] = await file.download();
  return buf.toString('utf8');
}

/**
 * @returns {Promise<{ size: number, contentType?: string }>}
 */
async function getObjectMeta(bucketName, objectName) {
  const file = getFileRef(bucketName, objectName);
  const [meta] = await file.getMetadata();
  const size = Number(meta.size) || 0;
  return {
    size,
    contentType: meta.contentType || undefined,
  };
}

/**
 * Parse Range: bytes=start-end | bytes=start- | bytes=-suffix
 * @returns {{ start: number, end: number } | null}
 */
function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader || fileSize <= 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
  if (!m) return null;
  let start = m[1] === '' ? null : parseInt(m[1], 10);
  let end = m[2] === '' ? null : parseInt(m[2], 10);

  if (start === null && end === null) return null;

  if (start !== null && end === null) {
    end = fileSize - 1;
  } else if (start === null && end !== null) {
    const suffixLen = end;
    start = Math.max(0, fileSize - suffixLen);
    end = fileSize - 1;
  }

  start = Math.max(0, Math.min(start, fileSize - 1));
  end = Math.max(start, Math.min(end, fileSize - 1));
  return { start, end };
}

/**
 * Readable stream for full object or byte range (no full file in memory).
 */
function createObjectReadStream(bucketName, objectName, range) {
  const file = getFileRef(bucketName, objectName);
  const opts = {};
  if (range && Number.isFinite(range.start) && Number.isFinite(range.end)) {
    opts.start = range.start;
    opts.end = range.end;
  }
  return file.createReadStream(opts);
}

module.exports = {
  getFileRef,
  downloadObjectAsString,
  getObjectMeta,
  parseRangeHeader,
  createObjectReadStream,
};
