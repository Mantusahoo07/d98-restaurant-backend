const DeliveryAgent = require('../models/DeliveryAgent');
const Order = require('../models/Order');

// Get delivery agent profile
exports.getAgentProfile = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ 
            email: req.user.email 
        }).select('-password -__v');

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        // Get agent statistics
        const assignedOrders = await Order.countDocuments({ 
            deliveryAgent: agent._id,
            status: 'assigned'
        });

        const activeOrders = await Order.countDocuments({ 
            deliveryAgent: agent._id,
            status: { $in: ['out_for_delivery'] }
        });

        const completedOrders = await Order.countDocuments({ 
            deliveryAgent: agent._id,
            status: 'delivered'
        });

        const agentWithStats = {
            ...agent.toObject(),
            assignedOrders,
            activeOrders,
            completedOrders,
            rating: 4.5
        };

        res.json({
            success: true,
            agent: agentWithStats
        });
    } catch (error) {
        console.error('Error fetching agent profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching agent profile',
            error: error.message
        });
    }
};

// Update agent profile
exports.updateAgentProfile = async (req, res) => {
    try {
        const { name, phone, vehicleNumber, isActive } = req.body;

        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        if (name) agent.name = name;
        if (phone) agent.phone = phone;
        if (vehicleNumber !== undefined) agent.vehicle = vehicleNumber;
        if (isActive !== undefined) agent.isActive = isActive;

        await agent.save();

        const updatedAgent = await DeliveryAgent.findById(agent._id).select('-password -__v');

        res.json({
            success: true,
            agent: updatedAgent
        });
    } catch (error) {
        console.error('Error updating agent profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating agent profile',
            error: error.message
        });
    }
};

// ==================== FIXED: Get assigned orders for specific agent ====================
exports.getAssignedOrders = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        // ONLY orders assigned to THIS specific agent with status 'assigned'
        const orders = await Order.find({
            deliveryAgent: agent._id,
            status: 'assigned'
        })
        .populate('items.menuItem')
        .sort({ createdAt: -1 });

        // Return without price information
        const ordersWithoutPrices = orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            address: order.address,
            items: order.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                instruction: item.instruction
                // Removed price
            })),
            status: order.status,
            createdAt: order.createdAt,
            deliveryOtp: order.deliveryOtp
        }));

        res.json({
            success: true,
            orders: ordersWithoutPrices,
            count: ordersWithoutPrices.length
        });
    } catch (error) {
        console.error('Error fetching assigned orders:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching assigned orders',
            error: error.message
        });
    }
};

// ==================== Get active (out_for_delivery) orders for agent ====================
exports.getActiveOrders = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        // Orders with status 'out_for_delivery' assigned to this agent
        const orders = await Order.find({
            deliveryAgent: agent._id,
            status: 'out_for_delivery'
        })
        .populate('items.menuItem')
        .sort({ createdAt: -1 });

        // Return without price information
        const ordersWithoutPrices = orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            address: order.address,
            items: order.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                instruction: item.instruction
                // Removed price
            })),
            status: order.status,
            createdAt: order.createdAt,
            deliveryOtp: order.deliveryOtp
        }));

        res.json({
            success: true,
            orders: ordersWithoutPrices,
            count: ordersWithoutPrices.length
        });
    } catch (error) {
        console.error('Error fetching active orders:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching active orders',
            error: error.message
        });
    }
};

// ==================== Get completed (delivered) orders for agent ====================
exports.getCompletedOrders = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        // Orders with status 'delivered' assigned to this agent
        const orders = await Order.find({
            deliveryAgent: agent._id,
            status: 'delivered'
        })
        .populate('items.menuItem')
        .sort({ deliveredAt: -1 })
        .limit(20);

        // Return without price information
        const ordersWithoutPrices = orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            customerName: order.customerName,
            address: order.address,
            items: order.items.map(item => ({
                name: item.name,
                quantity: item.quantity
                // Removed price
            })),
            status: order.status,
            deliveredAt: order.deliveredAt,
            createdAt: order.createdAt
        }));

        res.json({
            success: true,
            orders: ordersWithoutPrices,
            count: ordersWithoutPrices.length
        });
    } catch (error) {
        console.error('Error fetching completed orders:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching completed orders',
            error: error.message
        });
    }
};

