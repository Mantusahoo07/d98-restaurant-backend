// middleware/restaurantStatus.js
const admin = require('firebase-admin');

const checkRestaurantStatus = async (req, res, next) => {
  try {
    const statusRef = admin.database().ref('restaurant/status');
    const snapshot = await statusRef.once('value');
    const isOpen = snapshot.val() !== false; // Default to open if not set
    
    if (!isOpen && req.method === 'POST' && req.path.includes('/orders')) {
      return res.status(403).json({
        success: false,
        message: 'Restaurant is currently closed. Please try again later.',
        code: 'RESTAURANT_CLOSED'
      });
    }
    
    req.restaurantStatus = isOpen;
    next();
  } catch (error) {
    console.error('Error checking restaurant status:', error);
    next(); // Continue anyway if there's an error
  }
};

module.exports = checkRestaurantStatus;