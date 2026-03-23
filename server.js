// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const mongoose = require('mongoose');
// const http = require('http');
// const { Server } = require('socket.io');

// const app = express();
// const server = http.createServer(app);

// // Socket.io setup with CORS
// const io = new Server(server, {
//   cors: {
//     origin: process.env.FRONTEND_URL || 'http://localhost:3000',
//     methods: ['GET', 'POST'],
//     credentials: true,
//   },
// });

// // Middleware
// app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // Database connection (must be before routes to ensure models are loaded)
// const MONGODB_URI = process.env.MONGODB_URI || `mongodb://localhost:27017/${process.env.DATABASE_NAME || 'learninghub'}`;

// // mongoose.connect(MONGODB_URI)
// //   .then(() => {
// //     console.log('✅ MongoDB connected successfully');
// //     console.log(`📦 Database: ${process.env.DATABASE_NAME || 'learninghub'}`);
    
// //     // Ensure models are loaded
// //     require('./models/User');
// //     require('./models/VerificationToken');
// //     require('./models/Course');
// //     require('./models/Tutor');
// //     require('./models/Transaction');
// //     require('./models/CourseProgress');
// //     require('./models/Feedback');
// //     console.log('✅ Models loaded');
// //   })
// //   .catch((error) => {
// //     console.error('❌ MongoDB connection error:', error.message);
// //   });


// mongoose.connect(MONGODB_URI)
//   .then(() => {
//     console.log('✅ MongoDB connected successfully');
//     console.log(`📦 Database: ${process.env.DATABASE_NAME || 'learninghub'}`);
//     require('./models/User');
//     require('./models/VerificationToken');
//     require('./models/Course');
//     require('./models/Tutor');
//     require('./models/Transaction');
//     require('./models/CourseProgress');
//     require('./models/Feedback');
//     console.log('✅ Models loaded');
//   })
//   .catch((error) => {
//     console.error('❌ MongoDB connection error:', error.message);
//     // ✅ ADDED: Exit process so Cloud Run knows it failed
//     process.exit(1);
//   });

// // Import models (after mongoose connection is established)
// const CourseProgress = require('./models/CourseProgress');

// // Routes (after database connection)
// const authRoutes = require('./routes/authRoutes');
// const courseRoutes = require('./routes/courseRoutes');
// const userRoutes = require('./routes/userRoutes');
// const tutorRoutes = require('./routes/tutorRoutes');
// const paymentRoutes = require('./routes/paymentRoutes');
// const transactionRoutes = require('./routes/transactionRoutes');
// const progressRoutes = require('./routes/progressRoutes');
// const adminRoutes = require('./routes/adminRoutes');
// const feedbackRoutes = require('./routes/feedbackRoutes');

// app.use('/api/auth', authRoutes);
// app.use('/api/courses', courseRoutes);
// app.use('/api/users', userRoutes);
// app.use('/api/tutors', tutorRoutes);
// app.use('/api/payments', paymentRoutes);
// app.use('/api/transactions', transactionRoutes);
// app.use('/api/progress', progressRoutes);
// app.use('/api/admins', adminRoutes);
// app.use('/api/feedback', feedbackRoutes);


// app.get('/', (req, res) => {
//   res.json({ 
//     message: 'Server is running!',
//     status: 'OK',
//     database: process.env.DATABASE_NAME || 'learninghub'
//   });
// });


// // ============================================================
// // ✅ ADDED: Health Check Endpoint (Required for Cloud Run)
// // Cloud Run uses this to verify the container is alive.
// // Must return 200 OK — do not remove this route.
// // ============================================================
// app.get('/health', (req, res) => {
//   const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
//   res.status(200).json({
//     status: 'healthy',
//     project: 'learning-hub',
//     database: dbStatus,
//     timestamp: new Date().toISOString(),
//     uptime: Math.floor(process.uptime()),
//   });
// });
// // ============================================================


// // Socket.io connection handling
// const progressTrackingService = require('./services/progressTrackingService');
// const { segmentsToRanges } = require('./utils/rangeUtils');

