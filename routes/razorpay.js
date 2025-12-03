// routes/razorpay.js
const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');

// Initialize Razorpay with LIVE keys
const razorpay = new Razorpay({
    key_id: process.env.RZP_LIVE_KEY_ID,
    key_secret: process.env.RZP_LIVE_KEY_SECRET
});

// Create Razorpay order (no auth required for this endpoint)
router.post('/create-order', async (req, res) => {
    try {
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
        
        // Create Razorpay order
        const options = {
            amount: amountInPaise,
            currency: currency,
            receipt: receipt || `receipt_${Date.now()}`,
            payment_capture: 1 // Auto capture payment
        };
        
        const order = await razorpay.orders.create(options);
        
        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency
        });
        
    } catch (error) {
        console.error('Razorpay order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order',
            error: error.message
        });
    }
});

// Verify payment webhook (for live mode)
router.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
    const crypto = require('crypto');
    
    const shasum = crypto.createHmac('sha256', process.env.RZP_LIVE_WEBHOOK_SECRET);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');
    
    if (digest === req.headers['x-razorpay-signature']) {
        // Payment is verified
        const paymentData = req.body.payload.payment.entity;
        
        console.log('✅ Webhook verified:', paymentData.id);
        // Update your database here
        
        res.json({ status: 'ok' });
    } else {
        // Invalid signature
        res.status(400).json({ status: 'invalid signature' });
    }
});

module.exports = router;