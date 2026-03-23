const RestaurantSettings = require('../models/RestaurantSettings');
const cron = require('node-cron');

// Store connected clients for real-time updates
let connectedClients = [];
let schedulerJob = null;

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

// Helper function to convert time string to minutes
const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

// Helper function to calculate restaurant status for display
const calculateRestaurantStatus = (settings) => {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    let isOpen = false;
    let nextOpenTime = null;
    let currentShift = null;
    
    if (settings.specialClosing?.isClosed) {
        isOpen = false;
    } else {
        if (settings.autoScheduleEnabled) {
            // Check shift 1
            if (settings.shift1Enabled) {
                const openTime = timeToMinutes(settings.shift1Open);
                const closeTime = timeToMinutes(settings.shift1Close);
                
                if (currentTime >= openTime && currentTime < closeTime) {
                    isOpen = true;
                    currentShift = 'Shift 1';
                }
            }
            
            // Check shift 2
            if (!isOpen && settings.shift2Enabled) {
                const openTime = timeToMinutes(settings.shift2Open);
                const closeTime = timeToMinutes(settings.shift2Close);
                
                if (currentTime >= openTime && currentTime < closeTime) {
                    isOpen = true;
                    currentShift = 'Shift 2';
                }
            }
        } else {
            isOpen = settings.isOnline;
        }
    }
    
    // Calculate next opening time if closed
    if (!isOpen && !settings.specialClosing?.isClosed && settings.autoScheduleEnabled) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        if (settings.shift1Enabled) {
            const openTime = timeToMinutes(settings.shift1Open);
            
            if (currentMinutes < openTime) {
                nextOpenTime = settings.shift1Open;
            } else if (settings.shift2Enabled) {
                const openTime2 = timeToMinutes(settings.shift2Open);
                
                if (currentMinutes < openTime2) {
                    nextOpenTime = settings.shift2Open;
                } else {
                    nextOpenTime = `Tomorrow ${settings.shift1Open}`;
                }
            } else {
                nextOpenTime = `Tomorrow ${settings.shift1Open}`;
            }
        } else if (settings.shift2Enabled) {
            const openTime = timeToMinutes(settings.shift2Open);
            
            if (currentMinutes < openTime) {
                nextOpenTime = settings.shift2Open;
            } else {
                nextOpenTime = `Tomorrow ${settings.shift2Open}`;
            }
        }
    }
    
    return {
        isOpen,
        currentShift,
        nextOpenTime,
        isTemporarilyClosed: settings.specialClosing?.isClosed || false,
        temporaryClosingReason: settings.specialClosing?.reason || '',
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

// Function to check if restaurant should be open based on current time
const shouldBeOpen = (settings) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    console.log(`=== SHOULD BE OPEN CHECK ===`);
    console.log(`Current time: ${now.toLocaleTimeString()} (${currentMinutes} minutes)`);
    console.log(`Auto schedule enabled: ${settings.autoScheduleEnabled}`);
    
    if (settings.specialClosing?.isClosed) {
        console.log(`Restaurant temporarily closed`);
        return false;
    }
    if (!settings.autoScheduleEnabled) {
        console.log(`Auto schedule disabled, using manual: ${settings.isOnline}`);
        return settings.isOnline;
    }
    
    // Check shift 1
    if (settings.shift1Enabled) {
        const openTime = timeToMinutes(settings.shift1Open);
        const closeTime = timeToMinutes(settings.shift1Close);
        
        console.log(`Shift 1: ${settings.shift1Open} (${openTime}) - ${settings.shift1Close} (${closeTime})`);
        
        if (currentMinutes >= openTime && currentMinutes < closeTime) {
            console.log(`✅ IN SHIFT 1 - Should be OPEN`);
            return true;
        }
    }
    
    // Check shift 2
    if (settings.shift2Enabled) {
        const openTime = timeToMinutes(settings.shift2Open);
        const closeTime = timeToMinutes(settings.shift2Close);
        
        console.log(`Shift 2: ${settings.shift2Open} (${openTime}) - ${settings.shift2Close} (${closeTime})`);
        
        if (currentMinutes >= openTime && currentMinutes < closeTime) {
            console.log(`✅ IN SHIFT 2 - Should be OPEN`);
            return true;
        }
    }
    
    console.log(`❌ Not in any shift - Should be CLOSED`);
    return false;
};

// Function to update restaurant status based on schedule
const updateStatusFromSchedule = async () => {
    try {
        const settings = await RestaurantSettings.findOne();
        if (!settings) return null;
        
        if (!settings.autoScheduleEnabled) {
            console.log('⏭️ Auto schedule disabled, skipping automatic update');
            return null;
        }
        
        const shouldBeOpenNow = shouldBeOpen(settings);
        
        if (settings.isOnline !== shouldBeOpenNow) {
            settings.isOnline = shouldBeOpenNow;
            settings.lastUpdatedAt = new Date();
            await settings.save();
            
            console.log(`🔄 Schedule updated restaurant status: ${shouldBeOpenNow ? 'OPEN' : 'CLOSED'} at ${new Date().toLocaleTimeString()}`);
            
            // Broadcast the updated status
            const updatedStatus = calculateRestaurantStatus(settings);
            broadcastRestaurantStatus(updatedStatus);
            
            return shouldBeOpenNow;
        } else {
            console.log(`✅ Current status: ${settings.isOnline ? 'OPEN' : 'CLOSED'} - No change needed`);
        }
        
        return settings.isOnline;
    } catch (error) {
        console.error('❌ Error updating status from schedule:', error);
        return null;
    }
};

