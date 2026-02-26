const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const checkUser = async () => {
    try {
        const liveUri = 'mongodb://hrmsuser:j6jTgFYcflQgEq32@ac-gdvbveo-shard-00-02.akr9n7d.mongodb.net:27017/hrms_attendance?ssl=true&authSource=admin&directConnection=true';
        await mongoose.connect(liveUri);
        console.log('Connected to MongoDB');

        const email = 'rsamariya50@gmail.com';
        const user = await User.findOne({ email });

        if (!user) {
            console.error('User not found');
            process.exit(1);
        }

        console.log('User Data:', {
            name: user.name,
            joiningDate: user.joiningDate,
            probationEndDate: user.probationEndDate,
            status: user.status,
            onboardingStatus: user.onboardingStatus
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkUser();
