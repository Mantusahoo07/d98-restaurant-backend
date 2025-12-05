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

module.exports = router;            });
        }
        
        // Make sure amount is an integer
        const amountInPaise = Math.round(Number(amount));
        
        console.log(`💰 Amount: ${amountInPaise} paise = ₹${(amountInPaise / 100).toFixed(2)}`);
        
        // Create order options
        const options = {
            amount: amountInPaise, // Razorpay expects amount in paise
            currency: currency,
            receipt: receipt || `receipt_${Date.now()}_${req.user.uid.substring(0, 8)}`,
            payment_capture: 1 // Auto capture
        };
        
        console.log('Razorpay options:', options);
        
        // Create Razorpay order
        const order = await razorpay.orders.create(options);
        
        console.log('✅ Order created:', order.id);
        
        // Return success response
        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount, // This is in paise
            currency: order.currency,
            receipt: order.receipt,
            status: order.status,
            message: 'Order created successfully'
        });
        
    } catch (error) {
        console.error('❌ Error creating order:', error);
        
        let errorMessage = 'Failed to create payment order';
        let statusCode = 500;
        
        if (error.statusCode === 401) {
            errorMessage = 'Invalid Razorpay credentials. Please check your API keys.';
            statusCode = 401;
        } else if (error.statusCode === 400) {
            errorMessage = error.error?.description || 'Invalid request to Razorpay';
            statusCode = 400;
        }
        
        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: error.message || 'Unknown error',
            code: error.statusCode
        });
    }
});

// Verify payment signature
router.post('/verify', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        
        console.log('🔐 Verifying payment signature...');
        console.log('Order ID:', razorpay_order_id);
        console.log('Payment ID:', razorpay_payment_id);
        
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Missing required payment details'
            });
        }
        
        // Generate expected signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RZP_KEY_SECRET)
            .update(body)
            .digest('hex');
        
        console.log('Expected signature:', expectedSignature.substring(0, 20) + '...');
        console.log('Received signature:', razorpay_signature.substring(0, 20) + '...');
        
        const isSignatureValid = expectedSignature === razorpay_signature;
        
        if (isSignatureValid) {
            console.log('✅ Signature verified successfully');
            res.json({
                success: true,
                message: 'Payment verified successfully',
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                verified: true
            });
        } else {
            console.error('❌ Invalid signature');
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

// Test endpoint to check if Razorpay is working
router.get('/test-connection', async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(500).json({
                success: false,
                message: 'Razorpay not initialized'
            });
        }
        
        // Try to fetch a test order to check connection
        const testOrderId = 'fake_order_for_test';
        
        // Just return the configuration status
        res.json({
            success: true,
            message: 'Razorpay is configured',
            razorpay: {
                initialized: true,
                key_id: process.env.RZP_KEY_ID ? process.env.RZP_KEY_ID.substring(0, 8) + '...' : 'Not set',
                test_mode: process.env.RZP_KEY_ID ? process.env.RZP_KEY_ID.includes('test') : false
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Test connection error:', error);
        res.status(500).json({
            success: false,
            message: 'Error testing Razorpay connection',
            error: error.message
        });
    }
});

// Get public key for frontend
router.get('/key', (req, res) => {
    res.json({
        success: true,
        key: process.env.RZP_KEY_ID
    });
});

module.exports = router;event = req.body.event;
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


