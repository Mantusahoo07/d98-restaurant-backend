const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Public route (no token needed)
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: "Auth route working",
  });
});

// Protected route (requires Firebase ID Token)
router.get('/profile', auth, (req, res) => {
  res.json({
    success: true,
    message: "Protected route accessed successfully",
    user: req.user,
  });
});

module.exports = router;