// io.use(async (socket, next) => {
//   try {
//     const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
//     const user = await progressTrackingService.authenticateSocket(socket, token);
//     socket.user = user;
//     next();
//   } catch (error) {
//     console.error('[Socket.io] Authentication failed:', error.message);
//     next(new Error('Authentication failed'));
//   }
// });

// io.on('connection', (socket) => {
//   console.log(`[Socket.io] ✅ User connected: ${socket.user.userId}`);

//   // Join user's personal room
//   socket.join(`user_${socket.user.userId}`);

//   // Handle video progress tracking
//   socket.on('video:progress', async (data) => {
//     // Reduced logging - only log occasionally to avoid spam
//     if (Math.random() < 0.05) { // Log 5% of events
//       console.log(`[Socket.io] 📹 Progress received from ${socket.user.userId}:`, {
//         lessonId: data.lessonId,
//         currentTime: data.currentTime,
//         isPlaying: data.isPlaying,
//         watchedSegmentsCount: data.watchedSegmentsCount || 0,
//       });
//     }
//     try {
//       const { courseId, lessonId, currentTime, videoDuration, isPlaying, watchedSegments } = data;

//       if (!courseId || !lessonId || typeof currentTime !== 'number') {
//         socket.emit('video:progress:error', { message: 'Invalid data' });
//         return;
//       }

//       const sessionKey = `${socket.user.userId}_${lessonId}`;

//       // Validate progress
//       if (isPlaying) {
//         const session = progressTrackingService.activeSessions.get(sessionKey);
        
//         if (!session) {
//           // Start new session - track range start from current position
//           progressTrackingService.startSession(sessionKey, currentTime);
//           console.log(`[Socket.io] 🎬 Started new session for ${socket.user.userId}, lesson ${lessonId}, startTime: ${currentTime}`);
//         }

//         const validation = progressTrackingService.validateProgress(
//           sessionKey,
//           currentTime,
//           videoDuration
//         );

//         if (!validation.valid) {
//           // Invalid progress (skip detected) - don't update
//           socket.emit('video:progress:warning', { 
//             message: 'Invalid progress detected',
//             reason: validation.reason 
//           });
//           return;
//         }

//         // Update session (this ensures rangeStart is set)
//         progressTrackingService.updateSession(sessionKey, currentTime, true);

//         // Save progress every 3 seconds (throttled) for real-time persistence
//         const updatedSession = progressTrackingService.activeSessions.get(sessionKey);
//         if (updatedSession && Date.now() - (updatedSession.lastPersistAt || 0) > 3000) {
//           // Calculate watched range from session rangeStart to current time
//           // rangeStart should be set when session starts
//           let rangeStart = updatedSession.rangeStart !== undefined && updatedSession.rangeStart !== null
//             ? updatedSession.rangeStart
//             : (updatedSession.lastTime || currentTime);
//           let rangeEnd = currentTime;
          
//           const watchedRangesFromSegments = segmentsToRanges(watchedSegments);
//           if (watchedRangesFromSegments.length > 0) {
//             rangeStart = watchedRangesFromSegments[0].start;
//             rangeEnd = watchedRangesFromSegments[watchedRangesFromSegments.length - 1].end;
//           }
          
//           // Only save if range is valid (end > start)
//           if (rangeEnd > rangeStart) {
//             console.log(`[Socket.io] 💾 Saving progress with range (Cloudinary + Socket.io) for ${socket.user.userId}, lesson ${lessonId}:`, {
//               rangeStart: rangeStart.toFixed(2),
//               rangeEnd: rangeEnd.toFixed(2),
//               rangeDuration: (rangeEnd - rangeStart).toFixed(2),
//               currentTime: currentTime.toFixed(2),
//               videoDuration: videoDuration,
//               watchedSegmentsCount: watchedSegments?.length || 0,
//             });
            
