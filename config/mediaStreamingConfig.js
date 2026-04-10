/**
 * HLS / media delivery tuning (read at process start; restart to pick up .env changes).
 */

/** In-memory cache for raw .m3u8 text in mediaProxyExpress before per-request JWT rewrite. */
function getHlsPlaylistCacheTtlMs() {
  const raw = process.env.HLS_PLAYLIST_CACHE_TTL_MS;
  if (raw === undefined || raw === '') return 30_000;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 30_000;
  if (n < 0) return 0;
  return Math.min(n, 600_000);
}

module.exports = {
  getHlsPlaylistCacheTtlMs,
};
