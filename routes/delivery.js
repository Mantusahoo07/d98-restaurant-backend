// routes/delivery.js - SIMPLE VERSION
const express = require('express');
const router = express.Router();

// Simple health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Delivery API is running' 
  });
});

// Mock profile endpoint
router.get('/profile', (req, res) => {
  // For now, just return a mock response
  res.json({
    success: true,
    data: {
      _id: 'demo_agent_1',
      name: 'Delivery Agent',
      email: 'delivery@d98.com',
      phone: '+919876543210',
      status: 'online',
      totalDeliveries: 12,
      totalEarnings: 600,
      rating: 4.5,
      todayStats: {
        deliveries: 3,
        earnings: 150
      }
    }
  });
});

// Mock available orders
router.get('/orders/available', (req, res) => {
  const mockOrders = [
    {
      _id: 'order_1_' + Date.now(),
      orderId: 'D98' + Date.now().toString().slice(-8),
      customerName: 'John Doe',
      customerPhone: '+919876543210',
      total: 450.00,
      status: 'ready_for_pickup',
      deliveryStatus: 'pending_assignment',
      createdAt: new Date().toISOString(),
      items: [
        { name: 'Chicken Biryani', quantity: 2, price: 200 },
        { name: 'Garlic Naan', quantity: 2, price: 50 }
      ],
      address: {
        line1: '123 Main Street',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        lat: 20.6952266,
        lng: 83.488972
      },
      deliveryOtp: '1234'
    }
  ];
  
  res.json({
    success: true,
    data: mockOrders
  });
});

module.exports = router;