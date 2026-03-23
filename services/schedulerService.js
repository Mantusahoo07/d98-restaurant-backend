const cron = require('node-cron');
const RestaurantSettings = require('../models/RestaurantSettings');

class RestaurantScheduler {
  constructor() {
    this.isRunning = false;
    this.job = null;
  }

  // Check if restaurant should be open based on current time and shifts
  shouldBeOpen(settings) {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    // If temporarily closed, return false
    if (settings.specialClosing?.isClosed) {
      return false;
    }
    
    // If auto schedule is disabled, use manual isOnline setting
    if (!settings.autoScheduleEnabled) {
      return settings.isOnline;
    }
    
    // Check shift 1
    if (settings.shift1Enabled) {
      const [openHour, openMin] = settings.shift1Open.split(':').map(Number);
      const [closeHour, closeMin] = settings.shift1Close.split(':').map(Number);
      const openTime = openHour * 60 + openMin;
      const closeTime = closeHour * 60 + closeMin;
      
      if (currentTime >= openTime && currentTime < closeTime) {
        return true;
      }
    }
    
    // Check shift 2
    if (settings.shift2Enabled) {
      const [openHour, openMin] = settings.shift2Open.split(':').map(Number);
      const [closeHour, closeMin] = settings.shift2Close.split(':').map(Number);
      const openTime = openHour * 60 + openMin;
      const closeTime = closeHour * 60 + closeMin;
      
      if (currentTime >= openTime && currentTime < closeTime) {
        return true;
      }
    }
    
    return false;
  }

  // Update restaurant status based on current time
  async updateRestaurantStatus() {
    try {
      console.log('🔄 Running restaurant status scheduler...');
      
      const settings = await RestaurantSettings.findOne();
      if (!settings) {
        console.log('No restaurant settings found');
        return;
      }
      
      // Only update if auto schedule is enabled
      if (settings.autoScheduleEnabled) {
        const shouldBeOpen = this.shouldBeOpen(settings);
        
        // Only update if status needs to change
        if (settings.isOnline !== shouldBeOpen) {
          settings.isOnline = shouldBeOpen;
          settings.lastUpdatedAt = new Date();
          await settings.save();
          
          console.log(`✅ Restaurant status updated: ${shouldBeOpen ? 'OPEN' : 'CLOSED'}`);
          
          // Broadcast to connected clients if you have SSE
          // broadcastRestaurantStatus(shouldBeOpen ? 'open' : 'closed');
        } else {
          console.log(`⏭️ Restaurant status unchanged: ${settings.isOnline ? 'OPEN' : 'CLOSED'}`);
        }
      } else {
        console.log('Auto schedule disabled, skipping automatic update');
      }
    } catch (error) {
      console.error('❌ Error updating restaurant status:', error);
    }
  }

  // Check for upcoming shift changes
  async checkUpcomingShifts() {
    try {
      const settings = await RestaurantSettings.findOne();
      if (!settings || !settings.autoScheduleEnabled) return;
      
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const currentStatus = this.shouldBeOpen(settings);
      
      // Get next shift time
      let nextChangeTime = null;
      let nextChangeAction = null;
      
      if (settings.shift1Enabled) {
        const [openHour, openMin] = settings.shift1Open.split(':').map(Number);
        const [closeHour, closeMin] = settings.shift1Close.split(':').map(Number);
        const openTime = openHour * 60 + openMin;
        const closeTime = closeHour * 60 + closeMin;
        
        if (currentTime < openTime) {
          nextChangeTime = openTime;
          nextChangeAction = 'OPEN';
        } else if (currentTime >= openTime && currentTime < closeTime) {
          nextChangeTime = closeTime;
          nextChangeAction = 'CLOSE';
        }
      }
      
      if (settings.shift2Enabled) {
        const [openHour, openMin] = settings.shift2Open.split(':').map(Number);
        const [closeHour, closeMin] = settings.shift2Close.split(':').map(Number);
        const openTime = openHour * 60 + openMin;
        const closeTime = closeHour * 60 + closeMin;
        
        if (currentTime < openTime && (!nextChangeTime || openTime < nextChangeTime)) {
          nextChangeTime = openTime;
          nextChangeAction = 'OPEN';
        } else if (currentTime >= openTime && currentTime < closeTime && (!nextChangeTime || closeTime < nextChangeTime)) {
          nextChangeTime = closeTime;
          nextChangeAction = 'CLOSE';
        }
      }
      
      if (nextChangeTime) {
        const minutesUntil = nextChangeTime - currentTime;
        console.log(`⏰ Next status change in ${minutesUntil} minutes: ${nextChangeAction}`);
      }
    } catch (error) {
      console.error('Error checking upcoming shifts:', error);
    }
  }

  // Start the scheduler
  start() {
    if (this.isRunning) {
      console.log('Scheduler already running');
      return;
    }
    
    console.log('🚀 Starting restaurant status scheduler...');
    
    // Run every minute
    this.job = cron.schedule('* * * * *', async () => {
      await this.updateRestaurantStatus();
      await this.checkUpcomingShifts();
    });
    
    this.isRunning = true;
    console.log('✅ Restaurant status scheduler started (runs every minute)');
    
    // Run immediately on start
    this.updateRestaurantStatus();
    this.checkUpcomingShifts();
  }

  // Stop the scheduler
  stop() {
    if (this.job) {
      this.job.stop();
      this.isRunning = false;
      console.log('⏹️ Restaurant status scheduler stopped');
    }
  }
}

module.exports = new RestaurantScheduler();
