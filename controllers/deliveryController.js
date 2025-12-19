const DeliveryPartner = require('../models/DeliveryPartner');
const Order = require('../models/Order');

// Get delivery partner profile
exports.getProfile = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (!partner) {
      // If partner doesn't exist, create a basic profile
      const newPartner = await DeliveryPartner.create({
        firebaseUid: req.user.uid,
        name: req.user.name || 'Delivery Partner',
        phone: req.user.phone || '',
        email: req.user.email || '',
        vehicleType: 'bike'
      });
      
      return res.json({
        success: true,
        data: newPartner,
        message: 'Profile created automatically'
      });
    }
    
    res.json({
      success: true,
      data: partner
    });
  } catch (error) {
    console.error('Error fetching delivery profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
};

// Create/Update delivery partner profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, vehicleType, vehicleNumber } = req.body;
    
    let partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (partner) {
      // Update existing partner
      partner.name = name || partner.name;
      partner.phone = phone || partner.phone;
      partner.vehicleType = vehicleType || partner.vehicleType;
      partner.vehicleNumber = vehicleNumber || partner.vehicleNumber;
      
      await partner.save();
    } else {
      // Create new partner
      partner = await DeliveryPartner.create({
        firebaseUid: req.user.uid,
        name: name || req.user.name || 'Delivery Partner',
        phone: phone || req.user.phone || '',
        email: req.user.email || '',
        vehicleType: vehicleType || 'bike',
        vehicleNumber: vehicleNumber || ''
      });
    }
    
    res.json({
      success: true,
      data: partner,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
};

// Toggle online status
exports.toggleOnlineStatus = async (req, res) => {
  try {
    const { isOnline, location } = req.body;
    
    let partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (!partner) {
      // Create partner if doesn't exist
      partner = await DeliveryPartner.create({
        firebaseUid: req.user.uid,
        name: req.user.name || 'Delivery Partner',
        phone: req.user.phone || '',
        email: req.user.email || '',
        vehicleType: 'bike',
        isOnline: isOnline !== undefined ? isOnline : true
      });
    } else {
      partner.isOnline = isOnline !== undefined ? isOnline : !partner.isOnline;
    }
    
    if (location) {
      partner.currentLocation = {
        lat: location.lat,
        lng: location.lng,
        updatedAt: new Date()
      };
    }
    
    await partner.save();
    
    res.json({
      success: true,
      data: partner,
      message: `You are now ${partner.isOnline ? 'online' : 'offline'}`
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating status',
      error: error.message
    });
  }
};

// Get available orders for delivery
exports.getAvailableOrders = async (req, res) => {
  try {
    // Get orders that are ready for delivery
    const orders = await Order.find({
      status: { $in: ['confirmed', 'preparing'] },
      paymentStatus: 'paid',
      deliveryStatus: 'pending_assignment'
    })
    .populate('items.menuItem')
    .sort({ createdAt: 1 })
    .limit(20);
    
    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    console.error('Error fetching available orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
};

// Accept an order for delivery
exports.acceptOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Check if partner is online
    const partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (!partner || !partner.isOnline) {
      return res.status(400).json({
        success: false,
        message: 'You must be online to accept orders'
      });
    }
    
    // Find the order
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Check if order is available for delivery
    if (order.deliveryStatus !== 'pending_assignment') {
      return res.status(400).json({
        success: false,
        message: 'Order is not available for delivery'
      });
    }
    
    // Check if partner already has an active order
    if (partner.currentOrder) {
      const currentActiveOrder = await Order.findById(partner.currentOrder);
      if (currentActiveOrder && !['delivered', 'cancelled'].includes(currentActiveOrder.deliveryStatus)) {
        return res.status(400).json({
          success: false,
          message: 'You already have an active delivery. Complete it first.'
        });
      }
    }
    
    // Update order with delivery partner info
    order.deliveryAgentId = partner._id;
    order.deliveryAgentName = partner.name;
    order.deliveryAgentPhone = partner.phone;
    order.deliveryStatus = 'assigned';
    order.deliveryAssignedAt = new Date();
    
    await order.save();
    
    // Update partner stats
    partner.currentOrder = order._id;
    await partner.save();
    
    res.json({
      success: true,
      data: order,
      message: 'Order accepted successfully'
    });
  } catch (error) {
    console.error('Error accepting order:', error);
    res.status(500).json({
      success: false,
      message: 'Error accepting order',
      error: error.message
    });
  }
};

// Get delivery partner's active orders
exports.getActiveOrders = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (!partner) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'No delivery partner profile found'
      });
    }
    
    const orders = await Order.find({
      deliveryAgentId: partner._id,
      deliveryStatus: { $nin: ['delivered', 'cancelled'] }
    })
    .populate('items.menuItem')
    .sort({ deliveryAssignedAt: -1 });
    
    res.json({
      success: true,
      data: orders,
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
};

// Get delivery history
exports.getDeliveryHistory = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (!partner) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'No delivery partner profile found'
      });
    }
    
    const { limit = 20 } = req.query;
    
    const orders = await Order.find({
      deliveryAgentId: partner._id,
      deliveryStatus: 'delivered'
    })
    .populate('items.menuItem')
    .sort({ deliveredAt: -1 })
    .limit(parseInt(limit));
    
    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    console.error('Error fetching delivery history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching delivery history',
      error: error.message
    });
  }
};

