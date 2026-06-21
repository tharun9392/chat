const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const { authMiddleware } = require('./middleware/auth.middleware');
const chatRoutes = require('./routes/chat.routes');
const callRoutes = require('./routes/call.routes');
const adminRoutes = require('./routes/admin.routes');
const Chat = require('./models/chat.model');
const jwt = require('jsonwebtoken');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Create HTTP server using Express app
const server = http.createServer(app);

// CORS configuration helper
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002'
];

const checkOrigin = (origin, callback) => {
  // Allow requests with no origin (like mobile apps, curl, or server-to-server)
  if (!origin) return callback(null, true);
  
  // Check if it is a local address, Vercel subdomain, or matches CLIENT_URL
  const isLocal = allowedOrigins.includes(origin);
  const isVercel = origin.endsWith('.vercel.app');
  const isClientUrl = process.env.CLIENT_URL && 
    process.env.CLIENT_URL.split(',').map(url => url.trim()).includes(origin);
  
  if (isLocal || isVercel || isClientUrl) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
};

// Initialize Socket.IO with the server and CORS configuration
const io = new Server(server, {
  cors: {
    origin: checkOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  },
  maxHttpBufferSize: 1e8 // 100MB to allow sending large images/voice messages
});

app.set('io', io);

// Middleware
app.use(cors({
  origin: checkOrigin,
  credentials: true
}));
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

async function connectToDatabase() {
  const atlasUri = process.env.MONGODB_URI;
  
  if (!atlasUri) {
    console.error('🔴 CRITICAL: MONGODB_URI is not defined in the environment variables!');
    process.exit(1);
  }

  // Mongoose connection event listeners for logging and health checks
  mongoose.connection.on('connecting', () => {
    console.log('Attempting to connect to MongoDB Atlas...');
  });

  mongoose.connection.on('connected', () => {
    console.log('✅ Connected to MongoDB Atlas successfully');
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB connection lost. Reconnecting...');
  });

  try {
    await mongoose.connect(atlasUri, {
      serverSelectionTimeoutMS: 10000, // 10s timeout
      heartbeatFrequencyMS: 10000, // check server status every 10s
    });
  } catch (err) {
    console.error('🔴 CRITICAL: Failed to establish initial database connection to MongoDB Atlas:', err.message);
    process.exit(1);
  }
}

connectToDatabase();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/admin', adminRoutes);

// Map to store user connections: { userId: Set<socketId> }
const userConnections = new Map();

