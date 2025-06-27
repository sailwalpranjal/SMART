// backend/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const Redis = require('ioredis');
const multer = require('multer');
const path = require('path');

const productRoutes = require('./src/routes/productRoutes');
const arRoutes = require('./src/routes/arRoutes');
const measurementRoutes = require('./src/routes/measurementRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// File upload configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Routes
app.use('/api/products', productRoutes);
app.use('/api/ar', arRoutes);
app.use('/api/measurements', measurementRoutes);

// Socket.io for real-time features
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join-ar-session', (sessionId) => {
    socket.join(sessionId);
    socket.emit('ar-session-joined', { sessionId });
  });

  socket.on('tracking-update', async (data) => {
    const { sessionId, trackingData } = data;
    
    // Store tracking data in Redis for processing
    await redis.setex(
      `tracking:${sessionId}`,
      300, // 5 minutes TTL
      JSON.stringify(trackingData)
    );

    // Broadcast to other participants
    socket.to(sessionId).emit('tracking-data', trackingData);
  });

  socket.on('size-calculation', async (data) => {
    const { measurements, productId } = data;
    
    // Process size recommendation
    const sizeRecommendation = await calculateSize(measurements, productId);
    
    socket.emit('size-recommendation', sizeRecommendation);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Helper function for size calculation
async function calculateSize(measurements, productId) {
  // This would integrate with ML service
  // For now, return mock data
  return {
    recommendedSize: 'M',
    confidence: 0.92,
    fitScore: 8.5,
    alternativeSizes: ['L'],
    details: {
      chest: 'Perfect fit',
      waist: 'Slightly loose',
      length: 'Good'
    }
  };
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, io, redis };