//             const result = await progressTrackingService.saveProgress(
//               socket.user.userId,
//               courseId,
//               lessonId,
//               validation.watchDuration,
//               currentTime,
//               videoDuration,
//               rangeStart,
//               rangeEnd,
//               watchedRangesFromSegments
//             );

//             console.log(`[Socket.io] ✅ Progress saved to DB:`, {
//               watched: result.watched,
//               watchedSeconds: result.watchedSeconds,
//               completed: result.completed,
//               progressPercent: result.progressPercent,
//             });
            
//             // Get watchedRanges from saved progress to send back to client
//             const courseProgress = await CourseProgress.findOne({ 
//               userId: socket.user.userId, 
//               courseId 
//             });
//             let watchedRanges = [];
//             if (courseProgress) {
//               const lessonProgress = courseProgress.lessons.find(
//                 l => l.lessonId.toString() === lessonId.toString()
//               );
//               if (lessonProgress && lessonProgress.watchedRanges) {
//                 watchedRanges = lessonProgress.watchedRanges;
//               }
//             }
            
//             socket.emit('video:progress:saved', {
//               ...result,
//               lessonId: lessonId,
//               watchedRanges: watchedRanges,
//             });
            
//             // Reset range start for next interval (continue tracking from current position)
//             updatedSession.rangeStart = currentTime;
//             updatedSession.lastPersistAt = Date.now();
//           }
//         }
//       } else {
//         // Video paused - save the watched range and end session
//         const session = progressTrackingService.activeSessions.get(sessionKey);
//         if (session) {
//           // Calculate final watched range from session start to pause time
//           let rangeStart = session.rangeStart || session.lastTime || currentTime;
//           let rangeEnd = currentTime;
          
//           const watchedRangesFromSegments = segmentsToRanges(watchedSegments);
//           if (watchedRangesFromSegments.length > 0) {
//             rangeStart = watchedRangesFromSegments[0].start;
//             rangeEnd = watchedRangesFromSegments[watchedRangesFromSegments.length - 1].end;
//           }
          
//           const totalWatchDuration = session.watchDuration;
          
//           console.log(`[Socket.io] 💾 Saving progress on pause with range (Cloudinary) for ${socket.user.userId}, lesson ${lessonId}:`, {
//             rangeStart: rangeStart.toFixed(2),
//             rangeEnd: rangeEnd.toFixed(2),
//             currentTime: currentTime,
//             videoDuration: videoDuration,
//             watchedSegmentsCount: watchedSegments?.length || 0,
//           });
          
//           const result = await progressTrackingService.saveProgress(
//             socket.user.userId,
//             courseId,
//             lessonId,
//             totalWatchDuration,
//             currentTime,
//             videoDuration,
//             rangeStart,
//             rangeEnd,
//             watchedRangesFromSegments
//           );
          
//           console.log(`[Socket.io] ✅ Progress saved on pause to DB:`, {
//             watched: result.watched,
//             watchedSeconds: result.watchedSeconds,
//             completed: result.completed,
//             progressPercent: result.progressPercent,
//           });
          
//           // Get watchedRanges from saved progress to send back to client
//           const courseProgress = await CourseProgress.findOne({ 
//             userId: socket.user.userId, 
//             courseId 
//           });
//           let watchedRanges = [];
//           if (courseProgress) {
//             const lessonProgress = courseProgress.lessons.find(
//               l => l.lessonId.toString() === lessonId.toString()
//             );
//             if (lessonProgress && lessonProgress.watchedRanges) {
//               watchedRanges = lessonProgress.watchedRanges;
//             }
//           }
          
//           socket.emit('video:progress:saved', {
//             ...result,
//             lessonId: lessonId,
//             watchedRanges: watchedRanges,
//           });
          
//           // End session after saving
//           progressTrackingService.endSession(sessionKey);
//         } else if (currentTime > 0) {
//           // No active session but video was paused with progress - save current position
//           // Handle watchedSegments from client if available (Cloudinary + Socket.io)
//           let finalRangeStart = 0;
//           let finalRangeEnd = currentTime;
          
