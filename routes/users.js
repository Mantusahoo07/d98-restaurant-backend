const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');

// All routes protected by Firebase Token middleware
router.use(auth);

// ✔ CREATE USER (Required by frontend)
router.post('/', userController.createUserProfile);

// ✔ GET USER PROFILE
router.get('/profile', userController.getUserProfile);

// ✔ UPDATE USER PROFILE
router.put('/profile', userController.updateUserProfile);

// Address routes (fixed names to match frontend)
router.post('/address', userController.addAddress);
router.put('/address/:addressId', userController.updateAddress);
router.delete('/address/:addressId', userController.deleteAddress);

module.exports = router;
