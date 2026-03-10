const RestaurantSettings = require('../models/RestaurantSettings');

// Store connected clients for real-time updates
let connectedClients = [];

// Function to broadcast restaurant status to all connected clients
const broadcastRestaurantStatus = (status) => {
    connectedClients.forEach(client => {
        try {
            client.res.write(`data: ${JSON.stringify(status)}\n\n`);
        } catch (error) {
            console.error('Error broadcasting to client:', error);
        }
    });
};

// SSE endpoint for real-time restaurant status
exports.restaurantStatusSSE = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send initial data
    RestaurantSettings.getSettings().then(settings => {
        const status = calculateRestaurantStatus(settings);
        res.write(`data: ${JSON.stringify(status)}\n\n`);
    });
    
    // Add client to connected list
    const clientId = Date.now();
    const newClient = {
        id: clientId,
        res
    };
    connectedClients.push(newClient);
    
    // Remove client on connection close
    req.on('close', () => {
        connectedClients = connectedClients.filter(client => client.id !== clientId);
    });
};

// Helper function to calculate restaurant status
const calculateRestaurantStatus = (settings) => {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    let isOpen = false;
    let nextOpenTime = null;
    let currentShift = null;
    let offlineMessage = null;
    let statusSource = 'auto';
    
    // CRITICAL: If manual override is true, ONLY use the manual isOnline setting
    // Completely ignore auto schedule when manual override is active
    if (settings.manualOverride) {
        isOpen = settings.isOnline;
        statusSource = 'manual';
        
        console.log(`🔧 Manual override ACTIVE - status forced to: ${isOpen ? 'OPEN' : 'CLOSED'} (ignoring schedule)`);
        
        // Add offline reason if restaurant is closed
        if (!isOpen && settings.offlineReason && settings.offlineReason.reason) {
            offlineMessage = {
                reason: settings.offlineReason.reason,
                duration: settings.offlineReason.duration,
                setAt: settings.offlineReason.setAt,
                message: getOfflineMessage(settings.offlineReason)
            };
        }
    } 
    // If special closing is active (temporary closing)
    else if (settings.specialClosing.isClosed) {
        isOpen = false;
        statusSource = 'special_closing';
        offlineMessage = {
            reason: 'temporarily_closed',
            message: settings.specialClosing.reason,
            estimatedReturn: settings.specialClosing.estimatedReturn
        };
    } 
    // Auto-schedule mode (manual override is OFF)
    else {
        if (settings.autoScheduleEnabled) {
            // Check shift 1
            if (settings.shift1Enabled) {
                if (currentTime >= settings.shift1Open && currentTime <= settings.shift1Close) {
                    isOpen = true;
                    currentShift = 'Shift 1';
                    statusSource = 'schedule_shift1';
                }
            }
            
            // Check shift 2 if not already open
            if (!isOpen && settings.shift2Enabled) {
                if (currentTime >= settings.shift2Open && currentTime <= settings.shift2Close) {
                    isOpen = true;
                    currentShift = 'Shift 2';
                    statusSource = 'schedule_shift2';
                }
            }
            
            // If still not open, calculate next opening time
            if (!isOpen) {
                statusSource = 'schedule_closed';
                if (settings.shift1Enabled && currentTime < settings.shift1Open) {
                    nextOpenTime = settings.shift1Open;
                } else if (settings.shift2Enabled && currentTime < settings.shift2Open) {
                    nextOpenTime = settings.shift2Open;
                } else if (settings.shift1Enabled) {
                    // Next day's shift 1
                    nextOpenTime = settings.shift1Open;
                }
            }
        } else {
            // Auto schedule disabled - use manual isOnline setting
            isOpen = settings.isOnline;
            statusSource = 'manual_no_schedule';
        }
    }
    
    console.log(`📍 Status calculated - isOpen: ${isOpen}, source: ${statusSource}, manualOverride: ${settings.manualOverride}, nextOpen: ${nextOpenTime || 'N/A'}`);
    
    return {
        isOpen,
        currentShift,
        nextOpenTime,
        isTemporarilyClosed: settings.specialClosing.isClosed,
        temporaryClosingReason: settings.specialClosing.reason,
        manualOverride: settings.manualOverride,
        statusSource,
        offlineReason: settings.offlineReason,
        offlineMessage,
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
    };
};

