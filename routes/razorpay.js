// routes/razorpay.js
const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const auth = require('../middleware/auth');

router.use(auth);

console.log('=== RAZORPAY CONFIGURATION ===');
console.log('RZP_KEY_ID from env:', process.env.RZP_KEY_ID);
console.log('RZP_KEY_SECRET from env:', process.env.RZP_KEY_SECRET ? '***SET***' : 'NOT SET');

// Check if environment variables are set
if (!process.env.RZP_KEY_ID || process.env.RZP_KEY_ID.includes('${')) {
    console.error('❌ ERROR: RZP_KEY_ID is not properly set in environment variables!');
    console.error('Current value:', process.env.RZP_KEY_ID);
}

if (!process.env.RZP_KEY_SECRET || process.env.RZP_KEY_SECRET.includes('${')) {
    console.error('❌ ERROR: RZP_KEY_SECRET is not properly set in environment variables!');
}

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RZP_KEY_ID,
    key_secret: process.env.RZP_KEY_SECRET
});

// Create Razorpay order
router.post('/create-order', async (req, res) => {
    try {
        console.log('=== CREATING RAZORPAY ORDER ===');
        console.log('Request data:', req.body);
        
        // Check if Razorpay is properly initialized
        if (!razorpay.key_id || !razorpay.key_secret) {
            console.error('❌ Razorpay not initialized properly');
            return res.status(500).json({
                success: false,
                message: 'Payment gateway not configured',
                details: 'Razorpay keys are missing or invalid'
            });
        }
        
        console.log('Using Razorpay key:', razorpay.key_id.substring(0, 8) + '...');
        
        const { amount, receipt, currency = 'INR' } = req.body;
        
        // Validate amount
        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid amount is required'
            });
        }
        
        // Convert to paise
        const amountInPaise = Math.round(amount * 100);
        console.log('Amount in paise:', amountInPaise);
        
        // Create Razorpay order
        const options = {
            amount: amountInPaise,
            currency: currency,
            receipt: receipt || `receipt_${Date.now()}`,
            payment_capture: 1
        };
        
        console.log('Razorpay options:', options);
        
        try {
            const order = await razorpay.orders.create(options);
            console.log('✅ Razorpay order created:', order.id);
            
            res.json({
                success: true,
                orderId: order.id,
                amount: order.amount,
                currency: order.currency
            });
            
        } catch (razorpayError) {
            console.error('❌ Razorpay API Error:', razorpayError);
            
            // Provide helpful error message
            let userMessage = 'Payment gateway error';
            if (razorpayError.statusCode === 401) {
                userMessage = 'Invalid payment gateway credentials. Please check backend configuration.';
            }
            
            res.status(500).json({
                success: false,
                message: userMessage,
                error: razorpayError.error?.description || razorpayError.message,
                code: razorpayError.statusCode
            });
        }
        
    } catch (error) {
        console.error('❌ General error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order',
            error: error.message
        });
    }
});

// Test endpoint
router.get('/test', async (req, res) => {
    const keyId = razorpay.key_id || process.env.RZP_KEY_ID;
    
    res.json({
        success: true,
        message: 'Razorpay test endpoint',
        key_configured: !!keyId,
        key_preview: keyId ? keyId.substring(0, 10) + '...' : 'Not set',
        secret_configured: !!(razorpay.key_secret || process.env.RZP_KEY_SECRET),
        timestamp: new Date().toISOString()
    });
});



// In razorpay.js
const crypto = require('crypto');

router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);
    
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RZP_KEY_SECRET)
      .update(body)
      .digest('hex');
    
    if (signature === expectedSignature) {
      const event = req.body.event;
      const payment = req.body.payload.payment.entity;
      
      // Handle payment events
      if (event === 'payment.captured') {
        // Update order status to paid
        console.log('Payment captured:', payment.id);
      } else if (event === 'payment.failed') {
        // Update order status to failed
        console.log('Payment failed:', payment.id);
      }
      
      res.status(200).send('OK');
    } else {
      res.status(400).send('Invalid signature');
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

module.exports = router;