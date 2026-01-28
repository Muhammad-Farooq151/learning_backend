const Tutor = require('../models/Tutor');

// Create a new tutor
const createTutor = async (req, res) => {
  try {
    const {
      name,
      email,
      speciality,
      phoneNumber,
      courses,
    } = req.body;

    // Validate required fields
    if (!name || !email || !speciality || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, email, speciality, phoneNumber',
      });
    }

    // Parse courses if it comes as a string
    const parsedCourses = typeof courses === 'string' 
      ? JSON.parse(courses) 
      : (Array.isArray(courses) ? courses : []);

    // Validate course IDs
    if (parsedCourses.length > 0) {
      const Course = require('../models/Course');
      const validCourses = await Course.find({ _id: { $in: parsedCourses } });
      if (validCourses.length !== parsedCourses.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more course IDs are invalid',
        });
      }
    }

    // Check if tutor with same email already exists
    const existingTutor = await Tutor.findOne({ email: email.toLowerCase() });
    if (existingTutor) {
      return res.status(400).json({
        success: false,
        message: 'Tutor with this email already exists',
      });
    }

    // Create tutor
    const tutor = new Tutor({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      speciality: speciality.trim(),
      phoneNumber: phoneNumber.trim(),
      courses: parsedCourses || [],
    });

    await tutor.save();

    res.status(201).json({
      success: true,
      message: 'Tutor created successfully',
      data: tutor,
    });
  } catch (error) {
    console.error('Error creating tutor:', error);

    res.status(500).json({
      success: false,
      message: 'Error creating tutor',
      error: error.message,
    });
  }
};

// Get all tutors
const getAllTutors = async (req, res) => {
  try {
    const { speciality, search } = req.query;
    const query = {};

    if (speciality) {
      query.speciality = new RegExp(speciality, 'i');
    }

    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { speciality: new RegExp(search, 'i') },
      ];
    }

    const tutors = await Tutor.find(query)
      .populate('courses', 'title')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: tutors,
    });
  } catch (error) {
    console.error('Error fetching tutors:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tutors',
      error: error.message,
    });
  }
};

// Get single tutor by ID
const getTutorById = async (req, res) => {
  try {
    const { id } = req.params;
    const tutor = await Tutor.findById(id).populate('courses', 'title');

    if (!tutor) {
      return res.status(404).json({
        success: false,
        message: 'Tutor not found',
      });
    }

    res.status(200).json({
      success: true,
      data: tutor,
    });
  } catch (error) {
    console.error('Error fetching tutor:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tutor',
      error: error.message,
    });
  }
};

// Update tutor
const updateTutor = async (req, res) => {
  try {
    const { id } = req.params;
    const tutor = await Tutor.findById(id);

    if (!tutor) {
      return res.status(404).json({
        success: false,
        message: 'Tutor not found',
      });
    }

    const {
      name,
      email,
      speciality,
      phoneNumber,
      courses,
    } = req.body;

    // Parse courses if it comes as a string
    const parsedCourses = typeof courses === 'string' 
      ? JSON.parse(courses) 
      : (Array.isArray(courses) ? courses : undefined);

    // Validate course IDs if courses are being updated
    if (parsedCourses !== undefined && parsedCourses.length > 0) {
      const Course = require('../models/Course');
      const validCourses = await Course.find({ _id: { $in: parsedCourses } });
      if (validCourses.length !== parsedCourses.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more course IDs are invalid',
        });
      }
    }

    // Check if email is being changed and if new email already exists
    if (email && email.toLowerCase() !== tutor.email) {
      const existingTutor = await Tutor.findOne({ email: email.toLowerCase() });
      if (existingTutor) {
        return res.status(400).json({
          success: false,
          message: 'Tutor with this email already exists',
        });
      }
    }

    // Update tutor fields
    if (name) tutor.name = name.trim();
    if (email) tutor.email = email.toLowerCase().trim();
    if (speciality) tutor.speciality = speciality.trim();
    if (phoneNumber) tutor.phoneNumber = phoneNumber.trim();
    if (parsedCourses !== undefined) tutor.courses = parsedCourses;

    await tutor.save();

    res.status(200).json({
      success: true,
      message: 'Tutor updated successfully',
      data: tutor,
    });
  } catch (error) {
    console.error('Error updating tutor:', error);

    res.status(500).json({
      success: false,
      message: 'Error updating tutor',
      error: error.message,
    });
  }
};

// Delete tutor
const deleteTutor = async (req, res) => {
  try {
    const { id } = req.params;
    const tutor = await Tutor.findById(id);

    if (!tutor) {
      return res.status(404).json({
        success: false,
        message: 'Tutor not found',
      });
    }

    await Tutor.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Tutor deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting tutor:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting tutor',
      error: error.message,
    });
  }
};

module.exports = {
  createTutor,
  getAllTutors,
  getTutorById,
  updateTutor,
  deleteTutor,
};
