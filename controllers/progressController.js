const CourseProgress = require('../models/CourseProgress');
const User = require('../models/User');
const Course = require('../models/Course');
const {
  mergeRanges,
  clampRangesToDuration,
  calculateWatchedSeconds,
  getResumeTime,
} = require('../utils/rangeUtils');

const COMPLETE_THRESHOLD = 90;

async function recalcProgressFromCourse(progress) {
  const course = await Course.findById(progress.courseId).select('lessons').lean();
  const total = course?.lessons?.length || 1;
  progress.recalculateCourseProgress(total);
}

// POST /api/progress/update
// Update lesson progress for a user and course
const updateProgress = async (req, res) => {
  try {
    const { userId, courseId, lessonId, watched, completed } = req.body;

    if (!userId || !courseId || !lessonId) {
      return res.status(400).json({
        success: false,
        message: 'userId, courseId, and lessonId are required',
      });
    }

    // Verify user exists and is enrolled in the course
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const isEnrolled = user.enrolledCourses?.some(
      (id) => id.toString() === courseId.toString()
    );

    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'User is not enrolled in this course',
      });
    }

    // Find or create progress document
    let progress = await CourseProgress.findOne({ userId, courseId });

    if (!progress) {
      // Create new progress document
      progress = new CourseProgress({
        userId,
        courseId,
        lessons: [],
      });
    }

    // Find or update lesson progress
    const lessonIndex = progress.lessons.findIndex(
      (l) => l.lessonId.toString() === lessonId.toString()
    );

    if (lessonIndex >= 0) {
      // Update existing lesson progress
      const previousWatched = progress.lessons[lessonIndex].watched || 0;
      
      // Always update watched (resume position) if provided and is greater
      if (watched !== undefined && watched !== null) {
        if (completed === true) {
          // If marked as completed, set watched to full duration
          progress.lessons[lessonIndex].watched = watched;
        } else if (watched > previousWatched) {
          // Update watched if new value is greater (prevent going backwards)
          progress.lessons[lessonIndex].watched = watched;
        }
      }
      
      // Recalculate watchedSeconds from watchedRanges if available
      if (progress.lessons[lessonIndex].watchedRanges && progress.lessons[lessonIndex].watchedRanges.length > 0) {
        progress.lessons[lessonIndex].watchedSeconds = calculateWatchedSeconds(progress.lessons[lessonIndex].watchedRanges);
      }
      
      // Update completed status
      if (completed === true) {
        progress.lessons[lessonIndex].completed = true;
        if (watched !== undefined && watched !== null) {
          progress.lessons[lessonIndex].watched = Math.max(progress.lessons[lessonIndex].watched, watched);
        }
      } else if (completed !== undefined) {
        progress.lessons[lessonIndex].completed = completed;
      }
      
      progress.lessons[lessonIndex].lastWatchedAt = new Date();
    } else {
      // Add new lesson progress
      progress.lessons.push({
        lessonId,
        watched: watched || 0,
        watchedSeconds: 0,
        watchedRanges: [],
        completed: completed || false,
        lastWatchedAt: new Date(),
      });
    }

    await recalcProgressFromCourse(progress);

    await progress.save();

    res.status(200).json({
      success: true,
      message: 'Progress updated successfully',
      data: progress,
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating progress',
      error: error.message,
    });
  }
};

// GET /api/progress/:courseId?userId=...
// Get progress for a user and course
const getProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { userId } = req.query;

    if (!userId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'userId and courseId are required',
      });
    }

    const progress = await CourseProgress.findOne({ userId, courseId });

    if (!progress) {
      return res.status(200).json({
        success: true,
        data: {
          userId,
          courseId,
          lessons: [],
          overallProgress: 0,
          coursePercent: 0,
          courseCompleted: false,
        },
      });
    }

    const lessonsWithResume = progress.lessons.map((lesson) => {
      const watchedSeconds =
        lesson.watchedRanges && lesson.watchedRanges.length > 0
          ? calculateWatchedSeconds(lesson.watchedRanges)
          : lesson.watchedSeconds || 0;

      const resumeTime =
        lesson.watchedRanges && lesson.watchedRanges.length > 0
          ? getResumeTime(lesson.watchedRanges)
          : lesson.watched || 0;

      const dur = Number(lesson.duration) || 0;
      let watchedPercent =
        lesson.watchedPercent != null ? Number(lesson.watchedPercent) : null;
      if (watchedPercent == null && dur > 0) {
        watchedPercent = Math.min(100, Math.round((watchedSeconds / dur) * 100));
      }
      if (watchedPercent == null) watchedPercent = 0;

      return {
        ...lesson.toObject(),
        watchedSeconds,
        resumeTime,
        watchedPercent,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        ...progress.toObject(),
        lessons: lessonsWithResume,
      },
    });
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching progress',
      error: error.message,
    });
  }
};

