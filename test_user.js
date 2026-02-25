const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const testLogin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const email = 'rohitsamariya90@gmail.com';
        const password = '***'; // I don't know the password, but I can check if it finds the user

        const user = await User.findOne({ email: new RegExp('^' + email + '$', 'i') }).select('+password');
        if (!user) {
            console.log('User not found');
            process.exit(0);
        }

        console.log('User found:', user.email);
        console.log('Password hash:', user.password);
        console.log('Status:', user.status);
        console.log('isActive:', user.isActive);

        // Check if role is present
        console.log('Role:', user.role);

        // Check if branch is present
        console.log('Branch:', user.branch);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

testLogin();
