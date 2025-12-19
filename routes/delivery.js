const express = require('express');
const router = express.Router();
const DeliveryAgent = require('../models/DeliveryAgent');
const Order = require('../models/Order');
const User = require('../models/User');

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // In production, you would verify the Firebase token here
    // For now, we'll accept any token and extract user info from it
    req.user = {
      uid: `user_${Date.now()}`,
      email: 'demo@d98.com'
    };
    
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};

// 1. Get or create delivery agent profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    let agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });
    
    if (!agent) {
      // Create new delivery agent profile
      agent = new DeliveryAgent({
        firebaseUid: req.user.uid,
        name: req.user.name || 'Delivery Agent',
        email: req.user.email || 'delivery@d98.com',
        phone: req.user.phone || '+919876543210',
        status: 'offline'
      });
      
      await agent.save();
      
      return res.status(200).json({
        success: true,
        message: 'Delivery agent profile created',
        data: agent
      });
    }
    
    res.status(200).json({
      success: true,
      data: agent
    });
  } catch (error) {
    console.error('Error getting delivery profile:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// 2. Get available orders (not assigned to any agent)
router.get('/orders/available', verifyToken, async (req, res) => {
  try {
    const orders = await Order.find({
      paymentStatus: 'paid',
      deliveryStatus: { $in: ['pending_assignment', null] },
      status: { $in: ['confirmed', 'preparing', 'ready_for_pickup'] }
    })
    .sort({ createdAt: -1 })
    .limit(20);
    
    res.status(200).json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Error getting available orders:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// 3. Get assigned orders for current agent
router.get('/assigned', verifyToken, async (req, res) => {
  try {
    const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Delivery agent not found' 
      });
    }
    
    const orders = await Order.find({
      deliveryAgentId: agent._id,
      deliveryStatus: { 
        $in: ['assigned', 'picked', 'out_for_delivery', 'arrived_at_customer'] 
      }
    })
    .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Error getting assigned orders:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// 4. Accept an order
router.post('/accept/:orderId', verifyToken, async (req, res) => {
  try {
    const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Delivery agent not found' 
      });
    }
    
    if (!agent.isAvailable) {
      return res.status(400).json({ 
        success: false, 
        message: 'Agent is not available' 
      });
    }
    
    const order = await Order.findById(req.params.orderId);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    if (order.deliveryAgentId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order already assigned' 
      });
    }
    
    // Update order
    order.deliveryAgentId = agent._id;
    order.deliveryAgentName = agent.name;
    order.deliveryAgentPhone = agent.phone;
    order.deliveryStatus = 'assigned';
    order.deliveryAssignedAt = new Date();
    
    // Update agent status
    agent.isAvailable = false;
    agent.status = 'on_delivery';
    
    await Promise.all([order.save(), agent.save()]);
    
    res.status(200).json({
      success: true,
      message: 'Order accepted successfully',
      data: order
    });
  } catch (error) {
    console.error('Error accepting order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// 5. Mark order as picked up
router.post('/pickup/:orderId', verifyToken, async (req, res) => {
  try {
    const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Delivery agent not found' 
      });
    }
    
    const order = await Order.findById(req.params.orderId);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    if (order.deliveryAgentId.toString() !== agent._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to update this order' 
      });
    }
    
    order.deliveryStatus = 'picked';
    order.pickedAt = new Date();
    
    await order.save();
    
    res.status(200).json({
      success: true,
      message: 'Order marked as picked up',
      data: order
    });
  } catch (error) {
    console.error('Error picking up order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// 6. Start delivery
router.post('/start/:orderId', verifyToken, async (req, res) => {
  try {
    const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Delivery agent not found' 
      });
    }
    
    const order = await Order.findById(req.params.orderId);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    if (order.deliveryAgentId.toString() !== agent._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to update this order' 
      });
    }
    
    order.deliveryStatus = 'out_for_delivery';
    order.outForDeliveryAt = new Date();
    
    await order.save();
    
    res.status(200).json({
      success: true,
      message: 'Delivery started',
      data: order
    });
  } catch (error) {
    console.error('Error starting delivery:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// 7. Mark as arrived at customer
router.post('/arrived/:orderId', verifyToken, async (req, res) => {
  try {
    const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Delivery agent not found' 
      });
    }
    
    const order = await Order.findById(req.params.orderId);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    if (order.deliveryAgentId.toString() !== agent._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to update this order' 
      });
    }
    
    order.deliveryStatus = 'arrived_at_customer';
    order.arrivedAtCustomerAt = new Date();
    
    await order.save();
    
    res.status(200).json({
      success: true,
      message: 'Arrived at customer location',
      data: order
    });
  } catch (error) {
    console.error('Error updating arrival:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// 8. Verify OTP and complete delivery
router.post('/verify-otp/:orderId', verifyToken, async (req, res) => {
  try {
    const { otp } = req.body;
    
    if (!otp || otp.length !== 4) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid OTP required' 
      });
    }
    
    const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Delivery agent not found' 
      });
    }
    
    const order = await Order.findById(req.params.orderId);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    if (order.deliveryAgentId.toString() !== agent._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to verify OTP for this order' 
      });
    }
    
    // Check OTP
    if (order.deliveryOtp !== otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP' 
      });
    }
    
    // Update order
    order.deliveryStatus = 'delivered';
    order.deliveredAt = new Date();
    order.otpVerified = true;
    order.status = 'delivered';
    
    // Update agent stats
    agent.totalDeliveries += 1;
    agent.todayStats.deliveries += 1;
    agent.todayStats.earnings += 50; // Delivery fee
    agent.totalEarnings += 50;
    agent.isAvailable = true;
    agent.status = 'online';
    
    await Promise.all([order.save(), agent.save()]);
    
    res.status(200).json({
      success: true,
      message: 'OTP verified successfully. Delivery completed!',
      data: order
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// 9. Update agent status (online/offline)
router.post('/status', verifyToken, async (req, res) => {
  try {
    const { status, location } = req.body;
    
    const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Delivery agent not found' 
      });
    }
    
    agent.status = status || 'online';
    agent.isAvailable = status === 'online';
    
    if (location) {
      agent.currentLocation = {
        lat: location.lat,
        lng: location.lng
      };
    }
    
    await agent.save();
    
    res.status(200).json({
      success: true,
      message: 'Status updated',
      data: agent
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// 10. Update agent location
router.post('/location', verifyToken, async (req, res) => {
  try {
    const { location } = req.body;
    
    const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Delivery agent not found' 
      });
    }
    
    if (location) {
      agent.currentLocation = {
        lat: location.lat,
        lng: location.lng
      };
      
      await agent.save();
    }
    
    res.status(200).json({
      success: true,
      message: 'Location updated'
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// 11. Get delivery stats
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Delivery agent not found' 
      });
    }
    
    // Calculate additional stats
    const completedOrders = await Order.countDocuments({
      deliveryAgentId: agent._id,
      deliveryStatus: 'delivered'
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayDeliveries = await Order.countDocuments({
      deliveryAgentId: agent._id,
      deliveryStatus: 'delivered',
      deliveredAt: { $gte: today }
    });
    
    // Calculate average delivery time
    const deliveredOrders = await Order.find({
      deliveryAgentId: agent._id,
      deliveryStatus: 'delivered',
      deliveredAt: { $exists: true },
      outForDeliveryAt: { $exists: true }
    }).limit(50);
    
    let avgDeliveryTime = 30; // Default 30 minutes
    if (deliveredOrders.length > 0) {
      const totalTime = deliveredOrders.reduce((sum, order) => {
        const deliveryTime = (order.deliveredAt - order.outForDeliveryAt) / (1000 * 60); // minutes
        return sum + deliveryTime;
      }, 0);
      avgDeliveryTime = Math.round(totalTime / deliveredOrders.length);
    }
    
    const stats = {
      totalDeliveries: agent.totalDeliveries,
      todayDeliveries: todayDeliveries,
      todayEarnings: agent.todayStats.earnings,
      totalEarnings: agent.totalEarnings,
      successRate: completedOrders > 0 ? Math.round((completedOrders / agent.totalDeliveries) * 100) : 100,
      avgDeliveryTime: avgDeliveryTime,
      rating: agent.rating,
      status: agent.status
    };
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// 12. Reject an order
router.post('/reject/:orderId', verifyToken, async (req, res) => {
  try {
    const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Delivery agent not found' 
      });
    }
    
    const order = await Order.findById(req.params.orderId);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    // Only reject if assigned to this agent
    if (order.deliveryAgentId && order.deliveryAgentId.toString() === agent._id.toString()) {
      order.deliveryAgentId = undefined;
      order.deliveryAgentName = undefined;
      order.deliveryAgentPhone = undefined;
      order.deliveryStatus = 'pending_assignment';
      order.deliveryAssignedAt = undefined;
      
      // Make agent available again
      agent.isAvailable = true;
      agent.status = 'online';
      
      await Promise.all([order.save(), agent.save()]);
    }
    
    res.status(200).json({
      success: true,
      message: 'Order rejected'
    });
  } catch (error) {
    console.error('Error rejecting order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

module.exports = router;