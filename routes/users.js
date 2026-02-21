const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');

// Apply Firebase auth middleware to all routes
router.use(auth);

// User profile routes
router.post('/', userController.createUserProfile);          // POST /api/users - Create profile
router.get('/profile', userController.getUserProfile);       // GET /api/users/profile - Get profile
router.put('/profile', userController.updateUserProfile);    // PUT /api/users/profile - Update profile

// Address routes
router.get('/addresses', userController.getAllAddresses);           // GET /api/users/addresses - Get all addresses
router.post('/addresses', userController.addAddress);               // POST /api/users/addresses - Add address
router.put('/addresses/:addressId', userController.updateAddress);  // PUT /api/users/addresses/:id - Update address
router.delete('/addresses/:addressId', userController.deleteAddress); // DELETE /api/users/addresses/:id - Delete address

// Admin routes (optional)
router.get('/:id', userController.getUserById);        // GET /api/users/:id - Get user by ID (admin)
router.get('/', userController.getAllUsers);           // GET /api/users - Get all users (admin)

module.exports = router;