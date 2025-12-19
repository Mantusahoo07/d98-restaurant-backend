const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  name: String
});

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: false,
    unique: true
  },
  userId: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  items: [orderItemSchema],
  subtotal: {
    type: Number,
    required: true
  },
  deliveryCharge: {
    type: Number,
    required: true
  },
  platformFee: {
    type: Number,
    required: true
  },
  gst: {
    type: Number,
    required: true
  },
  total: {
    type: Number,
    required: true
  },
  address: {
    name: String,
    firstName: String,
    lastName: String,
    phone: String,
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String,
    lat: Number,
    lng: Number
  },
  paymentMethod: {
    type: String,
    enum: ['online', 'cod'],
    default: 'online'
  },
  paymentId: String,
  razorpayOrderId: String,
  razorpaySignature: String,
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  
  // ========== DELIVERY AGENT FIELDS ==========
  deliveryAgentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryPartner'
  },
  deliveryAgentName: String,
  deliveryAgentPhone: String,
  
  // Delivery timestamps
  deliveryAssignedAt: Date,
  pickedAt: Date,
  outForDeliveryAt: Date,
  arrivedAtCustomerAt: Date,
  deliveredAt: Date,
  
  // Delivery status tracking
  deliveryStatus: {
    type: String,
    enum: [
      'pending_assignment',  // Order ready but no agent assigned
      'assigned',            // Agent assigned but not picked up
      'picked',              // Agent picked up from restaurant
      'out_for_delivery',    // On the way to customer
      'arrived_at_customer', // Reached customer location
      'delivered',           // Delivery completed
      'cancelled'            // Delivery cancelled
    ],
    default: 'pending_assignment'
  },
  
  // Main order status (keep this for backward compatibility)
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'pending'
  },
  
  deliveryOtp: {
    type: String,
    required: true
  },
  otpVerified: {
    type: Boolean,
    default: false
  },
  estimatedDelivery: Date,
  
  // Additional delivery info
  deliveryInstructions: String,
  customerRating: {
    type: Number,
    min: 1,
    max: 5
  },
  deliveryRating: {
    type: Number,
    min: 1,
    max: 5
  },
  deliveryFeedback: String,
  
  // Auto status update based on timestamps
  isLate: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Generate order ID before saving
orderSchema.pre('save', function(next) {
  if (!this.orderId) {
    this.orderId = 'D98' + Date.now().toString().slice(-8);
  }
  
  // Auto-update main status based on delivery status for backward compatibility
  if (this.deliveryStatus) {
    switch(this.deliveryStatus) {
      case 'pending_assignment':
      case 'assigned':
        this.status = 'confirmed';
        break;
      case 'picked':
        this.status = 'preparing';
        break;
      case 'out_for_delivery':
        this.status = 'out_for_delivery';
        break;
      case 'arrived_at_customer':
      case 'delivered':
        this.status = 'delivered';
        break;
      case 'cancelled':
        this.status = 'cancelled';
        break;
    }
  }
  
  // Auto-check if delivery is late (more than 60 minutes from estimated)
  if (this.estimatedDelivery && this.deliveryStatus !== 'delivered' && this.deliveryStatus !== 'cancelled') {
    const now = new Date();
    const estimated = new Date(this.estimatedDelivery);
    const delayMinutes = (now - estimated) / (1000 * 60);
    this.isLate = delayMinutes > 15; // Mark as late if >15 minutes past estimate
  }
  
  next();
});

// Index for faster queries
orderSchema.index({ deliveryStatus: 1 });
orderSchema.index({ deliveryAgentId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

// Virtual for delivery time calculation
orderSchema.virtual('deliveryTimeMinutes').get(function() {
  if (this.outForDeliveryAt && this.deliveredAt) {
    return (this.deliveredAt - this.outForDeliveryAt) / (1000 * 60); // minutes
  }
  return null;
});

// Method to check if order is ready for pickup
orderSchema.methods.isReadyForPickup = function() {
  return this.status === 'confirmed' && !this.deliveryAgentId;
};

// Method to assign delivery agent
orderSchema.methods.assignAgent = function(agentId, agentName, agentPhone) {
  this.deliveryAgentId = agentId;
  this.deliveryAgentName = agentName;
  this.deliveryAgentPhone = agentPhone;
  this.deliveryStatus = 'assigned';
  this.deliveryAssignedAt = new Date();
  
  // Update estimated delivery time (45 minutes from now)
  this.estimatedDelivery = new Date(Date.now() + 45 * 60 * 1000);
};

// Method to mark as picked up
orderSchema.methods.markAsPicked = function() {
  this.deliveryStatus = 'picked';
  this.pickedAt = new Date();
};

// Method to start delivery
orderSchema.methods.startDelivery = function() {
  this.deliveryStatus = 'out_for_delivery';
  this.outForDeliveryAt = new Date();
};

// Method to mark as arrived at customer
orderSchema.methods.arriveAtCustomer = function() {
  this.deliveryStatus = 'arrived_at_customer';
  this.arrivedAtCustomerAt = new Date();
};

// Method to complete delivery with OTP verification
orderSchema.methods.completeDelivery = function(otp) {
  if (this.deliveryOtp === otp) {
    this.deliveryStatus = 'delivered';
    this.deliveredAt = new Date();
    this.otpVerified = true;
    return true;
  }
  return false;
};

// Static method to get available orders for delivery
orderSchema.statics.getAvailableOrders = function() {
  return this.find({
    paymentStatus: 'paid',
    deliveryStatus: { $in: ['pending_assignment', 'assigned'] },
    status: { $in: ['confirmed', 'preparing'] }
  }).sort({ createdAt: 1 });
};

// Static method to get orders by delivery agent
orderSchema.statics.getOrdersByAgent = function(agentId) {
  return this.find({
    deliveryAgentId: agentId,
    deliveryStatus: { $nin: ['delivered', 'cancelled'] }
  }).sort({ deliveryStatus: 1, createdAt: 1 });
};



module.exports = mongoose.model('Order', orderSchema);