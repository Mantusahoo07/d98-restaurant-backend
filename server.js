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

// ==================== TEMPORARY RAZORPAY ENDPOINT ====================
// Add this section right here
app.post('/api/razorpay/create-order', async (req, res) => {
    try {
        const { amount, receipt, currency = 'INR' } = req.body;
        console.log('📞 Creating Razorpay order:', { amount, receipt, currency });
        
        // Generate a mock Razorpay order ID for testing
        // In production, you would call the actual Razorpay API here
        const mockOrderId = `order_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        
        res.json({
            success: true,
            orderId: mockOrderId,
            amount: amount,
            currency: currency,
            receipt: receipt || `receipt_${Date.now()}`,
            note: 'This is a mock order ID for testing. Replace with real Razorpay integration.'
        });
    } catch (error) {
        console.error('❌ Error creating mock Razorpay order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order',
            error: error.message
        });
    }
});
// ==================== END TEMPORARY RAZORPAY ENDPOINT ====================

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'D98 Restaurant API is running' 
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});