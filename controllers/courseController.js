const mongoose = require('mongoose');
const Course = require('../models/Course');
const User = require('../models/User');
const Tutor = require('../models/Tutor');
const {
  uploadVideo,
  uploadImage,
  uploadResourceFile,
  deleteStoredFile,
  deleteLessonVideoAssets,
} = require('../config/storage');
const gcs = require('../config/gcsStorage');
const {
  isHlsPipelineEnabled,
  getHlsPipelineDiagnostics,
  logHlsPipelineDecision,
  prepareHlsLessonUpload,
  buildHlsLessonFieldsFromExistingRaw,
  scheduleHlsTranscoding,
} = require('../config/videoPipeline');
const { cleanupFiles } = require('../middleware/upload');
const {
  redactCourseMediaForClient,
  stripLessonAndResourceMediaUrls,
} = require('../utils/redactCourseMediaUrls');
const { validateCourseLevelValue } = require('../utils/courseLevelHelpers');
const { validateCategoryValue } = require('../utils/categoryHelpers');
const { normalizeAdminPickName } = require('../utils/normalizeAdminPickName');
const fs = require('fs');
const path = require('path');

function shouldRedactCourseApi(req) {
  if (process.env.REDACT_GCS_URLS_IN_COURSE_API === 'false') return false;
  return !(req.authUser && req.authUser.role === 'admin');
}

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findTutorByName = async (name = '') => {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) return null;

  return Tutor.findOne({
    name: { $regex: `^${escapeRegExp(normalizedName)}$`, $options: 'i' },
  });
};

const attachCourseToTutorByName = async (tutorName, courseId) => {
  const tutor = await findTutorByName(tutorName);
  if (!tutor) return null;

  await Tutor.findByIdAndUpdate(tutor._id, {
    $addToSet: { courses: courseId },
  });

  return tutor;
};

const detachCourseFromTutorByName = async (tutorName, courseId) => {
  const tutor = await findTutorByName(tutorName);
  if (!tutor) return null;

  await Tutor.findByIdAndUpdate(tutor._id, {
    $pull: { courses: courseId },
  });

  return tutor;
};

const MAX_LESSON_VIDEO_BYTES = 8 * 1024 * 1024 * 1024;

function parseDirectUploadPlan(req) {
  try {
    const raw = req.body.directUploadPlan;
    if (raw == null || raw === '') return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return null;
  }
}

function directUploadIndexMap(plan) {
  const m = new Map();
  if (!plan || !Array.isArray(plan.lessons)) return m;
  plan.lessons.forEach((d) => {
    if (d && d.lessonIndex !== undefined && d.lessonIndex !== null) {
      m.set(Number(d.lessonIndex), d);
    }
  });
  return m;
}

function assertRawKeyMatchesLesson(objectKey, courseId, lessonId) {
  const norm = String(objectKey || '').replace(/^\/+|\/+$/g, '');
  const ext = path.extname(norm) || '.mp4';
  const expected = gcs.rawObjectRelForLesson(courseId, lessonId, ext);
  if (norm !== expected) {
    throw new Error('Video object path does not match this course lesson');
  }
}

/** Presign raw PUT URLs for a new course (browser uploads directly to GCS; avoids Cloud Run body limits). */
const presignNewCourseLessonVideos = async (req, res) => {
  try {
    if (!isHlsPipelineEnabled()) {
      const d = getHlsPipelineDiagnostics();
      return res.status(400).json({
        success: false,
        message: `Direct upload needs the HLS/GCS pipeline. ${d.reason || 'Check server env.'}`,
        diagnostics: {
          storageProvider: d.provider,
          rawBucketResolved: d.rawBucket || null,
          enableVideoTranscoder: !d.transcoderDisabled,
          hint:
            'On Cloud Run set STORAGE_PROVIDER=gcs, GCS_MERGED_VIDEO_BUCKET or GCS_BUCKET_RAW_UPLOADS, GCS_PROJECT_ID, and keep ENABLE_VIDEO_TRANSCODER=true (or unset).',
        },
      });
    }
    const { lessons } = req.body;
    if (!Array.isArray(lessons) || lessons.length === 0) {
      return res.status(400).json({ success: false, message: 'lessons array is required' });
    }

    const courseId = new mongoose.Types.ObjectId();
    const out = [];

    for (const item of lessons) {
      const lessonIndex = Number(item.lessonIndex);
      const fileName = typeof item.fileName === 'string' ? item.fileName : '';
      const fileSize = item.fileSize != null ? Number(item.fileSize) : 0;

      if (!Number.isFinite(lessonIndex) || lessonIndex < 0) {
        return res.status(400).json({ success: false, message: 'Invalid lessonIndex' });
      }
      if (!fileName.trim()) {
        return res.status(400).json({ success: false, message: 'fileName is required per lesson' });
      }
      if (fileSize > MAX_LESSON_VIDEO_BYTES) {
        return res.status(400).json({ success: false, message: 'Video exceeds maximum size (8GB)' });
      }

      const ext = path.extname(fileName) || '.mp4';
      const lessonId = new mongoose.Types.ObjectId();
      const objectRel = gcs.rawObjectRelForLesson(courseId, lessonId, ext);
      const contentType = gcs.contentTypeForVideoExt(ext);
      const { uploadUrl, objectKey } = await gcs.getSignedPutUrlForRawObject(objectRel, contentType);

      out.push({
        lessonIndex,
        lessonId: String(lessonId),
        objectKey,
        uploadUrl,
        contentType,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        courseId: String(courseId),
        lessons: out,
      },
    });
  } catch (error) {
    console.error('[presignNewCourseLessonVideos]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create upload URLs',
    });
  }
};