// ==================== Get available assignments ====================
exports.getAssignments = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent || !agent.isActive || agent.status !== 'available') {
            return res.json({
                success: true,
                assignments: []
            });
        }

        // ONLY orders with status 'confirmed' AND no agent
        const assignments = await Order.find({
            status: 'confirmed',
            $or: [
                { deliveryAgent: { $exists: false } },
                { deliveryAgent: null }
            ]
        })
        .populate('items.menuItem')
        .sort({ createdAt: 1 })
        .limit(10);

        // Return without price information
        const assignmentsWithoutPrices = assignments.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            address: order.address,
            items: order.items.map(item => ({
                name: item.name,
                quantity: item.quantity
                // Removed price
            })),
            status: order.status,
            createdAt: order.createdAt
        }));

        res.json({
            success: true,
            assignments: assignmentsWithoutPrices,
            count: assignmentsWithoutPrices.length
        });
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching assignments',
            error: error.message
        });
    }
};

// ==================== Accept assignment ====================
exports.acceptAssignment = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent || agent.status !== 'available') {
            return res.status(400).json({
                success: false,
                message: 'Agent is not available'
            });
        }

        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order is confirmed (ready for assignment)
        if (order.status !== 'confirmed') {
            return res.status(400).json({
                success: false,
                message: 'Order is not ready for assignment'
            });
        }

        // Double-check order doesn't already have an agent
        if (order.deliveryAgent) {
            return res.status(400).json({
                success: false,
                message: 'Order already assigned to another agent'
            });
        }

        // Assign to this agent - set status to 'assigned' first
        order.deliveryAgent = agent._id;
        order.status = 'assigned';
        order.assignedAt = new Date();
        await order.save();

        // Update agent status
        agent.status = 'busy';
        await agent.save();

        const updatedOrder = await Order.findById(order._id)
            .populate('items.menuItem');

        // Return without price
        const orderWithoutPrice = {
            _id: updatedOrder._id,
            orderId: updatedOrder.orderId,
            customerName: updatedOrder.customerName,
            customerPhone: updatedOrder.customerPhone,
            address: updatedOrder.address,
            items: updatedOrder.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                instruction: item.instruction
            })),
            status: updatedOrder.status,
            createdAt: updatedOrder.createdAt,
            deliveryOtp: updatedOrder.deliveryOtp
        };

        res.json({
            success: true,
            order: orderWithoutPrice,
            message: 'Order assigned successfully'
        });
    } catch (error) {
        console.error('Error accepting assignment:', error);
        res.status(500).json({
            success: false,
            message: 'Error accepting assignment',
            error: error.message
        });
    }
};

// ==================== Mark as out for delivery (after picking up) ====================
exports.markAsOutForDelivery = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order is assigned to this agent
        if (!order.deliveryAgent || order.deliveryAgent.toString() !== agent._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Order not assigned to you'
            });
        }

        // Check if order is in assigned status
        if (order.status !== 'assigned') {
            return res.status(400).json({
                success: false,
                message: 'Order is not in assigned status'
            });
        }

        // Update to out_for_delivery
        order.status = 'out_for_delivery';
        await order.save();

        const updatedOrder = await Order.findById(order._id)
            .populate('items.menuItem');

        // Return without price
        const orderWithoutPrice = {
            _id: updatedOrder._id,
            orderId: updatedOrder.orderId,
            customerName: updatedOrder.customerName,
            customerPhone: updatedOrder.customerPhone,
            address: updatedOrder.address,
            items: updatedOrder.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                instruction: item.instruction
            })),
            status: updatedOrder.status,
            createdAt: updatedOrder.createdAt,
            deliveryOtp: updatedOrder.deliveryOtp
        };

        res.json({
            success: true,
            order: orderWithoutPrice,
            message: 'Order marked as out for delivery'
        });
    } catch (error) {
        console.error('Error marking as out for delivery:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking as out for delivery',
            error: error.message
        });
    }
};

