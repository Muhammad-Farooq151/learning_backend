/**
 * Normalize category / course-level picks from the client so we persist
 * display names in Course, never Mongo ids or raw objects.
 */
function normalizeAdminPickName(raw) {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'object' && raw !== null && typeof raw.name === 'string') {
    return raw.name.trim();
  }
  return '';
}

module.exports = { normalizeAdminPickName };
