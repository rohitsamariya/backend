require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

const testLogin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const email = 'aman@example.com'; // Change to an actual email you want to test
        const password = 'password123'; // Change to the actual password

        console.log(`Testing login for: ${email}`);
        const user = await User.findOne({ email: new RegExp('^' + email.trim() + '$', 'i') }).select('+password');

        if (!user) {
            console.log('❌ User not found');
            process.exit(0);
        }

        console.log('User found, checking password...');
        const isMatch = await user.matchPassword(password);
        if (isMatch) {
            console.log('✅ Password matches!');
        } else {
            console.log('❌ Password mismatch');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
};

testLogin();
