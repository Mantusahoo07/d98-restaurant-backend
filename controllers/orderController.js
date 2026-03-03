const Order = require('../models/Order');
const Menu = require('../models/Menu');
const Razorpay = require('razorpay');
const DeliverySettings = require('../models/DeliverySettings');
const crypto = require('crypto');
const routeService = require('../services/routeService');

// ==================== ROUTE SERVICE (OpenRouteService) ====================
class RouteService {
  constructor() {
    this.apiKey = process.env.ORS_API_KEY || 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6Ijc5YzI1OGNjMGVhYTRmNWZhYWQ1ZWRiZWE1NzFjOTZkIiwiaCI6Im11cm11cjY0In0=';
    this.cache = new Map(); // Simple in-memory cache
    this.dailyCallCount = 0;
    this.maxDailyCalls = 1900; // Leave buffer of 100 calls
  }

  /**
   * Get road distance between two points using OpenRouteService
   */
  async getRoadDistance(lat1, lng1, lat2, lng2) {
    try {
      // Check cache first (round to 4 decimals ~11 meters)
      const cacheKey = this.getCacheKey(lat1, lng1, lat2, lng2);
      if (this.cache.has(cacheKey)) {
        console.log('📦 Using cached road distance');
        return {
          distance: this.cache.get(cacheKey),
          source: 'cache'
        };
      }

      // Check daily limit
      this.dailyCallCount++;
      if (this.dailyCallCount > this.maxDailyCalls) {
        console.warn('⚠️ Approaching daily API limit, using fallback');
        const fallbackDistance = this.calculateStraightLine(lat1, lng1, lat2, lng2);
        return {
          distance: fallbackDistance,
          source: 'fallback-straight-line',
          warning: 'API limit reached'
        };
      }

      // Call OpenRouteService API
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${this.apiKey}&start=${lng1},${lat1}&end=${lng2},${lat2}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.features && data.features[0]) {
        const distanceInKm = data.features[0].properties.segments[0].distance / 1000; // Convert meters to km
        
        // Cache the result (expire after 24 hours)
        this.cache.set(cacheKey, distanceInKm);
        setTimeout(() => this.cache.delete(cacheKey), 24 * 60 * 60 * 1000);
        
        console.log(`✅ ORS road distance: ${distanceInKm.toFixed(2)} km`);
        return {
          distance: distanceInKm,
          source: 'ors'
        };
      } else {
        console.warn('⚠️ ORS routing failed, using straight-line fallback');
        const fallbackDistance = this.calculateStraightLine(lat1, lng1, lat2, lng2);
        return {
          distance: fallbackDistance,
          source: 'fallback-straight-line'
        };
      }
    } catch (error) {
      console.error('❌ ORS API error:', error.message);
      const fallbackDistance = this.calculateStraightLine(lat1, lng1, lat2, lng2);
      return {
        distance: fallbackDistance,
        source: 'fallback-straight-line',
        error: error.message
      };
    }
  }

  /**
   * Calculate straight-line distance (fallback)
   */
  calculateStraightLine(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Generate cache key for coordinates
   */
  getCacheKey(lat1, lng1, lat2, lng2) {
    const p1 = `${lat1.toFixed(4)},${lng1.toFixed(4)}`;
    const p2 = `${lat2.toFixed(4)},${lng2.toFixed(4)}`;
    return `${p1}:${p2}`;
  }

  /**
   * Reset daily call count (call this at midnight)
   */
  resetDailyCount() {
    this.dailyCallCount = 0;
    console.log('📊 ORS daily call count reset');
  }
}


// Reset counter at midnight (if server runs continuously)
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    routeService.resetDailyCount();
  }
}, 60 * 1000); // Check every minute

// ==================== RAZORPAY INITIALIZATION ====================
let razorpayInstance = null;

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

// ==================== ORDER CONTROLLER FUNCTIONS ====================

