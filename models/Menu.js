const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },

  description: { type: String, required: true },

  price: { type: Number, required: true, min: 0 },

  // ❗ remove ENUM so dynamic categories work
  category: { type: String, required: true },

  type: {
    type: String,
    required: true,
    enum: ['veg', 'nonveg', 'egg']
  },

  image: { type: String, required: true },

  available: { type: Boolean, default: true },

  ingredients: [String],

  preparationTime: { type: Number, default: 15 },

  spicyLevel: {
    type: String,
    enum: ['mild', 'medium', 'hot'],
    default: 'medium'
  }
}, { timestamps: true });

module.exports = mongoose.model('Menu', menuSchema);
