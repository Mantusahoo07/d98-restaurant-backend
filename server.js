const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

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
      delivery: '/api/delivery', // ADDED THIS
      razorpay: '/api/razorpay/create-order',
      admin: '/api/admin'
    }
  });
});

// Import ALL route files
const usersRouter = require('./routes/users');
const menuRouter = require('./routes/menu');
const ordersRouter = require('./routes/orders');
const authRouter = require('./routes/auth');
const categoriesRouter = require('./routes/categories');
const razorpayRouter = require('./routes/razorpay');
const adminRouter = require('./routes/admin');

// IMPORTANT: Add delivery routes
const deliveryRouter = require('./routes/delivery');

// Mount ALL routes
app.use('/api/users', usersRouter);
app.use('/api/menu', menuRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/auth', authRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/razorpay', razorpayRouter);
app.use('/api/admin', adminRouter);


// CRITICAL: Mount delivery routes - ADD THIS LINE
app.use('/api/delivery', deliveryRouter);

console.log('=== ROUTE DEBUG ===');
console.log('Admin router loaded:', !!adminRouter);
console.log('DeliverySettings model loaded:', !!require('./models/DeliverySettings'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'D98 Restaurant API is running',
    timestamp: new Date().toISOString()
  });
});

// Razorpay key endpoint
app.get('/api/config/razorpay-key', (req, res) => {
  res.json({
    success: true,
    key: process.env.RZP_KEY_ID
  });
});

app.use('/api/admin', (req, res, next) => {
    console.log(`📞 Admin API Request: ${req.method} ${req.path} from ${req.ip}`);
    console.log('  User:', req.user ? req.user.email : 'No user');
    next();
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  console.log(`❌ Route not found: ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📞 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🚚 Delivery API: http://localhost:${PORT}/api/delivery/profile`);
});