// ==================== Verify delivery OTP ====================
exports.verifyDeliveryOtp = async (req, res) => {
    try {
        console.log('🔑 Verifying delivery OTP for order:', req.params.id);
        
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        const { otp } = req.body;
        
        if (!otp) {
            return res.status(400).json({
                success: false,
                message: 'OTP is required'
            });
        }
        
        // Verify OTP
        if (order.deliveryOtp !== otp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP'
            });
        }
        
        // Check if order is already delivered
        if (order.status === 'delivered') {
            return res.status(400).json({
                success: false,
                message: 'Order is already delivered'
            });
        }
        
        // OTP verified, mark as delivered
        order.status = 'delivered';
        order.deliveredAt = new Date();
        order.otpVerified = true;
        await order.save();
        
        // Update agent stats
        const agent = await DeliveryAgent.findById(order.deliveryAgent);
        if (agent) {
            agent.ordersDelivered += 1;
            // Check if agent has any other active orders
            const otherActiveOrders = await Order.countDocuments({
                deliveryAgent: agent._id,
                status: { $in: ['assigned', 'out_for_delivery'] }
            });
            
            if (otherActiveOrders === 0) {
                agent.status = 'available';
            }
            await agent.save();
        }
        
        res.json({
            success: true,
            message: 'OTP verified and order marked as delivered',
            data: {
                _id: order._id,
                orderId: order.orderId,
                status: order.status,
                deliveredAt: order.deliveredAt
            }
        });
    } catch (error) {
        console.error('Error verifying delivery OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying delivery OTP',
            error: error.message
        });
    }
};

// ==================== Get earnings data (simplified - count only) ====================
exports.getEarnings = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1);
        weekStart.setHours(0, 0, 0, 0);

        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const deliveredOrders = await Order.find({
            deliveryAgent: agent._id,
            status: 'delivered'
        }).select('deliveredAt');

        let todayDeliveries = 0;
        let weekDeliveries = 0;
        let monthDeliveries = 0;

        deliveredOrders.forEach(order => {
            const orderDate = new Date(order.deliveredAt);

            if (orderDate >= today) {
                todayDeliveries++;
            }
            
            if (orderDate >= weekStart) {
                weekDeliveries++;
            }
            
            if (orderDate >= monthStart) {
                monthDeliveries++;
            }
        });

        const earningsData = {
            today: todayDeliveries,
            week: weekDeliveries,
            month: monthDeliveries,
            total: agent.ordersDelivered,
            totalDeliveries: agent.ordersDelivered,
            rating: 4.5,
            avgDeliveryTime: 25,
            monthlyDeliveries: monthDeliveries
        };

        res.json({
            success: true,
            earnings: earningsData
        });
    } catch (error) {
        console.error('Error fetching earnings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching earnings',
            error: error.message
        });
    }
};

// ==================== Get transaction history (simplified) ====================
exports.getTransactionHistory = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        const orders = await Order.find({
            deliveryAgent: agent._id,
            status: 'delivered'
        }).select('orderId deliveredAt')
          .sort({ deliveredAt: -1 })
          .limit(20);

        const transactions = orders.map(order => ({
            type: 'delivery',
            orderId: order.orderId,
            date: order.deliveredAt,
            status: 'completed'
        }));

        res.json({
            success: true,
            transactions: transactions
        });
    } catch (error) {
        console.error('Error fetching transaction history:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching transaction history',
            error: error.message
        });
    }
};

// ==================== Get notifications ====================
exports.getNotifications = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        const notifications = [
            {
                id: 1,
                title: 'New Assignment',
                message: 'You have a new delivery assignment in your area',
                type: 'assignment',
                read: false,
                createdAt: new Date(Date.now() - 30 * 60 * 1000)
            },
            {
                id: 2,
                title: 'Weekly Summary',
                message: `You completed ${agent.ordersDelivered || 0} deliveries this week`,
                type: 'earnings',
                read: true,
                createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
            }
        ];

        res.json({
            success: true,
            notifications
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching notifications',
            error: error.message
        });
    }
};

// ==================== Check if user is a delivery agent ====================
exports.checkAgentStatus = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ 
            email: req.user.email 
        }).select('email name isActive');

        if (agent) {
            res.json({
                success: true,
                isAgent: true,
                agent
            });
        } else {
            res.json({
                success: true,
                isAgent: false
            });
        }
    } catch (error) {
        console.error('Error checking agent status:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking agent status',
            error: error.message
        });
    }
};
