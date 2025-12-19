const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

const Order = require('../models/Order');
const DeliveryAgent = require('../models/DeliveryPartner');

/* ===============================
   AUTH REQUIRED FOR ALL ROUTES
================================ */
router.use(auth);

/* ===============================
   GET /api/agent/profile
================================ */
router.get('/profile', async (req, res) => {
  let agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });

  if (!agent) {
    agent = await DeliveryAgent.create({
      firebaseUid: req.user.uid,
      email: req.user.email
    });
  }

  res.json({ success: true, agent });
});

/* ===============================
   POST /api/agent/status
================================ */
router.post('/status', async (req, res) => {
  const { status } = req.body;

  await DeliveryAgent.findOneAndUpdate(
    { firebaseUid: req.user.uid },
    { status }
  );

  res.json({ success: true });
});

/* ===============================
   GET /api/agent/orders
================================ */
router.get('/orders', async (req, res) => {
  const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });

  const orders = await Order.getOrdersByAgent(agent._id)
    .populate('items.menuItem');

  res.json({ success: true, orders });
});

/* ===============================
   POST /api/agent/orders/:id/pick
================================ */
router.post('/orders/:id/pick', async (req, res) => {
  const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });

  const order = await Order.findOne({
    _id: req.params.id,
    deliveryAgentId: agent._id
  });

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  order.markAsPicked();
  await order.save();

  agent.status = 'on_delivery';
  await agent.save();

  res.json({ success: true, message: 'Order picked up' });
});

/* ===============================
   POST /api/agent/orders/:id/start
================================ */
router.post('/orders/:id/start', async (req, res) => {
  const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });

  const order = await Order.findOne({
    _id: req.params.id,
    deliveryAgentId: agent._id
  });

  if (!order) {
    return res.status(404).json({ success: false });
  }

  order.startDelivery();
  await order.save();

  res.json({ success: true, message: 'Out for delivery' });
});

/* ===============================
   POST /api/agent/orders/:id/arrived
================================ */
router.post('/orders/:id/arrived', async (req, res) => {
  const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });

  const order = await Order.findOne({
    _id: req.params.id,
    deliveryAgentId: agent._id
  });

  if (!order) {
    return res.status(404).json({ success: false });
  }

  order.arriveAtCustomer();
  await order.save();

  res.json({ success: true, message: 'Arrived at customer' });
});

/* ===============================
   POST /api/agent/orders/:id/complete
================================ */
router.post('/orders/:id/complete', async (req, res) => {
  const { otp } = req.body;

  const agent = await DeliveryAgent.findOne({ firebaseUid: req.user.uid });

  const order = await Order.findOne({
    _id: req.params.id,
    deliveryAgentId: agent._id
  });

  if (!order) {
    return res.status(404).json({ success: false });
  }

  const verified = order.completeDelivery(otp);
  if (!verified) {
    return res.status(400).json({
      success: false,
      message: 'Invalid OTP'
    });
  }

  await order.save();

  agent.totalDeliveries += 1;
  agent.totalEarnings += 30; // configurable
  agent.status = 'online';
  await agent.save();

  res.json({
    success: true,
    message: 'Delivery completed successfully'
  });
});

/* ===============================
   POST /api/agent/location
================================ */
router.post('/location', async (req, res) => {
  const { lat, lng } = req.body;

  await DeliveryAgent.findOneAndUpdate(
    { firebaseUid: req.user.uid },
    {
      currentLocation: {
        lat,
        lng,
        updatedAt: new Date()
      }
    }
  );

  res.json({ success: true });
});

module.exports = router;
