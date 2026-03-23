const mongoose = require('mongoose');

const RestaurantSettingsSchema = new mongoose.Schema({
    // Simple online/offline status
    isOnline: {
        type: Boolean,
        default: false
    },
    
    // Metadata
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastUpdatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Ensure only one document exists
RestaurantSettingsSchema.statics.getSettings = async function() {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

module.exports = mongoose.model('RestaurantSettings', RestaurantSettingsSchema);
