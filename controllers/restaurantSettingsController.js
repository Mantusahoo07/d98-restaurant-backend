const RestaurantSettings = require('../models/RestaurantSettings');

// ==================== ADMIN ENDPOINTS (Protected) ====================

// Get restaurant settings for admin
exports.getRestaurantSettings = async (req, res) => {
    try {
        console.log('🏪 Admin fetching restaurant settings');
        const settings = await RestaurantSettings.getSettings();
        
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('❌ Error fetching restaurant settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching restaurant settings',
            error: error.message
        });
    }
};

// Update restaurant settings
exports.updateRestaurantSettings = async (req, res) => {
    try {
        console.log('✏️ Admin updating restaurant settings');
        const {
            isOnline,
            autoScheduleEnabled,
            shift1Enabled,
            shift1Open,
            shift1Close,
            shift2Enabled,
            shift2Open,
            shift2Close,
            specialClosing
        } = req.body;

        let settings = await RestaurantSettings.findOne();
        
        if (!settings) {
            settings = new RestaurantSettings();
        }

        // Update fields
        if (typeof isOnline !== 'undefined') settings.isOnline = isOnline;
        if (typeof autoScheduleEnabled !== 'undefined') settings.autoScheduleEnabled = autoScheduleEnabled;
        
        // Shift 1
        if (typeof shift1Enabled !== 'undefined') settings.shift1Enabled = shift1Enabled;
        if (shift1Open) settings.shift1Open = shift1Open;
        if (shift1Close) settings.shift1Close = shift1Close;
        
        // Shift 2
        if (typeof shift2Enabled !== 'undefined') settings.shift2Enabled = shift2Enabled;
        if (shift2Open) settings.shift2Open = shift2Open;
        if (shift2Close) settings.shift2Close = shift2Close;
        
        // Special Closing
        if (specialClosing) {
            settings.specialClosing = {
                ...settings.specialClosing,
                ...specialClosing
            };
        }

        settings.lastUpdatedBy = req.user._id;
        settings.lastUpdatedAt = new Date();

        await settings.save();

        res.json({
            success: true,
            message: 'Restaurant settings updated successfully',
            data: settings
        });
    } catch (error) {
        console.error('❌ Error updating restaurant settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating restaurant settings',
            error: error.message
        });
    }
};

// Reset to defaults
exports.resetRestaurantSettings = async (req, res) => {
    try {
        console.log('🔄 Admin resetting restaurant settings to defaults');
        
        let settings = await RestaurantSettings.findOne();
        
        if (!settings) {
            settings = new RestaurantSettings();
        }

        // Reset to defaults
        settings.isOnline = false;
        settings.autoScheduleEnabled = true;
        settings.shift1Enabled = true;
        settings.shift1Open = '09:00';
        settings.shift1Close = '17:00';
        settings.shift2Enabled = true;
        settings.shift2Open = '18:00';
        settings.shift2Close = '23:00';
        settings.specialClosing = {
            isClosed: false,
            reason: '',
            closedUntil: null
        };
        settings.lastUpdatedBy = req.user._id;
        settings.lastUpdatedAt = new Date();

        await settings.save();

        res.json({
            success: true,
            message: 'Restaurant settings reset to defaults',
            data: settings
        });
    } catch (error) {
        console.error('❌ Error resetting restaurant settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error resetting restaurant settings',
            error: error.message
        });
    }
};

// ==================== PUBLIC ENDPOINT (No Auth) ====================

// Get restaurant status for customers
exports.getRestaurantStatus = async (req, res) => {
    try {
        console.log('👥 Public fetching restaurant status');
        
        const settings = await RestaurantSettings.getSettings();
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        // Calculate if restaurant is currently open
        let isOpen = false;
        let nextOpenTime = null;
        let currentShift = null;
        
        // Check if temporarily closed
        if (settings.specialClosing.isClosed) {
            isOpen = false;
        } else {
            // Check auto-schedule
            if (settings.autoScheduleEnabled) {
                // Check Shift 1
                if (settings.shift1Enabled) {
                    if (currentTime >= settings.shift1Open && currentTime <= settings.shift1Close) {
                        isOpen = true;
                        currentShift = 'Shift 1';
                    }
                }
                
                // Check Shift 2
                if (!isOpen && settings.shift2Enabled) {
                    if (currentTime >= settings.shift2Open && currentTime <= settings.shift2Close) {
                        isOpen = true;
                        currentShift = 'Shift 2';
                    }
                }
                
                // If auto-schedule is disabled, use manual toggle
            } else {
                isOpen = settings.isOnline;
            }
        }
        
        // Calculate next opening time
        if (!isOpen && !settings.specialClosing.isClosed && settings.autoScheduleEnabled) {
            // Check next shift today
            if (settings.shift1Enabled && currentTime < settings.shift1Open) {
                nextOpenTime = settings.shift1Open;
            } else if (settings.shift2Enabled && currentTime < settings.shift2Open) {
                nextOpenTime = settings.shift2Open;
            } else {
                // Next shift tomorrow
                if (settings.shift1Enabled) {
                    nextOpenTime = settings.shift1Open;
                }
            }
        }

        // Return only what customers need
        res.json({
            success: true,
            data: {
                isOpen: isOpen,
                currentShift: currentShift,
                nextOpenTime: nextOpenTime,
                isTemporarilyClosed: settings.specialClosing.isClosed,
                temporaryClosingReason: settings.specialClosing.reason,
                shifts: {
                    shift1: {
                        enabled: settings.shift1Enabled,
                        open: settings.shift1Open,
                        close: settings.shift1Close
                    },
                    shift2: {
                        enabled: settings.shift2Enabled,
                        open: settings.shift2Open,
                        close: settings.shift2Close
                    }
                },
                autoScheduleEnabled: settings.autoScheduleEnabled,
                lastUpdated: settings.lastUpdatedAt
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching restaurant status:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching restaurant status'
        });
    }
};
