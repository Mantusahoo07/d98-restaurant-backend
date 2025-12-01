const express = require('express');
const router = express.Router();
const Category = require('../models/Category');

// Get all categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a category
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const exists = await Category.findOne({ name: name.trim() });
    if (exists) return res.status(400).json({ error: 'Category already exists' });

    const category = new Category({ name: name.trim() });
    await category.save();
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update category (rename or enable/disable)
router.put('/:id', async (req, res) => {
  try {
    const { name, enabled } = req.body;
    const update = {};
    if (typeof name !== 'undefined') update.name = name;
    if (typeof enabled !== 'undefined') update.enabled = enabled;

    const category = await Category.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle enabled (shortcut)
router.patch('/:id/toggle', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    category.enabled = !category.enabled;
    await category.save();
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete category
router.delete('/:id', async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
