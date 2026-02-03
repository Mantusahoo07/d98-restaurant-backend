const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Apply auth middleware to all routes except public-test
router.use((req, res, next) => {
    if (req.path === '/public-test') {
        return next(); // Skip auth for public test
    }
    auth(req, res, next);
});

// Public test endpoint
router.get('/public-test', (req, res) => {
    console.log('🚚 Delivery public test endpoint hit');
    res.json({
        success: true,
        message: 'Delivery API is working!',
        timestamp: new Date().toISOString()
    });
});

// Debug middleware
router.use((req, res, next) => {
    console.log(`🚚 Delivery route accessed by: ${req.user?.email || 'No user'}`);
    next();
});

// Get delivery agent profile
router.get('/profile', async (req, res) => {
    try {
        console.log(`👤 Fetching profile for: ${req.user.email}`);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        // Find agent by email
        let agent = await DeliveryAgent.findOne({ email: req.user.email });
        
        // If agent doesn't exist, check if it's a delivery agent email
        const isDeliveryAgentEmail = req.user.email.includes('@d98.com') || 
                                    req.user.email.includes('delivery') ||
                                    req.user.email.includes('agent');
        
        if (!agent && isDeliveryAgentEmail) {
            // Create new agent with temporary password
            console.log(`👤 Creating new agent for: ${req.user.email}`);
            
            agent = new DeliveryAgent({
                name: req.user.name || req.user.email.split('@')[0],
                email: req.user.email,
                phone: '0000000000', // Default phone
                password: 'temporary123', // Will be hashed
                vehicle: '',
                status: 'available',
                isActive: true
            });
            
            await agent.save();
            console.log(`✅ Created new agent: ${agent.email}`);
        }
        
        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found. Please contact admin.'
            });
        }
        
        // Get agent statistics
        const activeOrdersCount = await Order.countDocuments({
            deliveryAgent: agent._id,
            status: { $in: ['preparing', 'out_for_delivery', 'assigned'] }
        });
        
        const completedOrdersCount = await Order.countDocuments({
            deliveryAgent: agent._id,
            status: 'delivered'
        });
        
        // Prepare response
        const agentResponse = agent.toObject ? agent.toObject() : agent;
        
        const responseData = {
            ...agentResponse,
            activeOrders: activeOrdersCount,
            completedOrders: completedOrdersCount,
            rating: 4.5, // Default rating
            agentId: agent._id.toString().substring(0, 8).toUpperCase()
        };
        
        res.json({
            success: true,
            agent: responseData
        });
        
    } catch (error) {
        console.error('❌ Error in /profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile',
            error: error.message
        });
    }
});

// Update agent profile
router.put('/profile', async (req, res) => {
    try {
        const { name, phone, vehicle, isActive } = req.body;
        console.log(`✏️ Updating profile for: ${req.user.email}`);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        
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
        if (isActive !== undefined) {
            agent.isActive = isActive;
            agent.status = isActive ? 'available' : 'offline';
        }
        
        await agent.save();
        
        const updatedAgent = agent.toObject();
        
        res.json({
            success: true,
            agent: updatedAgent,
            message: 'Profile updated successfully'
        });
        
    } catch (error) {
        console.error('❌ Error updating profile:', error);
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
        const { isActive } = req.body;
        console.log(`🔄 Updating status for: ${req.user.email}, isActive: ${isActive}`);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        
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
        
        res.json({
            success: true,
            agent: {
                _id: agent._id,
                name: agent.name,
                email: agent.email,
                isActive: agent.isActive,
                status: agent.status
            },
            message: `You are now ${isActive ? 'online' : 'offline'}`
        });
        
    } catch (error) {
        console.error('❌ Error updating status:', error);
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
        console.log(`📦 Fetching active orders for: ${req.user.email}`);
        
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
            status: { $in: ['preparing', 'out_for_delivery', 'assigned', 'picked_up'] }
        })
        .populate('items.menuItem')
        .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            orders: orders,
            count: orders.length
        });
        
    } catch (error) {
        console.error('❌ Error fetching active orders:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching active orders',
            error: error.message
        });
    }
});

