const mongoose = require('mongoose');

const deliveryAgentSchema = new mongoose.Schema({
  firebaseUid: { 
    type: String, 
    required: true, 
    unique: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  phone: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['online', 'offline', 'busy', 'on_delivery'], 
    default: 'offline' 
  },
  currentLocation: {
    lat: { type: Number, default: 20.6952266 },
    lng: { type: Number, default: 83.488972 }
  },
  vehicleInfo: {
    type: String,
    default: 'Bike'
  },
  licenseNumber: String,
  isAvailable: { 
    type: Boolean, 
    default: true 
  },
  
  // Stats
  totalDeliveries: { 
    type: Number, 
    default: 0 
  },
  completedDeliveries: {
    type: Number,
    default: 0
  },
  totalEarnings: { 
    type: Number, 
    default: 0 
  },
  rating: { 
    type: Number, 
    default: 5.0,
    min: 0,
    max: 5 
  },
  totalRatings: {
    type: Number,
    default: 0
  },
  
  // Today's stats
  todayStats: {
    deliveries: { 
      type: Number, 
      default: 0 
    },
    earnings: { 
      type: Number, 
      default: 0 
    },
    startTime: Date,
    endTime: Date
  },
  
  // Performance metrics
  averageDeliveryTime: { // in minutes
    type: Number,
    default: 30
  },
  successRate: { // percentage
    type: Number,
    default: 100
  },
  
  // Current assignment
  currentOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  
  // Bank details for payments
  bankDetails: {
    accountNumber: String,
    accountName: String,
    bankName: String,
    ifscCode: String
  },
  
  // Documents
  documents: {
    aadharVerified: { type: Boolean, default: false },
    licenseVerified: { type: Boolean, default: false },
    vehicleVerified: { type: Boolean, default: false }
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Update the updatedAt field on save
deliveryAgentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Auto-calculate rating if totalRatings changed
  if (this.totalRatings > 0 && this.isModified('totalRatings')) {
    this.rating = (this.rating * (this.totalRatings - 1) + this.rating) / this.totalRatings;
  }
  
  next();
});

// Indexes
deliveryAgentSchema.index({ status: 1 });
deliveryAgentSchema.index({ isAvailable: 1 });
deliveryAgentSchema.index({ currentLocation: '2dsphere' });

// Method to update location
deliveryAgentSchema.methods.updateLocation = function(lat, lng) {
  this.currentLocation = { lat, lng };
  return this.save();
};

// Method to go online
deliveryAgentSchema.methods.goOnline = function() {
  this.status = 'online';
  this.isAvailable = true;
  this.todayStats.startTime = new Date();
  return this.save();
};

// Method to go offline
deliveryAgentSchema.methods.goOffline = function() {
  this.status = 'offline';
  this.isAvailable = false;
  this.currentOrderId = null;
  this.todayStats.endTime = new Date();
  return this.save();
};

// Method to accept order
deliveryAgentSchema.methods.acceptOrder = function(orderId) {
  this.status = 'on_delivery';
  this.isAvailable = false;
  this.currentOrderId = orderId;
  return this.save();
};

// Method to complete delivery
deliveryAgentSchema.methods.completeDelivery = function(earnings) {
  this.status = 'online';
  this.isAvailable = true;
  this.currentOrderId = null;
  
  // Update stats
  this.totalDeliveries += 1;
  this.completedDeliveries += 1;
  this.todayStats.deliveries += 1;
  this.totalEarnings += earnings;
  this.todayStats.earnings += earnings;
  
  return this.save();
};

// Method to calculate today's earnings
deliveryAgentSchema.methods.getTodayEarnings = function() {
  return this.todayStats.earnings;
};

// Static method to find available agents near location
deliveryAgentSchema.statics.findAvailableAgents = function(lat, lng, maxDistance = 5000) { // 5km
  return this.find({
    isAvailable: true,
    status: 'online',
    currentLocation: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [lng, lat]
        },
        $maxDistance: maxDistance
      }
    }
  }).limit(5);
};

module.exports = mongoose.model('DeliveryAgent', deliveryAgentSchema);