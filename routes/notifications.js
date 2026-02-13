const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');

// Get user notifications
router.get('/', auth, async (req, res) => {
    try {
        console.log('📱 Fetching notifications for user:', req.user.uid);
        
        // Check if Notification model exists and collection has data
        const notifications = await Notification.find({ userId: req.user.uid })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean(); // Use lean() for better performance
        
        const unreadCount = await Notification.countDocuments({ 
            userId: req.user.uid, 
            read: false 
        });
        
        console.log(`✅ Found ${notifications.length} notifications, ${unreadCount} unread`);
        
        res.json({
            success: true,
            notifications: notifications,
            unreadCount: unreadCount
        });
    } catch (error) {
        console.error('❌ Error fetching notifications:', error);
        
        // Don't return 500, return empty array with success false but still 200 status
        // This prevents frontend from breaking
        res.status(200).json({
            success: false,
            message: 'Error fetching notifications',
            notifications: [],
            unreadCount: 0,
            error: error.message
        });
    }
});

// Create notification (internal use)
async function createNotification(userId, title, message, type = 'info', icon = 'fa-bell', data = {}) {
    try {
        console.log(`📝 Creating notification for user ${userId}: ${title}`);
        
        const notification = new Notification({
            userId,
            title,
            message,
            type,
            icon,
            data,
            read: false,
            createdAt: new Date()
        });
        
        await notification.save();
        
        console.log(`✅ Notification created: ${notification._id}`);
        return notification;
    } catch (error) {
        console.error('❌ Error creating notification:', error);
        return null;
    }
}

// Mark notification as read
router.put('/:id/read', auth, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.uid },
            { read: true },
            { new: true }
        );
        
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Notification marked as read',
            notification: notification
        });
    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating notification',
            error: error.message
        });
    }
});

// Mark all notifications as read
router.put('/read-all', auth, async (req, res) => {
    try {
        const result = await Notification.updateMany(
            { userId: req.user.uid, read: false },
            { read: true }
        );
        
        console.log(`✅ Marked ${result.modifiedCount} notifications as read`);
        
        res.json({
            success: true,
            message: 'All notifications marked as read',
            count: result.modifiedCount
        });
    } catch (error) {
        console.error('❌ Error marking all as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating notifications',
            error: error.message
        });
    }
});

// Delete notification
router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await Notification.findOneAndDelete({ 
            _id: req.params.id, 
            userId: req.user.uid 
        });
        
        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Notification deleted'
        });
    } catch (error) {
        console.error('❌ Error deleting notification:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting notification',
            error: error.message
        });
    }
});

// Delete all notifications for user
router.delete('/', auth, async (req, res) => {
    try {
        const result = await Notification.deleteMany({ userId: req.user.uid });
        
        res.json({
            success: true,
            message: 'All notifications deleted',
            count: result.deletedCount
        });
    } catch (error) {
        console.error('❌ Error deleting notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting notifications',
            error: error.message
        });
    }
});

module.exports = router;
module.exports.createNotification = createNotification;
