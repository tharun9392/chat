const express = require('express');
const router = express.Router();
const Call = require('../models/call.model');
const { authMiddleware: auth } = require('../middleware/auth.middleware');

// Create a new call log entry
router.post('/', auth, async (req, res) => {
  try {
    const { chatId, receiverId, type } = req.body;
    const callerId = req.user._id || req.user.id;
    
    if (!chatId || !receiverId || !type) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    const call = await Call.create({
      chatId,
      callerId,
      receiverId,
      type, // 'audio' or 'video'
      status: 'initiated'
    });
    
    res.status(201).json(call);
  } catch (error) {
    console.error('Error creating call log:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update an existing call log (e.g., when it ends or is joined)
router.put('/:id', auth, async (req, res) => {
  try {
    const { status, duration } = req.body;
    const callId = req.params.id;
    
    const updatedCall = await Call.updateById(callId, { 
      status, 
      ...(duration !== undefined && { duration }) 
    });
    
    res.status(200).json(updatedCall);
  } catch (error) {
    console.error('Error updating call log:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get call history for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const calls = await Call.findByUser(userId);
    res.status(200).json(calls);
  } catch (error) {
    console.error('Error fetching call history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a call log entry (bidirectional)
router.delete('/:id', auth, async (req, res) => {
  try {
    const callId = req.params.id;
    const userId = String(req.user._id || req.user.id);
    
    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }
    
    // Verify user was a participant
    if (String(call.callerId) !== userId && String(call.receiverId) !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    await Call.findByIdAndDelete(callId);
    res.status(200).json({ message: 'Call history deleted for both participants' });
  } catch (error) {
    console.error('Error deleting call log:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
