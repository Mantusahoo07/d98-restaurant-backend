const DeliveryPartner = require('../models/DeliveryPartner');
const Order = require('../models/Order');
const User = require('../models/User');

// Get delivery partner profile
exports.getProfile = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Delivery partner not found'
      });
    }
    
    res.json({
      success: true,
      data: partner
    });
  } catch (error) {
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
        email: req.user.email,
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
    
    const partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Delivery partner not found'
      });
    }
    
    partner.isOnline = isOnline !== undefined ? isOnline : !partner.isOnline;
    
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
      paymentStatus: 'paid'
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
    if (!['confirmed', 'preparing'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order is not available for delivery'
      });
    }
    
    // Update order with delivery partner info
    order.status = 'out_for_delivery';
    order.deliveryPartner = {
      firebaseUid: req.user.uid,
      name: partner.name,
      phone: partner.phone
    };
    order.deliveryAssignedAt = new Date();
    
    await order.save();
    
    // Update partner stats
    partner.currentOrder = orderId;
    
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
    const orders = await Order.find({
      'deliveryPartner.firebaseUid': req.user.uid,
      status: 'out_for_delivery'
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
    const { startDate, endDate, limit = 20 } = req.query;
    
    let filter = {
      'deliveryPartner.firebaseUid': req.user.uid,
      status: 'delivered'
    };
    
    // Add date filter if provided
    if (startDate || endDate) {
      filter.deliveredAt = {};
      if (startDate) filter.deliveredAt.$gte = new Date(startDate);
      if (endDate) filter.deliveredAt.$lte = new Date(endDate);
    }
    
    const orders = await Order.find(filter)
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
    
    const partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Delivery partner not found'
      });
    }
    
    partner.currentLocation = {
      lat,
      lng,
      updatedAt: new Date()
    };
    
    await partner.save();
    
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
      return res.status(404).json({
        success: false,
        message: 'Delivery partner not found'
      });
    }
    
    // Calculate today's earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayEarnings = await Order.aggregate([
      {
        $match: {
          'deliveryPartner.firebaseUid': req.user.uid,
          status: 'delivered',
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
          'deliveryPartner.firebaseUid': req.user.uid,
          status: 'delivered',
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
          'deliveryPartner.firebaseUid': req.user.uid,
          status: 'delivered',
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
    
    const partner = await DeliveryPartner.findOne({ firebaseUid: req.user.uid });
    
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Delivery partner not found'
      });
    }
    
    partner.bankDetails = {
      accountNumber,
      ifscCode,
      accountHolder
    };
    
    await partner.save();
    
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