// GET /api/progress/user/:userId
// Get all progress for a user
const getUserProgress = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    const progressList = await CourseProgress.find({ userId })
      .populate('courseId', 'title thumbnailUrl')
      .sort({ lastAccessedAt: -1 });

    res.status(200).json({
      success: true,
      data: progressList,
    });
  } catch (error) {
    console.error('Error fetching user progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user progress',
      error: error.message,
    });
  }
};

/**
 * POST /api/progress/save — event-driven flush (pause, end, visibility, beforeunload, 60s backup)
 * Merges watchedRanges so duplicate segments are not double-counted.
 */
const saveProgress = async (req, res) => {
  try {
    const authUserId = req.user?.id;
    const {
      userId,
      courseId,
      lessonId,
      currentTime,
      duration,
      watchedRanges: incomingRanges,
      lessonEnded,
    } = req.body;

    if (!userId || !courseId || !lessonId) {
      return res.status(400).json({
        success: false,
        message: 'userId, courseId, and lessonId are required',
      });
    }

    if (String(authUserId) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isEnrolled = user.enrolledCourses?.some(
      (id) => id.toString() === courseId.toString()
    );
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'User is not enrolled in this course',
      });
    }

    const course = await Course.findById(courseId).select('lessons').lean();
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const lessonMeta = (course.lessons || []).find(
      (l) => l._id.toString() === lessonId.toString()
    );
    const durationSec =
      Number(duration) > 0
        ? Number(duration)
        : Number(lessonMeta?.duration) || 0;

    let progress = await CourseProgress.findOne({ userId, courseId });

    if (!progress) {
      progress = new CourseProgress({
        userId,
        courseId,
        lessons: [],
      });
    }

    const lid = progress.lessons.findIndex(
      (l) => l.lessonId.toString() === lessonId.toString()
    );

    let mergedRanges = [];
    if (lid >= 0 && progress.lessons[lid].watchedRanges?.length) {
      mergedRanges = progress.lessons[lid].watchedRanges.map((r) => ({
        start: r.start,
        end: r.end,
      }));
    }

    if (Array.isArray(incomingRanges) && incomingRanges.length > 0) {
      const sanitized = clampRangesToDuration(incomingRanges, durationSec);
      mergedRanges = mergeRanges([...mergedRanges, ...sanitized]);
    }

    let watchedSeconds = calculateWatchedSeconds(mergedRanges);
    if (durationSec > 0) {
      watchedSeconds = Math.min(watchedSeconds, durationSec);
    }
    /** Percent from merged segments only — do not trust clientPercent (anti-inflation). */
    const watchedPct =
      durationSec > 0
        ? Math.min(100, Math.round((watchedSeconds / durationSec) * 100))
        : 0;

    const prevWatched = lid >= 0 ? progress.lessons[lid].watched || 0 : 0;
    const ct = Number(currentTime);
    const fromRanges = mergedRanges.length > 0 ? getResumeTime(mergedRanges) : 0;
    const resumeTime = Math.min(
      durationSec || Number.MAX_SAFE_INTEGER,
      Math.max(Number.isFinite(ct) ? ct : 0, fromRanges, prevWatched)
    );

    const completed =
      lessonEnded === true ||
      watchedPct >= COMPLETE_THRESHOLD ||
      (lid >= 0 && progress.lessons[lid].completed);

    if (lid >= 0) {
      const L = progress.lessons[lid];
      L.watched = resumeTime;
      L.duration = durationSec;
      L.watchedPercent = watchedPct;
      L.watchedRanges = mergedRanges;
      L.watchedSeconds = watchedSeconds;
      L.completed = !!completed;
      L.lastWatchedAt = new Date();
    } else {
      progress.lessons.push({
        lessonId,
        watched: resumeTime,
        duration: durationSec,
        watchedPercent: watchedPct,
        watchedRanges: mergedRanges,
        watchedSeconds,
        completed: !!completed,
        lastWatchedAt: new Date(),
      });
    }

    await recalcProgressFromCourse(progress);
    await progress.save();

    res.status(200).json({
      success: true,
      message: 'Progress saved',
      data: {
        coursePercent: progress.coursePercent,
        courseCompleted: progress.courseCompleted,
        lesson: {
          lessonId,
          currentTime: resumeTime,
          duration: durationSec,
          watchedPercent: watchedPct,
          completed: !!completed,
        },
      },
    });
  } catch (error) {
    console.error('Error saving progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving progress',
      error: error.message,
    });
  }
};

module.exports = {
  updateProgress,
  saveProgress,
  getProgress,
  getUserProgress,
};
