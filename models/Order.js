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
    required: true,
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
  deliveredAt: Date
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