const User = require('../models/User');

// Get user profile
exports.getUserProfile = async (req, res) => {
  try {
    console.log('🔍 Looking for user with firebaseUid:', req.user.uid);
    console.log('📧 User email from Firebase:', req.user.email);
    
    // First try to find by firebaseUid
    let user = await User.findOne({ firebaseUid: req.user.uid });
    
    if (user) {
      console.log('✅ User found by firebaseUid:', user.email);
      return res.json({
        success: true,
        data: user
      });
    }
    
    // If not found by firebaseUid, try by email
    if (req.user.email) {
      console.log('🔍 User not found by firebaseUid, trying by email:', req.user.email);
      user = await User.findOne({ email: req.user.email });
      
      if (user) {
        console.log('✅ User found by email:', user.email);
        console.log('🔄 Updating existing user with firebaseUid:', req.user.uid);
        
        // Update existing user with firebaseUid
        user.firebaseUid = req.user.uid;
        
        // Update name if provided from different auth method
        if (req.user.name && user.name !== req.user.name) {
          user.name = req.user.name;
        }
        
        await user.save();
        
        console.log('✅ User updated with firebaseUid');
        
        return res.json({
          success: true,
          data: user,
          message: 'User profile linked with Firebase'
        });
      }
    }
    
    // User not found at all - return 404 to trigger profile creation
    console.log('❌ User not found in database');
    return res.status(404).json({
      success: false,
      message: 'User not found. Please create a profile first.'
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
    console.log('👤 Creating/updating user profile for Firebase UID:', req.user.uid);
    console.log('📧 User email from request:', req.user.email || req.body.email);
    
    // CRITICAL: First check if user exists by email (regardless of firebaseUid)
    // This ensures users with same email get linked regardless of auth method
    let user = null;
    
    if (req.user.email) {
      console.log('🔍 Checking if user exists by email:', req.user.email);
      user = await User.findOne({ email: req.user.email });
      
      if (user) {
        console.log('✅ Found existing user by email:', user.email);
        console.log('🔄 Updating existing user with new firebaseUid:', req.user.uid);
        
        // Update existing user with new firebaseUid
        user.firebaseUid = req.user.uid;
        
        // Update name if provided and different
        if (req.body.name && user.name !== req.body.name) {
          user.name = req.body.name;
        }
        
        // Update phone if provided
        if (req.body.phone) {
          user.phone = req.body.phone;
        }
        
        await user.save();
        
        console.log('✅ Updated existing user with new firebaseUid');
        
        return res.json({
          success: true,
          data: user,
          message: 'Existing user linked with new authentication method'
        });
      }
    }
    
    // If no user by email, check by firebaseUid
    if (!user) {
      user = await User.findOne({ firebaseUid: req.user.uid });
      
      if (user) {
        console.log('ℹ️ User already exists by firebaseUid:', user.email);
        return res.json({
          success: true,
          data: user,
          message: 'User already exists'
        });
      }
    }
    
    // Prepare user data for new user
    const userEmail = req.user.email || req.body.email;
    const userName = req.body.name || req.user.name || userEmail?.split('@')[0] || 'User';
    
    // Create new user (no existing user found)
    const userData = {
      firebaseUid: req.user.uid,
      name: userName,
      email: userEmail,
      phone: req.body.phone || '',
      addresses: [],
      preferences: {
        notifications: 'all',
        favoriteCategories: []
      },
      loyaltyPoints: 0
    };

    console.log('📝 Creating new user with data:', {
      name: userData.name,
      email: userData.email,
      hasPhone: !!userData.phone
    });
    
    user = await User.create(userData);

    console.log('✅ User created successfully:', user.email);
    
    res.status(201).json({
      success: true,
      data: user,
      message: 'User profile created successfully'
    });
    
  } catch (error) {
    console.error("❌ Create/Update User Error:", error);
    
    // Handle MongoDB duplicate key error (11000)
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyValue || {})[0];
      const duplicateValue = error.keyValue?.[duplicateField];
      
      console.log(`🔄 Handling duplicate ${duplicateField}: ${duplicateValue}`);
      
      // For duplicate email, try to find and return the existing user
      if (duplicateField === 'email' && duplicateValue) {
        try {
          const existingUser = await User.findOne({ email: duplicateValue });
          
          if (existingUser) {
            console.log('✅ Found existing user with duplicate email:', existingUser.email);
            
            // Update with new firebaseUid
            existingUser.firebaseUid = req.user.uid;
            await existingUser.save();
            
            console.log('✅ Linked existing user with new firebaseUid');
            
            return res.json({
              success: true,
              data: existingUser,
              message: 'User profile linked successfully'
            });
          }
        } catch (updateError) {
          console.error("❌ Failed to update existing user:", updateError);
        }
      }
      
      return res.status(400).json({
        success: false,
        message: `User with this ${duplicateField} already exists`,
        error: error.message,
        duplicateField: duplicateField
      });
    }
    
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
    console.log('📝 Updating profile for user:', req.user.uid);
    
    // First find by firebaseUid
    let user = await User.findOne({ firebaseUid: req.user.uid });
    
    // If not found, try by email (for linking across auth methods)
    if (!user && req.user.email) {
      user = await User.findOne({ email: req.user.email });
      
      if (user) {
        console.log('🔄 Found user by email, updating firebaseUid');
        user.firebaseUid = req.user.uid;
      }
    }
    
    if (!user) {
      console.log('❌ User not found when updating profile');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Update fields
    Object.assign(user, req.body);
    await user.save();
    
    console.log('✅ Profile updated successfully');
    
    res.json({
      success: true,
      data: user,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    res.status(400).json({
      success: false,
      message: 'Error updating user profile',
      error: error.message
    });
  }
};
