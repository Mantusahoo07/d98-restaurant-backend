const admin = require('firebase-admin');

// Firebase Service Account Object
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Simple auth middleware
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
    
    // Verify token WITHOUT checking revocation for now
    const decoded = await admin.auth().verifyIdToken(token, false); // Set to false
    
    req.user = decoded;
    req.userId = decoded.uid;
    
    console.log(`✅ Token verified for: ${decoded.email || decoded.uid.substring(0, 8)}...`);
    
    next();
    
  } catch (error) {
    console.error("Auth Error:", error.code, error.message);
    
    // Don't differentiate between expired and invalid for now
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

module.exports = auth;