const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');

router.use(auth);

router.post('/', orderController.createOrder);
router.get('/', auth, async (req, res) => {
    try {
        const { status, activeOnly } = req.query;
        
        let filter = { userId: req.user.uid };
        
        if (status && status !== 'all') {
            filter.status = status;
        }
        
        // If activeOnly=true, only get non-completed orders
        if (activeOnly === 'true') {
            filter.status = { $in: ['pending', 'confirmed', 'preparing', 'out_for_delivery'] };
        }
        
        const orders = await Order.find(filter)
            .populate('items.menuItem')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            data: orders,
            count: orders.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching orders',
            error: error.message
        });
    }
});
router.get('/:id', orderController.getOrderById);
router.put('/:id/status', orderController.updateOrderStatus);
router.post('/:id/verify-otp', orderController.verifyOtp);
router.post('/razorpay/create-order', orderController.createRazorpayOrder);
router.post('/:id/verify-payment', orderController.verifyAndUpdatePayment);

module.exports = router;