const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');

// Apply Firebase auth middleware to all routes
router.use(auth);

// User profile routes
router.post('/', userController.createUserProfile);
router.get('/profile', userController.getUserProfile);
router.put('/profile', userController.updateUserProfile);

// Address routes - note the order matters
router.get('/addresses', userController.getAllAddresses);
router.post('/addresses', userController.addAddress);
router.put('/addresses/:addressId', userController.updateAddress);
router.delete('/addresses/:addressId', userController.deleteAddress);
router.get('/addresses/check-duplicate', userController.checkDuplicateAddress); // This should be BEFORE /addresses/:addressId

// Admin routes
router.get('/:id', userController.getUserById);
router.get('/', userController.getAllUsers);

module.exports = router;
