const CourseProgress = require('../models/CourseProgress');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { mergeRanges, calculateWatchedSeconds, addWatchedRange, getResumeTime } = require('../utils/rangeUtils');

/**
 * Secure Progress Tracking Service
 * Validates video progress to prevent skipping and fake completion
 */
class ProgressTrackingService {
  constructor() {
    // Store active sessions: { userId_lessonId: { startTime, lastTime, lastUpdate, watchDuration } }
    this.activeSessions = new Map();
    
    // Cleanup inactive sessions after 5 minutes
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Authenticate socket connection
   */
  async authenticateSocket(socket, token) {
    try {
      if (!token) {
        throw new Error('No token provided');
      }

      const jwtSecret = process.env.JWT_SECRET || 'default_dev_jwt_secret_change_me';
      const decoded = jwt.verify(token, jwtSecret);
      
      const user = await User.findById(decoded.userId).select('_id email role status');
      if (!user || user.status !== 'active') {
        throw new Error('Invalid or inactive user');
      }

      return {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      };
    } catch (error) {
      throw new Error('Authentication failed: ' + error.message);
    }
  }

  /**
   * Validate progress update to detect skips/jumps
   */
  validateProgress(sessionKey, currentTime, videoDuration) {
    const session = this.activeSessions.get(sessionKey);
    
    if (!session) {
      // New session - initialize
      return {
        valid: true,
        watchDuration: 0,
        isNewSession: true,
      };
    }

    const now = Date.now();
    const timeSinceLastUpdate = (now - session.lastUpdate) / 1000; // seconds
    const timeDifference = currentTime - session.lastTime; // Can be positive (forward) or negative (backward)

    // Only detect forward progress (ignore backward seeking for now, it's allowed)
    const forwardProgress = Math.max(0, timeDifference);

    // Detect suspicious activity
    const suspicious = {
      skip: forwardProgress > 10 && timeSinceLastUpdate < 5, // Jumped more than 10 seconds forward in less than 5 seconds
      backward: timeDifference < -2, // Seeking backward more than 2 seconds
      inactive: timeSinceLastUpdate > 30, // No update for 30+ seconds
      // Only flag as tooFast if progress is significantly faster than real-time (2.5x threshold)
      // This allows for normal playback variations and slight buffering
      tooFast: forwardProgress > timeSinceLastUpdate * 2.5 && timeSinceLastUpdate > 0.5, // Only check if at least 0.5s has passed
    };

    // Only reject clear skips (not tooFast warnings for normal playback)
    if (suspicious.skip) {
      console.warn(`[ProgressTracking] ⚠️ Skip detected for ${sessionKey}:`, {
        forwardProgress,
        timeSinceLastUpdate,
        reason: 'skip_detected'
      });
      return {
        valid: false,
        reason: 'skip_detected',
        watchDuration: session.watchDuration, // Don't update watch duration
      };
    }

    // Log tooFast warnings but don't reject (allow normal playback variations)
    if (suspicious.tooFast) {
      // Only log occasionally to reduce console spam
      if (Math.random() < 0.1) { // Log 10% of warnings
        console.log(`[ProgressTracking] ℹ️ Fast progress detected (normal variation) for ${sessionKey}:`, {
          forwardProgress: forwardProgress.toFixed(2),
          timeSinceLastUpdate: timeSinceLastUpdate.toFixed(2),
          ratio: (forwardProgress / timeSinceLastUpdate).toFixed(2)
        });
      }
    }

    // Calculate actual watch duration
    // Only count time if video is playing and progressing normally
    let watchDuration = session.watchDuration;
    if (!suspicious.inactive && !suspicious.backward) {
      // Add the time difference, but cap it at reasonable rate (2x speed max for normal playback)
      const maxAllowedProgress = timeSinceLastUpdate * 2.0;
      const actualProgress = Math.min(forwardProgress, maxAllowedProgress);
      watchDuration += actualProgress;
    }

    return {
      valid: true,
      watchDuration: Math.min(watchDuration, videoDuration), // Cap at video duration
      isNewSession: false,
    };
  }

  /**
   * Start watching session
   */
  startSession(sessionKey, currentTime) {
    this.activeSessions.set(sessionKey, {
      startTime: Date.now(),
      lastTime: currentTime,
      lastUpdate: Date.now(),
      watchDuration: 0,
      isPlaying: true,
      rangeStart: currentTime, // Track range start for watchedRanges - CRITICAL for accurate tracking
    });
    console.log(`[ProgressTracking] Started session ${sessionKey} with rangeStart: ${currentTime}`);
  }

  /**
   * Update session
   */
  updateSession(sessionKey, currentTime, isPlaying = true) {
    const session = this.activeSessions.get(sessionKey);
    if (session) {
      session.lastTime = currentTime;
      session.lastUpdate = Date.now();
      session.isPlaying = isPlaying;
      // Keep rangeStart if already set, otherwise initialize it
      if (session.rangeStart === undefined || session.rangeStart === null) {
        session.rangeStart = currentTime;
      }
    }
  }

  /**
   * End session and return total watch duration
   */
  endSession(sessionKey) {
    const session = this.activeSessions.get(sessionKey);
    if (session) {
      const totalDuration = session.watchDuration;
      this.activeSessions.delete(sessionKey);
      return totalDuration;
    }
    return 0;
  }

  /**
   * Cleanup inactive sessions
   */
  cleanupInactiveSessions() {
    const now = Date.now();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [key, session] of this.activeSessions.entries()) {
      if (now - session.lastUpdate > inactiveThreshold) {
        console.log(`[ProgressTracking] Cleaning up inactive session: ${key}`);
        this.activeSessions.delete(key);
      }
    }
  }

