/**
 * Professional LMS-style Range Utilities
 * Handles watched ranges merging and calculation
 */

/**
 * Merge overlapping or adjacent ranges
 * @param {Array} ranges - Array of {start, end} objects
 * @returns {Array} - Merged ranges
 */
function mergeRanges(ranges) {
  if (!ranges || ranges.length === 0) return [];
  
  // Sort ranges by start time
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [];
  
  for (const range of sorted) {
    if (merged.length === 0) {
      merged.push({ ...range });
      continue;
    }
    
    const last = merged[merged.length - 1];
    
    // If current range overlaps or is adjacent to last range, merge them
    if (range.start <= last.end) {
      // Merge: extend end time if current range goes further
      last.end = Math.max(last.end, range.end);
    } else {
      // No overlap, add as new range
      merged.push({ ...range });
    }
  }
  
  return merged;
}

/**
 * Calculate total watched seconds from ranges
 * @param {Array} ranges - Array of {start, end} objects
 * @returns {Number} - Total watched seconds
 */
function calculateWatchedSeconds(ranges) {
  if (!ranges || ranges.length === 0) return 0;
  
  return ranges.reduce((total, range) => {
    return total + (range.end - range.start);
  }, 0);
}

/**
 * Add a new watched range and merge with existing ranges
 * @param {Array} existingRanges - Existing watched ranges
 * @param {Number} start - Start time in seconds
 * @param {Number} end - End time in seconds
 * @returns {Array} - Merged ranges
 */
function addWatchedRange(existingRanges, start, end) {
  if (start >= end) return existingRanges || [];
  
  const newRange = { start, end };
  const allRanges = [...(existingRanges || []), newRange];
  
  return mergeRanges(allRanges);
}

/**
 * Check if a time range is already watched
 * @param {Array} ranges - Watched ranges
 * @param {Number} start - Start time
 * @param {Number} end - End time
 * @returns {Boolean} - True if already watched
 */
function isRangeWatched(ranges, start, end) {
  if (!ranges || ranges.length === 0) return false;
  
  for (const range of ranges) {
    // Check if the new range is completely within an existing range
    if (start >= range.start && end <= range.end) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get the last watched position (resume time)
 * @param {Array} ranges - Watched ranges
 * @returns {Number} - Last watched position in seconds
 */
function getResumeTime(ranges) {
  if (!ranges || ranges.length === 0) return 0;
  
  // Find the maximum end time across all ranges
  return Math.max(...ranges.map(r => r.end));
}

module.exports = {
  mergeRanges,
  calculateWatchedSeconds,
  addWatchedRange,
  isRangeWatched,
  getResumeTime,
};
