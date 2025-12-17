// routes/admin.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Order = require('../models/Order');
const Category = require('../models/Category');
const Menu = require('../models/Menu');

// List of admin emails (update with your actual admin emails)
const ADMIN_EMAILS = [
  'admin@d98.com',
  'manager@d98.com'
  // Add more admin emails here
];

// Admin middleware - checks if user is admin
const isAdmin = async (req, res, next) => {
  try {
    const userEmail = req.user.email;
    
    if (!ADMIN_EMAILS.includes(userEmail.toLowerCase())) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Admin access required'
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking admin permissions',
      error: error.message
    });
  }
};

// Apply both auth and admin check to all routes
router.use(auth);
router.use(isAdmin);

// ==================== USERS ====================
// Get all users (admin)
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('-addresses -firebaseUid')
      .sort({ createdAt: -1 });
    
    // Count orders for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const orderCount = await Order.countDocuments({ userId: user.firebaseUid });
        return {
          ...user.toObject(),
          orderCount
        };
      })
    );
    
    res.json(usersWithStats);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
});

// Get user by ID (admin)
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
});

// ==================== ORDERS ====================
// Get all orders (admin)
router.get('/orders', async (req, res) => {
  try {
    const { status, startDate, endDate, page = 1, limit = 50 } = req.query;
    
    let filter = {};
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    const orders = await Order.find(filter)
      .populate('items.menuItem')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Order.countDocuments(filter);
    
    res.json({
      data: orders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
});

// Get order by ID (admin)
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.menuItem');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching order',
      error: error.message
    });
  }
});

// Update order status (admin)
router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    order.status = status;
    
    // If delivered, set deliveredAt
    if (status === 'delivered') {
      order.deliveredAt = new Date();
    }
    
    await order.save();
    
    res.json({
      success: true,
      data: order,
      message: 'Order status updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating order status',
      error: error.message
    });
  }
});

// Get order statistics (admin)
router.get('/orders/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    
    const stats = {
      totalOrders: await Order.countDocuments(),
      todayOrders: await Order.countDocuments({ createdAt: { $gte: today } }),
      yesterdayOrders: await Order.countDocuments({ 
        createdAt: { $gte: yesterday, $lt: today } 
      }),
      thisMonthOrders: await Order.countDocuments({ createdAt: { $gte: thisMonth } }),
      totalRevenue: await Order.aggregate([
        { $match: { status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      byStatus: await Order.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      byPaymentMethod: await Order.aggregate([
        { $group: { _id: '$paymentMethod', count: { $sum: 1 } } }
      ])
    };
    
    // Convert aggregate results
    stats.totalRevenue = stats.totalRevenue[0]?.total || 0;
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching order stats',
      error: error.message
    });
  }
});

// ==================== CATEGORIES ====================
// Get all categories (admin - same as public but with auth)
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: error.message
    });
  }
});

// Create category (admin)
router.post('/categories', async (req, res) => {
  try {
    const { name, enabled = true } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }
    
    // Check if category already exists
    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category already exists'
      });
    }
    
    const category = await Category.create({ name, enabled });
    
    res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating category',
      error: error.message
    });
  }
});

// Update category (admin)
router.put('/categories/:id', async (req, res) => {
  try {
    const { name, enabled } = req.body;
    
    const category = await Category.findById(req.params.id);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    if (name) {
      // Check if new name already exists (excluding current category)
      const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Category name already exists'
        });
      }
      
      category.name = name;
    }
    
    if (typeof enabled !== 'undefined') {
      category.enabled = enabled;
    }
    
    await category.save();
    
    res.json({
      success: true,
      data: category,
      message: 'Category updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating category',
      error: error.message
    });
  }
});

// Delete category (admin)
router.delete('/categories/:id', async (req, res) => {
  try {
    // Check if category has menu items
    const menuItemsCount = await Menu.countDocuments({ categoryId: req.params.id });
    
    if (menuItemsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. It has ${menuItemsCount} menu item(s).`
      });
    }
    
    await Category.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting category',
      error: error.message
    });
  }
});

// ==================== MENU ====================
// Get all menu items (admin)
router.get('/menu', async (req, res) => {
  try {
    const menuItems = await Menu.find()
      .sort({ category: 1, name: 1 });
    
    // Get categories for grouping
    const categories = await Category.find({ enabled: true });
    
    const groupedMenu = {
      data: menuItems,
      categories,
      stats: {
        total: menuItems.length,
        available: menuItems.filter(item => item.available).length,
        unavailable: menuItems.filter(item => !item.available).length
      }
    };
    
    res.json(groupedMenu);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching menu',
      error: error.message
    });
  }
});

// Create menu item (admin)
router.post('/menu', async (req, res) => {
  try {
    const menuItem = await Menu.create(req.body);
    
    res.status(201).json({
      success: true,
      data: menuItem,
      message: 'Menu item created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating menu item',
      error: error.message
    });
  }
});

// Update menu item (admin)
router.put('/menu/:id', async (req, res) => {
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
      data: menuItem,
      message: 'Menu item updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating menu item',
      error: error.message
    });
  }
});

// Delete menu item (admin)
router.delete('/menu/:id', async (req, res) => {
  try {
    await Menu.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Menu item deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting menu item',
      error: error.message
    });
  }
});

// Toggle menu item availability (admin)
router.patch('/menu/:id/toggle-availability', async (req, res) => {
  try {
    const menuItem = await Menu.findById(req.params.id);
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }
    
    menuItem.available = !menuItem.available;
    await menuItem.save();
    
    res.json({
      success: true,
      data: menuItem,
      message: `Menu item ${menuItem.available ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error toggling menu item availability',
      error: error.message
    });
  }
});

// ==================== DASHBOARD STATS ====================
// Get dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const [
      totalUsers,
      totalOrders,
      totalMenuItems,
      totalCategories,
      todayOrders,
      todayRevenue,
      recentOrders,
      orderStatusCounts,
      topMenuItems
    ] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      Menu.countDocuments(),
      Category.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: today } }),
      Order.aggregate([
        { $match: { createdAt: { $gte: today }, status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Order.find()
        .populate('items.menuItem')
        .sort({ createdAt: -1 })
        .limit(10),
      Order.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $unwind: '$items' },
        { $group: { 
          _id: '$items.menuItem', 
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }},
        { $sort: { totalQuantity: -1 } },
        { $limit: 5 },
        { $lookup: {
          from: 'menus',
          localField: '_id',
          foreignField: '_id',
          as: 'menuItem'
        }},
        { $unwind: '$menuItem' }
      ])
    ]);
    
    const stats = {
      overview: {
        totalUsers,
        totalOrders,
        totalMenuItems,
        totalCategories,
        todayOrders,
        todayRevenue: todayRevenue[0]?.total || 0
      },
      orderStatus: orderStatusCounts.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      recentOrders: recentOrders.map(order => ({
        _id: order._id,
        orderId: order.orderId,
        customerName: order.customerName,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
        itemCount: order.items.length
      })),
      topMenuItems: topMenuItems.map(item => ({
        name: item.menuItem.name,
        category: item.menuItem.category,
        totalQuantity: item.totalQuantity,
        totalRevenue: item.totalRevenue
      }))
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats',
      error: error.message
    });
  }
});

module.exports = router;