// Helper to broadcast to all sockets of a user
const emitToUser = (userId, event, data) => {
  const userIdStr = String(userId);
  const socketIds = userConnections.get(userIdStr);
  
  if (socketIds && socketIds.size > 0) {
    socketIds.forEach(id => {
      io.to(id).emit(event, data);
    });
    console.log(`[Signaling] Event '${event}' sent to user ${userIdStr} (${socketIds.size} sockets)`);
    return true;
  }
  
  console.warn(`[Signaling] Failed to send '${event}' to user ${userIdStr} - NO ACTIVE CONNECTIONS`);
  console.log(`[Signaling] Currently active IDs:`, Array.from(userConnections.keys()));
  return false;
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Authenticate user and store connection
  socket.on('authenticate', (data) => {
    try {
      const { token } = data;
      if (!token) {
        socket.emit('authentication_error', { message: 'No token provided' });
        return;
      }
      
      const decoded = jwt.verify(
        token, 
        process.env.JWT_SECRET || 'yourSecretKeyForJWTAuthentication'
      );
      
      const userId = String(decoded.userId);
      socket.userId = userId;
      
      // Add this socket to the user's set of connections
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId).add(socket.id);
      
      console.log(`User ${userId} authenticated on socket ${socket.id} (Total tabs: ${userConnections.get(userId).size})`);
      socket.emit('authenticated', { userId });
    } catch (error) {
      console.error('Socket authentication error:', error.message);
      socket.emit('authentication_error', { message: 'Invalid token' });
    }
  });

  // Join a room (for private chat)
  socket.on('join_room', async (room) => {
    try {
      if (!socket.userId) {
        socket.emit('room_join_error', { message: 'User not authenticated' });
        return;
      }
      
      const chat = await Chat.findById(room);
      if (!chat) {
        socket.emit('room_join_error', { message: 'Chat not found' });
        return;
      }
      
      const userIdStr = String(socket.userId);
      const isParticipant = chat.participants.some(pId => String(pId) === userIdStr);
      
      if (!isParticipant) {
        socket.emit('room_join_error', { message: 'You do not have access to this chat' });
        return;
      }
      
      socket.join(room);
      console.log(`User ${socket.userId} joined room: ${room}`);
      socket.emit('room_joined', { room });
    } catch (error) {
      socket.emit('room_join_error', { message: 'Server error' });
    }
  });

  // Handle private messages
  socket.on('send_message', (data) => {
    socket.to(data.room).emit('receive_message', data);
  });

  // Handle read receipts
  socket.on('mark_read', (data) => {
    const { chatId, readerId } = data;
    socket.to(chatId).emit('messages_read', { chatId, readerId });
  });

  // Handle delivery receipts
  socket.on('mark_delivered', (data) => {
    const { chatId, receiverId } = data;
    socket.to(chatId).emit('messages_delivered', { chatId, receiverId });
  });

  // Handle message deletion sync
  socket.on('delete_message', (data) => {
    const { chatId, messageId } = data;
    socket.to(chatId).emit('message_deleted', { chatId, messageId });
  });

  // Handle Video/Audio call signaling
  socket.on('call_user', (data) => {
    console.log(`Call initiated from ${data.from} to ${data.to} (Type: ${data.type})`);
    
    const sent = emitToUser(data.to, 'incoming_call', {
      from: data.from,
      fromName: data.fromName,
      fromPic: data.fromPic,
      signal: data.signalData,
      type: data.type,
      callId: data.callId
    });

    if (!sent) {
      console.warn(`Call failed: Receiver ${data.to} is NOT connected`);
      socket.emit('call_error', { message: 'User is offline or unavailable' });
    }
  });

  socket.on('answer_call', (data) => {
    console.log(`Call answered by ${socket.userId} targeted to caller ${data.to}`);
    emitToUser(data.to, 'call_accepted', data.signal);
  });

  socket.on('call_signal', (data) => {
    console.log(`[Signaling] Relay signal from ${socket.userId} to ${data.to} (${data.signal.candidate ? 'Candidate' : 'SDP'})`);
    emitToUser(data.to, 'call_signal', {
      from: socket.userId,
      signal: data.signal
    });
  });

  socket.on('end_call', (data) => {
    emitToUser(data.to, 'call_ended');
  });

  socket.on('call_ringing', (data) => {
    console.log(`[Calling] Call ringing notification from ${socket.userId} to ${data.to}`);
    emitToUser(data.to, 'call_ringing', { from: socket.userId });
  });

  socket.on('call_state_change', (data) => {
    console.log(`[Calling] State change from ${socket.userId} to ${data.to}:`, data.state);
    emitToUser(data.to, 'call_state_change', {
      from: socket.userId,
      state: data.state
    });
  });

  socket.on('call_reaction', (data) => {
    console.log(`[Calling] Reaction from ${socket.userId} to ${data.to}: ${data.reaction}`);
    emitToUser(data.to, 'call_reaction', {
      from: socket.userId,
      reaction: data.reaction
    });
  });
  
  // Handle chat requests
  socket.on('chat_request', (data) => {
    const { receiverId, senderId, senderName } = data;
    const sent = emitToUser(receiverId, 'chat_request_received', {
      senderId,
      senderName,
      requestId: data.requestId
    });
    
    if (!sent) {
      socket.emit('chat_request_status', {
        status: 'offline',
        receiverId
      });
    }
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    
    if (socket.userId && userConnections.has(socket.userId)) {
      const socketSet = userConnections.get(socket.userId);
      socketSet.delete(socket.id);
      
      if (socketSet.size === 0) {
        userConnections.delete(socket.userId);
        console.log(`User ${socket.userId} fully removed from connections`);
      } else {
        console.log(`User ${socket.userId} still has ${socketSet.size} active tabs`);
      }
    }
  });
});

// Default route
app.get('/', (req, res) => {
  res.send('Chat API is running');
});

// Start server
const PORT = process.env.PORT || 5002;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

server.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
  
  // Removed background message cleaner - feature decommissioned
});