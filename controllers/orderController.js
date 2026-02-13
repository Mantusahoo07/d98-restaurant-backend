const Order = require('../models/Order');
const Menu = require('../models/Menu');
const Razorpay = require('razorpay');
const { createNotification } = require('../routes/notifications'); // Add this line

// Initialize Razorpay - FIXED: No initialization at bottom
let razorpayInstance = null;

// Function to initialize Razorpay lazily
const getRazorpayInstance = () => {
  if (!razorpayInstance) {
    if (process.env.RZP_KEY_ID && process.env.RZP_KEY_SECRET) {
      razorpayInstance = new Razorpay({
        key_id: process.env.RZP_KEY_ID,
        key_secret: process.env.RZP_KEY_SECRET
      });
      console.log('✅ Razorpay initialized successfully');
    } else {
      console.warn('⚠️ Razorpay keys not configured');
    }
  }
  return razorpayInstance;
};

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
    
    // 🔔 CREATE NOTIFICATION FOR USER
    try {
      await createNotification(
        req.user.uid,
        '🎉 Order Confirmed!',
        `Your order #${order.orderId} has been placed successfully. Total: ₹${total.toFixed(2)}`,
        'order_update',
        'fa-shopping-bag',
        { orderId: order._id, status: 'pending' }
      );
      console.log('✅ Order confirmation notification sent');
    } catch (notifError) {
      console.error('❌ Failed to send notification:', notifError);
      // Don't fail the order if notification fails
    }
    
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
    
    // 🔔 CREATE NOTIFICATION FOR USER
    try {
      let title = '📦 Order Update';
      let icon = 'fa-truck';
      let message = '';
      
      switch(status) {
        case 'confirmed':
          title = '✅ Order Confirmed';
          message = `Your order #${order.orderId} has been confirmed. We'll start preparing soon!`;
          icon = 'fa-check-circle';
          break;
        case 'preparing':
          title = '👨‍🍳 Preparing Your Order';
          message = `Great news! We're preparing your order #${order.orderId}.`;
          icon = 'fa-utensils';
          break;
        case 'out_for_delivery':
          title = '🛵 Out for Delivery';
          message = `Your order #${order.orderId} is out for delivery! Delivery OTP: ${order.deliveryOtp}`;
          icon = 'fa-motorcycle';
          break;
        case 'delivered':
          title = '🎉 Order Delivered';
          message = `Your order #${order.orderId} has been delivered. Enjoy your meal!`;
          icon = 'fa-check-circle';
          break;
        case 'cancelled':
          title = '❌ Order Cancelled';
          message = `Your order #${order.orderId} has been cancelled.`;
          icon = 'fa-times-circle';
          break;
        default:
          message = `Your order #${order.orderId} status is now: ${status}`;
      }
      
      await createNotification(
        order.userId,
        title,
        message,
        'order_update',
        icon,
        { orderId: order._id, status: status }
      );
      console.log(`✅ Status update notification sent for order ${order.orderId}`);
    } catch (notifError) {
      console.error('❌ Failed to send status update notification:', notifError);
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
    
    // 🔔 CREATE DELIVERY NOTIFICATION
    try {
      await createNotification(
        order.userId,
        '🎊 Order Delivered Successfully!',
        `Your order #${order.orderId} has been delivered. Hope you enjoy your meal!`,
        'order_update',
        'fa-check-circle',
        { orderId: order._id, status: 'delivered' }
      );
    } catch (notifError) {
      console.error('❌ Failed to send delivery notification:', notifError);
    }
    
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

// Get assigned orders for delivery agent - NEW FUNCTION
exports.getAssignedOrdersForAgent = async (req, res) => {
  try {
    // This would require delivery agent authentication
    // For now, returning empty or mock data
    console.log('🛵 Getting assigned orders for delivery agent');
    
    // In a real implementation, you would:
    // 1. Get delivery agent ID from auth
    // 2. Find orders assigned to this agent
    // 3. Return those orders
    
    const orders = await Order.find({
      deliveryAgent: req.user.uid, // Assuming delivery agent has auth
      status: { $in: ['out_for_delivery', 'preparing'] }
    })
    .populate('items.menuItem')
    .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    console.error('Error fetching assigned orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assigned orders',
      error: error.message
    });
  }
};

// Create Razorpay order
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
    
    // Get Razorpay instance
    const razorpay = getRazorpayInstance();
    
    // Check if Razorpay is configured
    if (!razorpay) {
      console.error('❌ Razorpay not initialized');
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured'
      });
    }
    
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: receipt || 'receipt_' + Date.now(),
      payment_capture: 1,
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
    console.error('❌ Razorpay order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
};

// Update payment
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
          paymentStatus: paymentStatus || 'paid'
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

    // 🔔 NOTIFICATION FOR PAYMENT SUCCESS
    try {
      await createNotification(
        order.userId,
        '💳 Payment Successful',
        `Payment of ₹${order.total.toFixed(2)} for order #${order.orderId} was successful.`,
        'order_update',
        'fa-credit-card',
        { orderId: order._id, status: 'confirmed' }
      );
    } catch (notifError) {
      console.error('❌ Failed to send payment notification:', notifError);
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
    order.paymentStatus = 'paid';
    order.status = 'confirmed';
    
    await order.save();

    // 🔔 NOTIFICATION FOR PAYMENT VERIFICATION
    try {
      await createNotification(
        order.userId,
        '💳 Payment Verified',
        `Your payment of ₹${order.total.toFixed(2)} for order #${order.orderId} has been verified.`,
        'order_update',
        'fa-check-circle',
        { orderId: order._id, status: 'confirmed' }
      );
    } catch (notifError) {
      console.error('❌ Failed to send payment verification notification:', notifError);
    }

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
