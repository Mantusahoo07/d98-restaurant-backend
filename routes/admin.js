// routes/admin.js
const express = require('express');
const router = express.Router();

router.get('/delivery-settings', async (req, res) => {
  const DeliverySettings = require('../models/DeliverySettings');
  const settings = await DeliverySettings.findOne() || {};
  res.json({
    success: true,
    data: settings
  });
});


    } catch (err) {
        console.error('Delivery settings GET error:', err);
        res.status(500).json({ success:false });
    }
});

// UPDATE delivery settings
router.put('/delivery-settings', async (req, res) => {
    try {
        const data = req.body;

        const settings = await DeliverySettings.findOneAndUpdate(
            {},
            data,
            { upsert:true, new:true }
        );

        res.json({
            success:true,
            data:settings
        });

    } catch (err) {
        console.error('Delivery settings PUT error:', err);
        res.status(500).json({ success:false });
    }
});

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Order = require('../models/Order');
const Category = require('../models/Category');
const Menu = require('../models/Menu');
const DeliveryAgent = require('../models/DeliveryAgent');
const deliverySettingsController = require('../controllers/deliverySettingsController');

// Parse admin emails from environment variable
const ADMIN_EMAILS = process.env.ADMIN_EMAILS 
  ? process.env.ADMIN_EMAILS.split(',').map(email => email.trim().toLowerCase())
  : ['admin@d98.com', 'manager@d98.com'];

// Admin middleware - checks if user is admin
const isAdmin = async (req, res, next) => {
  try {
    const userEmail = req.user.email?.toLowerCase();
    
    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: 'User email not found'
      });
    }
    
    if (!ADMIN_EMAILS.includes(userEmail)) {
      console.warn(`⚠️ Unauthorized admin access attempt: ${userEmail}`);
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Admin access required'
      });
    }
    
    console.log(`✅ Admin access granted to: ${userEmail}`);
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

// Add this at the TOP of your admin.js routes (right after router.use(isAdmin);)
router.get('/test', (req, res) => {
  console.log('✅ Admin test route hit by:', req.user.email);
  res.json({
    success: true,
    message: 'Admin API is working',
    user: req.user.email,
    timestamp: new Date().toISOString()
  });
});

// ==================== DASHBOARD STATISTICS ====================
// Get dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    
    const [
      totalUsers,
      totalOrders,
      totalMenuItems,
      totalCategories,
      todayOrders,
      todayRevenue,
      recentOrders
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
        .sort({ createdAt: -1 })
        .limit(5)
        .select('orderId customerName total status createdAt')
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
      recentOrders: recentOrders
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats',
      error: error.message
    });
  }
});

// ==================== USERS MANAGEMENT ====================
// Get all users
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
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          createdAt: user.createdAt,
          orderCount: orderCount
        };
      })
    );
    
    res.json(usersWithStats);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
});

// Get user by ID
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-addresses -firebaseUid');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
});

// ==================== ORDERS MANAGEMENT ====================
// Get all orders
router.get('/orders', async (req, res) => {
  try {
    const { status } = req.query;
    
    let filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    const orders = await Order.find(filter)
      .populate('items.menuItem')
      .sort({ createdAt: -1 });
    
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
});

// Get order by ID
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
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order',
      error: error.message
    });
  }
});

// Update order status
router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { status, notes, deliveryAgentId } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    const validStatuses = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
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
    
    // If assigned to delivery agent
    if (deliveryAgentId) {
      const agent = await DeliveryAgent.findById(deliveryAgentId);
      if (agent) {
        order.deliveryAgent = deliveryAgentId;
        order.assignedAt = new Date();
        
        // Update agent status if going out for delivery
        if (status === 'out_for_delivery') {
          agent.status = 'busy';
          await agent.save();
        }
      }
    }
    
    // If delivered, set deliveredAt and increment agent's orders
    if (status === 'delivered') {
      order.deliveredAt = new Date();
      
      // Increment agent's orders delivered count
      if (order.deliveryAgent) {
        await DeliveryAgent.findByIdAndUpdate(order.deliveryAgent, {
          $inc: { ordersDelivered: 1 },
          status: 'available' // Set agent back to available
        });
      }
    }
    
    // If cancelled, free up the agent if assigned
    if (status === 'cancelled' && order.deliveryAgent) {
      await DeliveryAgent.findByIdAndUpdate(order.deliveryAgent, {
        status: 'available'
      });
    }
    
    if (notes) {
      order.notes = notes;
    }
    
    await order.save();
    
    const updatedOrder = await Order.findById(order._id)
      .populate('deliveryAgent', 'name phone')
      .populate('items.menuItem');
    
    res.json({
      success: true,
      data: updatedOrder,
      message: 'Order status updated successfully'
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order status',
      error: error.message
    });
  }
});

