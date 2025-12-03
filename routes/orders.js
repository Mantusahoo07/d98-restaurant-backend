const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');

router.use(auth);

router.post('/', orderController.createOrder);
router.get('/', orderController.getUserOrders);
router.get('/:id', orderController.getOrderById);
router.put('/:id/status', orderController.updateOrderStatus);
router.post('/:id/verify-otp', orderController.verifyOtp);
router.post('/razorpay/create-order', orderController.createRazorpayOrder);

module.exports = router;