// Helper function to get user-friendly offline message
const getOfflineMessage = (offlineReason) => {
    if (!offlineReason || !offlineReason.reason) return null;
    
    const reasonMap = {
        'out_of_stock': 'Items out of stock',
        'kitchen_full': 'Kitchen is full',
        'staff_unavailable': 'Delivery staff unavailable',
        'temporarily_closed': 'Temporarily closed'
    };
    
    const reasonText = reasonMap[offlineReason.reason] || offlineReason.reason;
    
    if (!offlineReason.duration) return reasonText;
    
    const durationMap = {
        '30min': '30 minutes',
        '1hour': '1 hour',
        '2hours': '2 hours',
        'manual': 'Manual',
        'next_shift': 'Next shift',
        'tomorrow': 'Tomorrow'
    };
    
    if (offlineReason.duration && offlineReason.duration.includes('T')) {
        try {
            const date = new Date(offlineReason.duration);
            return `${reasonText} - Back on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
        } catch (e) {
            return reasonText;
        }
    }
    
    const durationText = durationMap[offlineReason.duration] || offlineReason.duration;
    return `${reasonText} - Returns in ${durationText}`;
};

// ==================== ADMIN ENDPOINTS (Protected) ====================

// Get restaurant settings for admin
exports.getRestaurantSettings = async (req, res) => {
    try {
        console.log('🏪 Admin fetching restaurant settings');
        const settings = await RestaurantSettings.getSettings();
        
        // Calculate status to include nextOpenTime
        const status = calculateRestaurantStatus(settings);
        
        res.json({
            success: true,
            data: {
                ...settings.toObject(),
                nextOpenTime: status.nextOpenTime,
                statusSource: status.statusSource
            }
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
            manualOverride,
            offlineReason,
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

        // CRITICAL: When manually toggling, always set manualOverride to true
        // This ensures auto-schedule doesn't override the manual setting
        if (typeof manualOverride !== 'undefined') {
            settings.manualOverride = manualOverride;
        } else if (typeof isOnline !== 'undefined') {
            // If isOnline is being updated but manualOverride not specified,
            // assume this is a manual action and set manualOverride to true
            settings.manualOverride = true;
        }

        // Update fields
        if (typeof isOnline !== 'undefined') settings.isOnline = isOnline;
        if (typeof autoScheduleEnabled !== 'undefined') settings.autoScheduleEnabled = autoScheduleEnabled;
        
        // Handle offline reason
        if (offlineReason) {
            settings.offlineReason = {
                reason: offlineReason.reason,
                duration: offlineReason.duration,
                setAt: new Date()
            };
        } else if (offlineReason === null) {
            // Clear offline reason if explicitly set to null
            settings.offlineReason = {
                reason: null,
                duration: null,
                setAt: null
            };
        }
        
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

        // Calculate and broadcast updated status
        const updatedStatus = calculateRestaurantStatus(settings);
        broadcastRestaurantStatus(updatedStatus);

        console.log(`✅ Restaurant settings updated - isOnline: ${settings.isOnline}, manualOverride: ${settings.manualOverride}`);

        res.json({
            success: true,
            message: 'Restaurant settings updated successfully',
            data: {
                ...settings.toObject(),
                nextOpenTime: updatedStatus.nextOpenTime,
                statusSource: updatedStatus.statusSource
            }
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
        settings.manualOverride = false;
        settings.offlineReason = {
            reason: null,
            duration: null,
            setAt: null
        };
        settings.shift1Enabled = true;
        settings.shift1Open = '09:00';
        settings.shift1Close = '17:00';
        settings.shift2Enabled = true;
        settings.shift2Open = '18:00';
        settings.shift2Close = '23:00';
        settings.specialClosing = {
            isClosed: false,
            reason: '',
            estimatedReturn: null,
            closedUntil: null
        };
        settings.lastUpdatedBy = req.user._id;
        settings.lastUpdatedAt = new Date();

        await settings.save();

        // Calculate and broadcast updated status
        const updatedStatus = calculateRestaurantStatus(settings);
        broadcastRestaurantStatus(updatedStatus);

        res.json({
            success: true,
            message: 'Restaurant settings reset to defaults',
            data: {
                ...settings.toObject(),
                nextOpenTime: updatedStatus.nextOpenTime,
                statusSource: updatedStatus.statusSource
            }
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
        const status = calculateRestaurantStatus(settings);
        
        // Add user-friendly message for customers
        let customerMessage = status.isOpen ? 'Restaurant is open' : 'Restaurant is currently closed';
        
        if (!status.isOpen) {
            if (status.offlineMessage) {
                customerMessage = status.offlineMessage.message || status.offlineMessage.reason;
                if (status.offlineMessage.duration && !status.offlineMessage.duration.includes('T')) {
                    const durationMap = {
                        '30min': '30 minutes',
                        '1hour': '1 hour',
                        '2hours': '2 hours',
                        'manual': 'later',
                        'next_shift': 'next shift',
                        'tomorrow': 'tomorrow'
                    };
                    customerMessage += ` (opens in ${durationMap[status.offlineMessage.duration] || status.offlineMessage.duration})`;
                }
            } else if (status.nextOpenTime) {
                customerMessage = `Opens at ${status.nextOpenTime}`;
            } else if (status.manualOverride) {
                customerMessage = 'Restaurant is temporarily closed by management';
            }
        }
        
        res.json({
            success: true,
            data: {
                ...status,
                customerMessage
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
