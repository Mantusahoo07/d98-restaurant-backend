const Menu = require('../models/Menu');

// Get all menu items
exports.getMenu = async (req, res) => {
  try {
    const { category, type, search, available } = req.query;
    
    let filter = {};
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (type && type !== 'all') {
      filter.type = type;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (available !== undefined) {
      filter.available = available === 'true';
    }
    
    const menu = await Menu.find(filter).sort({ category: 1, name: 1 });
    
    res.json({
      success: true,
      data: menu,
      count: menu.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching menu',
      error: error.message
    });
  }
};

// Get menu item by ID
exports.getMenuItem = async (req, res) => {
  try {
    const menuItem = await Menu.findById(req.params.id);
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }
    
    res.json({
      success: true,
      data: menuItem
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching menu item',
      error: error.message
    });
  }
};

// Create menu item (Admin only)
exports.createMenuItem = async (req, res) => {
  try {
    const menuItem = new Menu(req.body);
    await menuItem.save();
    
    res.status(201).json({
      success: true,
      data: menuItem
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating menu item',
      error: error.message
    });
  }
};

// Update menu item (Admin only)
exports.updateMenuItem = async (req, res) => {
  try {
    const menuItem = await Menu.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }
    
    res.json({
      success: true,
      data: menuItem
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating menu item',
      error: error.message
    });
  }
};