/** Presign raw PUT for one lesson on an existing course (large replacement video). */
const presignExistingCourseLessonVideo = async (req, res) => {
  try {
    if (!isHlsPipelineEnabled()) {
      const d = getHlsPipelineDiagnostics();
      return res.status(400).json({
        success: false,
        message: `Direct upload needs the HLS/GCS pipeline. ${d.reason || 'Check server env.'}`,
        diagnostics: {
          storageProvider: d.provider,
          rawBucketResolved: d.rawBucket || null,
          enableVideoTranscoder: !d.transcoderDisabled,
          hint:
            'On Cloud Run set STORAGE_PROVIDER=gcs, GCS_MERGED_VIDEO_BUCKET or GCS_BUCKET_RAW_UPLOADS, GCS_PROJECT_ID, and keep ENABLE_VIDEO_TRANSCODER=true (or unset).',
        },
      });
    }
    const { courseId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const { lessonIndex, fileName, fileSize } = req.body;
    const idx = Number(lessonIndex);
    if (!Number.isFinite(idx) || idx < 0 || !course.lessons || idx >= course.lessons.length) {
      return res.status(400).json({ success: false, message: 'Invalid lessonIndex' });
    }
    const fileSizeN = fileSize != null ? Number(fileSize) : 0;
    if (fileSizeN > MAX_LESSON_VIDEO_BYTES) {
      return res.status(400).json({ success: false, message: 'Video exceeds maximum size (8GB)' });
    }

    const fn = typeof fileName === 'string' ? fileName : '';
    if (!fn.trim()) {
      return res.status(400).json({ success: false, message: 'fileName is required' });
    }

    const lesson = course.lessons[idx];
    const lessonId = lesson._id;
    const ext = path.extname(fn) || '.mp4';
    const objectRel = gcs.rawObjectRelForLesson(course._id, lessonId, ext);
    const contentType = gcs.contentTypeForVideoExt(ext);
    const { uploadUrl, objectKey } = await gcs.getSignedPutUrlForRawObject(objectRel, contentType);

    return res.status(200).json({
      success: true,
      data: {
        lessonIndex: idx,
        lessonId: String(lessonId),
        objectKey,
        uploadUrl,
        contentType,
      },
    });
  } catch (error) {
    console.error('[presignExistingCourseLessonVideo]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create upload URL',
    });
  }
};

