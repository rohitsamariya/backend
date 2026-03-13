const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const checkLocalUser = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hrms_attendance');
        console.log('Connected to Local MongoDB');

        const email = 'rohitsamariya90@gmail.com';
        const user = await User.findOne({ email: new RegExp('^' + email + '$', 'i') }).select('+password');

        if (user) {
            console.log(`✅ User found: ${email}`);
            console.log('Data:', {
                name: user.name,
                status: user.status,
                role: user.role,
                hasPassword: !!user.password,
                passwordHashPrefix: user.password ? user.password.substring(0, 10) : 'N/A'
            });
        } else {
            console.log(`❌ User NOT found locally: ${email}`);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
};

checkLocalUser();
