// models/DeliverySettings.js
const mongoose = require('mongoose');

const DeliverySettingsSchema = new mongoose.Schema({
    maxDeliveryRadius: {
        type: Number,
        required: true,
        default: 10,
        min: 1,
        max: 50
    },
    baseDeliveryCharge: {
        type: Number,
        required: true,
        default: 20,
        min: 0
    },
    additionalChargePerKm: {
        type: Number,
        required: true,
        default: 10,
        min: 0
    },
    freeDeliveryWithin5kmThreshold: {
        type: Number,
        required: true,
        default: 999,
        min: 0
    },
    freeDeliveryUpto10kmThreshold: {
        type: Number,
        required: true,
        default: 1499,
        min: 0
    },
    platformFeePercent: {
        type: Number,
        required: true,
        default: 3,
        min: 0,
        max: 10
    },
    gstPercent: {
        type: Number,
        required: true,
        default: 5,
        min: 0,
        max: 18
    },
    restaurantLocation: {
        lat: {
            type: Number,
            required: true,
            default: 20.6952266
        },
        lng: {
            type: Number,
            required: true,
            default: 83.488972
        }
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Ensure only one document exists
DeliverySettingsSchema.statics.getSettings = async function() {
    let settings = await this.findOne();
    
    if (!settings) {
        settings = await this.create({});
    }
    
    return settings;
};

DeliverySettingsSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('DeliverySettings', DeliverySettingsSchema);