// Create a new course
const createCourse = async (req, res) => {
  try {
    const {
      title,
      category,
      instructor,
      price,
      discountPercentage,
      courseLevel,
      taxPercentage,
      skills,
      description,
      faqs,
      lessons,
      resources,
      keywords,
      status = 'draft',
    } = req.body;

    const categoryNorm = normalizeAdminPickName(category);
    const courseLevelNorm = normalizeAdminPickName(courseLevel);

    // Validate required fields (category & course level are stored as names, not ids)
    if (!title || !categoryNorm || !instructor || !price || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, category, instructor, price, description',
      });
    }

    const okCategory = await validateCategoryValue(categoryNorm);
    if (!okCategory) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category. Use an entry from Admin → Categories.',
      });
    }

    if (courseLevelNorm) {
      const okLevel = await validateCourseLevelValue(courseLevelNorm);
      if (!okLevel) {
        return res.status(400).json({
          success: false,
          message: 'Invalid course level. Use an entry from Admin → Course Levels.',
        });
      }
    }

    // Parse JSON strings if they come as strings
    const parsedSkills = typeof skills === 'string' ? JSON.parse(skills) : skills;
    const parsedFaqs = typeof faqs === 'string' ? JSON.parse(faqs) : faqs;
    const parsedLessons = typeof lessons === 'string' ? JSON.parse(lessons) : lessons;
    const parsedKeywords = typeof keywords === 'string' ? JSON.parse(keywords) : keywords;
    const parsedResources = typeof resources === 'string' ? JSON.parse(resources) : resources;

    // Upload thumbnail if provided
    let thumbnailUrl = null;
    let thumbnailPublicId = null;
    const thumbnailFile = req.files && Array.isArray(req.files) 
      ? req.files.find(f => f.fieldname === 'thumbnail') 
      : null;
    if (thumbnailFile) {
      try {
        const thumbnailResult = await uploadImage(thumbnailFile.path);
        thumbnailUrl = thumbnailResult.url;
        thumbnailPublicId = thumbnailResult.publicId;
        // Clean up local file
        if (fs.existsSync(thumbnailFile.path)) {
          fs.unlinkSync(thumbnailFile.path);
        }
      } catch (error) {
        console.error('Error uploading thumbnail:', error);
        if (thumbnailFile && thumbnailFile.path) {
          cleanupFiles([thumbnailFile]);
        }
        return res.status(500).json({
          success: false,
          message: 'Error uploading thumbnail',
        });
      }
    }

    // Get all lesson video files (order in multipart may not match lesson index — use videoIndices)
    const lessonVideoFiles = req.files && Array.isArray(req.files)
      ? req.files.filter(f => f.fieldname === 'lessonVideos')
      : [];

    let videoIndices = [];
    try {
      const raw = req.body.videoIndices;
      if (raw) {
        videoIndices = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (e) {
      console.warn('[createCourse] videoIndices parse failed, using sequential video mapping');
    }

    const lessonVideoMap = {};
    const useIndexMap =
      Array.isArray(videoIndices) &&
      videoIndices.length > 0 &&
      videoIndices.length === lessonVideoFiles.length;

    if (useIndexMap) {
      lessonVideoFiles.forEach((videoFile, videoIndex) => {
        const lessonIndex = videoIndices[videoIndex];
        if (lessonIndex !== undefined && lessonIndex !== null) {
          lessonVideoMap[lessonIndex] = videoFile;
        }
      });
    } else {
      // Fallback: sequential file order → lesson 0, 1, 2… (legacy)
      lessonVideoFiles.forEach((videoFile, i) => {
        if (parsedLessons && i < parsedLessons.length) {
          lessonVideoMap[i] = videoFile;
        }
      });
    }

    const directPlan = parseDirectUploadPlan(req);
    const directByIndex = directUploadIndexMap(directPlan);

    if (directPlan && directPlan.lessons && parsedLessons && Array.isArray(parsedLessons)) {
      for (const d of directPlan.lessons) {
        const li = Number(d.lessonIndex);
        if (!Number.isFinite(li) || li < 0 || li >= parsedLessons.length) {
          return res.status(400).json({
            success: false,
            message: 'directUploadPlan contains an invalid lessonIndex',
          });
        }
      }
    }

    let courseId;
    if (directPlan && directPlan.courseId && mongoose.Types.ObjectId.isValid(directPlan.courseId)) {
      courseId = new mongoose.Types.ObjectId(directPlan.courseId);
    } else {
      courseId = new mongoose.Types.ObjectId();
    }

    const pendingHlsJobs = [];

    if (lessonVideoFiles.length > 0 || directByIndex.size > 0) {
      logHlsPipelineDecision('createCourse');
    }

    // Process lesson videos
    const processedLessons = [];
    if (parsedLessons && Array.isArray(parsedLessons)) {
      for (let i = 0; i < parsedLessons.length; i++) {
        const lesson = parsedLessons[i];
        const direct = directByIndex.get(i);

        let lessonId;
        if (direct && direct.lessonId && mongoose.Types.ObjectId.isValid(direct.lessonId)) {
          lessonId = new mongoose.Types.ObjectId(direct.lessonId);
        } else {
          lessonId = new mongoose.Types.ObjectId();
        }

        const lessonData = {
          _id: lessonId,
          lessonName: lesson.lessonName || '',
          skills: lesson.skills || [],
          learningOutcomes: lesson.learningOutcomes || '',
          order: i,
        };

        const videoFile = lessonVideoMap[i] || null;

        if (direct && direct.objectKey) {
          if (videoFile) {
            if (req.files && Array.isArray(req.files)) {
              req.files.forEach((file) => cleanupFiles([file]));
            }
            return res.status(400).json({
              success: false,
              message: `Lesson ${i + 1}: use either direct GCS upload or multipart upload, not both`,
            });
          }
          try {
            assertRawKeyMatchesLesson(direct.objectKey, courseId, lessonId);
            const { lessonFields, scheduleMeta } = await buildHlsLessonFieldsFromExistingRaw(
              direct.objectKey,
              courseId,
              lessonId,
              0
            );
            Object.assign(lessonData, lessonFields);
            pendingHlsJobs.push(scheduleMeta);
          } catch (error) {
            console.error(`[createCourse] direct raw lesson ${i}:`, error);
            if (req.files && Array.isArray(req.files)) {
              req.files.forEach((file) => cleanupFiles([file]));
            }
            return res.status(400).json({
              success: false,
              message: error.message || `Error linking video for lesson ${i + 1}`,
            });
          }
        } else if (videoFile) {
          try {
            if (isHlsPipelineEnabled()) {
              console.log(`[createCourse] HLS pipeline — course ${courseId} lesson ${lessonId}`);
              const { lessonFields, scheduleMeta } = await prepareHlsLessonUpload(
                videoFile.path,
                courseId,
                lessonId
              );
              Object.assign(lessonData, lessonFields);
              pendingHlsJobs.push(scheduleMeta);
            } else {
              console.warn(
                '[createCourse] HLS pipeline not active — storing MP4 in processed bucket (see [HLS] log above)'
              );
              const videoResult = await uploadVideo(videoFile.path);
              lessonData.videoUrl = videoResult.url;
              lessonData.videoPublicId = videoResult.publicId;
              lessonData.videoType = 'mp4';
              lessonData.duration = videoResult.duration || 0;
            }
            if (fs.existsSync(videoFile.path)) {
              fs.unlinkSync(videoFile.path);
            }
          } catch (error) {
            console.error(`Error uploading video for lesson ${i}:`, error);
            cleanupFiles([videoFile]);
            return res.status(500).json({
              success: false,
              message: `Error uploading video for lesson ${i + 1}`,
              error: error.message,
            });
          }
        }

        processedLessons.push(lessonData);
      }
    }

    // Process course resources (optional)
    const processedResources = [];
    if (parsedResources && Array.isArray(parsedResources) && parsedResources.length > 0) {
      // Get all resource files
      const resourceFiles = req.files && Array.isArray(req.files)
        ? req.files.filter(f => f.fieldname === 'resourceFiles')
        : [];

      for (let i = 0; i < parsedResources.length; i++) {
        const resource = parsedResources[i];
        const resourceData = {
          name: resource.name || '',
          description: resource.description || '',
          fileType: resource.fileType || '',
        };

        // Get file for this resource (by index)
        const resourceFile = resourceFiles[i] || null;

        if (resourceFile) {
          try {
            const fileResult = await uploadResourceFile(resourceFile.path, 'courses/resources');
            resourceData.fileUrl = fileResult.downloadUrl || fileResult.url; // Use downloadUrl for PDFs
            resourceData.filePublicId = fileResult.publicId;
            // Clean up local file
            if (fs.existsSync(resourceFile.path)) {
              fs.unlinkSync(resourceFile.path);
            }
          } catch (error) {
            console.error(`Error uploading resource file ${i}:`, error);
            cleanupFiles([resourceFile]);
            return res.status(500).json({
              success: false,
              message: `Error uploading resource file ${i + 1}`,
            });
          }
        }

        // Only add resource if it has a name and file
        if (resourceData.name && resourceData.fileUrl) {
          processedResources.push(resourceData);
        }
      }
    }

    // Parse discountPercentage
    const parsedDiscountPercentage = discountPercentage 
      ? parseFloat(discountPercentage) 
      : 0;
    
    // Validate discount percentage
    if (parsedDiscountPercentage < 0 || parsedDiscountPercentage > 100) {
      return res.status(400).json({
        success: false,
        message: 'Discount percentage must be between 0 and 100',
      });
    }

    // Parse taxPercentage
    const parsedTaxPercentage = taxPercentage 
      ? parseFloat(taxPercentage) 
      : 0;

    // Validate taxPercentage range
    if (parsedTaxPercentage < 0 || parsedTaxPercentage > 70) {
      return res.status(400).json({
        success: false,
        message: 'Tax percentage must be between 0% and 70%',
      });
    }

    // Create course (courseId pre-generated so lesson videos can use RAW → Transcoder paths)
    const course = new Course({
      _id: courseId,
      title,
      category: categoryNorm,
      instructor,
      price,
      discountPercentage: parsedDiscountPercentage,
      courseLevel: courseLevelNorm || undefined,
      taxPercentage: parsedTaxPercentage,
      skills: parsedSkills || [],
      description,
      faqs: parsedFaqs || [],
      lessons: processedLessons,
      resources: processedResources,
      keywords: parsedKeywords || [],
      thumbnailUrl,
      thumbnailPublicId,
      status,
    });

    await course.save();
    await attachCourseToTutorByName(instructor, course._id);

    pendingHlsJobs.forEach((meta) => {
      try {
        scheduleHlsTranscoding(meta);
      } catch (e) {
        console.error('[createCourse] schedule HLS transcoding:', e.message);
      }
    });

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: course,
    });
  } catch (error) {
    console.error('Error creating course:', error);
    
    // Clean up any uploaded files on error
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach(file => cleanupFiles([file]));
    }

    res.status(500).json({
      success: false,
      message: 'Error creating course',
      error: error.message,
    });
  }
};