// ==================== CATEGORIES MANAGEMENT ====================
// Get all categories (admin version - includes count of menu items)
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    
    // Count menu items for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const itemCount = await Menu.countDocuments({ category: category.name });
        return {
          _id: category._id,
          name: category.name,
          enabled: category.enabled,
          itemCount: itemCount,
          createdAt: category.createdAt
        };
      })
    );
    
    res.json(categoriesWithCounts);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: error.message
    });
  }
});

// Create category
router.post('/categories', async (req, res) => {
  try {
    const { name, enabled = true } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }
    
    // Check if category already exists (case insensitive)
    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category already exists'
      });
    }
    
    const category = await Category.create({ 
      name: name.trim(),
      enabled: enabled 
    });
    
    res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully'
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating category',
      error: error.message
    });
  }
});

// Update category
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
    
    if (name && name.trim() !== '') {
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
      
      category.name = name.trim();
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
    console.error('Error updating category:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating category',
      error: error.message
    });
  }
});

// Delete category
router.delete('/categories/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    // Check if category has menu items
    const menuItemsCount = await Menu.countDocuments({ category: category.name });
    
    if (menuItemsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. It has ${menuItemsCount} menu item(s). Remove or reassign items first.`
      });
    }
    
    await Category.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting category',
      error: error.message
    });
  }
});

// ==================== DELIVERY AGENTS MANAGEMENT ====================

// Get all delivery agents
router.get('/delivery-agents', async (req, res) => {
  try {
    console.log('📦 Fetching delivery agents...');
    
    const agents = await DeliveryAgent.find({ isActive: true })
      .select('-password')
      .sort({ createdAt: -1 });
    
    console.log(`✅ Found ${agents.length} delivery agents`);
    
    res.json({
      success: true,
      data: agents,
      count: agents.length
    });
  } catch (error) {
    console.error('❌ Error fetching delivery agents:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching delivery agents',
      error: error.message
    });
  }
});

// Create delivery agent
router.post('/delivery-agents', async (req, res) => {
  try {
    console.log('👤 Creating delivery agent:', req.body.email);
    
    const { name, email, phone, vehicle, status, password } = req.body;
    
    // Validate required fields
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone and password are required'
      });
    }
    
    // Check if agent already exists
    const existingAgent = await DeliveryAgent.findOne({ email });
    if (existingAgent) {
      return res.status(400).json({
        success: false,
        message: 'Delivery agent with this email already exists'
      });
    }
    
    // Create agent
    const agentData = {
      name,
      email,
      phone,
      password,
      vehicle: vehicle || '',
      status: status || 'available',
      isActive: true
    };
    
    const agent = await DeliveryAgent.create(agentData);
    
    console.log('✅ Delivery agent created:', agent.email);
    
    res.status(201).json({
      success: true,
      data: {
        _id: agent._id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        vehicle: agent.vehicle,
        status: agent.status,
        ordersDelivered: agent.ordersDelivered,
        createdAt: agent.createdAt
      },
      message: 'Delivery agent created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating delivery agent:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Delivery agent with this email already exists',
        error: 'DUPLICATE_EMAIL'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating delivery agent',
      error: error.message
    });
  }
});

// Update delivery agent
router.put('/delivery-agents/:id', async (req, res) => {
  try {
    console.log('✏️ Updating delivery agent:', req.params.id);
    
    const { name, phone, vehicle, status, password } = req.body;
    
    const agent = await DeliveryAgent.findById(req.params.id);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Delivery agent not found'
      });
    }
    
    // Update fields if provided
    if (name) agent.name = name;
    if (phone) agent.phone = phone;
    if (vehicle !== undefined) agent.vehicle = vehicle;
    if (status) agent.status = status;
    if (password) agent.password = password; // Will be hashed by pre-save hook
    
    await agent.save();
    
    console.log('✅ Delivery agent updated:', agent.email);
    
    res.json({
      success: true,
      data: {
        _id: agent._id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        vehicle: agent.vehicle,
        status: agent.status,
        ordersDelivered: agent.ordersDelivered,
        updatedAt: agent.updatedAt
      },
      message: 'Delivery agent updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating delivery agent:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating delivery agent',
      error: error.message
    });
  }
});

// Delete delivery agent
router.delete('/delivery-agents/:id', async (req, res) => {
  try {
    console.log('🗑️ Deleting delivery agent:', req.params.id);
    
    const agent = await DeliveryAgent.findById(req.params.id);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Delivery agent not found'
      });
    }
    
    // Soft delete by setting isActive to false
    agent.isActive = false;
    await agent.save();
    
    console.log('✅ Delivery agent soft deleted:', agent.email);
    
    res.json({
      success: true,
      message: 'Delivery agent deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting delivery agent:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting delivery agent',
      error: error.message
    });
  }
});

// Toggle agent status
router.patch('/delivery-agents/:id/toggle-status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status || !['available', 'busy', 'offline'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required: available, busy, or offline'
      });
    }
    
    const agent = await DeliveryAgent.findById(req.params.id);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Delivery agent not found'
      });
    }
    
    agent.status = status;
    await agent.save();
    
    res.json({
      success: true,
      data: {
        _id: agent._id,
        name: agent.name,
        status: agent.status
      },
      message: 'Agent status updated successfully'
    });
  } catch (error) {
    console.error('Error toggling agent status:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling agent status',
      error: error.message
    });
  }
});

// Get available agents
router.get('/delivery-agents/available', async (req, res) => {
  try {
    const agents = await DeliveryAgent.find({
      status: 'available',
      isActive: true
    }).select('name phone email vehicle status');
    
    res.json({
      success: true,
      data: agents,
      count: agents.length
    });
  } catch (error) {
    console.error('Error fetching available agents:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available agents',
      error: error.message
    });
  }
});

// ================= DELIVERY SETTINGS =================



// ==================== MENU MANAGEMENT ====================
// Get all menu items
router.get('/menu', async (req, res) => {
  try {
    const menuItems = await Menu.find()
      .sort({ category: 1, name: 1 });
    
    res.json(menuItems);
  } catch (error) {
    console.error('Error fetching menu:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching menu',
      error: error.message
    });
  }
});

// Create menu item
router.post('/menu', async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = ['name', 'description', 'price', 'category', 'type', 'image'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          success: false,
          message: `${field} is required`
        });
      }
    }
    
    const menuItem = await Menu.create(req.body);
    
    res.status(201).json({
      success: true,
      data: menuItem,
      message: 'Menu item created successfully'
    });
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating menu item',
      error: error.message
    });
  }
});

// Update menu item
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
    console.error('Error updating menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating menu item',
      error: error.message
    });
  }
});

// Delete menu item
router.delete('/menu/:id', async (req, res) => {
  try {
    const menuItem = await Menu.findById(req.params.id);
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }
    
    await Menu.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Menu item deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting menu item',
      error: error.message
    });
  }
});

// Toggle menu item availability
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
    console.error('Error toggling menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling menu item',
      error: error.message
    });
  }
});

router.get('/delivery-settings', async (req,res)=>{
  const DeliverySettings = require('../models/DeliverySettings');

  const settings = await DeliverySettings.findOne() || {};

  res.json({
    success:true,
    data:settings
  });
});


module.exports = router;
