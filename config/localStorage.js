/**
 * Local filesystem storage for development (localhost).
 * Files are served from GET /uploads/... — see server.js static middleware.
 */
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const { randomUUID } = require('crypto');
const { execSync } = require('child_process');

const UPLOAD_ROOT = path.join(__dirname, '..', 'public', 'uploads');

function getBaseUrl() {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.API_PUBLIC_URL ||
    `http://localhost:${process.env.PORT || 5000}`;
  return base.replace(/\/$/, '');
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function getVideoDurationSeconds(filePath) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', timeout: 60000 }
    );
    const sec = parseFloat(String(out).trim());
    return Number.isFinite(sec) ? Math.round(sec) : 0;
  } catch {
    return 0;
  }
}

async function saveBufferFromPath(srcPath, folder, originalExt) {
  const ext = originalExt || path.extname(srcPath) || '';
  const name = `${Date.now()}-${randomUUID()}${ext}`;
  const destDir = path.join(UPLOAD_ROOT, folder);
  await ensureDir(destDir);
  const destPath = path.join(destDir, name);
  await fsp.copyFile(srcPath, destPath);
  const rel = path.join(folder, name).split(path.sep).join('/');
  const url = `${getBaseUrl()}/uploads/${rel}`;
  return { url, publicId: rel };
}

const uploadVideoToLocal = async (filePath, folder = 'courses/videos') => {
  const { url, publicId } = await saveBufferFromPath(filePath, folder, path.extname(filePath));
  const duration = getVideoDurationSeconds(filePath);
  return { url, publicId, duration };
};

const uploadImageToLocal = async (filePath, folder = 'courses/images') => {
  return saveBufferFromPath(filePath, folder, path.extname(filePath));
};

const uploadFileToLocal = async (filePath, folder = 'courses/resources') => {
  const { url, publicId } = await saveBufferFromPath(filePath, folder, path.extname(filePath));
  return {
    url,
    downloadUrl: url,
    publicId,
  };
};

const deleteFromLocal = async (publicId) => {
  if (!publicId) return null;
  const safe = String(publicId).replace(/^\/+/, '').replace(/\.\./g, '');
  const full = path.join(UPLOAD_ROOT, safe);
  if (!full.startsWith(UPLOAD_ROOT)) {
    throw new Error('Invalid path');
  }
  if (fs.existsSync(full)) {
    await fsp.unlink(full);
  }
  return { ok: true };
};

module.exports = {
  uploadVideoToLocal,
  uploadImageToLocal,
  uploadFileToLocal,
  deleteFromLocal,
  UPLOAD_ROOT,
};
