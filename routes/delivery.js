// routes/delivery.js
const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const auth = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);

// Debug middleware for delivery routes
router.use((req, res, next) => {
    console.log('🚚 Delivery route accessed by user:', req.user.email);
    next();
});

// Check if user is delivery agent
router.get('/check-agent', async (req, res) => {
    try {
        console.log('🔍 Checking if user is delivery agent:', req.user.email);
        res.json({
            success: true,
            isAgent: req.user.email.includes('@d98.com'),
            email: req.user.email
        });
    } catch (error) {
        console.error('Error checking agent status:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking agent status',
            error: error.message
        });
    }
});

router.get('/check-agent/:uid', async (req, res) => {
    try {
        res.json({
            success: true,
            isAgent: req.user.email.includes('@d98.com'),
            email: req.user.email
        });
    } catch (error) {
        console.error('Error checking agent status:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking agent status',
            error: error.message
        });
    }
});

// Agent profile endpoints
router.get('/profile', async (req, res) => {
    try {
        console.log('👤 Fetching profile for:', req.user.email);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        // Find or create agent
        let agent = await DeliveryAgent.findOne({ email: req.user.email });
        
        if (!agent) {
            // Create new agent profile
            console.log('👤 Creating new agent profile for:', req.user.email);
            
            // Check if email is a delivery agent email
            const isAgentEmail = req.user.email.includes('@d98.com');
            
            agent = new DeliveryAgent({
                name: req.user.name || 'Delivery Agent',
                email: req.user.email,
                phone: 'Not set',
                password: 'temp123', // Will be hashed by pre-save hook
                vehicle: '',
                status: isAgentEmail ? 'available' : 'offline',
                isActive: isAgentEmail
            });
            
            await agent.save();
            console.log('✅ Created new agent:', agent.email);
        }
        
        // Remove password from response
        const agentData = agent.toObject();
        delete agentData.password;
        
        // Get agent statistics
        const activeOrdersCount = await Order.countDocuments({ 
            deliveryAgent: agent._id,
            status: { $in: ['preparing', 'out_for_delivery'] }
        });
        
        const completedOrdersCount = await Order.countDocuments({ 
            deliveryAgent: agent._id,
            status: 'delivered'
        });
        
        const agentWithStats = {
            ...agentData,
            activeOrders: activeOrdersCount,
            completedOrders: completedOrdersCount,
            rating: 4.5,
            agentId: agent._id.toString().substring(0, 8)
        };
        
        res.json({
            success: true,
            agent: agentWithStats
        });
        
    } catch (error) {
        console.error('❌ Error fetching agent profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching agent profile',
            error: error.message
        });
    }
});

// Update agent profile
router.put('/profile', async (req, res) => {
    try {
        console.log('✏️ Updating profile for:', req.user.email);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const { name, phone, vehicle, vehicleType, isActive } = req.body;
        
        let agent = await DeliveryAgent.findOne({ email: req.user.email });
        
        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Agent not found'
            });
        }
        
        // Update fields
        if (name) agent.name = name;
        if (phone) agent.phone = phone;
        if (vehicle !== undefined) agent.vehicle = vehicle;
        if (isActive !== undefined) agent.isActive = isActive;
        
        await agent.save();
        
        // Remove password from response
        const updatedAgent = agent.toObject();
        delete updatedAgent.password;
        
        res.json({
            success: true,
            agent: updatedAgent,
            message: 'Profile updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile',
            error: error.message
        });
    }
});

// Update online status
router.put('/profile/status', async (req, res) => {
    try {
        const DeliveryAgent = require('../models/DeliveryAgent');
        const { isActive } = req.body;
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        
        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Agent not found'
            });
        }
        
        agent.isActive = isActive;
        agent.status = isActive ? 'available' : 'offline';
        await agent.save();
        
        const agentData = agent.toObject();
        delete agentData.password;
        
        res.json({
            success: true,
            agent: agentData,
            message: `You are now ${isActive ? 'online' : 'offline'}`
        });
        
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating status',
            error: error.message
        });
    }
});