// Get all courses
const getAllCourses = async (req, res) => {
  try {
    const { status, category, page = 1, limit = 10 } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }
    if (category) {
      query.category = category;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const courses = await Course.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'fullName email');

    // Calculate enrolled count for each course
    const coursesWithEnrolled = await Promise.all(
      courses.map(async (course) => {
        const enrolledCount = await User.countDocuments({
          enrolledCourses: course._id,
        });
        const courseObj = course.toObject();
        courseObj.enrolled = enrolledCount;
        if (shouldRedactCourseApi(req)) {
          redactCourseMediaForClient(courseObj);
          stripLessonAndResourceMediaUrls(courseObj);
        }
        return courseObj;
      })
    );

    const total = await Course.countDocuments(query);

    res.status(200).json({
      success: true,
      data: coursesWithEnrolled,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching courses',
      error: error.message,
    });
  }
};

// Get single course by ID
const getCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findById(id).populate('createdBy', 'fullName email');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Calculate enrolled count for this course
    const enrolledCount = await User.countDocuments({
      enrolledCourses: course._id,
    });

    const courseObj = course.toObject();
    courseObj.enrolled = enrolledCount;

    if (Array.isArray(courseObj.lessons) && courseObj.lessons.length > 0) {
      
      courseObj.lessons = [...courseObj.lessons].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
    }

    if (shouldRedactCourseApi(req)) {
      redactCourseMediaForClient(courseObj);
    }

    // HLS transcodingStatus must be fresh — avoid 304 / cached JSON showing stale "processing"
    res.set({
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    res.status(200).json({
      success: true,
      data: courseObj,
    });
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching course',
      error: error.message,
    });
  }
};

