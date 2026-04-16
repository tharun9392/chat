const User = require('../models/user.model');
const bcrypt = require('bcrypt');

async function seedAdmin() {
  const username = 'btharun356@gmail.com';
  const password = 'Tharun@123';
  
  console.log('--- ADMIN SEEDING START ---');
  try {
    // Check if user exists
    const existingUser = await User.findByUsername(username);
    
    if (existingUser) {
      console.log(`User ${username} already exists. Updating to Admin...`);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      await User.updateById(existingUser._id, { 
        isAdmin: true,
        password: hashedPassword // Update password just in case
      });
      console.log('   Success! User updated to Admin.');
    } else {
      console.log(`Creating new Admin user: ${username}...`);
      await User.create({
        username,
        password,
        displayName: 'Admin (B Tharun)',
        isAdmin: true
      });
      console.log('   Success! Admin user created.');
    }
    
    console.log('--- ADMIN SEEDING FINISHED ---');
    process.exit(0);
  } catch (err) {
    console.error('!!! SEEDING FAILED !!!');
    console.error(err);
    process.exit(1);
  }
}

seedAdmin();
