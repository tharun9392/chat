const express = require('express');
const Chat = require('../models/chat.model');
const User = require('../models/user.model');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Helper: get userId as a string from req.user
function getUserId(req) {
  return req.user._id.toString();
}

// ─── GET ALL ACTIVE CHATS ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const chats = await Chat.find({
      participants: userId,
      status: 'active'
    }).sort({ lastActivity: -1 });

    // Enrich chats with participant info
    const enrichedChats = await Promise.all(chats.map(async (chat) => {
      const participants = await Promise.all(chat.participants.map(async (pId) => {
        const user = await User.findById(pId);
        if (user) {
          return {
            _id: user._id.toString(),
            username: user.username,
            displayName: user.displayName,
            profilePic: user.profilePic,
            lastSeen: user.lastSeen
          };
        }
        return { _id: pId, username: 'Unknown' };
      }));

      const chatObj = chat.toObject ? chat.toObject() : chat;
      return { ...chatObj, participants };
    }));

    res.json({ chats: enrichedChats });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── GET RECEIVED CHAT REQUESTS ─────────────────────────────────────────────
router.get('/requests/received', async (req, res) => {
  try {
    const userId = getUserId(req);
    const chats = await Chat.find({
      status: 'pending',
      'requestInfo.recipientId': userId
    });

    const enrichedRequests = await Promise.all(chats.map(async (chat) => {
      const sender = await User.findById(chat.requestInfo.senderId);
      if (!sender) return null;

      return {
        _id: chat._id.toString(),
        sender: {
          _id: sender._id.toString(),
          username: sender.username,
          displayName: sender.displayName,
          profilePic: sender.profilePic
        },
        status: chat.status,
        createdAt: chat.createdAt
      };
    }));

    res.json({ requests: enrichedRequests.filter(r => r !== null) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── GET SENT CHAT REQUESTS ────────────────────────────────────────────────
router.get('/requests/sent', async (req, res) => {
  try {
    const userId = getUserId(req);
    const chats = await Chat.find({
      status: 'pending',
      'requestInfo.senderId': userId
    });

    const enrichedRequests = await Promise.all(chats.map(async (chat) => {
      const recipient = await User.findById(chat.requestInfo.recipientId);
      if (!recipient) return null;

      return {
        _id: chat._id.toString(),
        recipient: {
          _id: recipient._id.toString(),
          username: recipient.username,
          displayName: recipient.displayName,
          profilePic: recipient.profilePic
        },
        status: chat.status,
        createdAt: chat.createdAt
      };
    }));

    res.json({ requests: enrichedRequests.filter(r => r !== null) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── SEND A CHAT REQUEST ────────────────────────────────────────────────────
router.post('/request', async (req, res) => {
  try {
    const { recipientId } = req.body;
    const senderId = getUserId(req);
    const recipientIdStr = String(recipientId);

    if (senderId === recipientIdStr) {
      return res.status(400).json({ message: 'You cannot send a request to yourself' });
    }

    // Verify recipient exists
    const recipientUser = await User.findById(recipientIdStr);
    if (!recipientUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if a chat already exists between these users (any status)
    const existingChat = await Chat.findOne({
      participants: { $all: [senderId, recipientIdStr] }
    });

    if (existingChat) {
      if (existingChat.status === 'active') {
        // Enrich the existing chat with participant info and return it
        const enrichedParticipants = await Promise.all(existingChat.participants.map(async (pId) => {
          const u = await User.findById(pId);
          if (u) return { _id: u._id.toString(), username: u.username, displayName: u.displayName, profilePic: u.profilePic, lastSeen: u.lastSeen };
          return { _id: pId, username: 'Unknown' };
        }));
        const chatObj = existingChat.toObject ? existingChat.toObject() : existingChat;
        return res.status(200).json({
          message: 'Chat already exists',
          existing: true,
          chat: { ...chatObj, participants: enrichedParticipants }
        });
      }
      if (existingChat.status === 'pending') {
        return res.status(200).json({
          message: 'Chat request already pending',
          existing: true,
          pending: true,
          chatId: existingChat._id
        });
      }
    }

    const newChat = await Chat.create({
      participants: [senderId, recipientIdStr],
      status: 'pending',
      requestInfo: {
        senderId: senderId,
        recipientId: recipientIdStr
      },
      messages: []
    });

    // Emit real-time notification
    const io = req.app.get('io');
    if (io) {
      const senderUser = await User.findById(senderId);
      const senderName = senderUser ? senderUser.displayName || senderUser.username : 'Someone';

      io.emit('chat_request_notification', {
        recipientId: recipientIdStr,
        senderId: senderId,
        senderName,
        requestId: newChat._id.toString()
      });
    }

    res.status(201).json({ message: 'Chat request sent', chat: newChat });
  } catch (error) {
    console.error('Error in POST /request:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── RESPOND TO A CHAT REQUEST (ACCEPT / REJECT / BLOCK) ───────────────────
router.put('/request/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body; // 'accepted', 'rejected', 'blocked'
    const userId = getUserId(req);

    const chat = await Chat.findById(requestId);
    if (!chat) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Authorization: user must be a participant but NOT the sender
    const participantIds = chat.participants.map(p => p.toString());
    const senderId = chat.requestInfo.senderId ? chat.requestInfo.senderId.toString() : null;
    const isParticipant = participantIds.includes(userId);
    const isNotSender = userId !== senderId;

    if (!isParticipant || !isNotSender) {
      return res.status(403).json({ message: 'Only the recipient can respond to this request' });
    }

    if (chat.status !== 'pending') {
      return res.status(400).json({ message: `Request already ${chat.status}` });
    }

    const io = req.app.get('io');

    if (status === 'accepted') {
      // Update status to active
      await Chat.findByIdAndUpdate(requestId, {
        $set: { status: 'active', isAccepted: true, lastActivity: new Date() }
      });

      // Fetch the updated chat and enrich with participant info
      const updatedChat = await Chat.findById(requestId);
      const enrichedParticipants = await Promise.all(
        updatedChat.participants.map(async (pId) => {
          const u = await User.findById(pId);
          if (u) return { _id: u._id.toString(), username: u.username, displayName: u.displayName, profilePic: u.profilePic, lastSeen: u.lastSeen };
          return { _id: pId.toString(), username: 'Unknown' };
        })
      );
      const chatObj = updatedChat.toObject();
      const enrichedChat = { ...chatObj, participants: enrichedParticipants };

      // Emit full enriched chat to ALL participants via socket
      if (io) {
        updatedChat.participants.forEach(pId => {
          io.emit('chat_request_accepted', {
            chatId: requestId,
            senderId: chat.requestInfo.senderId,
            recipientId: chat.requestInfo.recipientId,
            chat: enrichedChat  // Full chat object for instant UI update
          });
        });
      }

      // Return the full chat so the frontend can immediately append it
      return res.json({ message: 'Request accepted', chat: enrichedChat });

    } else if (status === 'rejected') {
      await Chat.findByIdAndDelete(requestId);
      if (io) {
        io.emit('chat_request_rejected', {
          requestId,
          senderId: chat.requestInfo.senderId
        });
      }
    } else if (status === 'blocked') {
      await Chat.findByIdAndUpdate(requestId, { $set: { status: 'blocked' } });
    }

    res.json({ message: `Request ${status}` });
  } catch (error) {
    console.error('Error in PUT /request/:requestId:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// ─── ADMIN: GET ALL CHATS ──────────────────────────────────────────────────
router.get('/all', adminMiddleware, async (req, res) => {
  try {
    const chats = await Chat.find({});
    const enrichedChats = await Promise.all(chats.map(async (chat) => {
      const enrichedParticipants = await Promise.all(chat.participants.map(async (pId) => {
        const user = await User.findById(pId);
        return user ? { _id: user._id.toString(), username: user.username } : pId;
      }));
      return { ...(chat.toObject ? chat.toObject() : chat), participants: enrichedParticipants };
    }));
    res.json({ chats: enrichedChats });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── GET SINGLE CHAT ───────────────────────────────────────────────────────
// MUST be after /all and /requests/* to avoid matching those as :chatId
router.get('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { skip = 0, limit = 20 } = req.query;
    const limitNum = parseInt(limit, 10) || 20;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const userId = getUserId(req);
    const participantIds = chat.participants.map(p => p.toString());

    if (!participantIds.includes(userId) && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Unauthorized access to this chat' });
    }

    // Enrich participants
    const participants = await Promise.all(chat.participants.map(async (pId) => {
      const user = await User.findById(pId);
      if (user) {
        return {
          _id: user._id.toString(),
          username: user.username,
          displayName: user.displayName,
          profilePic: user.profilePic,
          publicKey: user.publicKey,
          lastSeen: user.lastSeen
        };
      }
      return null;
    }));

    let messages = chat.messages || [];
    const totalMessages = messages.length;
    if (messages.length > limitNum) {
      messages = messages.slice(-limitNum);
    }

    res.json({
      chat: {
        ...(chat.toObject ? chat.toObject() : chat),
        participants: participants.filter(p => p !== null),
        messages,
        totalMessages,
        hasMore: totalMessages > limitNum
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── SEND A MESSAGE ────────────────────────────────────────────────────────
router.post('/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = getUserId(req);

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const participantIds = chat.participants.map(p => p.toString());
    if (!participantIds.includes(userId)) {
      return res.status(403).json({ message: 'You are not a participant in this chat' });
    }

    if (chat.status !== 'active') {
      return res.status(400).json({ message: 'Cannot send messages to a non-active chat' });
    }

    const message = {
      _id: uuidv4(),
      sender: userId,
      content: req.body.content,
      type: req.body.type || 'text',
      timestamp: new Date(),
      status: 'sent',
      fileName: req.body.fileName,
      fileSize: req.body.fileSize,
      mimeType: req.body.mimeType,
      iv: req.body.iv,
      senderName: req.user.displayName || req.user.username,
      encrypted: req.body.encrypted || false,
      isCallLog: req.body.isCallLog || false,
      isVoiceMessage: req.body.isVoiceMessage || false,
      autoDeleteAt: req.body.autoDeleteAt,
      deleteAfterView: req.body.deleteAfterView || false,
      createdAt: new Date().toISOString()
    };

    const updatedChat = await Chat.addMessage(chatId, message);

    // Emit to other participants
    const io = req.app.get('io');
    if (io) {
      const recipientIds = participantIds.filter(p => p !== userId);
      recipientIds.forEach(recipientId => {
        io.emit('receive_message', {
          chatId,
          message,
          senderId: userId,
          recipientId
        });
      });
    }

    res.status(201).json({ message });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── LOAD MORE MESSAGES (PAGINATION) ────────────────────────────────────────
router.get('/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = getUserId(req);
    const { skip = 0, limit = 20 } = req.query;
    const skipNum = parseInt(skip, 10) || 0;
    const limitNum = parseInt(limit, 10) || 20;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const participantIds = chat.participants.map(p => p.toString());
    if (!participantIds.includes(userId)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const messages = chat.messages || [];
    const total = messages.length;
    const start = Math.max(0, total - skipNum - limitNum);
    const end = total - skipNum;
    const paginatedMessages = messages.slice(Math.max(0, start), Math.max(0, end));

    res.json({
      messages: paginatedMessages,
      total,
      hasMore: start > 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── DELETE A MESSAGE ──────────────────────────────────────────────────────
router.delete('/:chatId/messages/:messageId', async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const userId = getUserId(req);

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const participantIds = chat.participants.map(p => p.toString());
    if (!participantIds.includes(userId)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await Chat.removeMessage(chatId, messageId);

    const io = req.app.get('io');
    if (io) {
      participantIds.forEach(pId => {
        io.emit('message_deleted', { chatId, messageId, deletedBy: userId, recipientId: pId });
      });
    }

    res.json({ message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── UPDATE TYPING STATUS ──────────────────────────────────────────────────
router.post('/:chatId/typing', async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = getUserId(req);
    const { isTyping } = req.body;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const io = req.app.get('io');
    if (io) {
      const recipientIds = chat.participants.map(p => p.toString()).filter(p => p !== userId);
      recipientIds.forEach(recipientId => {
        io.emit('typing_status', { chatId, userId, isTyping, recipientId });
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── MARK MESSAGES AS READ ─────────────────────────────────────────────────
router.put('/:chatId/read', async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = getUserId(req);

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    let updated = false;
    const updatedMessages = chat.messages.map(msg => {
      if (msg.sender !== userId && !msg.recipientRead) {
        updated = true;
        return { ...msg.toObject(), recipientRead: true, readAt: new Date().toISOString(), status: 'read' };
      }
      return msg;
    });

    if (updated) {
      await Chat.findByIdAndUpdate(chatId, { $set: { messages: updatedMessages } });

      const io = req.app.get('io');
      if (io) {
        const senderIds = [...new Set(chat.messages.filter(m => m.sender !== userId).map(m => m.sender))];
        senderIds.forEach(senderId => {
          io.emit('messages_read', { chatId, readBy: userId, recipientId: senderId });
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── DELETE A CHAT ─────────────────────────────────────────────────────────
router.delete('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = getUserId(req);

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const participantIds = chat.participants.map(p => p.toString());
    if (!participantIds.includes(userId) && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await Chat.findByIdAndDelete(chatId);
    res.json({ message: 'Chat deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
