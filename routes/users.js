const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');

// Add this debug line
console.log('✅ userController methods:', Object.keys(userController));

// Apply auth middleware
router.use(auth);

// Address routes - SPECIFIC routes FIRST
router.get('/addresses/check-duplicate', userController.checkDuplicateAddress); // Line 22?
router.get('/addresses', userController.getAllAddresses);
router.post('/addresses', userController.addAddress);
router.put('/addresses/:addressId', userController.updateAddress);
router.delete('/addresses/:addressId', userController.deleteAddress);

// Profile routes
router.post('/', userController.createUserProfile);
router.get('/profile', userController.getUserProfile);
router.put('/profile', userController.updateUserProfile);

// Admin routes (parameterized routes LAST)
router.get('/:id', userController.getUserById);
router.get('/', userController.getAllUsers);

module.exports = router;
