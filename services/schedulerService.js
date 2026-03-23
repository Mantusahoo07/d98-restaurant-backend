const cron = require('node-cron');
const RestaurantSettings = require('../models/RestaurantSettings');

let schedulerJob = null;
let isRunning = false;

// Helper function to convert time string to minutes
const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

// Helper function to get current time in minutes
const getCurrentMinutes = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
};

// Function to check if restaurant should be open based on current time
const shouldBeOpen = (settings) => {
    const now = new Date();
    const currentMinutes = getCurrentMinutes();
    
    console.log(`\n=== SHOULD BE OPEN CHECK ===`);
    console.log(`Current time: ${now.toLocaleTimeString()} (${currentMinutes} minutes)`);
    
    // If auto schedule is OFF, return current manual status
    if (!settings.autoScheduleEnabled) {
        console.log(`⚙️ Auto schedule disabled, using manual status: ${settings.isOnline ? 'OPEN' : 'CLOSED'}`);
        return settings.isOnline;
    }
    
    // Check special closing
    if (settings.specialClosing?.isClosed) {
        console.log(`❌ Restaurant temporarily closed`);
        return false;
    }
    
    // Check manual override (temporary override from header)
    if (settings.manualOverride && settings.manualOverrideExpiry) {
        const expiryTime = new Date(settings.manualOverrideExpiry);
        if (expiryTime > now) {
            console.log(`🔧 Manual override active until ${expiryTime.toLocaleTimeString()}`);
            console.log(`📌 Using manual status: ${settings.isOnline ? 'OPEN' : 'CLOSED'}`);
            return settings.isOnline;
        } else if (expiryTime <= now) {
            console.log(`⏰ Manual override expired at ${expiryTime.toLocaleTimeString()}`);
            // We'll clear this in the update function
            return null;
        }
    }
    
    console.log(`📅 Auto schedule enabled, checking shifts...`);
    
    // Check shift 1
    if (settings.shift1Enabled) {
        const openMinutes = timeToMinutes(settings.shift1Open);
        const closeMinutes = timeToMinutes(settings.shift1Close);
        
        console.log(`   Shift 1: ${settings.shift1Open} (${openMinutes}) - ${settings.shift1Close} (${closeMinutes})`);
        console.log(`   Current minutes: ${currentMinutes}`);
        
        // CRITICAL FIX: Use < for closing time, not <=
        if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
            console.log(`   ✅ IN SHIFT 1 - Should be OPEN`);
            return true;
        } else {
            console.log(`   ❌ NOT in Shift 1`);
            if (currentMinutes >= closeMinutes) {
                console.log(`      (Current time ${currentMinutes} is >= closing time ${closeMinutes})`);
            }
            if (currentMinutes < openMinutes) {
                console.log(`      (Current time ${currentMinutes} is before opening time ${openMinutes})`);
            }
        }
    }
    
    // Check shift 2
    if (settings.shift2Enabled) {
        const openMinutes = timeToMinutes(settings.shift2Open);
        const closeMinutes = timeToMinutes(settings.shift2Close);
        
        console.log(`   Shift 2: ${settings.shift2Open} (${openMinutes}) - ${settings.shift2Close} (${closeMinutes})`);
        console.log(`   Current minutes: ${currentMinutes}`);
        
        // CRITICAL FIX: Use < for closing time, not <=
        if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
            console.log(`   ✅ IN SHIFT 2 - Should be OPEN`);
            return true;
        } else {
            console.log(`   ❌ NOT in Shift 2`);
            if (currentMinutes >= closeMinutes) {
                console.log(`      (Current time ${currentMinutes} is >= closing time ${closeMinutes})`);
            }
            if (currentMinutes < openMinutes) {
                console.log(`      (Current time ${currentMinutes} is before opening time ${openMinutes})`);
            }
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
        
        console.log(`\n🕐 SCHEDULER CHECK at ${new Date().toLocaleTimeString()}`);
        console.log(`Current isOnline: ${settings.isOnline ? 'OPEN' : 'CLOSED'}`);
        console.log(`Auto Schedule Enabled: ${settings.autoScheduleEnabled}`);
        
        // If auto schedule is disabled, don't update automatically
        if (!settings.autoScheduleEnabled) {
            console.log('⏭️ Auto schedule disabled, skipping automatic update');
            return null;
        }
        
        // Check and clear expired manual override
        let needsSave = false;
        if (settings.manualOverride && settings.manualOverrideExpiry) {
            const expiryTime = new Date(settings.manualOverrideExpiry);
            if (expiryTime <= new Date()) {
                console.log(`⏰ Manual override expired at ${expiryTime.toLocaleTimeString()}, reverting to schedule`);
                settings.manualOverride = false;
                settings.manualOverrideExpiry = null;
                needsSave = true;
            } else {
                console.log(`🔧 Manual override active until ${expiryTime.toLocaleTimeString()}`);
                // Don't change status while manual override is active
                return settings.isOnline;
            }
        }
        
        const shouldBeOpenNow = shouldBeOpen(settings);
        
        // CRITICAL: Only update if shouldBeOpenNow is not null (not in manual override)
        if (shouldBeOpenNow !== null && (settings.isOnline !== shouldBeOpenNow || needsSave)) {
            const previousStatus = settings.isOnline;
            settings.isOnline = shouldBeOpenNow;
            settings.lastUpdatedAt = new Date();
            await settings.save();
            
            console.log(`🔄 Schedule updated restaurant status: ${previousStatus ? 'OPEN' : 'CLOSED'} → ${shouldBeOpenNow ? 'OPEN' : 'CLOSED'} at ${new Date().toLocaleTimeString()}`);
            
            return shouldBeOpenNow;
        } else if (shouldBeOpenNow === null) {
            console.log(`⏸️ Status unchanged (manual override active)`);
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
        const currentMinutes = getCurrentMinutes();
        
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
const start = () => {
    if (schedulerJob) {
        console.log('Scheduler already running');
        return;
    }
    
    console.log('🚀 Starting restaurant status scheduler...');
    
    // Run every minute
    schedulerJob = cron.schedule('* * * * *', async () => {
        console.log(`\n🕐 Scheduler running at ${new Date().toLocaleTimeString()}`);
        await updateStatusFromSchedule();
        await checkUpcomingShifts();
    });
    
    isRunning = true;
    console.log('✅ Restaurant status scheduler started (runs every minute)');
    
    // Run immediately on start
    setTimeout(async () => {
        console.log(`🕐 Initial scheduler run at ${new Date().toLocaleTimeString()}`);
        await updateStatusFromSchedule();
        await checkUpcomingShifts();
    }, 5000);
};

// Stop the scheduler
const stop = () => {
    if (schedulerJob) {
        schedulerJob.stop();
        schedulerJob = null;
        isRunning = false;
        console.log('⏹️ Restaurant status scheduler stopped');
    }
};

// Get current status (for debugging)
const getStatus = async () => {
    try {
        const settings = await RestaurantSettings.findOne();
        if (!settings) return null;
        
        const shouldBeOpenNow = settings.autoScheduleEnabled ? shouldBeOpen(settings) : settings.isOnline;
        
        return {
            isOnline: settings.isOnline,
            autoScheduleEnabled: settings.autoScheduleEnabled,
            manualOverride: settings.manualOverride,
            manualOverrideExpiry: settings.manualOverrideExpiry,
            shouldBeOpen: shouldBeOpenNow,
            needsUpdate: shouldBeOpenNow !== settings.isOnline && !settings.manualOverride
        };
    } catch (error) {
        console.error('Error getting status:', error);
        return null;
    }
};

module.exports = {
    start,
    stop,
    isRunning,
    getStatus,
    timeToMinutes,
    shouldBeOpen,
    getCurrentMinutes
};
