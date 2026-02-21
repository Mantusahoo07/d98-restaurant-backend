const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
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
  lng: Number,
  isDefault: {
    type: Boolean,
    default: false
  }
});

const userSchema = new mongoose.Schema({
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
  phone: String,
  profileImage: {
    type: String,
    default: null
  },
  addresses: [addressSchema],
  preferences: {
    notifications: {
      type: String,
      enum: ['all', 'orders_only', 'none'],
      default: 'all'
    },
    favoriteCategories: [String]
  },
  loyaltyPoints: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});
module.exports = mongoose.model('User', userSchema);
