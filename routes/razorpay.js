// routes/razorpay.js
const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const auth = require('../middleware/auth');

// Apply authentication middleware to all routes
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

// Test endpoint - check if Razorpay is configured correctly
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
        
        // Convert to paise (Razorpay expects amount in smallest currency unit)
        // For INR: ₹1 = 100 paise
        const amountInPaise = Math.round(amount);
        console.log('Amount in paise:', amountInPaise);
        console.log('Amount in rupees:', (amountInPaise / 100).toFixed(2));
        
        // Validate amount is reasonable (minimum ₹1, maximum ₹100000)
        if (amountInPaise < 100) {
            return res.status(400).json({
                success: false,
                message: 'Minimum amount is ₹1'
            });
        }
        
        if (amountInPaise > 10000000) { // ₹100,000 maximum
            return res.status(400).json({
                success: false,
                message: 'Maximum amount is ₹100,000'
            });
        }
        
        // Create Razorpay order
        const options = {
            amount: amountInPaise,
            currency: currency,
            receipt: receipt || `receipt_${Date.now()}_${req.user.uid}`,
            payment_capture: 1, // Auto capture payment
            notes: {
                userId: req.user.uid,
                orderType: 'food_delivery',
                timestamp: new Date().toISOString()
            }
        };
        
        console.log('Razorpay options:', options);
        
        try {
            const order = await razorpay.orders.create(options);
            console.log('✅ Razorpay order created:', order.id);
            
            res.json({
                success: true,
                orderId: order.id,
                amount: order.amount, // This is in paise
                currency: order.currency,
                receipt: order.receipt,
                status: order.status
            });
            
        } catch (razorpayError) {
            console.error('❌ Razorpay API Error:', razorpayError);
            
            // Provide helpful error message
            let userMessage = 'Payment gateway error';
            let errorCode = razorpayError.statusCode || 500;
            
            if (razorpayError.statusCode === 401) {
                userMessage = 'Invalid payment gateway credentials. Please check backend configuration.';
            } else if (razorpayError.statusCode === 400) {
                userMessage = 'Invalid payment request. Please check the amount and currency.';
            }
            
            res.status(errorCode).json({
                success: false,
                message: userMessage,
                error: razorpayError.error?.description || razorpayError.message,
                code: razorpayError.statusCode
            });
        }
        
    } catch (error) {
        console.error('❌ General error in create-order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order',
            error: error.message
        });
    }
});

// Verify payment signature
router.post('/verify-payment', async (req, res) => {
    try {
        const crypto = require('crypto');
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        
        console.log('=== VERIFYING PAYMENT SIGNATURE ===');
        console.log('Order ID:', razorpay_order_id);
        console.log('Payment ID:', razorpay_payment_id);
        
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Missing payment verification details'
            });
        }
        
        // Create signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RZP_KEY_SECRET)
            .update(body.toString())
            .digest('hex');
        
        const isAuthentic = expectedSignature === razorpay_signature;
        
        console.log('Signature verification:', isAuthentic ? '✅ Valid' : '❌ Invalid');
        
        if (isAuthentic) {
            res.json({
                success: true,
                message: 'Payment verified successfully',
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                verified: true
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Invalid payment signature',
                verified: false
            });
        }
        
    } catch (error) {
        console.error('❌ Error verifying payment:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying payment',
            error: error.message
        });
    }
});

// Get payment details
router.get('/payment/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        
        console.log('Getting payment details for:', paymentId);
        
        const payment = await razorpay.payments.fetch(paymentId);
        
        res.json({
            success: true,
            payment: {
                id: payment.id,
                amount: payment.amount,
                currency: payment.currency,
                status: payment.status,
                method: payment.method,
                captured: payment.captured,
                email: payment.email,
                contact: payment.contact,
                createdAt: new Date(payment.created_at * 1000).toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching payment details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching payment details',
            error: error.message
        });
    }
});

// Get order details
router.get('/order/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        console.log('Getting order details for:', orderId);
        
        const order = await razorpay.orders.fetch(orderId);
        
        res.json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
                receipt: order.receipt,
                status: order.status,
                attempts: order.attempts,
                createdAt: new Date(order.created_at * 1000).toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching order details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching order details',
            error: error.message
        });
    }
});

// Webhook endpoint for payment events
const crypto = require('crypto');

router.post('/webhook', async (req, res) => {
    try {
        console.log('=== RAZORPAY WEBHOOK RECEIVED ===');
        
        const signature = req.headers['x-razorpay-signature'];
        const body = JSON.stringify(req.body);
        
        // Verify webhook signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RZP_WEBHOOK_SECRET || process.env.RZP_KEY_SECRET)
            .update(body)
            .digest('hex');
        
        if (signature !== expectedSignature) {
            console.error('❌ Invalid webhook signature');
            return res.status(400).send('Invalid signature');
        }
        
        const event = req.body.event;
        const payment = req.body.payload?.payment?.entity;
        const order = req.body.payload?.order?.entity;
        
        console.log('Webhook event:', event);
        console.log('Payment ID:', payment?.id);
        console.log('Order ID:', order?.id);
        
        // Handle different events
        switch (event) {
            case 'payment.captured':
                console.log('✅ Payment captured successfully:', payment.id);
                // Update your database order status to 'paid'
                break;
                
            case 'payment.failed':
                console.error('❌ Payment failed:', payment.id);
                // Update your database order status to 'failed'
                break;
                
            case 'order.paid':
                console.log('✅ Order paid:', order.id);
                // Order is paid (all payments captured)
                break;
                
            default:
                console.log('ℹ️ Unhandled event type:', event);
        }
        
        // Always return 200 to acknowledge receipt
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).send('Error processing webhook');
    }
});

// Refund payment
router.post('/refund', async (req, res) => {
    try {
        const { paymentId, amount, notes } = req.body;
        
        if (!paymentId) {
            return res.status(400).json({
                success: false,
                message: 'Payment ID is required'
            });
        }
        
        const refundData = {
            payment_id: paymentId,
            amount: amount, // Optional: partial refund if specified
            notes: notes || { reason: 'Customer request' }
        };
        
        console.log('Processing refund:', refundData);
        
        const refund = await razorpay.refunds.create(refundData);
        
        res.json({
            success: true,
            refund: {
                id: refund.id,
                amount: refund.amount,
                currency: refund.currency,
                status: refund.status,
                speed_processed: refund.speed_processed,
                speed_requested: refund.speed_requested,
                createdAt: new Date(refund.created_at * 1000).toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Error processing refund:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing refund',
            error: error.message
        });
    }
});

module.exports = router;            
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
