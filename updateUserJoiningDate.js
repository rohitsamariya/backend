const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const updateEmployee = async () => {
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

        user.joiningDate = new Date('2025-08-12');
        // Also update probation end date (6 months from joining)
        const probationEndDate = new Date('2025-08-12');
        probationEndDate.setMonth(probationEndDate.getMonth() + 6);
        user.probationEndDate = probationEndDate;
        user.status = 'ACTIVE';
        user.onboardingStatus = 'COMPLETED';
        user.onboardingCompleted = true;

        await user.save();
        console.log(`Updated user ${user.name} (${user._id}). Joining Date set to 2025-08-12.`);
        console.log(`Probation End Date: ${user.probationEndDate.toISOString()}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

updateEmployee();
