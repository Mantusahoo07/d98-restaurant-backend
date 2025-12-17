// controllers/adminOrderController.js
const Order = require('../models/Order');

exports.getAdminOrders = async (req, res) => {
  try {
    const { status } = req.query;
    
    let filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    const orders = await Order.find(filter)
      .populate('items.menuItem')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('items.menuItem');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating order',
      error: error.message
    });
  }
};