// Update course
const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findById(id);
    const previousInstructor = course?.instructor || '';

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    const {
      title,
      category,
      instructor,
      price,
      discountPercentage,
      courseLevel,
      taxPercentage,
      skills,
      description,
      faqs,
      lessons,
      resources,
      keywords,
      status,
    } = req.body;

    // Parse JSON strings if they come as strings
    const parsedSkills = typeof skills === 'string' ? JSON.parse(skills) : skills;
    const parsedFaqs = typeof faqs === 'string' ? JSON.parse(faqs) : faqs;
    const parsedLessons = typeof lessons === 'string' ? JSON.parse(lessons) : lessons;
    const parsedResources = typeof resources === 'string' ? JSON.parse(resources) : resources;
    const parsedKeywords = typeof keywords === 'string' ? JSON.parse(keywords) : keywords;

    // Update thumbnail if new one is provided
    const thumbnailFile = req.files && Array.isArray(req.files) 
      ? req.files.find(f => f.fieldname === 'thumbnail') 
      : null;
    if (thumbnailFile) {
      // Delete old thumbnail from storage
      if (course.thumbnailPublicId) {
        try {
          await deleteStoredFile(course.thumbnailPublicId, 'image');
        } catch (error) {
          console.error('Error deleting old thumbnail:', error);
        }
      }

      // Upload new thumbnail
      try {
        const thumbnailResult = await uploadImage(thumbnailFile.path);
        course.thumbnailUrl = thumbnailResult.url;
        course.thumbnailPublicId = thumbnailResult.publicId;
        // Clean up local file
        if (fs.existsSync(thumbnailFile.path)) {
          fs.unlinkSync(thumbnailFile.path);
        }
      } catch (error) {
        console.error('Error uploading new thumbnail:', error);
        cleanupFiles([thumbnailFile]);
        return res.status(500).json({
          success: false,
          message: 'Error uploading thumbnail',
        });
      }
    }

    // Get all lesson video files
    const lessonVideoFiles = req.files && Array.isArray(req.files)
      ? req.files.filter(f => f.fieldname === 'lessonVideos')
      : [];

    // Get video indices mapping (which video belongs to which lesson)
    const videoIndices = req.body.videoIndices 
      ? (typeof req.body.videoIndices === 'string' ? JSON.parse(req.body.videoIndices) : req.body.videoIndices)
      : [];
    
    console.log(`Processing ${lessonVideoFiles.length} video files for ${parsedLessons.length} lessons`);
    console.log('Video indices mapping:', videoIndices);
    
    // Create a map: lessonIndex -> videoFile
    const lessonVideoMap = {};
    lessonVideoFiles.forEach((videoFile, videoIndex) => {
      const lessonIndex = videoIndices[videoIndex];
      if (lessonIndex !== undefined) {
        lessonVideoMap[lessonIndex] = videoFile;
        console.log(`Mapped video ${videoIndex} to lesson ${lessonIndex}`);
      }
    });

    const directPlan = parseDirectUploadPlan(req);
    const directByIndex = directUploadIndexMap(directPlan);

    if (directPlan && directPlan.lessons && parsedLessons && Array.isArray(parsedLessons)) {
      for (const d of directPlan.lessons) {
        const li = Number(d.lessonIndex);
        if (!Number.isFinite(li) || li < 0 || li >= parsedLessons.length) {
          return res.status(400).json({
            success: false,
            message: 'directUploadPlan contains an invalid lessonIndex',
          });
        }
      }
    }

    const pendingHlsUpdate = [];

    if (lessonVideoFiles.length > 0 || directByIndex.size > 0) {
      logHlsPipelineDecision('updateCourse');
    }

    // Update lesson videos
    if (parsedLessons && Array.isArray(parsedLessons)) {
      for (let i = 0; i < parsedLessons.length; i++) {
        const lesson = parsedLessons[i];
        const existingLesson = course.lessons[i];

        const videoFile = lessonVideoMap[i] || null;
        const directEntry = directByIndex.get(i);

        let lessonId;
        if (lesson._id != null && mongoose.Types.ObjectId.isValid(lesson._id)) {
          lessonId = new mongoose.Types.ObjectId(lesson._id);
        } else if (existingLesson && existingLesson._id) {
          lessonId = existingLesson._id;
        } else {
          lessonId = new mongoose.Types.ObjectId();
        }
        lesson._id = lessonId;

        if (directEntry && directEntry.objectKey) {
          if (videoFile) {
            if (req.files && Array.isArray(req.files)) {
              req.files.forEach((file) => cleanupFiles([file]));
            }
            return res.status(400).json({
              success: false,
              message: `Lesson ${i + 1}: use either direct GCS upload or multipart upload, not both`,
            });
          }
          if (existingLesson && existingLesson.videoPublicId) {
            try {
              const prev = existingLesson.toObject ? existingLesson.toObject() : existingLesson;
              await deleteLessonVideoAssets(prev);
            } catch (error) {
              console.error(`Error deleting old video for lesson ${i}:`, error);
            }
          }
          try {
            assertRawKeyMatchesLesson(directEntry.objectKey, course._id, lessonId);
            const { lessonFields, scheduleMeta } = await buildHlsLessonFieldsFromExistingRaw(
              directEntry.objectKey,
              course._id,
              lessonId,
              0
            );
            Object.assign(lesson, lessonFields);
            pendingHlsUpdate.push(scheduleMeta);
          } catch (error) {
            console.error(`[updateCourse] direct raw lesson ${i}:`, error);
            if (req.files && Array.isArray(req.files)) {
              req.files.forEach((file) => cleanupFiles([file]));
            }
            return res.status(400).json({
              success: false,
              message: error.message || `Error linking video for lesson ${i + 1}`,
            });
          }
        } else if (videoFile) {
          if (existingLesson && existingLesson.videoPublicId) {
            try {
              const prev = existingLesson.toObject ? existingLesson.toObject() : existingLesson;
              await deleteLessonVideoAssets(prev);
            } catch (error) {
              console.error(`Error deleting old video for lesson ${i}:`, error);
            }
          }

          try {
            if (isHlsPipelineEnabled()) {
              console.log(`[updateCourse] HLS pipeline — course ${course._id} lesson ${lessonId}`);
              const { lessonFields, scheduleMeta } = await prepareHlsLessonUpload(
                videoFile.path,
                course._id,
                lessonId
              );
              Object.assign(lesson, lessonFields);
              pendingHlsUpdate.push(scheduleMeta);
            } else {
              console.warn(
                '[updateCourse] HLS pipeline not active — storing MP4 in processed bucket (see [HLS] log above)'
              );
              const videoResult = await uploadVideo(videoFile.path);
              lesson.videoUrl = videoResult.url;
              lesson.videoPublicId = videoResult.publicId;
              lesson.videoType = 'mp4';
              lesson.duration = videoResult.duration || 0;
              lesson.transcodingStatus = undefined;
              lesson.transcodingJobName = null;
              lesson.rawVideoPublicId = null;
            }
            if (fs.existsSync(videoFile.path)) {
              fs.unlinkSync(videoFile.path);
            }
          } catch (error) {
            console.error(`Error uploading video for lesson ${i}:`, error);
            cleanupFiles([videoFile]);
            return res.status(500).json({
              success: false,
              message: `Error uploading video for lesson ${i + 1}`,
              error: error.message,
            });
          }
        } else if (existingLesson) {
          lesson.videoUrl = existingLesson.videoUrl;
          lesson.videoPublicId = existingLesson.videoPublicId;
          lesson.duration = existingLesson.duration;
          lesson.videoType = existingLesson.videoType || 'mp4';
          lesson.transcodingStatus = existingLesson.transcodingStatus;
          lesson.transcodingJobName = existingLesson.transcodingJobName;
          lesson.rawVideoPublicId = existingLesson.rawVideoPublicId;
        }

        lesson.order = i;
      }
    }

    // Parse and validate discountPercentage
    if (discountPercentage !== undefined) {
      const parsedDiscountPercentage = parseFloat(discountPercentage) || 0;
      if (parsedDiscountPercentage < 0 || parsedDiscountPercentage > 100) {
        return res.status(400).json({
          success: false,
          message: 'Discount percentage must be between 0 and 100',
        });
      }
      course.discountPercentage = parsedDiscountPercentage;
    }

    if (courseLevel !== undefined && courseLevel !== null && courseLevel !== '') {
      const courseLevelNorm = normalizeAdminPickName(courseLevel);
      const okLevel = await validateCourseLevelValue(courseLevelNorm);
      if (!okLevel) {
        return res.status(400).json({
          success: false,
          message: 'Invalid course level. Use an entry from Admin → Course Levels.',
        });
      }
      course.courseLevel = courseLevelNorm;
    }

    // Parse and validate taxPercentage
    if (taxPercentage !== undefined) {
      const parsedTaxPercentage = parseFloat(taxPercentage) || 0;
      if (parsedTaxPercentage < 0 || parsedTaxPercentage > 70) {
        return res.status(400).json({
          success: false,
          message: 'Tax percentage must be between 0% and 70%',
        });
      }
      course.taxPercentage = parsedTaxPercentage;
    }

    // Update course fields
    if (title) course.title = title;
    if (category !== undefined && category !== null && String(category).trim() !== '') {
      const categoryNorm = normalizeAdminPickName(category);
      const okCat = await validateCategoryValue(categoryNorm);
      if (!okCat) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category. Use an entry from Admin → Categories.',
        });
      }
      course.category = categoryNorm;
    }
    if (instructor) course.instructor = instructor;
    if (price) course.price = price;
    if (parsedSkills) course.skills = parsedSkills;
    if (description) course.description = description;
    // Process course resources (optional)
    if (parsedResources && Array.isArray(parsedResources)) {
      // Get all resource files
      const resourceFiles = req.files && Array.isArray(req.files)
        ? req.files.filter(f => f.fieldname === 'resourceFiles')
        : [];

      const processedResources = [];
      
      for (let i = 0; i < parsedResources.length; i++) {
        const resource = parsedResources[i];
        const existingResource = course.resources && course.resources[i] ? course.resources[i] : null;
        
        const resourceData = {
          name: resource.name || '',
          description: resource.description || '',
          fileType: resource.fileType || '',
        };

        // Get file for this resource (by index)
        const resourceFile = resourceFiles[i] || null;

        if (resourceFile) {
          // Delete old resource file from storage if exists
          if (existingResource && existingResource.filePublicId) {
            try {
              await deleteStoredFile(existingResource.filePublicId, 'resource');
            } catch (error) {
              console.error('Error deleting old resource file:', error);
            }
          }

          // Upload new resource file
          try {
            const fileResult = await uploadResourceFile(resourceFile.path, 'courses/resources');
            resourceData.fileUrl = fileResult.downloadUrl || fileResult.url; // Use downloadUrl for PDFs
            resourceData.filePublicId = fileResult.publicId;
            // Clean up local file
            if (fs.existsSync(resourceFile.path)) {
              fs.unlinkSync(resourceFile.path);
            }
          } catch (error) {
            console.error(`Error uploading resource file ${i}:`, error);
            cleanupFiles([resourceFile]);
            return res.status(500).json({
              success: false,
              message: `Error uploading resource file ${i + 1}`,
            });
          }
        } else if (existingResource) {
          // Keep existing file if no new file is provided
          resourceData.fileUrl = existingResource.fileUrl;
          resourceData.filePublicId = existingResource.filePublicId;
        }

        // Only add resource if it has a name and file
        if (resourceData.name && resourceData.fileUrl) {
          processedResources.push(resourceData);
        }
      }

      // Delete resources that are no longer in the list
      if (course.resources && course.resources.length > processedResources.length) {
        for (let i = processedResources.length; i < course.resources.length; i++) {
          const oldResource = course.resources[i];
          if (oldResource && oldResource.filePublicId) {
            try {
              await deleteStoredFile(oldResource.filePublicId, 'resource');
            } catch (error) {
              console.error('Error deleting old resource:', error);
            }
          }
        }
      }

      course.resources = processedResources;
    }

    if (parsedFaqs) course.faqs = parsedFaqs;
    if (parsedLessons) course.lessons = parsedLessons;
    if (parsedKeywords) course.keywords = parsedKeywords;
    if (status) course.status = status;

    await course.save();

    pendingHlsUpdate.forEach((meta) => {
      try {
        scheduleHlsTranscoding(meta);
      } catch (e) {
        console.error('[updateCourse] schedule HLS transcoding:', e.message);
      }
    });

    if (instructor && instructor.trim() !== previousInstructor.trim()) {
      await detachCourseFromTutorByName(previousInstructor, course._id);
      await attachCourseToTutorByName(instructor, course._id);
    } else {
      await attachCourseToTutorByName(course.instructor, course._id);
    }

    res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      data: course,
    });
  } catch (error) {
    console.error('Error updating course:', error);
    
    // Clean up any uploaded files on error
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach(file => cleanupFiles([file]));
    }

    res.status(500).json({
      success: false,
      message: 'Error updating course',
      error: error.message,
    });
  }
};

