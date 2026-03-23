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

// ==================== SSE ENDPOINT ====================

// SSE endpoint for real-time restaurant status
exports.restaurantStatusSSE = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send initial data
    RestaurantSettings.getSettings().then(settings => {
        const status = {
            isOpen: settings.isOnline,
            lastUpdated: settings.lastUpdatedAt
        };
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

// ==================== ADMIN ENDPOINTS ====================

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

// Update restaurant status (simple toggle)
exports.updateRestaurantSettings = async (req, res) => {
    try {
        console.log('✏️ Admin updating restaurant status');
        console.log('Request body:', req.body);
        
        const { isOnline } = req.body;
        
        let settings = await RestaurantSettings.findOne();
        
        if (!settings) {
            settings = new RestaurantSettings();
        }

        // Update only the isOnline status
        if (typeof isOnline !== 'undefined') {
            settings.isOnline = isOnline;
            settings.lastUpdatedAt = new Date();
        }

        await settings.save();

        console.log(`✅ Restaurant status updated to: ${settings.isOnline ? 'ONLINE' : 'OFFLINE'}`);

        // Broadcast the updated status
        broadcastRestaurantStatus({
            isOpen: settings.isOnline,
            lastUpdated: settings.lastUpdatedAt
        });

        res.json({
            success: true,
            message: `Restaurant is now ${settings.isOnline ? 'OPEN' : 'CLOSED'}`,
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

// ==================== PUBLIC ENDPOINT ====================

// Get restaurant status for customers
exports.getRestaurantStatus = async (req, res) => {
    try {
        console.log('👥 Public fetching restaurant status');
        
        const settings = await RestaurantSettings.getSettings();
        
        res.json({
            success: true,
            data: {
                isOpen: settings.isOnline,
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
