const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const auth = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);

// Profile routes
router.get('/profile', deliveryController.getProfile);
router.post('/profile', deliveryController.updateProfile);

// Status and location
router.post('/status', deliveryController.toggleOnlineStatus);
router.post('/location', deliveryController.updateLocation);

// Orders
router.get('/orders/available', deliveryController.getAvailableOrders);
router.get('/orders/active', deliveryController.getActiveOrders);
router.get('/orders/history', deliveryController.getDeliveryHistory);
router.post('/orders/:orderId/accept', deliveryController.acceptOrder);

// Earnings and bank
router.get('/earnings', deliveryController.getEarnings);
router.post('/bank-details', deliveryController.updateBankDetails);

// In routes/orders.js, add these routes:

// Delivery agent routes
router.put('/:id/assign-agent', orderController.assignDeliveryAgent);
router.put('/:id/delivery-status', orderController.updateDeliveryStatus);

// Get available orders for delivery agents
router.get('/delivery/available', async (req, res) => {
  try {
    const orders = await Order.getAvailableOrders();
    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching available orders',
      error: error.message
    });
  }
});

// Get orders assigned to current delivery agent
router.get('/delivery/my-orders', async (req, res) => {
  try {
    // Assuming you have agent ID in req.user
    const agentId = req.user.deliveryAgentId || req.user.uid;
    
    // You'll need to implement this method in Order model
    const orders = await Order.find({
      deliveryAgentId: agentId,
      deliveryStatus: { $nin: ['delivered', 'cancelled'] }
    }).sort({ deliveryStatus: 1, createdAt: 1 });
    
    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching agent orders',
      error: error.message
    });
  }
});


module.exports = router;