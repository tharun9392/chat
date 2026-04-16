const mongoose = require('mongoose');

const callSchema = new mongoose.Schema({
  callerId: { type: String, required: true },
  receiverId: { type: String, required: true },
  chatId: { type: String },
  status: { type: String, enum: ['initiated', 'joined', 'missed', 'rejected', 'completed', 'busy'], default: 'initiated' },
  duration: { type: Number, default: 0 },
  type: { type: String, enum: ['video', 'audio'], default: 'video' },
  startedAt: { type: Date },
  endedAt: { type: Date }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Static methods to maintain compatibility with NeDB-wrapper API
callSchema.statics.findByUser = function(userId) {
  return this.find({ 
    $or: [{ callerId: userId }, { receiverId: userId }] 
  }).sort({ createdAt: -1 });
};

callSchema.statics.updateById = function(id, updateData) {
  return this.findByIdAndUpdate(id, { $set: updateData }, { new: true });
};

callSchema.statics.delete = function(id) {
  return this.findByIdAndDelete(id).then(doc => !!doc);
};

const Call = mongoose.model('Call', callSchema);

module.exports = Call;
