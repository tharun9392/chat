const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  _id: { type: String }, // UUID from routes
  sender: { type: String, required: true },
  content: { type: String }, // Usually encrypted
  type: { type: String, default: 'text' }, // text, image, file, system
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: 'sent' }, // sent, delivered, read
  fileName: { type: String },
  fileSize: { type: Number },
  mimeType: { type: String },
  iv: { type: String }, // Initialization vector for encryption
  senderName: { type: String },
  recipientRead: { type: Boolean, default: false },
  delivered: { type: Boolean, default: false },
  encrypted: { type: Boolean, default: false },
  isCallLog: { type: Boolean, default: false },
  isVoiceMessage: { type: Boolean, default: false },
  autoDeleteAt: { type: String },
  deleteAfterView: { type: Boolean, default: false },
  readAt: { type: String },
  deliveredAt: { type: String },
  createdAt: { type: String }
}, { _id: false });

const chatSchema = new mongoose.Schema({
  participants: [{ type: String }], // Array of user IDs as strings
  messages: [messageSchema],
  encryptionKeys: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastActivity: { type: Date, default: Date.now },
  type: { type: String, Enum: ['private', 'group'], default: 'private' },
  name: { type: String },
  groupAdmin: { type: String },
  status: { type: String, enum: ['pending', 'active', 'blocked'], default: 'active' },
  isAccepted: { type: Boolean, default: false },
  requestInfo: {
    senderId: { type: String },
    recipientId: { type: String }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Static methods to maintain compatibility with NeDB-wrapper API
chatSchema.statics.findOneByParticipants = function(userId1, userId2) {
  return this.findOne({ 
    participants: { $all: [userId1, userId2] },
    type: 'private'
  });
};

chatSchema.statics.findByParticipant = function(userId) {
  return this.find({ participants: userId, status: 'active' }).sort({ lastActivity: -1 });
};

chatSchema.statics.addMessage = function(chatId, message) {
  return this.findByIdAndUpdate(
    chatId,
    { 
      $push: { messages: message },
      $set: { lastActivity: new Date() }
    },
    { new: true }
  );
};

chatSchema.statics.removeMessage = function(chatId, messageId) {
  return this.findByIdAndUpdate(
    chatId,
    { $pull: { messages: { _id: messageId } } },
    { new: true }
  );
};

chatSchema.statics.updateById = function(id, updateData) {
  return this.findByIdAndUpdate(id, { $set: updateData }, { new: true });
};

chatSchema.statics.delete = function(id) {
  return this.findByIdAndDelete(id).then(doc => !!doc);
};

chatSchema.statics.findAll = function() {
  return this.find({});
};

chatSchema.statics.cleanupViewOnceMessages = async function(chatId, userId) {
  const chat = await this.findById(chatId);
  if (!chat) return;
  
  const now = new Date();
  const filteredMessages = chat.messages.filter(msg => {
    // Remove view-once messages that were read by someone other than the sender
    if (msg.deleteAfterView && msg.readAt && String(msg.sender) !== String(userId)) {
      return false;
    }
    // Remove auto-delete messages that have expired
    if (msg.autoDeleteAt && new Date(msg.autoDeleteAt) <= now) {
      return false;
    }
    return true;
  });
  
  if (filteredMessages.length !== chat.messages.length) {
    await this.findByIdAndUpdate(chatId, { $set: { messages: filteredMessages } });
  }
};

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;