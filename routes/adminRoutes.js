// adminRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Order = require('../models/Order');
const Menu = require('../models/Menu');
const Category = require('../models/Category');

// Apply auth middleware to all admin routes
router.use(auth);

// =================== ADMIN CHECK MIDDLEWARE ===================
// Add this function to check if user is admin
async function checkAdmin(req, res, next) {
    try {
        // For now, allow all authenticated users as admin
        // In production, you should check user role
        if (req.user) {
            next();
        } else {
            res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error checking admin status'
        });
    }
}

router.use(checkAdmin);

// =================== USERS ROUTES ===================
// Get all users
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({}).select('-addresses -preferences -__v').sort({ createdAt: -1 });
        
        // Count orders for each user
        const usersWithStats = await Promise.all(users.map(async (user) => {
            const orderCount = await Order.countDocuments({ userId: user.firebaseUid });
            return {
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                addresses: user.addresses?.length || 0,
                orderCount: orderCount,
                createdAt: user.createdAt
            };
        }));
        
        res.json({
            success: true,
            count: usersWithStats.length,
            data: usersWithStats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error.message
        });
    }
});

// =================== ORDERS ROUTES ===================
// Get all orders
router.get('/orders', async (req, res) => {
    try {
        const { status, date } = req.query;
        
        let filter = {};
        if (status && status !== 'all') {
            filter.status = status;
        }
        
        // Date filtering
        if (date === 'today') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            filter.createdAt = { $gte: today };
        } else if (date === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            filter.createdAt = { $gte: weekAgo };
        } else if (date === 'month') {
            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            filter.createdAt = { $gte: monthAgo };
        }
        
        const orders = await Order.find(filter)
            .populate('items.menuItem', 'name price')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            count: orders.length,
            data: orders
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching orders',
            error: error.message
        });
    }
});

// Update order status
router.put('/orders/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }
        
        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        ).populate('items.menuItem', 'name price');
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        res.json({
            success: true,
            data: order
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating order status',
            error: error.message
        });
    }
});

// Delete order
router.delete('/orders/:id', async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Order deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting order',
            error: error.message
        });
    }
});

// =================== MENU ROUTES ===================
// Get all menu items (already exists, but ensure it works)
router.get('/menu', async (req, res) => {
    try {
        const menuItems = await Menu.find({}).sort({ category: 1, name: 1 });
        res.json(menuItems);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching menu items',
            error: error.message
        });
    }
});

// Add new menu item
router.post('/menu', async (req, res) => {
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
            data: menuItem
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error updating menu item',
            error: error.message
        });
    }
});

// Delete menu item
router.delete('/menu/:id', async (req, res) => {
    try {
        const menuItem = await Menu.findByIdAndDelete(req.params.id);
        
        if (!menuItem) {
            return res.status(404).json({
                success: false,
                message: 'Menu item not found'
            });
        }
        
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

// =================== CATEGORIES ROUTES ===================
// Get all categories
router.get('/categories', async (req, res) => {
    try {
        const categories = await Category.find({}).sort({ order: 1, name: 1 });
        
        // Count menu items in each category
        const categoriesWithCounts = await Promise.all(categories.map(async (category) => {
            const menuCount = await Menu.countDocuments({ category: category.name });
            return {
                ...category.toObject(),
                menuCount
            };
        }));
        
        res.json(categoriesWithCounts);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching categories',
            error: error.message
        });
    }
});

// Add new category
router.post('/categories', async (req, res) => {
    try {
        const category = new Category(req.body);
        await category.save();
        
        res.status(201).json({
            success: true,
            data: category
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error creating category',
            error: error.message
        });
    }
});

// Update category
router.put('/categories/:id', async (req, res) => {
    try {
        const category = await Category.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }
        
        res.json({
            success: true,
            data: category
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error updating category',
            error: error.message
        });
    }
});

// Delete category
router.delete('/categories/:id', async (req, res) => {
    try {
        const category = await Category.findByIdAndDelete(req.params.id);
        
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }
        
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

module.exports = router;
