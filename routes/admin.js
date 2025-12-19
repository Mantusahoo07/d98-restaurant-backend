const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const Order = require('../models/Order');
const DeliveryAgent = require('../models/DeliveryPartner');

/* =====================================================
   ADMIN – ASSIGN DELIVERY AGENT TO ORDER
   POST /api/admin/orders/:id/assign-agent
===================================================== */
router.post('/orders/:id/assign-agent', auth, async (req, res) => {
  try {
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        message: 'agentId is required'
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Ensure order is ready
    if (!order.isReadyForPickup()) {
      return res.status(400).json({
        success: false,
        message: 'Order not ready for assignment'
      });
    }

    const agent = await DeliveryAgent.findById(agentId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Delivery agent not found'
      });
    }

    // Assign agent using schema method
    order.assignAgent(agent._id, agent.name, agent.phone);

    // Generate OTP if missing
    if (!order.deliveryOtp) {
      order.deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
    }

    await order.save();

    res.json({
      success: true,
      message: 'Delivery agent assigned successfully',
      order: {
        id: order._id,
        deliveryStatus: order.deliveryStatus,
        assignedAt: order.deliveryAssignedAt
      },
      agent: {
        id: agent._id,
        name: agent.name,
        phone: agent.phone
      }
    });

  } catch (error) {
    console.error('Assign agent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign delivery agent'
    });
  }
});

module.exports = router;
