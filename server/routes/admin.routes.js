const express = require('express');
const User = require('../models/user.model');
const Chat = require('../models/chat.model');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');

const router = express.Router();

// Apply auth and admin middleware to all routes
router.use(authMiddleware, adminMiddleware);

// Get system statistics
router.get('/stats', async (req, res) => {
  try {
    const userCount = await User.countDocuments({});
    
    const chatCount = await Chat.countDocuments({});
    
    // Total messages across all chats
    const allChats = await Chat.findAll();
    const messageCount = allChats.reduce((sum, chat) => sum + (chat.messages?.length || 0), 0);
    
    res.json({
      stats: {
        users: userCount,
        chats: chatCount,
        messages: messageCount,
        upTime: process.uptime()
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: -1 });
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete a user
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId === req.user._id) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Delete user
    await User.findByIdAndDelete(userId);
    
    // Also delete chats where this user was a participant? 
    // Or just mark them as 'deleted user'? 
    // For now, let's keep it simple.
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Broadcast a system-wide announcement
router.post('/broadcast', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === '') {
      return res.status(400).json({ message: 'Announcement message is required' });
    }

    const io = req.app.get('io');
    if (!io) {
      return res.status(500).json({ message: 'Socket server not available' });
    }

    io.emit('admin_announcement', {
      message: message.trim(),
      senderName: req.user.displayName || req.user.username,
      timestamp: new Date()
    });

    res.json({ message: 'Announcement broadcast successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
