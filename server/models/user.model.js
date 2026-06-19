const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  displayName: { type: String },
  isAdmin: { type: Boolean, default: false },
  publicKey: { type: String, default: '' },
  publicKeyVersion: { type: Number, default: 0 },
  privateKey: { type: String, default: '' },
  settings: { type: mongoose.Schema.Types.Mixed, default: { darkMode: false } },
  blockedUsers: [{ type: String }],
  profilePic: { type: String, default: '' },
  lastSeen: { type: Date, default: Date.now },
  refreshTokens: [{ type: String }]
}, { 
  timestamps: true,
  // Ensure _id is returned as a string if needed, although Mongoose does this by default via .id
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save hook to handle defaults and password hashing
userSchema.pre('save', async function(next) {
  if (!this.displayName) {
    this.displayName = this.username;
  }

  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Static methods to maintain compatibility with existing NeDB-wrapper API
userSchema.statics.findByUsername = function(username) {
  console.log('Finding user by username (case-insensitive):', username);
  return this.findOne({ username: new RegExp('^' + username + '$', 'i') });
};

userSchema.statics.updateById = async function(id, updateData) {
  console.log('Updating user:', id);
  
  // If password is being updated, hash it manually because findByIdAndUpdate doesn't trigger pre-save hooks
  if (updateData.password) {
    const salt = await bcrypt.genSalt(10);
    updateData.password = await bcrypt.hash(updateData.password, salt);
  }
  
  return this.findByIdAndUpdate(id, { $set: updateData }, { new: true });
};

userSchema.statics.comparePassword = async function(user, candidatePassword) {
  if (!user || !user.password) return false;
  return await bcrypt.compare(candidatePassword, user.password);
};

userSchema.statics.findAll = function() {
  return this.find({});
};

const User = mongoose.model('User', userSchema);

module.exports = User;