//           const watchedRangesFromSegments = segmentsToRanges(watchedSegments);
//           if (watchedRangesFromSegments.length > 0) {
//             finalRangeStart = watchedRangesFromSegments[0].start;
//             finalRangeEnd = watchedRangesFromSegments[watchedRangesFromSegments.length - 1].end;
//           }
          
//           console.log(`[Socket.io] 💾 Saving progress (no session, Cloudinary) for ${socket.user.userId}, lesson ${lessonId}:`, {
//             currentTime: currentTime,
//             videoDuration: videoDuration,
//             watchedSegmentsCount: watchedSegments?.length || 0,
//             rangeStart: finalRangeStart,
//             rangeEnd: finalRangeEnd,
//           });
          
//           const result = await progressTrackingService.saveProgress(
//             socket.user.userId,
//             courseId,
//             lessonId,
//             0,
//             currentTime,
//             videoDuration,
//             finalRangeStart,
//             finalRangeEnd,
//             watchedRangesFromSegments
//           );
          
//           console.log(`[Socket.io] ✅ Progress saved (no session) to DB:`, {
//             watched: result.watched,
//             watchedSeconds: result.watchedSeconds,
//             completed: result.completed,
//           });
          
//           // Get watchedRanges from saved progress to send back to client
//           const courseProgress = await CourseProgress.findOne({ 
//             userId: socket.user.userId, 
//             courseId 
//           });
//           let watchedRanges = [];
//           if (courseProgress) {
//             const lessonProgress = courseProgress.lessons.find(
//               l => l.lessonId.toString() === lessonId.toString()
//             );
//             if (lessonProgress && lessonProgress.watchedRanges) {
//               watchedRanges = lessonProgress.watchedRanges;
//             }
//           }
          
//           socket.emit('video:progress:saved', {
//             ...result,
//             lessonId: lessonId,
//             watchedRanges: watchedRanges,
//           });
//         }
//       }
//     } catch (error) {
//       console.error('[Socket.io] Error handling progress:', error);
//       socket.emit('video:progress:error', { message: error.message });
//     }
//   });

//   // Handle video ended (Cloudinary + Socket.io)
//   socket.on('video:ended', async (data) => {
//     try {
//       const { courseId, lessonId, videoDuration, watchedSegments } = data;
//       const sessionKey = `${socket.user.userId}_${lessonId}`;
      
//       const totalWatchDuration = progressTrackingService.endSession(sessionKey);
      
//       // Use watchedSegments if available (SCORM-style from Cloudinary)
//       let finalRangeStart = 0;
//       let finalRangeEnd = videoDuration;
      
//       const watchedRangesFromSegments = segmentsToRanges(watchedSegments);
//       if (watchedRangesFromSegments.length > 0) {
//         finalRangeStart = watchedRangesFromSegments[0].start;
//         finalRangeEnd = watchedRangesFromSegments[watchedRangesFromSegments.length - 1].end;
//       }
      
//       const result = await progressTrackingService.saveProgress(
//         socket.user.userId,
//         courseId,
//         lessonId,
//         totalWatchDuration,
//         videoDuration,
//         videoDuration,
//         finalRangeStart,
//         finalRangeEnd,
//         watchedRangesFromSegments
//       );
      
//       // Get watchedRanges from saved progress to send back to client
//       const courseProgress = await CourseProgress.findOne({ 
//         userId: socket.user.userId, 
//         courseId 
//       });
//       let watchedRanges = [];
//       if (courseProgress) {
//         const lessonProgress = courseProgress.lessons.find(
//           l => l.lessonId.toString() === lessonId.toString()
//         );
//         if (lessonProgress && lessonProgress.watchedRanges) {
//           watchedRanges = lessonProgress.watchedRanges;
//         }
//       }

//       socket.emit('video:ended:saved', { 
//         success: true,
//         ...result,
//         lessonId: lessonId,
//         watchedRanges: watchedRanges,
//       });
//     } catch (error) {
//       console.error('[Socket.io] Error handling video end:', error);
//       socket.emit('video:ended:error', { message: error.message });
//     }
//   });