// Update location
exports.updateLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }
    
    let partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (!partner) {
      // Create partner if doesn't exist
      partner = await DeliveryPartner.create({
        firebaseUid: req.user.uid,
        name: req.user.name || 'Delivery Partner',
        phone: req.user.phone || '',
        email: req.user.email || '',
        vehicleType: 'bike',
        currentLocation: {
          lat,
          lng,
          updatedAt: new Date()
        }
      });
    } else {
      partner.currentLocation = {
        lat,
        lng,
        updatedAt: new Date()
      };
      await partner.save();
    }
    
    res.json({
      success: true,
      message: 'Location updated successfully'
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating location',
      error: error.message
    });
  }
};

// Get earnings summary
exports.getEarnings = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (!partner) {
      return res.json({
        success: true,
        data: {
          totalEarnings: 0,
          todayEarnings: 0,
          weekEarnings: 0,
          monthEarnings: 0,
          totalDeliveries: 0,
          rating: 5,
          earningsHistory: []
        }
      });
    }
    
    // Calculate today's earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayEarnings = await Order.aggregate([
      {
        $match: {
          deliveryAgentId: partner._id,
          deliveryStatus: 'delivered',
          deliveredAt: { $gte: today }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $multiply: ['$total', 0.2] } } // 20% commission
        }
      }
    ]);
    
    // Calculate this week's earnings
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEarnings = await Order.aggregate([
      {
        $match: {
          deliveryAgentId: partner._id,
          deliveryStatus: 'delivered',
          deliveredAt: { $gte: weekStart }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $multiply: ['$total', 0.2] } }
        }
      }
    ]);
    
    // Calculate this month's earnings
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthEarnings = await Order.aggregate([
      {
        $match: {
          deliveryAgentId: partner._id,
          deliveryStatus: 'delivered',
          deliveredAt: { $gte: monthStart }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $multiply: ['$total', 0.2] } }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        totalEarnings: partner.totalEarnings,
        todayEarnings: todayEarnings[0]?.total || 0,
        weekEarnings: weekEarnings[0]?.total || 0,
        monthEarnings: monthEarnings[0]?.total || 0,
        totalDeliveries: partner.totalDeliveries,
        rating: partner.rating,
        earningsHistory: partner.earnings.slice(-10).reverse() // Last 10 earnings
      }
    });
  } catch (error) {
    console.error('Error fetching earnings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching earnings',
      error: error.message
    });
  }
};

// Update bank details
exports.updateBankDetails = async (req, res) => {
  try {
    const { accountNumber, ifscCode, accountHolder } = req.body;
    
    if (!accountNumber || !ifscCode || !accountHolder) {
      return res.status(400).json({
        success: false,
        message: 'All bank details are required'
      });
    }
    
    let partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (!partner) {
      // Create partner if doesn't exist
      partner = await DeliveryPartner.create({
        firebaseUid: req.user.uid,
        name: req.user.name || 'Delivery Partner',
        phone: req.user.phone || '',
        email: req.user.email || '',
        vehicleType: 'bike',
        bankDetails: {
          accountNumber,
          ifscCode,
          accountHolder
        }
      });
    } else {
      partner.bankDetails = {
        accountNumber,
        ifscCode,
        accountHolder
      };
      await partner.save();
    }
    
    res.json({
      success: true,
      message: 'Bank details updated successfully'
    });
  } catch (error) {
    console.error('Error updating bank details:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating bank details',
      error: error.message
    });
  }
};

// Assign delivery agent to order (for admin use)
exports.assignDeliveryAgent = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { agentId, agentName, agentPhone } = req.body;
    
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Assign agent using the method from Order model
    order.deliveryAgentId = agentId;
    order.deliveryAgentName = agentName;
    order.deliveryAgentPhone = agentPhone;
    order.deliveryStatus = 'assigned';
    order.deliveryAssignedAt = new Date();
    
    await order.save();
    
    res.json({
      success: true,
      data: order,
      message: 'Delivery agent assigned successfully'
    });
  } catch (error) {
    console.error('Error assigning delivery agent:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning delivery agent',
      error: error.message
    });
  }
};