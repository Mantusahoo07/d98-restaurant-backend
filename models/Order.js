const mongoose = require('mongoose');

// models/Order.js
const orderItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu',
    required: false
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
  name: {
    type: String,
    required: true
  },
  instruction: {
    type: String,
    default: ''
  },
  // Track if this specific item was rejected
  rejected: {
    type: Boolean,
    default: false
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  // Suggested replacement
  suggestedItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu'
  },
  suggestedItemName: {
    type: String,
    default: ''
  },
  suggestedItemPrice: {
    type: Number,
    default: 0
  }
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
  deliveryAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAgent',
    default: null
  },
  
  assignedAt: Date,
  
  paymentId: String,
  razorpayOrderId: String,
  razorpaySignature: String,
  
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  
status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'assigned', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'],
    default: 'pending'
}
  
  // Track if order has been rejected
  rejectionReason: {
    type: String,
    default: ''
  },
  
  // Track rejected items with suggestions
  rejectedItems: [{
    itemId: String,
    itemName: String,
    reason: String,
    suggestedItem: {
      itemId: String,
      name: String,
      price: Number
    }
  }],
  
  // Flag for modification status
  modificationStatus: {
    type: String,
    enum: ['none', 'pending', 'accepted', 'rejected'],
    default: 'none'
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
  deliveredAt: Date,
  
  // Notes for order
  notes: String
}, {
  timestamps: true
});

// Generate order ID before saving
orderSchema.pre('save', function(next) {
  if (!this.orderId) {
    this.orderId = 'D98' + Date.now().toString().slice(-8);
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