// Get assignments (orders without delivery agents)
router.get('/assignments', async (req, res) => {
    try {
        console.log(`🎯 Fetching assignments for: ${req.user.email}`);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        
        if (!agent || !agent.isActive) {
            return res.json({
                success: true,
                assignments: [],
                message: 'Agent is offline or not found'
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
        .limit(10);
        
        res.json({
            success: true,
            assignments: assignments,
            count: assignments.length
        });
        
    } catch (error) {
        console.error('❌ Error fetching assignments:', error);
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
        const orderId = req.params.id;
        console.log(`✅ Accepting assignment ${orderId} for: ${req.user.email}`);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        
        if (!agent || !agent.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Agent is not active'
            });
        }
        
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        // Assign order to agent
        order.deliveryAgent = agent._id;
        order.status = 'assigned';
        order.assignedAt = new Date();
        await order.save();
        
        // Update agent status
        agent.status = 'busy';
        await agent.save();
        
        const updatedOrder = await Order.findById(orderId)
            .populate('items.menuItem');
        
        res.json({
            success: true,
            order: updatedOrder,
            message: 'Assignment accepted successfully'
        });
        
    } catch (error) {
        console.error('❌ Error accepting assignment:', error);
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
        console.log(`❌ Rejecting assignment ${req.params.id} for: ${req.user.email}`);
        
        // Just log the rejection
        res.json({
            success: true,
            message: 'Assignment rejected'
        });
        
    } catch (error) {
        console.error('❌ Error rejecting assignment:', error);
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
        const orderId = req.params.id;
        console.log(`📦 Marking order ${orderId} as picked up by: ${req.user.email}`);
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        // Verify agent owns this order
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
        console.error('❌ Error marking order as picked up:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking order as picked up',
            error: error.message
        });
    }
});

// Verify delivery OTP and mark as delivered - NEW ROUTE
router.post('/orders/:id/verify-otp', async (req, res) => {
    try {
        const orderId = req.params.id;
        const { otp } = req.body;
        
        console.log(`🔐 Verifying OTP for order ${orderId} by: ${req.user.email}`);
        
        if (!otp) {
            return res.status(400).json({
                success: false,
                message: 'OTP is required'
            });
        }
        
        const DeliveryAgent = require('../models/DeliveryAgent');
        const Order = require('../models/Order');
        
        const agent = await DeliveryAgent.findOne({ email: req.user.email });
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        // Verify agent owns this order
        if (!order.deliveryAgent || order.deliveryAgent.toString() !== agent._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Order not assigned to you'
            });
        }
        
        // Verify OTP
        if (order.deliveryOtp !== otp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP'
            });
        }
        
        // Check if order is already delivered
        if (order.status === 'delivered') {
            return res.status(400).json({
                success: false,
                message: 'Order is already delivered'
            });
        }
        
        // OTP verified, mark as delivered
        order.status = 'delivered';
        order.deliveredAt = new Date();
        order.otpVerified = true;
        await order.save();
        
        // Update agent stats
        agent.ordersDelivered += 1;
        agent.status = 'available';
        await agent.save();
        
        const updatedOrder = await Order.findById(orderId)
            .populate('items.menuItem');
        
        res.json({
            success: true,
            order: updatedOrder,
            message: 'OTP verified and order marked as delivered'
        });
        
    } catch (error) {
        console.error('❌ Error verifying OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying OTP',
            error: error.message
        });
    }
});



// Get earnings
router.get('/earnings', async (req, res) => {
    try {
        console.log(`💰 Fetching earnings for: ${req.user.email}`);
        
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
        
        // Calculate earnings (₹40 per delivery)
        let todayEarnings = 0;
        let weekEarnings = 0;
        let monthEarnings = 0;
        let totalEarnings = 0;
        
        deliveredOrders.forEach(order => {
            const orderDate = new Date(order.deliveredAt || order.updatedAt);
            const earnings = order.deliveryCharge || 40; // Default ₹40
            
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
            bonuses: 200,
            monthlyDeliveries: deliveredOrders.filter(order => 
                new Date(order.deliveredAt || order.updatedAt) >= monthStart
            ).length
        };
        
        res.json({
            success: true,
            earnings: earningsData
        });
        
    } catch (error) {
        console.error('❌ Error fetching earnings:', error);
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
        console.log(`📊 Fetching transactions for: ${req.user.email}`);
        
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
        .select('orderId deliveryCharge deliveredAt')
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
        
        res.json({
            success: true,
            transactions: transactions
        });
        
    } catch (error) {
        console.error('❌ Error fetching transactions:', error);
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
        console.log(`🔔 Fetching notifications for: ${req.user.email}`);
        
        const notifications = [
            {
                id: 1,
                title: 'Welcome to D98 Delivery!',
                message: 'Your delivery agent account is now active.',
                type: 'info',
                read: false,
                createdAt: new Date()
            }
        ];
        
        res.json({
            success: true,
            notifications: notifications
        });
        
    } catch (error) {
        console.error('❌ Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching notifications',
            error: error.message
        });
    }
});

// Check if user is agent
router.get('/check-agent', async (req, res) => {
    try {
        const isAgentEmail = req.user.email.includes('@d98.com') || 
                            req.user.email.includes('delivery') ||
                            req.user.email.includes('agent');
        
        res.json({
            success: true,
            isAgent: isAgentEmail,
            email: req.user.email
        });
    } catch (error) {
        console.error('❌ Error checking agent status:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking agent status',
            error: error.message
        });
    }
});

module.exports = router;