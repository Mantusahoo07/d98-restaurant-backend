// routes/razorpay.js
const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RZP_KEY_ID,
    key_secret: process.env.RZP_KEY_SECRET
});

// Create Razorpay order
router.post('/create-order', async (req, res) => {
    try {
        console.log('Creating Razorpay order with data:', req.body);
        
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
            payment_capture: 1 // Auto capture
        };
        
        console.log('Razorpay options:', options);
        
        const order = await razorpay.orders.create(options);
        
        console.log('Razorpay order created:', order.id);
        
        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency
        });
        
    } catch (error) {
        console.error('Razorpay order creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order',
            error: error.message
        });
    }
});

// Test endpoint to check if Razorpay is working
router.get('/test', async (req, res) => {
    try {
        // Try to fetch payments to test connection
        const payments = await razorpay.payments.all({ count: 1 });
        
        res.json({
            success: true,
            message: 'Razorpay connection successful',
            key_id: razorpay.key_id
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Razorpay connection failed',
            error: error.message
        });
    }
});

module.exports = router;