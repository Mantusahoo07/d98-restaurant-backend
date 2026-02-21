const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');

// Add debug middleware to see all requests
router.use((req, res, next) => {
  console.log(`👤 Users route hit: ${req.method} ${req.url}`);
  next();
});

// Apply Firebase auth middleware to all routes
router.use(auth);

// User profile routes
router.post('/', userController.createUserProfile);
router.get('/profile', userController.getUserProfile);
router.put('/profile', userController.updateUserProfile);

// Address routes - IMPORTANT: Specific routes must come BEFORE parameterized routes
router.get('/addresses/check-duplicate', userController.checkDuplicateAddress); // THIS MUST COME FIRST
router.get('/addresses', userController.getAllAddresses);
router.post('/addresses', userController.addAddress);
router.put('/addresses/:addressId', userController.updateAddress);
router.delete('/addresses/:addressId', userController.deleteAddress);

// Admin routes (these should come last as they have parameters)
router.get('/:id', userController.getUserById);
router.get('/', userController.getAllUsers);

module.exports = router;
