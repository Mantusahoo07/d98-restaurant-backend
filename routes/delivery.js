const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const auth = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);

// Check if user is delivery agent
router.get('/check-agent', deliveryController.checkAgentStatus);
router.get('/check-agent/:uid', deliveryController.checkAgentStatus);

// Agent profile
router.get('/profile', deliveryController.getAgentProfile);
router.put('/profile', deliveryController.updateAgentProfile);

// Agent orders
router.get('/orders/active', deliveryController.getActiveOrders);

// Assignments
router.get('/assignments', deliveryController.getAssignments);
router.post('/assignments/:id/accept', deliveryController.acceptAssignment);
router.post('/assignments/:id/reject', deliveryController.rejectAssignment);

// Order actions
router.post('/orders/:id/pickup', deliveryController.markAsPickedUp);
router.post('/orders/:id/deliver', deliveryController.markAsDelivered);

// Earnings and transactions
router.get('/earnings', deliveryController.getEarnings);
router.get('/transactions', deliveryController.getTransactionHistory);

// Notifications
router.get('/notifications', deliveryController.getNotifications);

module.exports = router;