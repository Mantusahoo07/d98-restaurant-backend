// routes/menu.js (PUBLIC VERSION)
const express = require('express');
const router = express.Router();
const Menu = require('../models/Menu');
const Category = require('../models/Category');

// Get all menu items (PUBLIC - no auth required)
router.get('/', async (req, res) => {
  try {
    const { category, available } = req.query;
    
    let filter = {};
    
    // Only show enabled categories' items
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    // Only show available items for public
    filter.available = true;
    
    const items = await Menu.find(filter).sort({ name: 1 });
    res.json(items);
  } catch (err) {
    console.error('Error fetching menu:', err);
    res.status(500).json({ error: 'Error fetching menu items' });
  }
});

// Get menu item by ID (PUBLIC)
router.get('/:id', async (req, res) => {
  try {
    const item = await Menu.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Don't show unavailable items to public
    if (!item.available) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(item);
  } catch (err) {
    console.error('Error fetching menu item:', err);
    res.status(500).json({ error: 'Error fetching menu item' });
  }
});

// Get menu categories (PUBLIC)
router.get('/categories/list', async (req, res) => {
  try {
    // Get enabled categories
    const categories = await Category.find({ enabled: true }).sort({ name: 1 });
    res.json(categories);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Error fetching categories' });
  }
});

module.exports = router;