  /**
   * Save progress to database using watchedRanges (Professional LMS-style)
   */
  async saveProgress(userId, courseId, lessonId, watchedSeconds, currentTime, videoDuration, rangeStart = null, rangeEnd = null) {
    try {
      // Find or create course progress
      let courseProgress = await CourseProgress.findOne({ userId, courseId });

      if (!courseProgress) {
        courseProgress = new CourseProgress({
          userId,
          courseId,
          lessons: [],
        });
      }

      // Find lesson progress
      let lessonProgress = courseProgress.lessons.find(
        (l) => l.lessonId.toString() === lessonId.toString()
      );

      if (!lessonProgress) {
        lessonProgress = {
          lessonId,
          watched: 0,
          watchedSeconds: 0,
          watchedRanges: [],
          completed: false,
          lastWatchedAt: new Date(),
          lastTimestamp: new Date(),
          watchSessions: [],
        };
        courseProgress.lessons.push(lessonProgress);
      }

      // Update watched (resume position) - always update to current position
      const newWatched = Math.min(currentTime, videoDuration);
      lessonProgress.watched = newWatched;
      
      // Add watched range if provided (for accurate tracking)
      if (rangeStart !== null && rangeEnd !== null && rangeStart < rangeEnd) {
        // Add the new watched range and merge with existing ranges
        lessonProgress.watchedRanges = addWatchedRange(
          lessonProgress.watchedRanges || [],
          rangeStart,
          rangeEnd
        );
        
        // Recalculate watchedSeconds from merged ranges
        lessonProgress.watchedSeconds = calculateWatchedSeconds(lessonProgress.watchedRanges);
      } else if (watchedSeconds > 0) {
        // Fallback: if no range provided, use watchedSeconds (backward compatibility)
        // But still prefer ranges if available
        if (!lessonProgress.watchedRanges || lessonProgress.watchedRanges.length === 0) {
          lessonProgress.watchedSeconds = Math.max(lessonProgress.watchedSeconds || 0, watchedSeconds);
        }
      }
      
      // Update timestamps
      lessonProgress.lastWatchedAt = new Date();
      lessonProgress.lastTimestamp = new Date();

      // Mark as completed if watched at least 90% of video
      const completionThreshold = videoDuration * 0.9;
      if (videoDuration > 0) {
        const totalWatched = lessonProgress.watchedSeconds || 0;
        if (totalWatched >= completionThreshold) {
          lessonProgress.completed = true;
        } else {
          // Don't mark as incomplete if already completed (prevent downgrade)
          if (!lessonProgress.completed) {
            lessonProgress.completed = false;
          }
        }
      }

      await courseProgress.save();

      // Get resume time from ranges
      const resumeTime = getResumeTime(lessonProgress.watchedRanges || []);

      return {
        success: true,
        watched: lessonProgress.watched,
        watchedSeconds: lessonProgress.watchedSeconds,
        completed: lessonProgress.completed,
        resumeTime: resumeTime,
        watchedRanges: lessonProgress.watchedRanges || [],
        progressPercent: videoDuration > 0 
          ? Math.round((lessonProgress.watchedSeconds / videoDuration) * 100) 
          : 0,
      };
    } catch (error) {
      console.error('[ProgressTracking] Error saving progress:', error);
      throw error;
    }
  }
}

module.exports = new ProgressTrackingService();
