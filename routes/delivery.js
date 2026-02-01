const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const DeliveryAgent = require('../models/DeliveryAgent');
const Order = require('../models/Order');

// Apply auth middleware to delivery routes
router.use(auth);

// Check if user is a delivery agent
router.get('/check-agent/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    
    // Check if this user exists as a delivery agent
    const agent = await DeliveryAgent.findOne({ email: req.user.email });
    
    if (agent) {
      return res.json({
        success: true,
        isAgent: true,
        agent: agent
      });
    }
    
    res.json({
      success: true,
      isAgent: false
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking agent status',
      error: error.message
    });
  }
});

// Get delivery agent profile
router.get('/profile', async (req, res) => {
  try {
    console.log('🔍 Fetching profile for:', req.user.email);
    
    const agent = await DeliveryAgent.findOne({ email: req.user.email });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Delivery agent profile not found'
      });
    }
    
    res.json({
      success: true,
      agent: agent
    });
  } catch (error) {
    console.error('❌ Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
});

// Create delivery agent profile
router.post('/agents', async (req, res) => {
  try {
    const { name, email, phone, vehicleType, vehicleNumber, isActive } = req.body;
    
    // Check if agent already exists
    const existingAgent = await DeliveryAgent.findOne({ email });
    if (existingAgent) {
      return res.status(400).json({
        success: false,
        message: 'Agent already exists'
      });
    }
    
    // Generate default password
    const defaultPassword = 'delivery@123';
    
    const newAgent = new DeliveryAgent({
      name,
      email,
      phone,
      password: defaultPassword,
      isActive: isActive || false
    });
    
    await newAgent.save();
    
    res.status(201).json({
      success: true,
      message: 'Delivery agent created successfully',
      agent: newAgent
    });
  } catch (error) {
    console.error('❌ Error creating agent:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating delivery agent',
      error: error.message
    });
  }
});

