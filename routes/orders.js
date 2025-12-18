const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');

router.use(auth);

router.post('/', orderController.createOrder);
router.get('/', auth, async (req, res) => {
    try {
        const { status, activeOnly } = req.query;
        
        console.log('📦 Fetching orders with query:', { status, activeOnly });
        
        let filter = { userId: req.user.uid };
        
        // Handle status filter
        if (status && status !== 'all') {
            filter.status = status;
        }
        
        // Handle activeOnly filter
        if (activeOnly === 'true') {
            filter.status = { 
                $in: ['pending', 'confirmed', 'preparing', 'out_for_delivery'] 
            };
        }
        
        console.log('🔍 MongoDB filter:', JSON.stringify(filter));
        
        const orders = await Order.find(filter)
            .populate('items.menuItem')
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
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
router.get('/:id', orderController.getOrderById);
router.put('/:id/status', orderController.updateOrderStatus);
router.post('/:id/verify-otp', orderController.verifyOtp);
router.post('/razorpay/create-order', orderController.createRazorpayOrder);
router.post('/:id/verify-payment', orderController.verifyAndUpdatePayment);

module.exports = router;