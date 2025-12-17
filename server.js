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
  console.log('Connected to MongoDB');
});

const razorpayRoutes = require('./routes/razorpay');

// Root Route (Fix for "Cannot GET /")
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
      razorpay: '/api/razorpay/create-order'
    }
  });
});

// Routes
app.use('/api/menu', require('./routes/menu'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/users', require('./routes/users'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/razorpay', razorpayRoutes);
app.use('/api/razorpay', require('./routes/razorpay'));


// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'D98 Restaurant API is running' 
  });
});
app.get('/api/config/razorpay-key', (req, res) => {
  res.json({
    success: true,
    key: process.env.RZP_KEY_ID
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
// In your server.js/index.js
const adminUsersRouter = require('./routes/admin-users'); // You'll create this
const adminOrdersRouter = require('./routes/admin-orders'); // You'll create this

// Admin routes
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin/orders', adminOrdersRouter);