// Function to check upcoming shifts and log them
const checkUpcomingShifts = async () => {
    try {
        const settings = await RestaurantSettings.findOne();
        if (!settings || !settings.autoScheduleEnabled) return;
        
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        let nextEvent = null;
        let nextEventMinutes = null;
        
        // Check shift 1
        if (settings.shift1Enabled) {
            const openTime = timeToMinutes(settings.shift1Open);
            const closeTime = timeToMinutes(settings.shift1Close);
            
            if (currentMinutes < openTime) {
                nextEvent = { type: 'OPEN', shift: 'Shift 1', time: openTime, timeStr: settings.shift1Open };
                nextEventMinutes = openTime;
            } else if (currentMinutes >= openTime && currentMinutes < closeTime) {
                nextEvent = { type: 'CLOSE', shift: 'Shift 1', time: closeTime, timeStr: settings.shift1Close };
                nextEventMinutes = closeTime;
            }
        }
        
        // Check shift 2 (if closer than current next event)
        if (settings.shift2Enabled) {
            const openTime = timeToMinutes(settings.shift2Open);
            const closeTime = timeToMinutes(settings.shift2Close);
            
            if (currentMinutes < openTime && (!nextEventMinutes || openTime < nextEventMinutes)) {
                nextEvent = { type: 'OPEN', shift: 'Shift 2', time: openTime, timeStr: settings.shift2Open };
                nextEventMinutes = openTime;
            } else if (currentMinutes >= openTime && currentMinutes < closeTime && (!nextEventMinutes || closeTime < nextEventMinutes)) {
                nextEvent = { type: 'CLOSE', shift: 'Shift 2', time: closeTime, timeStr: settings.shift2Close };
                nextEventMinutes = closeTime;
            }
        }
        
        if (nextEvent) {
            const minutesUntil = nextEventMinutes - currentMinutes;
            const hoursUntil = Math.floor(minutesUntil / 60);
            const minsUntil = minutesUntil % 60;
            const timeUntil = hoursUntil > 0 ? `${hoursUntil}h ${minsUntil}m` : `${minsUntil}m`;
            
            console.log(`⏰ Next scheduled event: ${nextEvent.type} ${nextEvent.shift} in ${timeUntil} at ${nextEvent.timeStr}`);
        }
    } catch (error) {
        console.error('Error checking upcoming shifts:', error);
    }
};

// Start the scheduler
const startScheduler = () => {
    if (schedulerJob) {
        console.log('Scheduler already running');
        return;
    }
    
    console.log('🚀 Starting restaurant status scheduler...');
    
    // Run every minute
    schedulerJob = cron.schedule('* * * * *', async () => {
        await updateStatusFromSchedule();
        await checkUpcomingShifts();
    });
    
    console.log('✅ Restaurant status scheduler started (runs every minute)');
    
    // Run immediately on start
    setTimeout(async () => {
        await updateStatusFromSchedule();
        await checkUpcomingShifts();
    }, 5000);
};

// Stop the scheduler
const stopScheduler = () => {
    if (schedulerJob) {
        schedulerJob.stop();
        schedulerJob = null;
        console.log('⏹️ Restaurant status scheduler stopped');
    }
};

// ==================== SSE ENDPOINT ====================

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
        console.log('Request body:', req.body);
        
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

        // CRITICAL: If auto schedule is enabled, recalculate status immediately
        if (settings.autoScheduleEnabled) {
            const newStatus = shouldBeOpen(settings);
            console.log(`🔄 Auto-schedule recalculated status: ${newStatus ? 'OPEN' : 'CLOSED'}`);
            settings.isOnline = newStatus;
        }

        await settings.save();

        console.log('✅ Settings saved:', {
            isOnline: settings.isOnline,
            autoScheduleEnabled: settings.autoScheduleEnabled,
            shift1Enabled: settings.shift1Enabled,
            shift1Open: settings.shift1Open,
            shift1Close: settings.shift1Close,
            shift2Enabled: settings.shift2Enabled,
            shift2Open: settings.shift2Open,
            shift2Close: settings.shift2Close
        });

        // Calculate and broadcast updated status
        const updatedStatus = calculateRestaurantStatus(settings);
        broadcastRestaurantStatus(updatedStatus);

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

        // Calculate and broadcast updated status
        const updatedStatus = calculateRestaurantStatus(settings);
        broadcastRestaurantStatus(updatedStatus);

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

// Get scheduler status (for debugging)
exports.getSchedulerStatus = async (req, res) => {
    try {
        const settings = await RestaurantSettings.findOne();
        const shouldBeOpenNow = settings ? shouldBeOpen(settings) : null;
        
        res.json({
            success: true,
            schedulerRunning: schedulerJob !== null,
            currentSettings: settings,
            shouldBeOpenNow,
            currentTime: new Date().toISOString(),
            nextCheck: 'Every minute'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error getting scheduler status',
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
        
        res.json({
            success: true,
            data: status
        });
        
    } catch (error) {
        console.error('❌ Error fetching restaurant status:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching restaurant status'
        });
    }
};

// Export scheduler functions for use in server.js
exports.startScheduler = startScheduler;
exports.stopScheduler = stopScheduler;
