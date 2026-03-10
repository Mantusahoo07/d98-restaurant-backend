// controllers/deliverySettingsController.js
const DeliverySettings = require('../models/DeliverySettings');

// Get delivery settings
exports.getDeliverySettings = async (req, res) => {
    try {
        console.log('📦 Fetching delivery settings for admin:', req.user.email);
        
        let settings = await DeliverySettings.findOne();
        
        if (!settings) {
            console.log('🆕 No delivery settings found, creating defaults...');
            // Create default settings
            settings = await DeliverySettings.create({});
            console.log('✅ Default delivery settings created');
        }
        
        console.log('✅ Delivery settings loaded successfully');
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('❌ Error fetching delivery settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching delivery settings',
            error: error.message
        });
    }
};

// Update delivery settings
exports.updateDeliverySettings = async (req, res) => {
    try {
        console.log('✏️ Updating delivery settings by:', req.user.email);
        console.log('Request body:', req.body);
        
        const {
            maxDeliveryRadius,
            baseDeliveryCharge,
            additionalChargePerKm,
            freeDeliveryWithin5kmThreshold,
            freeDeliveryUpto10kmThreshold,
            platformFeePercent,
            gstPercent,
            restaurantLat,
            restaurantLng
        } = req.body;
        
        // Validate required fields
        if (!maxDeliveryRadius || maxDeliveryRadius <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Maximum delivery radius is required'
            });
        }
        
        if (maxDeliveryRadius > 50) {
            return res.status(400).json({
                success: false,
                message: 'Maximum delivery radius cannot exceed 50km'
            });
        }
        
        let settings = await DeliverySettings.findOne();
        
        if (!settings) {
            // Create new settings
            settings = await DeliverySettings.create({
                maxDeliveryRadius,
                baseDeliveryCharge: baseDeliveryCharge || 20,
                additionalChargePerKm: additionalChargePerKm || 10,
                freeDeliveryWithin5kmThreshold: freeDeliveryWithin5kmThreshold || 999,
                freeDeliveryUpto10kmThreshold: freeDeliveryUpto10kmThreshold || 1499,
                platformFeePercent: platformFeePercent || 3,
                gstPercent: gstPercent || 5,
                restaurantLocation: {
                    lat: restaurantLat || 20.6952266,
                    lng: restaurantLng || 83.488972
                }
            });
            console.log('✅ New delivery settings created');
        } else {
            // Update existing settings
            settings.maxDeliveryRadius = maxDeliveryRadius;
            if (baseDeliveryCharge !== undefined) settings.baseDeliveryCharge = baseDeliveryCharge;
            if (additionalChargePerKm !== undefined) settings.additionalChargePerKm = additionalChargePerKm;
            if (freeDeliveryWithin5kmThreshold !== undefined) settings.freeDeliveryWithin5kmThreshold = freeDeliveryWithin5kmThreshold;
            if (freeDeliveryUpto10kmThreshold !== undefined) settings.freeDeliveryUpto10kmThreshold = freeDeliveryUpto10kmThreshold;
            if (platformFeePercent !== undefined) settings.platformFeePercent = platformFeePercent;
            if (gstPercent !== undefined) settings.gstPercent = gstPercent;
            
            if (restaurantLat !== undefined || restaurantLng !== undefined) {
                settings.restaurantLocation = {
                    lat: restaurantLat !== undefined ? restaurantLat : settings.restaurantLocation.lat,
                    lng: restaurantLng !== undefined ? restaurantLng : settings.restaurantLocation.lng
                };
            }
            
            await settings.save();
            console.log('✅ Delivery settings updated');
        }
        
        res.json({
            success: true,
            message: 'Delivery settings updated successfully',
            data: settings
        });
    } catch (error) {
        console.error('❌ Error updating delivery settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating delivery settings',
            error: error.message
        });
    }
};

// Reset delivery settings to defaults
exports.resetDeliverySettings = async (req, res) => {
    try {
        console.log('🔄 Resetting delivery settings to defaults by:', req.user.email);
        
        let settings = await DeliverySettings.findOne();
        
        const defaultSettings = {
            maxDeliveryRadius: 10,
            baseDeliveryCharge: 20,
            additionalChargePerKm: 10,
            freeDeliveryWithin5kmThreshold: 999,
            freeDeliveryUpto10kmThreshold: 1499,
            platformFeePercent: 3,
            gstPercent: 5,
            restaurantLocation: {
                lat: 20.6952266,
                lng: 83.488972
            }
        };
        
        if (!settings) {
            settings = await DeliverySettings.create(defaultSettings);
            console.log('✅ Default delivery settings created');
        } else {
            // Update with default values
            settings.maxDeliveryRadius = defaultSettings.maxDeliveryRadius;
            settings.baseDeliveryCharge = defaultSettings.baseDeliveryCharge;
            settings.additionalChargePerKm = defaultSettings.additionalChargePerKm;
            settings.freeDeliveryWithin5kmThreshold = defaultSettings.freeDeliveryWithin5kmThreshold;
            settings.freeDeliveryUpto10kmThreshold = defaultSettings.freeDeliveryUpto10kmThreshold;
            settings.platformFeePercent = defaultSettings.platformFeePercent;
            settings.gstPercent = defaultSettings.gstPercent;
            settings.restaurantLocation = defaultSettings.restaurantLocation;
            
            await settings.save();
            console.log('✅ Delivery settings reset to defaults');
        }
        
        res.json({
            success: true,
            message: 'Delivery settings reset to defaults',
            data: settings
        });
    } catch (error) {
        console.error('❌ Error resetting delivery settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error resetting delivery settings',
            error: error.message
        });
    }
};
