const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const auth = require('./middleware/auth');

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

// ==================== PUBLIC ENDPOINTS (NO AUTH) ====================

// Health check - Public
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'D98 Restaurant API is running',
    timestamp: new Date().toISOString()
  });
});

// Razorpay key - Public
app.get('/api/config/razorpay-key', (req, res) => {
  res.json({
    success: true,
    key: process.env.RZP_KEY_ID
  });
});

// PUBLIC DELIVERY SETTINGS - NO AUTH REQUIRED
app.get('/api/delivery-settings/public', async (req, res) => {
    try {
        console.log('📦 Public delivery settings requested');
        const DeliverySettings = require('./models/DeliverySettings');
        let settings = await DeliverySettings.findOne();
        
        if (!settings) {
            console.log('🆕 No delivery settings found, creating defaults...');
            settings = await DeliverySettings.create({});
        }
        
        // Return only the settings needed for customers
        res.json({
            success: true,
            data: {
                maxDeliveryRadius: settings.maxDeliveryRadius,
                baseDeliveryCharge: settings.baseDeliveryCharge,
                additionalChargePerKm: settings.additionalChargePerKm,
                freeDeliveryWithin5kmThreshold: settings.freeDeliveryWithin5kmThreshold,
                freeDeliveryUpto10kmThreshold: settings.freeDeliveryUpto10kmThreshold,
                platformFeePercent: settings.platformFeePercent,
                gstPercent: settings.gstPercent,
                restaurantLocation: settings.restaurantLocation
            }
        });
    } catch (error) {
        console.error('❌ Error fetching public delivery settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching delivery settings',
            error: error.message
        });
    }
});

// Add this endpoint to handle user linking
app.post('/api/users/link-account', auth, async (req, res) => {
  try {
    const User = require('./models/User');
    
    console.log('🔗 Linking user account for:', req.user.email);
    
    // Find user by email
    let user = await User.findOne({ email: req.user.email });
    
    if (user) {
      // Update with new firebaseUid
      user.firebaseUid = req.user.uid;
      await user.save();
      
      console.log('✅ User linked successfully');
      return res.json({
        success: true,
        data: user,
        message: 'Account linked successfully'
      });
    }
    
    // If no user found, return 404
    res.status(404).json({
      success: false,
      message: 'No user found with this email'
    });
    
  } catch (error) {
    console.error('❌ Error linking account:', error);
    res.status(500).json({
      success: false,
      message: 'Error linking account',
      error: error.message
    });
  }
});

// ==================== REAL-TIME UPDATES (SSE) ====================
// Store connected clients for order updates
let orderUpdateClients = [];

// SSE endpoint for order updates
app.get('/api/orders/updates', auth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to order updates' })}\n\n`);
    
    // Add client to connected list
    const clientId = Date.now() + '-' + req.user.uid;
    const newClient = {
        id: clientId,
        userId: req.user.uid,
        res
    };
    orderUpdateClients.push(newClient);
    
    // Remove client on connection close
    req.on('close', () => {
        orderUpdateClients = orderUpdateClients.filter(client => client.id !== clientId);
    });
});

// Function to broadcast order updates to specific user
const broadcastOrderUpdate = (userId, orderData) => {
    orderUpdateClients.forEach(client => {
        if (client.userId === userId) {
            try {
                client.res.write(`data: ${JSON.stringify(orderData)}\n\n`);
            } catch (error) {
                console.error('Error broadcasting to client:', error);
            }
        }
    });
};

// ==================== RESTAURANT STATUS SSE ====================
const restaurantSettingsController = require('./controllers/restaurantSettingsController');
app.get('/api/restaurant-status/updates', restaurantSettingsController.restaurantStatusSSE);

// ==================== ROOT ROUTE ====================
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
      delivery: '/api/delivery',
      'delivery-settings-public': '/api/delivery-settings/public',
      razorpay: '/api/razorpay/create-order',
      admin: '/api/admin',
      'order-updates': '/api/orders/updates (SSE - requires auth)',
      'restaurant-updates': '/api/restaurant-status/updates (SSE)'
    }
  });
});

// ==================== IMPORT ROUTE FILES ====================
const usersRouter = require('./routes/users');
const menuRouter = require('./routes/menu');
const ordersRouter = require('./routes/orders');
const authRouter = require('./routes/auth');
const categoriesRouter = require('./routes/categories');
const razorpayRouter = require('./routes/razorpay');
const adminRouter = require('./routes/admin');
const deliveryRouter = require('./routes/delivery');

// ==================== MOUNT ROUTES ====================
app.use('/api/users', usersRouter);
app.use('/api/menu', menuRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/auth', authRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/razorpay', razorpayRouter);
app.use('/api/admin', adminRouter);
app.use('/api/delivery', deliveryRouter);
app.get('/api/restaurant-status', restaurantSettingsController.getRestaurantStatus);

// ==================== 404 HANDLER (MUST BE LAST) ====================
app.use('*', (req, res) => {
  console.log(`❌ Route not found: ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==================== GRACEFUL SHUTDOWN ====================
let server;

const gracefulShutdown = async () => {
  console.log('🛑 Received shutdown signal, closing gracefully...');
  
  // Close HTTP server
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
    });
  }
  
  // Close MongoDB connection
  await mongoose.connection.close(false);
  console.log('MongoDB connection closed');
  
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;
server = app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📞 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📦 Delivery settings (public): http://localhost:${PORT}/api/delivery-settings/public`);
  console.log(`🚚 Delivery API: http://localhost:${PORT}/api/delivery/profile`);
  console.log(`🔄 Order updates SSE: http://localhost:${PORT}/api/orders/updates`);
  console.log(`🏪 Restaurant status SSE: http://localhost:${PORT}/api/restaurant-status/updates`);
});

// Export broadcast function for use in other controllers
module.exports = { app, broadcastOrderUpdate };
