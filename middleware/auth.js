// middleware/auth.js
const admin = require('firebase-admin');

// Check if Firebase Admin is already initialized
if (!admin.apps.length) {
  try {
    // Get Firebase credentials from environment variables
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (!privateKey || !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL) {
      console.warn('⚠️ Firebase environment variables are not fully configured');
    }
    
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: privateKey,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL || `https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40${process.env.FIREBASE_PROJECT_ID}.iam.gserviceaccount.com`
    };
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    console.log('✅ Firebase Admin initialized successfully');
    
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error.message);
  }
}

// Middleware for verifying Firebase token
const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: "No token provided"
      });
    }
    
    const token = authHeader.split('Bearer ')[1];
    
    // Verify Firebase token
    const decoded = await admin.auth().verifyIdToken(token);
    
    // Attach user info to request
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email?.split('@')[0] || 'User'
    };
    
    next();
    
  } catch (error) {
    console.error("Auth Error:", error.message);
    
    // Check specific error types
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        message: "Token has expired. Please login again."
      });
    }
    
    if (error.code === 'auth/argument-error') {
      return res.status(401).json({
        success: false,
        message: "Invalid token format."
      });
    }
    
    res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
};

module.exports = auth;