const admin = require('firebase-admin');

// Firebase Service Account Object (Render compatible)
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

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware for verifying Firebase token
const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    // Add this line to check revoked tokens
    const decoded = await admin.auth().verifyIdToken(token, true); // Added "true" parameter
    
    req.user = decoded;
    req.userId = decoded.uid;
    
    // Log for debugging (optional)
    console.log(`✅ Token verified for user: ${decoded.email || decoded.uid}`);
    
    next();

  } catch (error) {
    console.error("Auth Error:", error.message);
    
    // Handle expired tokens specifically
    if (error.code === 'auth/id-token-expired' || error.message.includes('expired')) {
      return res.status(401).json({
        success: false,
        message: "Token has expired. Please refresh your session.",
        code: "TOKEN_EXPIRED" // Added this code for frontend to recognize
      });
    }
    
    res.status(401).json({
      success: false,
      message: "Invalid token",
      error: error.message
    });
  }
};

module.exports = auth;