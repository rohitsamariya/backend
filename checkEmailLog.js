const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const checkEmailLog = async () => {
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

        console.log(`Email History for ${user.name}:`);
        user.emailHistory.slice(-5).forEach(h => {
            console.log(`- Type: ${h.emailType}, Status: ${h.status}, SentAt: ${h.sentAt}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkEmailLog();
