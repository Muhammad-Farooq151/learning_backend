const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const videosDir = path.join(uploadsDir, 'videos');
const imagesDir = path.join(uploadsDir, 'images');

if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir, { recursive: true });
}
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Configure storage for videos
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videosDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'video-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// Configure storage for images
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imagesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter for videos
const videoFileFilter = (req, file, cb) => {
  const allowedMimes = ['video/mp4', 'video/mov', 'video/avi', 'video/quicktime'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid video file type. Only MP4, MOV, and AVI are allowed.'), false);
  }
};

// File filter for images
const imageFileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid image file type. Only JPEG and PNG are allowed.'), false);
  }
};

// Multer instance for videos
const uploadVideo = multer({
  storage: videoStorage,
  fileFilter: videoFileFilter,
  limits: {
    fileSize: 800 * 1024 * 1024, // 800MB limit
  },
});

// Multer instance for images
const uploadImage = multer({
  storage: imageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Combined storage that routes files based on field name
const combinedStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'thumbnail') {
      cb(null, imagesDir);
    } else if (file.fieldname === 'lessonVideos') {
      cb(null, videosDir);
    } else {
      cb(null, uploadsDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    if (file.fieldname === 'thumbnail') {
      cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
    } else if (file.fieldname === 'lessonVideos') {
      cb(null, 'video-' + uniqueSuffix + path.extname(file.originalname));
    } else {
      cb(null, 'file-' + uniqueSuffix + path.extname(file.originalname));
    }
  },
});

// Combined file filter
const combinedFileFilter = (req, file, cb) => {
  if (file.fieldname === 'thumbnail') {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image file type. Only JPEG and PNG are allowed.'), false);
    }
  } else if (file.fieldname === 'lessonVideos') {
    const allowedMimes = ['video/mp4', 'video/mov', 'video/avi', 'video/quicktime'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video file type. Only MP4, MOV, and AVI are allowed.'), false);
    }
  } else {
    // Reject unexpected file fields (but allow text fields which won't reach here)
    cb(new Error(`Unexpected file field: ${file.fieldname}`), false);
  }
};

// Combined multer instance
const uploadCombined = multer({
  storage: combinedStorage,
  fileFilter: combinedFileFilter,
  limits: {
    fileSize: 800 * 1024 * 1024, // 800MB limit for videos
  },
});

// Middleware for course upload (thumbnail + lesson videos + other fields)
// Using .any() to accept all fields, then we'll filter in the controller
const uploadCourseFiles = uploadCombined.any();

// Middleware for multiple video uploads (for lessons)
const uploadMultipleVideos = uploadVideo.fields([
  { name: 'lessonVideos', maxCount: 50 }, // Support up to 50 lessons
]);

// Middleware for single image upload (for thumbnail)
const uploadThumbnail = uploadImage.single('thumbnail');

// Helper function to clean up uploaded files
const cleanupFiles = (files) => {
  if (!files) return;
  
  const fileArray = Array.isArray(files) ? files : [files];
  fileArray.forEach(file => {
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }
  });
};

module.exports = {
  uploadVideo,
  uploadImage,
  uploadMultipleVideos,
  uploadThumbnail,
  uploadCourseFiles,
  cleanupFiles,
};
