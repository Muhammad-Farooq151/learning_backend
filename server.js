require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection (must be before routes to ensure models are loaded)
const MONGODB_URI = process.env.MONGODB_URI || `mongodb://localhost:27017/${process.env.DATABASE_NAME || 'learninghub'}`;

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    console.log(`📦 Database: ${process.env.DATABASE_NAME || 'learninghub'}`);
    
    // Ensure models are loaded
    require('./models/User');
    require('./models/VerificationToken');
    require('./models/Course');
    console.log('✅ Models loaded');
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error.message);
  });

// Routes (after database connection)
const authRoutes = require('./routes/authRoutes');
const courseRoutes = require('./routes/courseRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
// Also support /courses for backward compatibility
app.use('/courses', courseRoutes);
app.use('/api/users', userRoutes);


app.get('/', (req, res) => {
  res.json({ 
    message: 'Server is running!',
    status: 'OK',
    database: process.env.DATABASE_NAME || 'learninghub'
  });
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('🚀 Server is running on port', PORT);
  console.log(`📍 http://localhost:${PORT}`);
});