// Delete course
const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findById(id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Delete thumbnail from storage
    if (course.thumbnailPublicId) {
      try {
        await deleteStoredFile(course.thumbnailPublicId, 'image');
      } catch (error) {
        console.error('Error deleting thumbnail from storage:', error);
      }
    }

    // Delete resource files from storage
    if (course.resources && course.resources.length > 0) {
      for (const resource of course.resources) {
        if (resource.filePublicId) {
          try {
            await deleteStoredFile(resource.filePublicId, 'resource');
          } catch (error) {
            console.error('Error deleting resource file from storage:', error);
          }
        }
      }
    }

    // Delete all lesson videos from storage (MP4 or HLS prefix + raw)
    if (course.lessons && course.lessons.length > 0) {
      for (const lesson of course.lessons) {
        if (lesson.videoPublicId) {
          try {
            await deleteLessonVideoAssets(lesson.toObject ? lesson.toObject() : lesson);
          } catch (error) {
            console.error('Error deleting video from storage:', error);
          }
        }
      }
    }

    // Delete course from database
    await detachCourseFromTutorByName(course.instructor, course._id);
    await Course.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Course deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting course',
      error: error.message,
    });
  }
};

module.exports = {
  createCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  presignNewCourseLessonVideos,
  presignExistingCourseLessonVideo,
};
