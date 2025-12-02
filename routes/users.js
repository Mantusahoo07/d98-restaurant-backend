const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');

// Apply Firebase auth middleware
router.use(auth);

// Create user (frontend requires this)
router.post('/', userController.createUserProfile);

// Get profile
router.get('/profile', userController.getUserProfile);

// Update profile
router.put('/profile', userController.updateUserProfile);

router.get('/addresses', userController.getAllAddresses);

// Address routes (fixed names to match frontend)
router.post('/addresses', userController.addAddress);
router.put('/addresses/:addressId', userController.updateAddress);
router.delete('/addresses/:addressId', userController.deleteAddress);

module.exports = router;