// Get active orders
router.get('/orders/active', async (req, res) => {
    try {
        console.log('📦 Fetching active orders for agent:', req.user.email);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        
        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Agent not found'
            });
        }
        
        const orders = await Order.find({
            deliveryAgent: agent._id,
            status: { $in: ['preparing', 'out_for_delivery', 'picked_up', 'assigned'] }
        })
        .populate('items.menuItem')
        .sort({ createdAt: -1 });
        
        console.log(`✅ Found ${orders.length} active orders for agent`);
        
        res.json({
            success: true,
            orders: orders,
            count: orders.length
        });
        
    } catch (error) {
        console.error('Error fetching active orders:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching active orders',
            error: error.message
        });
    }
});

// Get assignments
router.get('/assignments', async (req, res) => {
    try {
        console.log('🎯 Fetching assignments for agent:', req.user.email);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        
        if (!agent || !agent.isActive) {
            return res.json({
                success: true,
                assignments: [],
                message: 'Agent is offline'
            });
        }
        
        // Find orders that need delivery agents
        const assignments = await Order.find({
            $or: [
                { deliveryAgent: { $exists: false } },
                { deliveryAgent: null }
            ],
            status: { $in: ['confirmed', 'preparing'] }
        })
        .populate('items.menuItem')
        .sort({ createdAt: 1 })
        .limit(5);
        
        console.log(`✅ Found ${assignments.length} assignments`);
        
        res.json({
            success: true,
            assignments: assignments,
            count: assignments.length
        });
        
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching assignments',
            error: error.message
        });
    }
});

// Accept assignment
router.post('/assignments/:id/accept', async (req, res) => {
    try {
        console.log('✅ Accepting assignment:', req.params.id);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        
        if (!agent || !agent.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Agent is not active'
            });
        }
        
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        // Assign order to agent
        order.deliveryAgent = agent._id;
        order.status = 'preparing';
        order.assignedAt = new Date();
        await order.save();
        
        // Update agent status
        agent.status = 'busy';
        await agent.save();
        
        const updatedOrder = await Order.findById(order._id)
            .populate('items.menuItem');
        
        res.json({
            success: true,
            order: updatedOrder,
            message: 'Assignment accepted successfully'
        });
        
    } catch (error) {
        console.error('Error accepting assignment:', error);
        res.status(500).json({
            success: false,
            message: 'Error accepting assignment',
            error: error.message
        });
    }
});

// Reject assignment
router.post('/assignments/:id/reject', async (req, res) => {
    try {
        console.log('❌ Rejecting assignment:', req.params.id);
        
        // Just log the rejection, no database changes needed
        res.json({
            success: true,
            message: 'Assignment rejected'
        });
        
    } catch (error) {
        console.error('Error rejecting assignment:', error);
        res.status(500).json({
            success: false,
            message: 'Error rejecting assignment',
            error: error.message
        });
    }
});

// Mark order as picked up
router.post('/orders/:id/pickup', async (req, res) => {
    try {
        console.log('📦 Marking order as picked up:', req.params.id);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        if (!order.deliveryAgent || order.deliveryAgent.toString() !== agent._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Order not assigned to you'
            });
        }
        
        order.status = 'out_for_delivery';
        await order.save();
        
        res.json({
            success: true,
            order: order,
            message: 'Order marked as picked up'
        });
        
    } catch (error) {
        console.error('Error marking order as picked up:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking order as picked up',
            error: error.message
        });
    }
});

// Mark order as delivered
router.post('/orders/:id/deliver', async (req, res) => {
    try {
        console.log('✅ Marking order as delivered:', req.params.id);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        if (!order.deliveryAgent || order.deliveryAgent.toString() !== agent._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Order not assigned to you'
            });
        }
        
        order.status = 'delivered';
        order.deliveredAt = new Date();
        await order.save();
        
        // Update agent stats
        agent.ordersDelivered += 1;
        agent.status = 'available';
        await agent.save();
        
        res.json({
            success: true,
            order: order,
            message: 'Order marked as delivered'
        });
        
    } catch (error) {
        console.error('Error marking order as delivered:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking order as delivered',
            error: error.message
        });
    }
});

