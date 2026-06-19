const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const { authMiddleware } = require('../middleware/auth.middleware');
const sodium = require('libsodium-wrappers');

const router = express.Router();

// Helper to generate access and refresh tokens
const generateTokens = async (userId) => {
  const accessToken = jwt.sign(
    { userId, type: 'access', jti: Math.random().toString(36).substring(2) + Date.now() },
    process.env.JWT_SECRET || 'yourSecretKeyForJWTAuthentication',
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh', jti: Math.random().toString(36).substring(2) + Date.now() },
    process.env.REFRESH_TOKEN_SECRET || 'yourSecretKeyForJWTRefreshToken',
    { expiresIn: '7d' }
  );

  // Keep a maximum of 10 active sessions/refresh tokens to prevent database bloat
  const user = await User.findById(userId);
  let refreshTokens = user.refreshTokens || [];
  
  refreshTokens.push(refreshToken);
  if (refreshTokens.length > 10) {
    refreshTokens = refreshTokens.slice(refreshTokens.length - 10);
  }
  
  await User.findByIdAndUpdate(userId, { $set: { refreshTokens } });

  return { accessToken, refreshToken };
};

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
        
        // Generate Access and Refresh tokens
        const { accessToken, refreshToken } = await generateTokens(user._id);
        
        res.status(201).json({
          message: 'User registered successfully',
          token: accessToken,
          refreshToken,
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
    
    console.log('Authentication successful! Generating tokens...');
    
    // Update last seen
    try {
      await User.updateById(user._id, { lastSeen: new Date() });
    } catch (updateError) {
      console.error('Error updating last seen:', updateError);
      // Continue anyway - this is non-critical
    }
    
    // Generate Access and Refresh tokens
    const { accessToken, refreshToken } = await generateTokens(user._id);
    
    console.log('Tokens generated. Sending response...');
    
    return res.status(200).json({
      message: 'Login successful',
      token: accessToken,
      refreshToken,
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

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }
    
    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET || 'yourSecretKeyForJWTRefreshToken'
      );
    } catch (jwtError) {
      console.error('Refresh token verification failed:', jwtError.message);
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
    
    // Check if user exists and has this refresh token
    const user = await User.findById(decoded.userId);
    if (!user || !user.refreshTokens || !user.refreshTokens.includes(refreshToken)) {
      console.error('Refresh token is invalid or has been revoked');
      return res.status(401).json({ message: 'Session expired or revoked. Please log in again.' });
    }
    
    // Generate new Access and Refresh tokens (token rotation)
    const newAccessToken = jwt.sign(
      { userId: user._id, type: 'access', jti: Math.random().toString(36).substring(2) + Date.now() },
      process.env.JWT_SECRET || 'yourSecretKeyForJWTAuthentication',
      { expiresIn: '15m' }
    );
    
    const newRefreshToken = jwt.sign(
      { userId: user._id, type: 'refresh', jti: Math.random().toString(36).substring(2) + Date.now() },
      process.env.REFRESH_TOKEN_SECRET || 'yourSecretKeyForJWTRefreshToken',
      { expiresIn: '7d' }
    );
    
    // Rotate the refresh token: remove old, push new
    let refreshTokens = user.refreshTokens.filter(token => String(token) !== String(refreshToken));
    refreshTokens.push(newRefreshToken);
    if (refreshTokens.length > 10) {
      refreshTokens = refreshTokens.slice(refreshTokens.length - 10);
    }
    
    await User.findByIdAndUpdate(user._id, { $set: { refreshTokens } });
    
    res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Logout / invalidate refresh token
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      try {
        const decoded = jwt.decode(refreshToken);
        if (decoded && decoded.userId) {
          await User.findByIdAndUpdate(decoded.userId, {
            $pull: { refreshTokens: refreshToken }
          });
          console.log(`Successfully revoked refresh token for user ${decoded.userId}`);
        }
      } catch (err) {
        console.error('Error decoding/revoking refresh token during logout:', err);
      }
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
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

module.exports = router;