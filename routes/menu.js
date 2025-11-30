const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menuController');
const auth = require('../middleware/auth');

router.get('/', menuController.getMenu);
router.get('/:id', menuController.getMenuItem);

// Protected routes (Admin only)
router.post('/', auth, menuController.createMenuItem);
router.put('/:id', auth, menuController.updateMenuItem);

module.exports = router;