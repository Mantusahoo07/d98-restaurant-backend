const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const deliveryAgentSchema = new mongoose.Schema({
  agentId: {
    type: String,
    unique: true,
    default: function() {
      return 'AGT' + Date.now().toString().slice(-8);
    }
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  vehicleNumber: {
    type: String,
    default: '',
    trim: true
  },
  vehicleType: {
    type: String,
    enum: ['bike', 'scooter', 'bicycle', 'car'],
    default: 'bike'
  },
  status: {
    type: String,
    enum: ['available', 'busy', 'offline'],
    default: 'available'
  },
  isActive: {
    type: Boolean,
    default: false
  },
  ordersDelivered: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  ratingCount: {
    type: Number,
    default: 0
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Hash password before saving
deliveryAgentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
deliveryAgentSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
deliveryAgentSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Update rating when new rating is added
deliveryAgentSchema.methods.updateRating = function(newRating) {
  const totalRating = (this.rating * this.ratingCount) + newRating;
  this.ratingCount += 1;
  this.rating = totalRating / this.ratingCount;
};

module.exports = mongoose.model('DeliveryAgent', deliveryAgentSchema);