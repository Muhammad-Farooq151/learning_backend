# Courses API Documentation

## Overview
This API handles course creation, updates, deletion, and retrieval with Cloudinary integration for video and image uploads.

## Environment Variables Required
Add these to your `.env` file:
```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## API Endpoints

### 1. Create Course
**POST** `/api/courses`

**Request:**
- Content-Type: `multipart/form-data`
- Fields:
  - `title` (string, required)
  - `category` (string, required)
  - `instructor` (string, required)
  - `price` (string, required)
  - `description` (string, required)
  - `skills` (JSON string array, optional)
  - `faqs` (JSON string array, optional) - Format: `[{"question": "...", "answer": "..."}]`
  - `lessons` (JSON string array, optional) - Format: `[{"lessonName": "...", "skills": [...], "learningOutcomes": "..."}]`
  - `keywords` (JSON string array, optional)
  - `status` (string, optional) - "draft" or "published" (default: "draft")
  - `thumbnail` (file, optional) - Image file (JPEG/PNG, max 10MB)
  - `lessonVideos` (files, optional) - Video files (MP4/MOV/AVI, max 800MB each)

**Response:**
```json
{
  "success": true,
  "message": "Course created successfully",
  "data": { /* course object */ }
}
```

### 2. Get All Courses
**GET** `/api/courses`

**Query Parameters:**
- `status` (optional) - Filter by status ("draft" or "published")
- `category` (optional) - Filter by category
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 10) - Items per page

**Response:**
```json
{
  "success": true,
  "data": [ /* array of courses */ ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

### 3. Get Single Course
**GET** `/api/courses/:id`

**Response:**
```json
{
  "success": true,
  "data": { /* course object */ }
}
```

### 4. Update Course
**PUT** `/api/courses/:id`

**Request:**
- Same as Create Course, but all fields are optional
- Only provide files (thumbnail/videos) if you want to update them
- Old files will be automatically deleted from Cloudinary when new ones are uploaded

**Response:**
```json
{
  "success": true,
  "message": "Course updated successfully",
  "data": { /* updated course object */ }
}
```

### 5. Delete Course
**DELETE** `/api/courses/:id`

**Response:**
```json
{
  "success": true,
  "message": "Course deleted successfully"
}
```

## Course Model Structure

```javascript
{
  title: String,
  category: String,
  instructor: String,
  price: String,
  skills: [String],
  description: String,
  faqs: [{
    question: String,
    answer: String
  }],
  lessons: [{
    lessonName: String,
    skills: [String],
    learningOutcomes: String,
    videoUrl: String,
    videoPublicId: String,
    duration: Number,
    order: Number
  }],
  keywords: [String],
  thumbnailUrl: String,
  thumbnailPublicId: String,
  status: "draft" | "published",
  createdBy: ObjectId (ref: User),
  createdAt: Date,
  updatedAt: Date
}
```

## File Upload Specifications

### Thumbnail
- **Form field name:** `thumbnail`
- **Accepted formats:** JPEG, PNG
- **Max size:** 10MB
- **Recommended dimensions:** 1920 x 1080

### Lesson Videos
- **Form field name:** `lessonVideos` (multiple files)
- **Accepted formats:** MP4, MOV, AVI
- **Max size:** 800MB per file
- **Storage:** Uploaded to Cloudinary with automatic optimization

## Error Handling

All endpoints return errors in this format:
```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error message"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (missing/invalid fields)
- `404` - Not Found
- `500` - Internal Server Error

## Notes

1. **File Cleanup:** Local files are automatically deleted after successful Cloudinary upload
2. **Cloudinary Deletion:** When updating or deleting courses, old files are automatically removed from Cloudinary
3. **JSON Arrays:** Arrays (skills, faqs, lessons, keywords) should be sent as JSON strings in form-data
4. **Video Processing:** Videos are processed with chunked uploads for large files
5. **Image Optimization:** Images are automatically optimized and resized by Cloudinary
