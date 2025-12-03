const Order = require('../models/Order');
const Menu = require('../models/Menu');

// Create new order
exports.createOrder = async (req, res) => {
  try {
    const { items, address, paymentMethod, customerInfo } = req.body;
    
    // Calculate totals
    let subtotal = 0;
    const orderItems = [];
    
    for (const item of items) {
      const menuItem = await Menu.findById(item.menuItemId);
      if (!menuItem) {
        return res.status(400).json({
          success: false,
          message: `Menu item not found: ${item.menuItemId}`
        });
      }
      
      const itemTotal = menuItem.price * item.quantity;
      subtotal += itemTotal;
      
      orderItems.push({
        menuItem: menuItem._id,
        quantity: item.quantity,
        price: menuItem.price,
        name: menuItem.name
      });
    }
    
    const deliveryCharge = calculateDeliveryCharge(address);
    const platformFee = subtotal * 0.02;
    const gst = subtotal * 0.05;
    const total = subtotal + deliveryCharge + platformFee + gst;
    
    // Generate OTP
    const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
    
    const order = new Order({
      userId: req.user.uid,
      customerName: customerInfo.name,
      customerEmail: customerInfo.email,
      customerPhone: customerInfo.phone,
      items: orderItems,
      subtotal,
      deliveryCharge,
      platformFee,
      gst,
      total,
      address,
      paymentMethod,
      deliveryOtp,
      estimatedDelivery: new Date(Date.now() + 45 * 60000) // 45 minutes from now
    });
    
    await order.save();
    
    res.status(201).json({
      success: true,
      data: order
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
};

// Get user orders
exports.getUserOrders = async (req, res) => {
  try {
    const { status } = req.query;
    
    let filter = { userId: req.user.uid };
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    const orders = await Order.find(filter)
      .populate('items.menuItem')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
};

// Get order by ID
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      userId: req.user.uid
    }).populate('items.menuItem');
    
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
      message: 'Error fetching order',
      error: error.message
    });
  }
};

// Update order status (Admin only)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('items.menuItem');
    
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
    res.status(400).json({
      success: false,
      message: 'Error updating order',
      error: error.message
    });
  }
};

// Verify delivery OTP
exports.verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    
    const order = await Order.findOne({
      _id: req.params.id,
      userId: req.user.uid
    });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    if (order.deliveryOtp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }
    
    order.otpVerified = true;
    order.status = 'delivered';
    order.deliveredAt = new Date();
    await order.save();
    
    res.json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error verifying OTP',
      error: error.message
    });
  }
};

// Helper function to calculate delivery charge
function calculateDeliveryCharge(address) {
  if (!address || !address.lat || !address.lng) {
    return 40;
  }
  
  // Simplified calculation - in production, use proper distance calculation
  const restaurantLocation = { lat: 28.6139, lng: 77.2090 };
  const distance = calculateDistance(
    restaurantLocation.lat,
    restaurantLocation.lng,
    address.lat,
    address.lng
  );
  
  if (distance <= 0.5) return 10;
  if (distance <= 1) return 20;
  if (distance <= 10) return 20 + Math.ceil(distance - 1) * 10;
  return 60;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RZP_KEY_ID,
  key_secret: process.env.RZP_KEY_SECRET
});

exports.createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    const options = {
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: "D98_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      orderId: order.id
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Razorpay order creation failed",
      error: error.message
    });
  }
};
