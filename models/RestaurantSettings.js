const mongoose = require('mongoose');

const RestaurantSettingsSchema = new mongoose.Schema({
    // Restaurant Status
    isOnline: {
        type: Boolean,
        default: false
    },
    autoScheduleEnabled: {
        type: Boolean,
        default: true
    },
    
    // Shift 1 - Morning/Day
    shift1Enabled: {
        type: Boolean,
        default: true
    },
    shift1Open: {
        type: String,
        default: '09:00'
    },
    shift1Close: {
        type: String,
        default: '17:00'
    },
    
    // Shift 2 - Evening/Night
    shift2Enabled: {
        type: Boolean,
        default: true
    },
    shift2Open: {
        type: String,
        default: '18:00'
    },
    shift2Close: {
        type: String,
        default: '23:00'
    },
    
    // Special Closing
    specialClosing: {
        isClosed: {
            type: Boolean,
            default: false
        },
        reason: {
            type: String,
            default: ''
        },
        closedUntil: {
            type: Date,
            default: null
        }
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
