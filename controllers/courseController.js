const Course = require('../models/Course');
const User = require('../models/User');
const { uploadVideoToCloudinary, uploadImageToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');
const { cleanupFiles } = require('../middleware/upload');
const fs = require('fs');
const path = require('path');

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
      keywords,
      status = 'draft',
    } = req.body;

    // Validate required fields
    if (!title || !category || !instructor || !price || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, category, instructor, price, description',
      });
    }

    // Validate courseLevel if provided
    if (courseLevel && !['Beginner', 'Intermediate', 'Expert'].includes(courseLevel)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid courseLevel. Must be one of: Beginner, Intermediate, Expert',
      });
    }

    // Parse JSON strings if they come as strings
    const parsedSkills = typeof skills === 'string' ? JSON.parse(skills) : skills;
    const parsedFaqs = typeof faqs === 'string' ? JSON.parse(faqs) : faqs;
    const parsedLessons = typeof lessons === 'string' ? JSON.parse(lessons) : lessons;
    const parsedKeywords = typeof keywords === 'string' ? JSON.parse(keywords) : keywords;

    // Upload thumbnail if provided
    let thumbnailUrl = null;
    let thumbnailPublicId = null;
    const thumbnailFile = req.files && Array.isArray(req.files) 
      ? req.files.find(f => f.fieldname === 'thumbnail') 
      : null;
    if (thumbnailFile) {
      try {
        const thumbnailResult = await uploadImageToCloudinary(thumbnailFile.path);
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
          message: 'Error uploading thumbnail to Cloudinary',
        });
      }
    }

    // Get all lesson video files
    const lessonVideoFiles = req.files && Array.isArray(req.files)
      ? req.files.filter(f => f.fieldname === 'lessonVideos')
      : [];

    // Process lesson videos
    const processedLessons = [];
    if (parsedLessons && Array.isArray(parsedLessons)) {
      for (let i = 0; i < parsedLessons.length; i++) {
        const lesson = parsedLessons[i];
        const lessonData = {
          lessonName: lesson.lessonName || '',
          skills: lesson.skills || [],
          learningOutcomes: lesson.learningOutcomes || '',
          order: i,
        };

        // Get video file for this lesson (by index)
        const videoFile = lessonVideoFiles[i] || null;

        if (videoFile) {
          try {
            const videoResult = await uploadVideoToCloudinary(videoFile.path);
            lessonData.videoUrl = videoResult.url;
            lessonData.videoPublicId = videoResult.publicId;
            lessonData.duration = videoResult.duration || 0;
            // Clean up local file
            if (fs.existsSync(videoFile.path)) {
              fs.unlinkSync(videoFile.path);
            }
          } catch (error) {
            console.error(`Error uploading video for lesson ${i}:`, error);
            cleanupFiles([videoFile]);
            return res.status(500).json({
              success: false,
              message: `Error uploading video for lesson ${i + 1}`,
            });
          }
        }

        processedLessons.push(lessonData);
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

    // Create course
    const course = new Course({
      title,
      category,
      instructor,
      price,
      discountPercentage: parsedDiscountPercentage,
      courseLevel: courseLevel,
      taxPercentage: parsedTaxPercentage,
      skills: parsedSkills || [],
      description,
      faqs: parsedFaqs || [],
      lessons: processedLessons,
      keywords: parsedKeywords || [],
      thumbnailUrl,
      thumbnailPublicId,
      status,
    });

    await course.save();

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
      keywords,
      status,
    } = req.body;

    // Parse JSON strings if they come as strings
    const parsedSkills = typeof skills === 'string' ? JSON.parse(skills) : skills;
    const parsedFaqs = typeof faqs === 'string' ? JSON.parse(faqs) : faqs;
    const parsedLessons = typeof lessons === 'string' ? JSON.parse(lessons) : lessons;
    const parsedKeywords = typeof keywords === 'string' ? JSON.parse(keywords) : keywords;

    // Update thumbnail if new one is provided
    const thumbnailFile = req.files && Array.isArray(req.files) 
      ? req.files.find(f => f.fieldname === 'thumbnail') 
      : null;
    if (thumbnailFile) {
      // Delete old thumbnail from Cloudinary
      if (course.thumbnailPublicId) {
        try {
          await deleteFromCloudinary(course.thumbnailPublicId);
        } catch (error) {
          console.error('Error deleting old thumbnail:', error);
        }
      }

      // Upload new thumbnail
      try {
        const thumbnailResult = await uploadImageToCloudinary(thumbnailFile.path);
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
          message: 'Error uploading thumbnail to Cloudinary',
        });
      }
    }

    // Get all lesson video files
    const lessonVideoFiles = req.files && Array.isArray(req.files)
      ? req.files.filter(f => f.fieldname === 'lessonVideos')
      : [];

    // Update lesson videos
    if (parsedLessons && Array.isArray(parsedLessons)) {
      for (let i = 0; i < parsedLessons.length; i++) {
        const lesson = parsedLessons[i];
        const existingLesson = course.lessons[i];

        // Get video file for this lesson (by index)
        const videoFile = lessonVideoFiles[i] || null;

        if (videoFile) {
          // Delete old video from Cloudinary if it exists
          if (existingLesson && existingLesson.videoPublicId) {
            try {
              await deleteFromCloudinary(existingLesson.videoPublicId);
            } catch (error) {
              console.error(`Error deleting old video for lesson ${i}:`, error);
            }
          }

          // Upload new video
          try {
            const videoResult = await uploadVideoToCloudinary(videoFile.path);
            lesson.videoUrl = videoResult.url;
            lesson.videoPublicId = videoResult.publicId;
            lesson.duration = videoResult.duration || 0;
            // Clean up local file
            if (fs.existsSync(videoFile.path)) {
              fs.unlinkSync(videoFile.path);
            }
          } catch (error) {
            console.error(`Error uploading video for lesson ${i}:`, error);
            cleanupFiles([videoFile]);
            return res.status(500).json({
              success: false,
              message: `Error uploading video for lesson ${i + 1}`,
            });
          }
        } else if (existingLesson) {
          // Keep existing video if no new one is provided
          lesson.videoUrl = existingLesson.videoUrl;
          lesson.videoPublicId = existingLesson.videoPublicId;
          lesson.duration = existingLesson.duration;
        }

        lesson.order = i;
      }
    } else if (parsedLessons && Array.isArray(parsedLessons)) {
      // Update lessons without new videos
      parsedLessons.forEach((lesson, i) => {
        const existingLesson = course.lessons[i];
        if (existingLesson) {
          lesson.videoUrl = existingLesson.videoUrl;
          lesson.videoPublicId = existingLesson.videoPublicId;
          lesson.duration = existingLesson.duration;
        }
        lesson.order = i;
      });
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

    // Update courseLevel if provided
    if (courseLevel !== undefined && courseLevel !== null && courseLevel !== '') {
      if (!['Beginner', 'Intermediate', 'Expert'].includes(courseLevel)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid courseLevel. Must be one of: Beginner, Intermediate, Expert',
        });
      }
      course.courseLevel = courseLevel;
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
    if (category) course.category = category;
    if (instructor) course.instructor = instructor;
    if (price) course.price = price;
    if (parsedSkills) course.skills = parsedSkills;
    if (description) course.description = description;
    if (parsedFaqs) course.faqs = parsedFaqs;
    if (parsedLessons) course.lessons = parsedLessons;
    if (parsedKeywords) course.keywords = parsedKeywords;
    if (status) course.status = status;

    await course.save();

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

    // Delete thumbnail from Cloudinary
    if (course.thumbnailPublicId) {
      try {
        await deleteFromCloudinary(course.thumbnailPublicId);
      } catch (error) {
        console.error('Error deleting thumbnail from Cloudinary:', error);
      }
    }

    // Delete all lesson videos from Cloudinary
    if (course.lessons && course.lessons.length > 0) {
      for (const lesson of course.lessons) {
        if (lesson.videoPublicId) {
          try {
            await deleteFromCloudinary(lesson.videoPublicId);
          } catch (error) {
            console.error('Error deleting video from Cloudinary:', error);
          }
        }
      }
    }

    // Delete course from database
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
};