// Get earnings
router.get('/earnings', async (req, res) => {
    try {
        console.log('💰 Fetching earnings for agent:', req.user.email);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        
        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Agent not found'
            });
        }
        
        // Calculate dates
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1);
        weekStart.setHours(0, 0, 0, 0);
        
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        
        // Get delivered orders
        const deliveredOrders = await Order.find({
            deliveryAgent: agent._id,
            status: 'delivered'
        });
        
        // Calculate earnings
        let todayEarnings = 0;
        let weekEarnings = 0;
        let monthEarnings = 0;
        let totalEarnings = 0;
        
        deliveredOrders.forEach(order => {
            const orderDate = new Date(order.deliveredAt || order.updatedAt);
            const earnings = order.deliveryCharge || 40; // Default ₹40 per delivery
            
            totalEarnings += earnings;
            
            if (orderDate >= today) {
                todayEarnings += earnings;
            }
            
            if (orderDate >= weekStart) {
                weekEarnings += earnings;
            }
            
            if (orderDate >= monthStart) {
                monthEarnings += earnings;
            }
        });
        
        const earningsData = {
            today: todayEarnings,
            week: weekEarnings,
            month: monthEarnings,
            total: totalEarnings,
            totalDeliveries: agent.ordersDelivered,
            rating: 4.5,
            avgDeliveryTime: 25,
            deductions: 0,
            bonuses: 0,
            monthlyDeliveries: deliveredOrders.filter(order => 
                new Date(order.deliveredAt || order.updatedAt) >= monthStart
            ).length
        };
        
        res.json({
            success: true,
            earnings: earningsData
        });
        
    } catch (error) {
        console.error('Error fetching earnings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching earnings',
            error: error.message
        });
    }
});

// Get transactions
router.get('/transactions', async (req, res) => {
    try {
        console.log('📊 Fetching transactions for agent:', req.user.email);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        
        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Agent not found'
            });
        }
        
        // Get delivered orders as transactions
        const orders = await Order.find({
            deliveryAgent: agent._id,
            status: 'delivered'
        })
        .select('orderId total deliveryCharge deliveredAt')
        .sort({ deliveredAt: -1 })
        .limit(10);
        
        const transactions = orders.map(order => ({
            type: 'delivery',
            amount: order.deliveryCharge || 40,
            orderId: order.orderId,
            date: order.deliveredAt,
            status: 'completed',
            description: `Delivery fee for order #${order.orderId}`
        }));
        
        // Add some mock transactions
        const mockTransactions = [
            {
                type: 'bonus',
                amount: 200,
                description: 'Weekly performance bonus',
                date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                status: 'completed'
            },
            {
                type: 'withdrawal',
                amount: -1500,
                description: 'Bank transfer',
                date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                status: 'completed'
            }
        ];
        
        const allTransactions = [...mockTransactions, ...transactions]
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json({
            success: true,
            transactions: allTransactions
        });
        
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching transactions',
            error: error.message
        });
    }
});

// Get notifications
router.get('/notifications', async (req, res) => {
    try {
        console.log('🔔 Fetching notifications for agent:', req.user.email);
        
        const notifications = [
            {
                id: 1,
                title: 'Welcome to D98 Delivery',
                message: 'Your delivery agent account has been activated',
                type: 'info',
                read: false,
                createdAt: new Date()
            },
            {
                id: 2,
                title: 'New Features Available',
                message: 'Check out the new navigation features in the app',
                type: 'update',
                read: false,
                createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
            }
        ];
        
        res.json({
            success: true,
            notifications: notifications
        });
        
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching notifications',
            error: error.message
        });
    }
});

module.exports = router;