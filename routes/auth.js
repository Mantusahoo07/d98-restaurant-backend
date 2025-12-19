// middleware/auth.js
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    const token = authHeader.split('Bearer ')[1];
    
    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      error: error.message
    });
  }
};

// In your auth.js or new route
router.post('/delivery/register', async (req, res) => {
  try {
    const { name, phone, vehicleType, vehicleNumber } = req.body;
    
    // Check if already registered
    const existing = await DeliveryPartner.findOne({ 
      $or: [{ firebaseUid: req.user.uid }, { phone }] 
    });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Delivery partner already registered'
      });
    }
    
    // Create new delivery partner
    const partner = await DeliveryPartner.create({
      firebaseUid: req.user.uid,
      name,
      phone,
      email: req.user.email,
      vehicleType,
      vehicleNumber
    });
    
    res.status(201).json({
      success: true,
      data: partner,
      message: 'Registration successful'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

module.exports = auth;