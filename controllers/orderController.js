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
    const platformFee = subtotal * 0.03;
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
      deliveryAgent: req.user.uid   // 👈 AGENT UID
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    if (order.deliveryOtp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    order.status = "delivered";
    order.otpVerified = true;
    order.deliveredAt = new Date();

    await order.save();

    res.json({
      success: true,
      message: "Order delivered successfully"
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: "OTP verification failed",
      error: error.message
    });
  }
};


// Helper function to calculate delivery charge
function calculateDeliveryCharge(address) {
  if (!address || !address.lat || !address.lng) {
    return 0;
  }
  
  // Simplified calculation - in production, use proper distance calculation
  const restaurantLocation = { lat: 20.6952266, lng: 83.488972 };
  const distance = calculateDistance(
    restaurantLocation.lat,
    restaurantLocation.lng,
    address.lat,
    address.lng
  );
  
  if (distance <= 0.5) return 20;
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

// Add this function to your orderController.js
exports.createRazorpayOrder = async (req, res) => {
  try {
    console.log('Creating Razorpay order...');
    console.log('Amount received:', req.body.amount);
    
    const { amount, receipt } = req.body;
    
    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }
    
    // Convert amount to paise
    const amountInPaise = Math.round(amount * 100);
    
    // Check if Razorpay is configured
    if (!process.env.RZP_KEY_ID || !process.env.RZP_KEY_SECRET) {
      console.error('Razorpay keys not configured');
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured'
      });
    }
    
    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({
      key_id: process.env.RZP_KEY_ID,
      key_secret: process.env.RZP_KEY_SECRET
    });
    
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: receipt || 'receipt_' + Date.now(),
      notes: {
        userId: req.user.uid,
        orderType: 'food_delivery'
      }
    };
    
    console.log('Creating Razorpay order with options:', options);
    
    const order = await razorpay.orders.create(options);
    
    console.log('Razorpay order created:', order.id);
    
    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });
    
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
};

// In your update-payment endpoint (add this in orderController.js)
exports.updatePayment = async (req, res) => {
  try {
    const { paymentId, razorpayOrderId, razorpaySignature, status, paymentStatus } = req.body;
    
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          paymentId,
          razorpayOrderId,
          razorpaySignature,
          status: status || 'confirmed',
          paymentStatus: paymentStatus || 'paid'  // Update payment status
        }
      },
      { new: true }
    );

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
      message: 'Error updating payment',
      error: error.message
    });
  }
};

// Verify and update payment status
exports.verifyAndUpdatePayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    
    console.log('🔍 Verifying payment for order:', req.params.id);
    console.log('Payment ID:', razorpay_payment_id);
    console.log('Order ID:', razorpay_order_id);

    // Validate required fields
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification parameters'
      });
    }

    // Find the order
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify the user owns this order
    if (order.userId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this order'
      });
    }

    // Verify the payment signature
    const crypto = require('crypto');
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RZP_KEY_SECRET)
      .update(body)
      .digest('hex');
    
    const isSignatureValid = expectedSignature === razorpay_signature;
    
    if (!isSignatureValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Update the order with payment details
    order.paymentId = razorpay_payment_id;
    order.razorpayOrderId = razorpay_order_id;
    order.razorpaySignature = razorpay_signature;
    order.paymentStatus = 'paid'; // CRITICAL: Update payment status
    order.status = 'confirmed'; // Also update order status
    
    await order.save();

    console.log('✅ Payment verified and order updated successfully');
    
    res.json({
      success: true,
      message: 'Payment verified and order confirmed',
      data: order
    });

  } catch (error) {
    console.error('❌ Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying payment',
      error: error.message
    });
  }
};

// 🔹 Get assigned orders (Delivery Agent)
exports.getAssignedOrdersForAgent = async (req, res) => {
  try {
    const agentId = req.user.uid;

    const orders = await Order.find({
      deliveryAgent: agentId,
      status: { $in: ["assigned", "out_for_delivery"] }
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching assigned orders"
    });
  }
};
