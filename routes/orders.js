const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
console.log("🧪 orderController exports:", Object.keys(orderController));

const auth = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);

// Debug middleware for orders
router.use((req, res, next) => {
    console.log('📦 Orders route accessed by user:', req.user.uid);
    next();
});

// Get user orders
router.get('/', async (req, res) => {
    try {
        console.log('📦 Fetching orders for user:', req.user.uid);
        
        const { status } = req.query;
        
        let filter = { userId: req.user.uid };
        
        if (status && status !== 'all') {
            filter.status = status;
        }
        
        console.log('🔍 Filter:', filter);
        
        const Order = require('../models/Order');
        const orders = await Order.find(filter)
            .populate('items.menuItem')
            .populate('deliveryAgent')   // ✅ FIX
            .sort({ createdAt: -1 });
        
        console.log(`✅ Found ${orders.length} orders`);
        
        res.json({
            success: true,
            data: orders,
            count: orders.length
        });
        
    } catch (error) {
        console.error('❌ Error fetching orders:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching orders',
            error: error.message
        });
    }
});

// Create new order
router.post('/', orderController.createOrder);

// Get order by ID
router.get('/:id', async (req, res) => {
    try {
        const Order = require('../models/Order');
        const order = await Order.findOne({
            _id: req.params.id,
            userId: req.user.uid
        })
        .populate('items.menuItem')
        .populate('deliveryAgent');   // ✅ FIX
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        res.json({
            success: true,
            data: order
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching order',
            error: error.message
        });
    }
});

// 🔹 Delivery agent routes
router.get("/agent/assigned", orderController.getAssignedOrdersForAgent);

// Update order status (Admin only)
router.put('/:id/status', orderController.updateOrderStatus);

// Verify delivery OTP (for delivery agents)
router.post('/:id/verify-delivery-otp', orderController.verifyOtp);

// Create Razorpay order
router.post('/razorpay/create-order', async (req, res) => {
    try {
        console.log('💳 Creating Razorpay order via orders route');
        
        if (!orderController.createRazorpayOrder) {
            console.error('❌ orderController.createRazorpayOrder is undefined');
            return res.status(500).json({
                success: false,
                message: 'Payment function not available',
                error: 'Function undefined'
            });
        }
        
        return orderController.createRazorpayOrder(req, res);
        
    } catch (error) {
        console.error('❌ Error in Razorpay route:', error);
        res.status(500).json({
            success: false,
            message: 'Payment gateway error',
            error: error.message
        });
    }
});

// Verify payment
router.post('/:id/verify-payment', orderController.verifyAndUpdatePayment);

router.post('/calculate-distance', orderController.calculateRoadDistance);

module.exports = router;