//   // Handle disconnect
//   socket.on('disconnect', () => {
//     console.log(`[Socket.io] User disconnected: ${socket.user.userId}`);
//     // Cleanup sessions for this user
//     for (const [key] of progressTrackingService.activeSessions.entries()) {
//       if (key.startsWith(`${socket.user.userId}_`)) {
//         progressTrackingService.activeSessions.delete(key);
//       }
//     }
//   });
// });

// // ============================================================
// // ✅ UPDATED: PORT changed from 5000 to 8080 for Cloud Run
// // Cloud Run requires the app to listen on PORT env variable.
// // Original line was: const PORT = process.env.PORT || 5000;
// // ============================================================
// const PORT = process.env.PORT || 8080;
// // ============================================================

// server.listen(PORT, () => {
//   console.log('🚀 Server is running on port', PORT);
//   console.log(`📍 http://localhost:${PORT}`);
//   console.log('🔌 Socket.io server is ready');
// });

// // ============================================================
// // ✅ ADDED: Graceful Shutdown Handler (Required for Cloud Run)
// // Cloud Run sends SIGTERM before shutting down a container.
// // This ensures active connections close cleanly before exit.
// // ============================================================
// process.on('SIGTERM', () => {
//   console.log('🛑 SIGTERM received — shutting down gracefully...');
//   server.close(() => {
//     console.log('✅ HTTP server closed');
//     mongoose.connection.close(false, () => {
//       console.log('✅ MongoDB connection closed');
//       process.exit(0);
//     });
//   });
// });
// // ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const io = new Server(server, {
  cors: {
    // origin: process.env.FRONTEND_URL || 'http://localhost:3000' ,
    origin: ['https://stage.vixhunter.com', 'https://vixhunter.com'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// ✅ FIX: Routes loaded BEFORE server.listen so port opens fast
// ============================================================
const authRoutes = require('./routes/authRoutes');
const courseRoutes = require('./routes/courseRoutes');
const userRoutes = require('./routes/userRoutes');
const tutorRoutes = require('./routes/tutorRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const progressRoutes = require('./routes/progressRoutes');
const adminRoutes = require('./routes/adminRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tutors', tutorRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/feedback', feedbackRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Server is running!',
    status: 'OK',
    database: process.env.DATABASE_NAME || 'learninghub'
  });
});

// ============================================================
// ✅ Health Check Endpoint (Required for Cloud Run)
// Cloud Run uses this to verify the container is alive.
// Must return 200 OK — do not remove this route.
// ============================================================
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    status: 'healthy',
    project: 'learning-hub',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// ============================================================
// Import models for use in Socket.io handlers
// ============================================================
const CourseProgress = require('./models/CourseProgress');

