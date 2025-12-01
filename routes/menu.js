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
