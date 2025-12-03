// routes/razorpay.js
const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const auth = require('../middleware/auth');

console.log('Razorpay Environment Check:');
console.log('RZP_KEY_ID exists:', !!process.env.RZP_KEY_ID);
console.log('RZP_KEY_ID starts with:', process.env.RZP_KEY_ID ? process.env.RZP_KEY_ID.substring(0, 10) + '...' : 'NOT SET');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RZP_KEY_ID || 'rzp_test_dr3j7aeO5e1ItX',
    key_secret: process.env.RZP_KEY_SECRET || ''
});

router.use(auth);
// Create Razorpay order
router.post('/create-order', async (req, res) => {
    try {
        console.log('Creating Razorpay order with data:', req.body);
        console.log('Using Razorpay key:', razorpay.key_id.substring(0, 10) + '...');
        
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
            payment_capture: 1 // Auto capture
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
            res.status(500).json({
                success: false,
                message: 'Razorpay API error',
                error: razorpayError.message,
                errorDetails: razorpayError.error || razorpayError
            });
        }
        
    } catch (error) {
        console.error('❌ Razorpay order creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order',
            error: error.message,
            stack: error.stack
        });
    }
});

// Test endpoint to check if Razorpay is working
router.get('/test', async (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Razorpay route is working',
            key_id: razorpay.key_id ? razorpay.key_id.substring(0, 10) + '...' : 'Not set',
            env_loaded: !!process.env.RZP_KEY_ID
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Razorpay test failed',
            error: error.message
        });
    }
});

module.exports = router;