// ============================================================
// Socket.io connection handling
// ============================================================
const progressTrackingService = require('./services/progressTrackingService');
const { segmentsToRanges } = require('./utils/rangeUtils');

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    const user = await progressTrackingService.authenticateSocket(socket, token);
    socket.user = user;
    next();
  } catch (error) {
    console.error('[Socket.io] Authentication failed:', error.message);
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket.io] ✅ User connected: ${socket.user.userId}`);

  // Join user's personal room
  socket.join(`user_${socket.user.userId}`);

  // Handle video progress tracking
  socket.on('video:progress', async (data) => {
    // Reduced logging - only log occasionally to avoid spam
    if (Math.random() < 0.05) { // Log 5% of events
      console.log(`[Socket.io] 📹 Progress received from ${socket.user.userId}:`, {
        lessonId: data.lessonId,
        currentTime: data.currentTime,
        isPlaying: data.isPlaying,
        watchedSegmentsCount: data.watchedSegmentsCount || 0,
      });
    }
    try {
      const { courseId, lessonId, currentTime, videoDuration, isPlaying, watchedSegments } = data;

      if (!courseId || !lessonId || typeof currentTime !== 'number') {
        socket.emit('video:progress:error', { message: 'Invalid data' });
        return;
      }

      const sessionKey = `${socket.user.userId}_${lessonId}`;

      // Validate progress
      if (isPlaying) {
        const session = progressTrackingService.activeSessions.get(sessionKey);

        if (!session) {
          // Start new session - track range start from current position
          progressTrackingService.startSession(sessionKey, currentTime);
          console.log(`[Socket.io] 🎬 Started new session for ${socket.user.userId}, lesson ${lessonId}, startTime: ${currentTime}`);
        }

        const validation = progressTrackingService.validateProgress(
          sessionKey,
          currentTime,
          videoDuration
        );

        if (!validation.valid) {
          // Invalid progress (skip detected) - don't update
          socket.emit('video:progress:warning', {
            message: 'Invalid progress detected',
            reason: validation.reason
          });
          return;
        }

        // Update session (this ensures rangeStart is set)
        progressTrackingService.updateSession(sessionKey, currentTime, true);

        // Save progress every 3 seconds (throttled) for real-time persistence
        const updatedSession = progressTrackingService.activeSessions.get(sessionKey);
        if (updatedSession && Date.now() - (updatedSession.lastPersistAt || 0) > 3000) {
          // Calculate watched range from session rangeStart to current time
          // rangeStart should be set when session starts
          let rangeStart = updatedSession.rangeStart !== undefined && updatedSession.rangeStart !== null
            ? updatedSession.rangeStart
            : (updatedSession.lastTime || currentTime);
          let rangeEnd = currentTime;

          const watchedRangesFromSegments = segmentsToRanges(watchedSegments);
          if (watchedRangesFromSegments.length > 0) {
            rangeStart = watchedRangesFromSegments[0].start;
            rangeEnd = watchedRangesFromSegments[watchedRangesFromSegments.length - 1].end;
          }

          // Only save if range is valid (end > start)
          if (rangeEnd > rangeStart) {
            console.log(`[Socket.io] 💾 Saving progress with range (Cloudinary + Socket.io) for ${socket.user.userId}, lesson ${lessonId}:`, {
              rangeStart: rangeStart.toFixed(2),
              rangeEnd: rangeEnd.toFixed(2),
              rangeDuration: (rangeEnd - rangeStart).toFixed(2),
              currentTime: currentTime.toFixed(2),
              videoDuration: videoDuration,
              watchedSegmentsCount: watchedSegments?.length || 0,
            });

            const result = await progressTrackingService.saveProgress(
              socket.user.userId,
              courseId,
              lessonId,
              validation.watchDuration,
              currentTime,
              videoDuration,
              rangeStart,
              rangeEnd,
              watchedRangesFromSegments
            );

            console.log(`[Socket.io] ✅ Progress saved to DB:`, {
              watched: result.watched,
              watchedSeconds: result.watchedSeconds,
              completed: result.completed,
              progressPercent: result.progressPercent,
            });

            // Get watchedRanges from saved progress to send back to client
            const courseProgress = await CourseProgress.findOne({
              userId: socket.user.userId,
              courseId
            });
            let watchedRanges = [];
            if (courseProgress) {
              const lessonProgress = courseProgress.lessons.find(
                l => l.lessonId.toString() === lessonId.toString()
              );
              if (lessonProgress && lessonProgress.watchedRanges) {
                watchedRanges = lessonProgress.watchedRanges;
              }
            }

            socket.emit('video:progress:saved', {
              ...result,
              lessonId: lessonId,
              watchedRanges: watchedRanges,
            });

            // Reset range start for next interval (continue tracking from current position)
            updatedSession.rangeStart = currentTime;
            updatedSession.lastPersistAt = Date.now();
          }
        }
      } else {
        // Video paused - save the watched range and end session
        const session = progressTrackingService.activeSessions.get(sessionKey);
        if (session) {
          // Calculate final watched range from session start to pause time
          let rangeStart = session.rangeStart || session.lastTime || currentTime;
          let rangeEnd = currentTime;

          const watchedRangesFromSegments = segmentsToRanges(watchedSegments);
          if (watchedRangesFromSegments.length > 0) {
            rangeStart = watchedRangesFromSegments[0].start;
            rangeEnd = watchedRangesFromSegments[watchedRangesFromSegments.length - 1].end;
          }

          const totalWatchDuration = session.watchDuration;

          console.log(`[Socket.io] 💾 Saving progress on pause with range (Cloudinary) for ${socket.user.userId}, lesson ${lessonId}:`, {
            rangeStart: rangeStart.toFixed(2),
            rangeEnd: rangeEnd.toFixed(2),
            currentTime: currentTime,
            videoDuration: videoDuration,
            watchedSegmentsCount: watchedSegments?.length || 0,
          });

          const result = await progressTrackingService.saveProgress(
            socket.user.userId,
            courseId,
            lessonId,
            totalWatchDuration,
            currentTime,
            videoDuration,
            rangeStart,
            rangeEnd,
            watchedRangesFromSegments
          );

          console.log(`[Socket.io] ✅ Progress saved on pause to DB:`, {
            watched: result.watched,
            watchedSeconds: result.watchedSeconds,
            completed: result.completed,
            progressPercent: result.progressPercent,
          });

          // Get watchedRanges from saved progress to send back to client
          const courseProgress = await CourseProgress.findOne({
            userId: socket.user.userId,
            courseId
          });
          let watchedRanges = [];
          if (courseProgress) {
            const lessonProgress = courseProgress.lessons.find(
              l => l.lessonId.toString() === lessonId.toString()
            );
            if (lessonProgress && lessonProgress.watchedRanges) {
              watchedRanges = lessonProgress.watchedRanges;
            }
          }

          socket.emit('video:progress:saved', {
            ...result,
            lessonId: lessonId,
            watchedRanges: watchedRanges,
          });

          // End session after saving
          progressTrackingService.endSession(sessionKey);
        } else if (currentTime > 0) {
          // No active session but video was paused with progress - save current position
          // Handle watchedSegments from client if available (Cloudinary + Socket.io)
          let finalRangeStart = 0;
          let finalRangeEnd = currentTime;

          const watchedRangesFromSegments = segmentsToRanges(watchedSegments);
          if (watchedRangesFromSegments.length > 0) {
            finalRangeStart = watchedRangesFromSegments[0].start;
            finalRangeEnd = watchedRangesFromSegments[watchedRangesFromSegments.length - 1].end;
          }

          console.log(`[Socket.io] 💾 Saving progress (no session, Cloudinary) for ${socket.user.userId}, lesson ${lessonId}:`, {
            currentTime: currentTime,
            videoDuration: videoDuration,
            watchedSegmentsCount: watchedSegments?.length || 0,
            rangeStart: finalRangeStart,
            rangeEnd: finalRangeEnd,
          });

          const result = await progressTrackingService.saveProgress(
            socket.user.userId,
            courseId,
            lessonId,
            0,
            currentTime,
            videoDuration,
            finalRangeStart,
            finalRangeEnd,
            watchedRangesFromSegments
          );

          console.log(`[Socket.io] ✅ Progress saved (no session) to DB:`, {
            watched: result.watched,
            watchedSeconds: result.watchedSeconds,
            completed: result.completed,
          });

          // Get watchedRanges from saved progress to send back to client
          const courseProgress = await CourseProgress.findOne({
            userId: socket.user.userId,
            courseId
          });
          let watchedRanges = [];
          if (courseProgress) {
            const lessonProgress = courseProgress.lessons.find(
              l => l.lessonId.toString() === lessonId.toString()
            );
            if (lessonProgress && lessonProgress.watchedRanges) {
              watchedRanges = lessonProgress.watchedRanges;
            }
          }

          socket.emit('video:progress:saved', {
            ...result,
            lessonId: lessonId,
            watchedRanges: watchedRanges,
          });
        }
      }
    } catch (error) {
      console.error('[Socket.io] Error handling progress:', error);
      socket.emit('video:progress:error', { message: error.message });
    }
  });

  // Handle video ended (Cloudinary + Socket.io)
  socket.on('video:ended', async (data) => {
    try {
      const { courseId, lessonId, videoDuration, watchedSegments } = data;
      const sessionKey = `${socket.user.userId}_${lessonId}`;

      const totalWatchDuration = progressTrackingService.endSession(sessionKey);

      // Use watchedSegments if available (SCORM-style from Cloudinary)
      let finalRangeStart = 0;
      let finalRangeEnd = videoDuration;

      const watchedRangesFromSegments = segmentsToRanges(watchedSegments);
      if (watchedRangesFromSegments.length > 0) {
        finalRangeStart = watchedRangesFromSegments[0].start;
        finalRangeEnd = watchedRangesFromSegments[watchedRangesFromSegments.length - 1].end;
      }

      const result = await progressTrackingService.saveProgress(
        socket.user.userId,
        courseId,
        lessonId,
        totalWatchDuration,
        videoDuration,
        videoDuration,
        finalRangeStart,
        finalRangeEnd,
        watchedRangesFromSegments
      );

      // Get watchedRanges from saved progress to send back to client
      const courseProgress = await CourseProgress.findOne({
        userId: socket.user.userId,
        courseId
      });
      let watchedRanges = [];
      if (courseProgress) {
        const lessonProgress = courseProgress.lessons.find(
          l => l.lessonId.toString() === lessonId.toString()
        );
        if (lessonProgress && lessonProgress.watchedRanges) {
          watchedRanges = lessonProgress.watchedRanges;
        }
      }

      socket.emit('video:ended:saved', {
        success: true,
        ...result,
        lessonId: lessonId,
        watchedRanges: watchedRanges,
      });
    } catch (error) {
      console.error('[Socket.io] Error handling video end:', error);
      socket.emit('video:ended:error', { message: error.message });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket.io] User disconnected: ${socket.user.userId}`);
    // Cleanup sessions for this user
    for (const [key] of progressTrackingService.activeSessions.entries()) {
      if (key.startsWith(`${socket.user.userId}_`)) {
        progressTrackingService.activeSessions.delete(key);
      }
    }
  });
});

