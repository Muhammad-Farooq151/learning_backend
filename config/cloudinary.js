const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper function to delete file from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) return null;
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
};

// Helper function to upload video to Cloudinary
const uploadVideoToCloudinary = async (filePath, folder = 'courses/videos') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'video',
      folder: folder,
      chunk_size: 6000000, // 6MB chunks for large videos
      eager: [
        { width: 1280, height: 720, crop: 'limit' },
      ],
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
      duration: result.duration,
    };
  } catch (error) {
    console.error('Error uploading video to Cloudinary:', error);
    throw error;
  }
};

// Helper function to upload image to Cloudinary
const uploadImageToCloudinary = async (filePath, folder = 'courses/images') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'image',
      folder: folder,
      transformation: [
        { width: 1920, height: 1080, crop: 'limit' },
        { quality: 'auto' },
      ],
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Error uploading image to Cloudinary:', error);
    throw error;
  }
};

module.exports = {
  cloudinary,
  deleteFromCloudinary,
  uploadVideoToCloudinary,
  uploadImageToCloudinary,
};