// Update delivery agent profile
router.put('/profile', async (req, res) => {
  try {
    const { name, phone, vehicleNumber, vehicleType } = req.body;
    
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
    if (vehicleNumber) agent.vehicle = vehicleNumber;
    
    await agent.save();
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      agent: agent
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
    
    const agent = await DeliveryAgent.findOne({ email: req.user.email });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }
    
    agent.isActive = isActive;
    await agent.save();
    
    res.json({
      success: true,
      message: 'Status updated successfully',
      agent: agent
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

// Get active orders for delivery agent
router.get('/orders/active', async (req, res) => {
  try {
    console.log('🛵 Fetching active orders for agent:', req.user.email);
    
    // First, find the agent
    const agent = await DeliveryAgent.findOne({ email: req.user.email });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Delivery agent not found'
      });
    }
    
    // In a real implementation, you would fetch orders assigned to this agent
    // For now, let's return some mock data or all orders with specific status
    const orders = await Order.find({
      status: { $in: ['confirmed', 'preparing', 'out_for_delivery', 'picked_up'] }
    })
    .populate('items.menuItem')
    .sort({ createdAt: -1 })
    .limit(10);
    
    // Format orders for frontend
    const formattedOrders = orders.map(order => ({
      _id: order._id,
      orderId: order.orderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      status: order.status,
      deliveryOtp: order.deliveryOtp,
      address: order.address,
      items: order.items,
      total: order.total,
      deliveryCharge: order.deliveryCharge,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    }));
    
    res.json({
      success: true,
      orders: formattedOrders,
      count: formattedOrders.length
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

// Get available assignments (orders needing delivery agents)
router.get('/assignments', async (req, res) => {
  try {
    console.log('📋 Fetching assignments for agent:', req.user.email);
    
    // Get agent to check if online
    const agent = await DeliveryAgent.findOne({ email: req.user.email });
    
    if (!agent || !agent.isActive) {
      return res.json({
        success: true,
        assignments: [],
        message: 'Agent is offline'
      });
    }
    
    // Find orders that are confirmed/preparing but not assigned yet
    const assignments = await Order.find({
      status: 'confirmed',
      deliveryAgent: { $exists: false }
    })
    .populate('items.menuItem')
    .sort({ createdAt: -1 })
    .limit(5);
    
    // Format assignments
    const formattedAssignments = assignments.map(order => ({
      _id: order._id,
      orderId: order.orderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      status: order.status,
      deliveryOtp: order.deliveryOtp,
      address: order.address,
      items: order.items,
      total: order.total,
      deliveryCharge: order.deliveryCharge || 40, // Default delivery charge
      estimatedEarnings: order.deliveryCharge || 40,
      createdAt: order.createdAt
    }));
    
    res.json({
      success: true,
      assignments: formattedAssignments,
      count: formattedAssignments.length
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
    const { id } = req.params;
    
    // Find agent
    const agent = await DeliveryAgent.findOne({ email: req.user.email });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }
    
    // Find the order
    const order = await Order.findById(id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Check if order is already assigned
    if (order.deliveryAgent) {
      return res.status(400).json({
        success: false,
        message: 'Order already assigned to another agent'
      });
    }
    
    // Assign order to agent
    order.deliveryAgent = agent._id;
    order.status = 'preparing'; // Or 'assigned' depending on your flow
    order.assignedAt = new Date();
    await order.save();
    
    // Update agent status
    agent.status = 'busy';
    await agent.save();
    
    res.json({
      success: true,
      message: 'Assignment accepted successfully',
      order: order
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
    const { id } = req.params;
    
    // Just return success - in a real system, you might want to mark it as rejected
    // so other agents don't see it
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

// Pick up order (mark as picked up)
router.post('/orders/:id/pickup', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the order
    const order = await Order.findById(id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Check if order is assigned to this agent
    const agent = await DeliveryAgent.findOne({ email: req.user.email });
    if (!order.deliveryAgent || !order.deliveryAgent.equals(agent._id)) {
      return res.status(403).json({
        success: false,
        message: 'Order not assigned to you'
      });
    }
    
    // Update order status
    order.status = 'picked_up';
    await order.save();
    
    res.json({
      success: true,
      message: 'Order marked as picked up',
      order: order
    });
  } catch (error) {
    console.error('❌ Error marking as picked up:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking as picked up',
      error: error.message
    });
  }
});

// Deliver order (mark as delivered)
router.post('/orders/:id/deliver', async (req, res) => {
  try {
    const { id } = req.params;
    const { otp } = req.body;
    
    // Find the order
    const order = await Order.findById(id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Check if order is assigned to this agent
    const agent = await DeliveryAgent.findOne({ email: req.user.email });
    if (!order.deliveryAgent || !order.deliveryAgent.equals(agent._id)) {
      return res.status(403).json({
        success: false,
        message: 'Order not assigned to you'
      });
    }
    
    // Verify OTP if provided
    if (otp && otp !== order.deliveryOtp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }
    
    // Update order status
    order.status = 'delivered';
    order.deliveredAt = new Date();
    order.otpVerified = true;
    await order.save();
    
    // Update agent stats
    agent.ordersDelivered += 1;
    agent.status = 'available';
    await agent.save();
    
    res.json({
      success: true,
      message: 'Order marked as delivered',
      order: order
    });
  } catch (error) {
    console.error('❌ Error marking as delivered:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking as delivered',
      error: error.message
    });
  }
});

// Get earnings data
router.get('/earnings', async (req, res) => {
  try {
    const agent = await DeliveryAgent.findOne({ email: req.user.email });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }
    
    // Calculate earnings from delivered orders
    const deliveredOrders = await Order.find({
      deliveryAgent: agent._id,
      status: 'delivered'
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayEarnings = deliveredOrders
      .filter(order => order.deliveredAt >= today)
      .reduce((sum, order) => sum + (order.deliveryCharge || 40), 0);
    
    const thisMonthEarnings = deliveredOrders
      .filter(order => order.deliveredAt.getMonth() === today.getMonth() && 
                      order.deliveredAt.getFullYear() === today.getFullYear())
      .reduce((sum, order) => sum + (order.deliveryCharge || 40), 0);
    
    const totalEarnings = deliveredOrders
      .reduce((sum, order) => sum + (order.deliveryCharge || 40), 0);
    
    // Mock data for other fields
    res.json({
      success: true,
      earnings: {
        today: todayEarnings,
        week: thisMonthEarnings * 0.25, // Approx weekly
        month: thisMonthEarnings,
        total: totalEarnings,
        totalDeliveries: deliveredOrders.length,
        monthlyDeliveries: deliveredOrders.filter(order => 
          order.deliveredAt.getMonth() === today.getMonth() && 
          order.deliveredAt.getFullYear() === today.getFullYear()
        ).length,
        rating: 4.5, // Mock rating
        avgDeliveryTime: 25, // Mock avg time in minutes
        deductions: 0,
        bonuses: 0
      }
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

// Get transaction history
router.get('/transactions', async (req, res) => {
  try {
    const agent = await DeliveryAgent.findOne({ email: req.user.email });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }
    
    // Get delivered orders as transactions
    const deliveredOrders = await Order.find({
      deliveryAgent: agent._id,
      status: 'delivered'
    }).sort({ deliveredAt: -1 }).limit(20);
    
    const transactions = deliveredOrders.map(order => ({
      _id: order._id,
      orderId: order.orderId,
      date: order.deliveredAt || order.updatedAt,
      amount: order.deliveryCharge || 40,
      type: 'delivery',
      status: 'completed',
      description: `Delivery fee for order #${order.orderId}`
    }));
    
    res.json({
      success: true,
      transactions: transactions,
      count: transactions.length
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

// Get notifications (mock data for now)
router.get('/notifications', async (req, res) => {
  try {
    // Mock notifications
    const notifications = [
      {
        _id: '1',
        title: 'Welcome to D98 Delivery',
        message: 'You have successfully logged in as a delivery agent',
        type: 'info',
        read: false,
        createdAt: new Date()
      },
      {
        _id: '2',
        title: 'New Order Available',
        message: 'A new order is waiting for pickup',
        type: 'order',
        read: false,
        createdAt: new Date(Date.now() - 3600000) // 1 hour ago
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

module.exports = router;