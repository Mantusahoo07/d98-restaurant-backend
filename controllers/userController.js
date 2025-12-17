const User = require('../models/User');

// Get user profile
exports.getUserProfile = async (req, res) => {
  try {
    console.log('🔍 Looking for user with firebaseUid:', req.user.uid);
    const user = await User.findOne({ firebaseUid: req.user.uid });
    
    if (!user) {
      console.log('❌ User not found in database');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log('✅ User found:', user.email);
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('❌ Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user profile',
      error: error.message
    });
  }
};

// Create user profile if not exists
exports.createUserProfile = async (req, res) => {
  try {
    console.log('👤 Creating user profile for firebaseUid:', req.user.uid);
    
    // Check existing user
    let user = await User.findOne({ firebaseUid: req.user.uid });

    if (user) {
      console.log('ℹ️ User already exists:', user.email);
      return res.json({
        success: true,
        data: user,
        message: 'User already exists'
      });
    }

    // Create new user with data from body OR from Firebase token
    const userData = {
      firebaseUid: req.user.uid,
      name: req.body.name || req.user.name || "User",
      email: req.user.email || req.body.email,
      phone: req.body.phone || "",
      addresses: []
    };

    console.log('📝 Creating user with data:', userData);
    
    user = await User.create(userData);

    console.log('✅ User created successfully:', user.email);
    
    res.status(201).json({
      success: true,
      data: user,
      message: 'User profile created successfully'
    });
  } catch (error) {
    console.error("❌ Create User Error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating user profile",
      error: error.message
    });
  }
};

// Update user profile
exports.updateUserProfile = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { firebaseUid: req.user.uid },
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating user profile',
      error: error.message
    });
  }
};

// Manage addresses
exports.addAddress = async (req, res) => {
  try {
    console.log('📍 Adding address for user:', req.user.uid);
    
    const user = await User.findOne({ firebaseUid: req.user.uid });
    
    if (!user) {
      console.log('❌ User not found when adding address');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // If setting as default, remove default from other addresses
    if (req.body.isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }
    
    user.addresses.push(req.body);
    await user.save();
    
    console.log('✅ Address added successfully');
    
    res.status(201).json({
      success: true,
      data: user.addresses,
      message: 'Address added successfully'
    });
  } catch (error) {
    console.error('❌ Error adding address:', error);
    res.status(400).json({
      success: false,
      message: 'Error adding address',
      error: error.message
    });
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const addressIndex = user.addresses.id(req.params.addressId);
    
    if (!addressIndex) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }
    
    // If setting as default, remove default from other addresses
    if (req.body.isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }
    
    Object.assign(addressIndex, req.body);
    await user.save();
    
    res.json({
      success: true,
      data: user.addresses
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating address',
      error: error.message
    });
  }
};

exports.deleteAddress = async (req, res) => {
    try {
        const userId = req.user.uid;
        const addressId = req.params.addressId;

        const user = await User.findOne({ firebaseUid: userId });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Filter out the deleted address
        const originalLength = user.addresses.length;

        user.addresses = user.addresses.filter(addr => addr._id.toString() !== addressId);

        if (user.addresses.length === originalLength) {
            return res.status(404).json({
                success: false,
                message: "Address not found"
            });
        }

        await user.save();

        res.json({
            success: true,
            message: "Address deleted successfully",
            addresses: user.addresses
        });

    } catch (error) {
        console.error("Delete Address Error:", error);
        res.status(400).json({
            success: false,
            message: "Error deleting address",
            error: error.message
        });
    }
};

exports.getAllAddresses = async (req, res) => {
  try {
    console.log('📍 Getting addresses for user:', req.user.uid);
    
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user) {
      console.log('❌ User not found when fetching addresses');
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    console.log('✅ Found', user.addresses?.length || 0, 'addresses');
    
    return res.json({
      success: true,
      data: user.addresses || [],
      count: user.addresses?.length || 0
    });
  } catch (error) {
    console.error("❌ Get Addresses Error:", error);
    res.status(500).json({
      success: false,
      message: "Error loading addresses",
      error: error.message
    });
  }
};