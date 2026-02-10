const express = require('express');
const router = express.Router();
const Menu = require('../models/Menu');

// Get all menu items
router.get('/', async (req, res) => {
  try {
    const items = await Menu.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add menu item
router.post('/', async (req, res) => {
  try {
    const item = new Menu(req.body);
    await item.save();
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update menu item
router.put('/:id', async (req, res) => {
  try {
    const item = await Menu.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// In routes/menu.js, add this route
router.get('/delivery-settings', async (req, res) => {
    try {
        const DeliverySettings = require('../models/DeliverySettings');
        
        let settings = await DeliverySettings.findOne();
        
        if (!settings) {
            // Return default settings if none exist
            settings = {
                maxDeliveryRadius: 10,
                baseDeliveryCharge: 20,
                additionalChargePerKm: 10,
                freeDeliveryWithin5kmThreshold: 999,
                freeDeliveryUpto10kmThreshold: 1499,
                platformFeePercent: 3,
                gstPercent: 5,
                restaurantLocation: {
                    lat: 20.6952266,
                    lng: 83.488972
                }
            };
        }
        
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Error fetching delivery settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching delivery settings'
        });
    }
});

// Toggle availability (PATCH)
router.patch('/:id/toggle-availability', async (req, res) => {
  try {
    const item = await Menu.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    item.available = !item.available;
    await item.save();
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete menu item
router.delete('/:id', async (req, res) => {
  try {
    await Menu.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
