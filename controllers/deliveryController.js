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
        const activeOrders = await Order.countDocuments({ 
            deliveryAgent: agent._id,
            status: { $in: ['out_for_delivery', 'preparing', 'picked_up'] }
        });

        const completedOrders = await Order.countDocuments({ 
            deliveryAgent: agent._id,
            status: 'delivered'
        });

        const agentWithStats = {
            ...agent.toObject(),
            activeOrders,
            completedOrders,
            rating: 4.5 // Default or calculate from reviews
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
        const { name, phone, vehicleNumber, vehicleType, isActive } = req.body;

        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        // Update fields
        if (name) agent.name = name;
        if (phone) agent.phone = phone;
        if (vehicleNumber !== undefined) agent.vehicle = vehicleNumber;
        if (isActive !== undefined) agent.isActive = isActive;

        await agent.save();

        // Return updated agent without password
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

// Get active orders for agent
exports.getActiveOrders = async (req, res) => {
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
            status: { $in: ['confirmed', 'preparing', 'out_for_delivery', 'picked_up'] }
        })
        .populate('items.menuItem')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            orders
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

// Get available assignments for agent
exports.getAssignments = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent || !agent.isActive || agent.status !== 'available') {
            return res.json({
                success: true,
                assignments: []
            });
        }

        // Find orders without delivery agent or with specific status
        const assignments = await Order.find({
            $or: [
                { deliveryAgent: { $exists: false } },
                { deliveryAgent: null },
                { 
                    deliveryAgent: { $exists: true },
                    status: { $in: ['confirmed', 'preparing'] }
                }
            ],
            status: { $in: ['confirmed', 'preparing'] }
        })
        .populate('items.menuItem')
        .sort({ createdAt: 1 })
        .limit(10);

        res.json({
            success: true,
            assignments
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

// Accept assignment
// Accept assignment
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

        // Check if order is already assigned
        if (order.deliveryAgent && order.deliveryAgent.toString() !== agent._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Order already assigned to another agent'
            });
        }

        // IMPORTANT: Use 'out_for_delivery' - this IS in the enum
        order.deliveryAgent = agent._id;
        order.status = 'out_for_delivery'; // ← Changed from 'preparing' to 'out_for_delivery'
        order.assignedAt = new Date();
        await order.save();

        // Update agent status
        agent.status = 'busy';
        await agent.save();

        const updatedOrder = await Order.findById(order._id)
            .populate('items.menuItem');

        res.json({
            success: true,
            order: updatedOrder
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

// Reject assignment
exports.rejectAssignment = async (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Assignment rejected'
        });
    } catch (error) {
        console.error('Error rejecting assignment:', error);
        res.status(500).json({
            success: false,
            message: 'Error rejecting assignment',
            error: error.message
        });
    }
};

// Mark order as picked up
exports.markAsPickedUp = async (req, res) => {
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
        if (order.deliveryAgent.toString() !== agent._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Order not assigned to you'
            });
        }

        order.status = 'out_for_delivery';
        await order.save();

        const updatedOrder = await Order.findById(order._id)
            .populate('items.menuItem');

        res.json({
            success: true,
            order: updatedOrder
        });
    } catch (error) {
        console.error('Error marking as picked up:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking as picked up',
            error: error.message
        });
    }
};



// Verify delivery OTP for delivery agent
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
        
        res.json({
            success: true,
            message: 'OTP verified and order marked as delivered',
            data: order
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

// Get earnings data
exports.getEarnings = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        // Get today's start and end
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Get this week's start (Monday)
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1);
        weekStart.setHours(0, 0, 0, 0);

        // Get this month's start
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        // Get agent's delivered orders
        const deliveredOrders = await Order.find({
            deliveryAgent: agent._id,
            status: 'delivered'
        }).select('total deliveryCharge deliveredAt');

        // Calculate earnings
        let todayEarnings = 0;
        let weekEarnings = 0;
        let monthEarnings = 0;
        let totalEarnings = 0;

        deliveredOrders.forEach(order => {
            const orderDate = new Date(order.deliveredAt);
            const earnings = order.deliveryCharge || 40; // Default ₹40 per delivery

            totalEarnings += earnings;
            
            if (orderDate >= today) {
                todayEarnings += earnings;
            }
            
            if (orderDate >= weekStart) {
                weekEarnings += earnings;
            }
            
            if (orderDate >= monthStart) {
                monthEarnings += earnings;
            }
        });

        // Mock earnings data
        const earningsData = {
            today: todayEarnings,
            week: weekEarnings,
            month: monthEarnings,
            total: totalEarnings,
            totalDeliveries: agent.ordersDelivered,
            rating: 4.5,
            avgDeliveryTime: 25, // minutes
            deductions: 0,
            bonuses: 0,
            monthlyDeliveries: deliveredOrders.filter(order => 
                new Date(order.deliveredAt) >= monthStart
            ).length
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

// Get transaction history
exports.getTransactionHistory = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        // Get delivered orders as transactions
        const orders = await Order.find({
            deliveryAgent: agent._id,
            status: 'delivered'
        }).select('orderId total deliveryCharge deliveredAt')
          .sort({ deliveredAt: -1 })
          .limit(20);

        const transactions = orders.map(order => ({
            type: 'delivery',
            amount: order.deliveryCharge || 40,
            orderId: order.orderId,
            date: order.deliveredAt,
            status: 'completed'
        }));

        // Add some mock transactions for demonstration
        const mockTransactions = [
            {
                type: 'bonus',
                amount: 200,
                description: 'Weekly performance bonus',
                date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                status: 'completed'
            },
            {
                type: 'withdrawal',
                amount: -1500,
                description: 'Bank transfer',
                date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                status: 'completed'
            }
        ];

        const allTransactions = [...mockTransactions, ...transactions]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);

        res.json({
            success: true,
            transactions: allTransactions
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

// Get notifications
exports.getNotifications = async (req, res) => {
    try {
        const agent = await DeliveryAgent.findOne({ email: req.user.email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Delivery agent not found'
            });
        }

        // Mock notifications
        const notifications = [
            {
                id: 1,
                title: 'New Assignment',
                message: 'You have a new delivery assignment in your area',
                type: 'assignment',
                read: false,
                createdAt: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
            },
            {
                id: 2,
                title: 'Weekly Earnings',
                message: 'Your weekly earnings report is available',
                type: 'earnings',
                read: true,
                createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
            },
            {
                id: 3,
                title: 'Profile Update',
                message: 'Please update your vehicle information',
                type: 'reminder',
                read: false,
                createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
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

// Check if user is a delivery agent
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
