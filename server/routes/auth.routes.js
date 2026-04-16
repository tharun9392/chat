const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const { authMiddleware } = require('../middleware/auth.middleware');
const sodium = require('libsodium-wrappers');

const router = express.Router();

// Register a new user
router.post('/register', async (req, res) => {
  try {
    console.log('Register route hit with body:', req.body);
    let { username, password } = req.body;
    username = username ? username.trim() : username;
    
    if (!username || !password) {
      console.log('Missing username or password');
      return res.status(400).json({ message: 'Username and password are required' });
    }
    
    // Check if the username already exists
    console.log('Checking if username exists:', username);
    try {
      const existingUser = await User.findOne({ username });
      console.log('Existing user check result:', existingUser);
      
      if (existingUser) {
        console.log('Username already exists');
        const suggestions = [
          `${username}123`,
          `${username}_${Math.floor(Math.random() * 100)}`,
        ];
        return res.status(409).json({ 
          message: 'Username already exists', 
          suggestions 
        });
      }
      
      // Generate keypair for the user
      await sodium.ready;
      const { publicKey, privateKey } = sodium.crypto_box_keypair('hex');
      
      // Create a new user
      console.log('Creating new user with generated keypair');
      try {
        const user = await User.create({
          username,
          password,
          displayName: username,
          publicKey,
          publicKeyVersion: 1,
          privateKey
        });
        
        console.log('User created successfully:', user);
        
        // Generate JWT token
        const token = jwt.sign(
          { userId: user._id },
          process.env.JWT_SECRET || 'yourSecretKeyForJWTAuthentication',
          { expiresIn: '7d' }
        );
        
        res.status(201).json({
          message: 'User registered successfully',
          token,
          user: {
            id: user._id,
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            isAdmin: user.isAdmin,
            publicKey: user.publicKey,
            publicKeyVersion: user.publicKeyVersion
          },
          privateKey: privateKey,
          recoveryNote: 'IMPORTANT: Save your private key securely. You will need it to log in on other devices.'
        });
      } catch (createError) {
        console.error('Error creating user:', createError);
        console.error('Error stack:', createError.stack);
        throw createError;
      }
    } catch (findError) {
      console.error('Error finding existing user:', findError);
      console.error('Error stack:', findError.stack);
      throw findError;
    }
  } catch (error) {
    console.error('Registration error details:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login a user
router.post('/login', async (req, res) => {
  try {
    console.log('=== LOGIN REQUEST ===');
    let { username, password } = req.body;
    username = username ? username.trim() : username;
    
    if (!username || !password) {
      console.error('Missing credentials:', { hasUsername: !!username, hasPassword: !!password });
      return res.status(400).json({ message: 'Username and password are required' });
    }
    
    console.log('Looking up user (case-insensitive):', username);
    // Find the user case-insensitively
    const user = await User.findByUsername(username);
    if (!user) {
      console.error('Login failed: User not found ->', username);
      return res.status(401).json({ 
        message: 'Invalid credentials',
        hint: 'Username not found. Please check the spelling or register if you are new.' 
      });
    }
    
    console.log('User found:', user.username, '(Requested:', username, '). Comparing password...');
    // Check password with error handling
    let isMatch = false;
    try {
      isMatch = await User.comparePassword(user, password);
    } catch (passError) {
      console.error('Password comparison error:', passError);
      return res.status(401).json({ 
        message: 'Invalid credentials',
        hint: 'Error validating password. Please try again.'
      });
    }
    
    if (!isMatch) {
      console.error('Password mismatch for user:', username);
      return res.status(401).json({ 
        message: 'Invalid credentials',
        hint: 'Password is incorrect. Please try again.'
      });
    }
    
    console.log('Authentication successful! Generating token...');
    
    // Update last seen
    try {
      await User.updateById(user._id, { lastSeen: new Date() });
    } catch (updateError) {
      console.error('Error updating last seen:', updateError);
      // Continue anyway - this is non-critical
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'yourSecretKeyForJWTAuthentication',
      { expiresIn: '7d' }
    );
    
    console.log('Token generated. Sending response...');
    
    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        _id: user._id,
        username: user.username,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
        publicKey: user.publicKey,
        publicKeyVersion: user.publicKeyVersion,
        privateKey: user.privateKey,
        settings: user.settings,
        profilePic: user.profilePic
      }
    });
    
  } catch (error) {
    console.error('=== LOGIN ERROR ===', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current user info
router.get('/me', authMiddleware, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        _id: req.user._id,
        username: req.user.username,
        displayName: req.user.displayName,
        isAdmin: req.user.isAdmin,
        publicKey: req.user.publicKey,
        publicKeyVersion: req.user.publicKeyVersion,
        privateKey: req.user.privateKey,
        settings: req.user.settings,
        profilePic: req.user.profilePic
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Change password
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }
    
    // Check if the current password is correct
    const isMatch = await User.comparePassword(req.user, currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    
    // Update password
    await User.updateById(req.user._id, { password: newPassword });
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current user (session restoration)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    res.json({
      user: {
        id: user._id,
        _id: user._id,
        username: user.username,
        displayName: user.displayName,
        profilePic: user.profilePic,
        isAdmin: user.isAdmin,
        publicKey: user.publicKey,
        privateKey: user.privateKey,
        settings: user.settings
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router; 