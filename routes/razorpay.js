// routes/razorpay.js
const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const auth = require('../middleware/auth');

// Apply authentication middleware to all routes except webhook
router.use((req, res, next) => {
    if (req.path === '/webhook') {
        return next(); // Skip auth for webhook
    }
    auth(req, res, next);
});

console.log('=== RAZORPAY CONFIGURATION ===');
console.log('RZP_KEY_ID from env:', process.env.RZP_KEY_ID ? process.env.RZP_KEY_ID.substring(0, 8) + '...' : 'NOT SET');
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
        
        // IMPORTANT: Frontend should send amount in paise already
        // But let's ensure it's a valid integer for Razorpay
        let amountInPaise = Math.round(amount);
        
        // DEBUG: Log what we're receiving
        console.log('Amount received:', amount);
        console.log('Amount type:', typeof amount);
        console.log('Amount after rounding to paise:', amountInPaise);
        
        // Additional validation for Razorpay
        // Razorpay requires amount to be at least 100 paise (₹1) for INR
        if (currency === 'INR' && amountInPaise < 100) {
            return res.status(400).json({
                success: false,
                message: 'Amount must be at least ₹1.00',
                receivedAmount: amountInPaise / 100
            });
        }
        
        // Create Razorpay order
        const options = {
            amount: amountInPaise, // Razorpay expects amount in smallest currency unit (paise for INR)
            currency: currency,
            receipt: receipt || `receipt_${Date.now()}`,
            payment_capture: 1,
            notes: {
                userId: req.user?.uid || 'unknown',
                orderType: 'food_delivery'
            }
        };
        
        console.log('Razorpay options:', options);
        
        try {
            const order = await razorpay.orders.create(options);
            console.log('✅ Razorpay order created:', order.id);
            console.log('Order amount (paise):', order.amount);
            console.log('Order amount (rupees):', order.amount / 100);
            
            res.json({
                success: true,
                orderId: order.id,
                amount: order.amount, // Return amount in paise
                currency: order.currency,
                receipt: order.receipt
            });
            
        } catch (razorpayError) {
            console.error('❌ Razorpay API Error:', razorpayError);
            
            // Provide helpful error message
            let userMessage = 'Payment gateway error';
            let errorDetails = razorpayError.error?.description || razorpayError.message;
            
            if (razorpayError.statusCode === 401) {
                userMessage = 'Invalid payment gateway credentials. Please check backend configuration.';
            } else if (razorpayError.statusCode === 400) {
                userMessage = 'Invalid payment request. Please check the amount and try again.';
            }
            
            res.status(500).json({
                success: false,
                message: userMessage,
                error: errorDetails,
                code: razorpayError.statusCode
            });
        }
        
    } catch (error) {
        console.error('❌ General error in create-order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Verify payment signature (optional endpoint)
router.post('/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Missing payment verification parameters'
            });
        }
        
        // Create expected signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RZP_KEY_SECRET)
            .update(body)
            .digest('hex');
        
        const isSignatureValid = expectedSignature === razorpay_signature;
        
        if (isSignatureValid) {
            console.log('✅ Payment signature verified successfully');
            res.json({
                success: true,
                message: 'Payment signature verified',
                paymentId: razorpay_payment_id,
                orderId: razorpay_order_id
            });
        } else {
            console.error('❌ Payment signature verification failed');
            res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }
        
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying payment',
            error: error.message
        });
    }
});

// Webhook endpoint (for Razorpay to send payment events)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        console.log('=== RAZORPAY WEBHOOK RECEIVED ===');
        
        const signature = req.headers['x-razorpay-signature'];
        const webhookSecret = process.env.RZP_WEBHOOK_SECRET; // You should set this in environment
        
        if (!signature) {
            console.error('❌ No signature in webhook');
            return res.status(400).send('No signature');
        }
        
        // Verify webhook signature if secret is set
        if (webhookSecret) {
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(req.body)
                .digest('hex');
            
            if (signature !== expectedSignature) {
                console.error('❌ Invalid webhook signature');
                return res.status(400).send('Invalid signature');
            }
        }
        
        const event = JSON.parse(req.body);
        console.log('Webhook event:', event.event);
        console.log('Webhook payload:', JSON.stringify(event.payload, null, 2));
        
        // Handle different payment events
        switch (event.event) {
            case 'payment.captured':
                console.log('💰 Payment captured:', event.payload.payment.entity.id);
                // Update order status to paid in your database
                break;
                
            case 'payment.failed':
                console.log('❌ Payment failed:', event.payload.payment.entity.id);
                // Update order status to failed in your database
                break;
                
            case 'order.paid':
                console.log('✅ Order paid:', event.payload.order.entity.id);
                // Update order status to confirmed/paid
                break;
                
            default:
                console.log('ℹ️ Unhandled webhook event:', event.event);
        }
        
        // Always respond with 200 OK to acknowledge receipt
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).send('Error processing webhook');
    }
});

// Get payment details
router.get('/payment/:paymentId', async (req, res) => {
    try {
        const paymentId = req.params.paymentId;
        
        if (!paymentId) {
            return res.status(400).json({
                success: false,
                message: 'Payment ID is required'
            });
        }
        
        const payment = await razorpay.payments.fetch(paymentId);
        
        res.json({
            success: true,
            payment: {
                id: payment.id,
                amount: payment.amount,
                currency: payment.currency,
                status: payment.status,
                method: payment.method,
                order_id: payment.order_id,
                created_at: payment.created_at
            }
        });
        
    } catch (error) {
        console.error('Error fetching payment:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching payment details',
            error: error.message
        });
    }
});

module.exports = router;