const mongoose = require('mongoose');
const Chat = require('./models/chat.model');
require('dotenv').config();

async function checkChats() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const chats = await Chat.find({});
    console.log(`Total chats: ${chats.length}`);
    chats.forEach(c => {
      console.log(`- Chat ID: ${c._id}, Status: ${c.status}, Participants: ${c.participants}, isAccepted: ${c.isAccepted}`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkChats();
