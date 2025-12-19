const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const deliveryRouter = require('./routes/delivery');


require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/d98-restaurant', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on('connected', () => {
  console.log('✅ Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

// Import models
require('./models/Order'); // Make sure Order model exists
const DeliveryAgent = require('./models/DeliveryPartner');

const razorpayRoutes = require('./routes/razorpay');

// Root Route
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'D98 Restaurant Backend API is running 🚀',
    endpoints: {
      health: '/api/health',
      menu: '/api/menu',
      orders: '/api/orders',
      users: '/api/users',
      auth: '/api/auth',
      razorpay: '/api/razorpay/create-order',
      delivery: '/api/delivery/profile'
    }
  });
});

// In your main server file
const usersRouter = require('./routes/users');

// Mount routes
app.use('/api/users', usersRouter);

// Routes
app.use('/api/menu', require('./routes/menu'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/users', require('./routes/users'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/razorpay', razorpayRoutes);
app.use('/api/razorpay', require('./routes/razorpay'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/delivery', deliveryRouter);


// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'D98 Restaurant API is running',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Razorpay config endpoint
app.get('/api/config/razorpay-key', (req, res) => {
  res.json({
    success: true,
    key: process.env.RZP_KEY_ID
  });
});

// Delivery health check
app.get('/api/delivery/health', (req, res) => {
  res.json({
    success: true,
    message: 'Delivery API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});