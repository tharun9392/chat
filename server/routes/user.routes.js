const express = require('express');
const User = require('../models/user.model');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');

const router = express.Router();

// Search users by username
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    // Find users matching the query excluding the current user and blocked users
    const docs = await User.find({ username: new RegExp(query, 'i') });
    
    // Filter out current user and blocked users
    const filteredUsers = docs.filter(user => 
      String(user._id) !== String(req.user._id) && 
      !(req.user.blockedUsers || []).includes(String(user._id))
    );
    
    // Select only required fields
    const users = filteredUsers.map(user => ({
      _id: user._id,
      username: user.username,
      displayName: user.displayName,
      profilePic: user.profilePic,
      lastSeen: user.lastSeen
    }));
    
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { displayName, profilePic, username, publicKey } = req.body;
    
    // Update only the provided fields
    const updateData = {};
    if (displayName) updateData.displayName = displayName;
    if (profilePic) updateData.profilePic = profilePic;
    if (publicKey) updateData.publicKey = publicKey;
    if (username) {
      // Check if the username already exists
      const existingUser = await User.findOne({ username });
      if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
        return res.status(409).json({ message: 'Username already exists' });
      }
      updateData.username = username;
    }
    
    const updatedUser = await User.updateById(req.user._id, updateData);
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        displayName: updatedUser.displayName,
        profilePic: updatedUser.profilePic,
        publicKey: updatedUser.publicKey
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update encryption keys
router.put('/keys', authMiddleware, async (req, res) => {
  try {
    const { publicKey, privateKey } = req.body;
    
    if (!publicKey || !privateKey) {
      return res.status(400).json({ message: 'Public and private keys are required' });
    }
    
    // Update user keys
    await User.updateById(req.user._id, { 
      publicKey, 
      privateKey,
      publicKeyVersion: (req.user.publicKeyVersion || 0) + 1
    });
    
    res.json({ message: 'Encryption keys updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update user settings
router.put('/settings', authMiddleware, async (req, res) => {
  try {
    const { darkMode } = req.body;
    
    // Update settings
    if (darkMode !== undefined) {
      const settings = req.user.settings || {};
      settings.darkMode = darkMode;
      
      const updatedUser = await User.updateById(req.user._id, { settings });
      
      res.json({
        message: 'Settings updated successfully',
        settings: updatedUser.settings
      });
    } else {
      res.status(400).json({ message: 'No settings provided' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Block user
router.post('/block/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if user exists
    const userToBlock = await User.findById(userId);
    if (!userToBlock) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user is already blocked
    const blockedUsers = req.user.blockedUsers || [];
    const isBlocked = blockedUsers.includes(userId);
    if (isBlocked) {
      return res.status(400).json({ message: 'User is already blocked' });
    }
    
    // Add to blocked users
    blockedUsers.push(userId);
    await User.updateById(req.user._id, { blockedUsers });
    
    res.json({ message: 'User blocked successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Unblock user
router.post('/unblock/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if user is blocked
    const blockedUsers = req.user.blockedUsers || [];
    const blockIndex = blockedUsers.indexOf(userId);
    if (blockIndex === -1) {
      return res.status(400).json({ message: 'User is not blocked' });
    }
    
    // Remove from blocked users
    blockedUsers.splice(blockIndex, 1);
    await User.updateById(req.user._id, { blockedUsers });
    
    res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get blocked users
router.get('/blocked', authMiddleware, async (req, res) => {
  try {
    const blockedUserIds = req.user.blockedUsers || [];
    
    // Find all blocked users
    const blockedUsers = await Promise.all(
      blockedUserIds.map(id => User.findById(id))
    );
    
    // Filter out any null results and map to required fields
    const result = blockedUsers
      .filter(user => user !== null)
      .map(user => ({
        _id: user._id,
        username: user.username,
        displayName: user.displayName,
        profilePic: user.profilePic
      }));
    
    res.json({ blockedUsers: result });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Admin-only: Get all users
router.get('/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const docs = await User.find({}).select('-password');
    const users = docs.map(user => user.toObject());
    
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router; 