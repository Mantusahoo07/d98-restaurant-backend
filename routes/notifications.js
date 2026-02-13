const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');

// Get user notifications
router.get('/', auth, async (req, res) => {
    try {
        console.log('📱 Fetching notifications for user:', req.user.uid);
        
        const notifications = await Notification.find({ userId: req.user.uid })
            .sort({ createdAt: -1 })
            .limit(50);
        
        const unreadCount = await Notification.countDocuments({ 
            userId: req.user.uid, 
            read: false 
        });
        
        res.json({
            success: true,
            notifications: notifications,
            unreadCount: unreadCount
        });
    } catch (error) {
        console.error('❌ Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching notifications',
            error: error.message
        });
    }
});

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
        await Notification.updateMany(
            { userId: req.user.uid, read: false },
            { read: true }
        );
        
        res.json({
            success: true,
            message: 'All notifications marked as read'
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
        await Notification.findOneAndDelete({ 
            _id: req.params.id, 
            userId: req.user.uid 
        });
        
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

// Create notification (internal use - can be called from other routes)
async function createNotification(userId, title, message, type = 'info', icon = 'fa-bell', data = {}) {
    try {
        const notification = await Notification.create({
            userId,
            title,
            message,
            type,
            icon,
            data,
            read: false,
            createdAt: new Date()
        });
        
        console.log(`✅ Notification created for user ${userId}: ${title}`);
        return notification;
    } catch (error) {
        console.error('❌ Error creating notification:', error);
        return null;
    }
}

module.exports = router;
module.exports.createNotification = createNotification;
