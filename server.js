// models/DeliveryAgent.js - CREATE THIS NEW FILE
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
  isAvailable: { 
    type: Boolean, 
    default: true 
  },
  
  // Stats
  totalDeliveries: { 
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
  
  // Today's stats
  todayStats: {
    deliveries: { 
      type: Number, 
      default: 0 
    },
    earnings: { 
      type: Number, 
      default: 0 
    }
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
  next();
});

module.exports = mongoose.model('DeliveryAgent', deliveryAgentSchema);