// ============================================================
// ✅ CRITICAL FIX 1: Server starts FIRST before MongoDB
// Cloud Run checks PORT=8080 immediately on container start.
// Original: const PORT = process.env.PORT || 5000
// ============================================================
const PORT = process.env.PORT || 8080;

// ✅ CRITICAL FIX 2: Bind to '0.0.0.0' — required for Cloud Run
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Server is running on port', PORT);
  console.log(`📍 http://localhost:${PORT}`);
  console.log('🔌 Socket.io server is ready');

  // ✅ CRITICAL FIX 3: Connect MongoDB INSIDE listen callback
  // Port is open BEFORE MongoDB starts connecting.
  // MongoDB failure will NOT crash or block the server.
  const MONGODB_URI = process.env.MONGODB_URI || `mongodb://localhost:27017/${process.env.DATABASE_NAME || 'learninghub'}`;

  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✅ MongoDB connected successfully');
      console.log(`📦 Database: ${process.env.DATABASE_NAME || 'learninghub'}`);

      // Ensure models are loaded after DB connects
      require('./models/User');
      require('./models/VerificationToken');
      require('./models/Course');
      require('./models/Tutor');
      require('./models/Transaction');
      require('./models/CourseProgress');
      require('./models/Feedback');
      console.log('✅ Models loaded');
    })
    .catch((error) => {
      // ✅ FIX: Log only — do NOT call process.exit()
      // Server stays alive so Cloud Run health check passes
      console.error('❌ MongoDB connection error:', error.message);
    });
});

// ============================================================
// ✅ Graceful Shutdown Handler (Required for Cloud Run)
// Cloud Run sends SIGTERM before shutting down a container.
// This ensures active connections close cleanly before exit.
// ============================================================
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received — shutting down gracefully...');
  server.close(() => {
    console.log('✅ HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });
  });
});
// ============================================================
