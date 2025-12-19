const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController'); // ✅ Correct import
const orderController = require('../controllers/orderController'); // ✅ Also import orderController
const auth = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);

// Profile routes
router.get('/profile', deliveryController.getProfile);
router.post('/profile', deliveryController.updateProfile);

// Status and location
router.post('/status', deliveryController.toggleOnlineStatus);
router.post('/location', deliveryController.updateLocation);

// Orders - Use deliveryController, not orderController
router.get('/orders/available', deliveryController.getAvailableOrders);
router.get('/orders/active', deliveryController.getActiveOrders);
router.get('/orders/history', deliveryController.getDeliveryHistory);
router.post('/orders/:orderId/accept', deliveryController.acceptOrder);

// If you need to assign agent from admin side, keep this:
router.put('/orders/:id/assign-agent', deliveryController.assignDeliveryAgent);

// Earnings and bank
router.get('/earnings', deliveryController.getEarnings);
router.post('/bank-details', deliveryController.updateBankDetails);

module.exports = router;