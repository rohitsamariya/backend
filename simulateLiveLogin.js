const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const simulateLogin = async () => {
    try {
        const liveUri = 'mongodb://hrmsuser:j6jTgFYcflQgEq32@ac-gdvbveo-shard-00-02.akr9n7d.mongodb.net:27017/hrms_attendance?ssl=true&authSource=admin&directConnection=true';
        await mongoose.connect(liveUri);
        console.log('Connected to MongoDB Live');

        const email = 'rohitsamariya90@gmail.com';
        const password = 'test'; // This is what the user might be using? I don't know.

        const user = await User.findOne({ email: new RegExp('^' + email + '$', 'i') }).select('+password');
        if (user) {
            console.log(`Checking password for: ${email}`);
            const isMatch = await bcrypt.compare(password, user.password);
            console.log(`Password Match ('test'): ${isMatch}`);

            // Try another common one? No.
        } else {
            console.log(`User ${email} not found on live.`);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
};

simulateLogin();
