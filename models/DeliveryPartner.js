const mongoose = require('mongoose');

const deliveryPartnerSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  email: String,
  vehicleType: {
    type: String,
    enum: ['bike', 'scooter', 'car', 'bicycle'],
    default: 'bike'
  },
  vehicleNumber: String,
  isOnline: {
    type: Boolean,
    default: false
  },
  currentLocation: {
    lat: Number,
    lng: Number,
    updatedAt: Date
  },
  rating: {
    type: Number,
    default: 5,
    min: 1,
    max: 5
  },
  totalDeliveries: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  earnings: [{
    orderId: String,
    amount: Number,
    date: Date,
    orderTotal: Number
  }],
  documents: {
    license: String,
    rc: String,
    insurance: String,
    verified: {
      type: Boolean,
      default: false
    }
  },
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolder: String
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('DeliveryPartner', deliveryPartnerSchema);