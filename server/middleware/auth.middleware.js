const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

// Verify JWT token middleware
const authMiddleware = async (req, res, next) => {
  try {
    console.log('Auth middleware called for path:', req.path);
    const authHeader = req.headers.authorization;
    console.log('Authorization header:', authHeader ? 'Present' : 'Missing');
    
    const token = authHeader?.split(' ')[1] || null;
    
    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    // Verify the token
    try {
      console.log('Verifying token...');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'yourSecretKeyForJWTAuthentication');
      console.log('Token verified, user ID:', decoded.userId);
      
      // Find the user
      console.log('Finding user with ID:', decoded.userId);
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        console.log('User not found with ID:', decoded.userId);
        return res.status(401).json({ message: 'User session expired. Please log in again.' });
      }
      
      console.log('User found:', user.username);
      
      // Attach the user to the request object
      req.user = user;
      req.token = token;
      
      next();
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError.message);
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Invalid token' });
      }
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' });
      }
      
      throw jwtError;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Admin authorization middleware
const adminMiddleware = (req, res, next) => {
  try {
    console.log('Admin middleware called');
    console.log('User:', req.user ? `${req.user.username} (isAdmin: ${req.user.isAdmin})` : 'No user');
    
    if (!req.user || !req.user.isAdmin) {
      console.log('Admin access denied');
      return res.status(403).json({ message: 'Admin privileges required' });
    }
    
    console.log('Admin access granted');
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  authMiddleware,
  adminMiddleware
}; 