// Create new order
exports.createOrder = async (req, res) => {
  try {
    console.log('📦 Creating order with data:', JSON.stringify(req.body, null, 2));
    
    const { items, address, paymentMethod, customerInfo, orderId, deliveryOtp, total, subtotal, deliveryCharge, platformFee, gst, paymentId, razorpayOrderId, razorpaySignature, paymentStatus } = req.body;
    
    // Process order items
    let orderItems = [];
    let calculatedSubtotal = 0;
    
    for (const item of items) {
      if (item.name && item.price) {
        orderItems.push({
          menuItem: item.menuItemId || null,
          quantity: item.quantity,
          price: item.price,
          name: item.name,
          instruction: item.instruction || ''
        });
        calculatedSubtotal += item.price * item.quantity;
      } else {
        try {
          const menuItem = await Menu.findById(item.menuItemId);
          if (menuItem) {
            orderItems.push({
              menuItem: menuItem._id,
              quantity: item.quantity,
              price: menuItem.price,
              name: menuItem.name,
              instruction: item.instruction || ''
            });
            calculatedSubtotal += menuItem.price * item.quantity;
          } else {
            orderItems.push({
              menuItem: null,
              quantity: item.quantity,
              price: item.price || 0,
              name: item.name || 'Unknown Item',
              instruction: item.instruction || ''
            });
            calculatedSubtotal += (item.price || 0) * item.quantity;
          }
        } catch (dbError) {
          console.error('Error fetching menu item:', dbError);
          orderItems.push({
            menuItem: null,
            quantity: item.quantity,
            price: item.price || 0,
            name: item.name || 'Unknown Item',
            instruction: item.instruction || ''
          });
          calculatedSubtotal += (item.price || 0) * item.quantity;
        }
      }
    }
    
    const finalSubtotal = subtotal || calculatedSubtotal;
    
    // Calculate delivery charge using road distance
    let finalDeliveryCharge = deliveryCharge;
    if (!finalDeliveryCharge && finalDeliveryCharge !== 0) {
      finalDeliveryCharge = await calculateDeliveryCharge(address, finalSubtotal);
    }
    
    if (finalDeliveryCharge === -1) {
      return res.status(400).json({
        success: false,
        message: 'Delivery not available to this address. Address is beyond our delivery radius.'
      });
    }
    
    const finalPlatformFee = platformFee || (finalSubtotal * 0.03);
    const finalGst = gst || (finalSubtotal * 0.05);
    const finalTotal = total || (finalSubtotal + finalDeliveryCharge + finalPlatformFee + finalGst);
    const finalDeliveryOtp = deliveryOtp || Math.floor(1000 + Math.random() * 9000).toString();
    
    console.log(`📝 Setting order status to: pending (forced - overriding frontend)`);
    
    const order = new Order({
      orderId: orderId || ('D98' + Date.now().toString().slice(-8)),
      userId: req.user.uid,
      customerName: customerInfo?.name || req.body.customerName || 'Customer',
      customerEmail: customerInfo?.email || req.body.customerEmail || req.user.email,
      customerPhone: customerInfo?.phone || req.body.customerPhone || '',
      items: orderItems,
      subtotal: finalSubtotal,
      deliveryCharge: finalDeliveryCharge,
      platformFee: finalPlatformFee,
      gst: finalGst,
      total: finalTotal,
      address: address || req.body.address,
      paymentMethod: paymentMethod || 'online',
      paymentId: paymentId || req.body.paymentId,
      razorpayOrderId: razorpayOrderId || req.body.razorpayOrderId,
      razorpaySignature: razorpaySignature || req.body.razorpaySignature,
      paymentStatus: paymentStatus || 'paid',
      status: 'pending',
      deliveryOtp: finalDeliveryOtp,
      estimatedDelivery: new Date(Date.now() + 45 * 60000)
    });
    
    await order.save();
    
    console.log('✅ Order created successfully:', order._id, 'Status:', order.status);
    console.log('💰 Delivery charge applied:', finalDeliveryCharge);
    
    res.status(201).json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(400).json({
      success: false,
      message: 'Error creating order',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

// Get assigned orders for delivery agent
exports.getAssignedOrdersForAgent = async (req, res) => {
  try {
    console.log('🛵 Getting assigned orders for delivery agent');
    
    const orders = await Order.find({
      deliveryAgent: req.user.uid,
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
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }
    
    const amountInPaise = Math.round(amount * 100);
    const razorpay = getRazorpayInstance();
    
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
    const { paymentId, razorpayOrderId, razorpaySignature, paymentStatus } = req.body;
    
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          paymentId,
          razorpayOrderId,
          razorpaySignature,
          status: 'pending',
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
    
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification parameters'
      });
    }

    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.userId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this order'
      });
    }

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

    order.paymentId = razorpay_payment_id;
    order.razorpayOrderId = razorpay_order_id;
    order.razorpaySignature = razorpay_signature;
    order.paymentStatus = 'paid';
    order.status = 'pending';
    
    await order.save();

    console.log('✅ Payment verified and order created with pending status');
    
    res.json({
      success: true,
      message: 'Payment verified and order pending',
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

// ==================== DELIVERY CHARGE CALCULATION WITH ROAD DISTANCE ====================

async function calculateDeliveryCharge(address, subtotal = 0) {
  try {
    if (!address || !address.lat || !address.lng) {
      return 0;
    }
    
    const settings = await DeliverySettings.findOne();
    if (!settings) return 20;
    
    const restaurantLocation = settings.restaurantLocation || { lat: 20.6952266, lng: 83.488972 };
    
    // Get road distance (with fallback to straight-line)
    const routeResult = await routeService.getRoadDistance(
      restaurantLocation.lat,
      restaurantLocation.lng,
      address.lat,
      address.lng
    );
    
    const distance = routeResult.distance;
    
    console.log(`📍 Distance used: ${distance.toFixed(2)} km (${routeResult.source})`);
    
    // Check if within delivery radius
    if (distance > settings.maxDeliveryRadius) {
      return -1;
    }
    
    // Calculate delivery charge
    let deliveryCharge = settings.baseDeliveryCharge || 20;
    
    if (distance > 1) {
      const additionalKms = Math.ceil(distance - 1);
      deliveryCharge += additionalKms * (settings.additionalChargePerKm || 10);
    }
    
    // Apply free delivery thresholds
    if (distance <= 5 && subtotal >= (settings.freeDeliveryWithin5kmThreshold || 999)) {
      deliveryCharge = 0;
    } else if (distance <= settings.maxDeliveryRadius && subtotal >= (settings.freeDeliveryUpto10kmThreshold || 1499)) {
      deliveryCharge = 0;
    }
    
    return deliveryCharge;
    
  } catch (error) {
    console.error('Error calculating delivery charge:', error);
    return 20;
  }
}

// ==================== ORDER TOTALS CALCULATION ====================

exports.calculateOrderTotals = async (req, res) => {
  try {
    const { subtotal, address } = req.body;
    
    if (!subtotal || !address) {
      return res.status(400).json({
        success: false,
        message: 'Subtotal and address are required'
      });
    }
    
    const deliveryCharge = await calculateDeliveryCharge(address, subtotal);
    
    if (deliveryCharge === -1) {
      return res.json({
        success: true,
        deliverable: false,
        message: 'Delivery not available to this address'
      });
    }
    
    const settings = await DeliverySettings.findOne() || {};
    
    const platformFeePercent = (settings.platformFeePercent || 3) / 100;
    const gstPercent = (settings.gstPercent || 5) / 100;
    
    const platformFee = subtotal * platformFeePercent;
    const gst = subtotal * gstPercent;
    const total = subtotal + deliveryCharge + platformFee + gst;
    
    res.json({
      success: true,
      deliverable: true,
      breakdown: {
        subtotal: parseFloat(subtotal.toFixed(2)),
        deliveryCharge: parseFloat(deliveryCharge.toFixed(2)),
        platformFee: parseFloat(platformFee.toFixed(2)),
        gst: parseFloat(gst.toFixed(2)),
        total: parseFloat(total.toFixed(2))
      }
    });
    
  } catch (error) {
    console.error('Error calculating totals:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating totals',
      error: error.message
    });
  }
};
// Calculate road distance for display
exports.calculateRoadDistance = async (req, res) => {
    try {
        const { restaurantLat, restaurantLng, customerLat, customerLng } = req.body;
        
        if (!restaurantLat || !restaurantLng || !customerLat || !customerLng) {
            return res.status(400).json({
                success: false,
                message: 'Missing coordinates'
            });
        }
        
        const routeService = require('../services/routeService');
        
        const result = await routeService.getRoadDistance(
            parseFloat(restaurantLat), 
            parseFloat(restaurantLng),
            parseFloat(customerLat), 
            parseFloat(customerLng)
        );
        
        res.json({
            success: true,
            ...result
        });
        
    } catch (error) {
        console.error('Error calculating road distance:', error);
        res.status(500).json({
            success: false,
            message: 'Error calculating distance',
            error: error.message
        });
    }
};
