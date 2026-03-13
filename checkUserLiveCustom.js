const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const checkUser = async () => {
    try {
        const liveUri = 'mongodb://hrmsuser:j6jTgFYcflQgEq32@ac-gdvbveo-shard-00-02.akr9n7d.mongodb.net:27017/hrms_attendance?ssl=true&authSource=admin&directConnection=true';
        await mongoose.connect(liveUri);
        console.log('Connected to MongoDB Live');

        const emails = ['rohitsamariya90@gmail.com', 'rsamariya50@gmail.com'];

        for (const email of emails) {
            const user = await User.findOne({ email: new RegExp('^' + email + '$', 'i') })
                .select('+password')
                .populate('branch', 'name');
            if (user) {
                console.log(`✅ User found: ${email}`);
                console.log('Data:', {
                    name: user.name,
                    status: user.status,
                    role: user.role,
                    branch: user.branch ? user.branch.name : 'No Branch',
                    hasPassword: !!user.password,
                    passwordLength: user.password ? user.password.length : 0,
                    passwordHashPrefix: user.password ? user.password.substring(0, 10) : 'N/A',
                    createdAt: user.createdAt,
                    lastLogin: user.lastLogin
                });
            } else {
                console.log(`❌ User NOT found: ${email}`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
};

checkUser();
