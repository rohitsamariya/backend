const mongoose = require('mongoose');
const User = require('./models/User');
const Attendance = require('./models/Attendance');
require('dotenv').config();

const checkAttendance = async () => {
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

        const count = await Attendance.countDocuments({ user: user._id });
        console.log(`User ${user.name} has ${count} attendance records`);

        const febRecords = await Attendance.find({
            user: user._id,
            date: {
                $gte: new Date('2026-02-01'),
                $lte: new Date('2026-02-28')
            }
        });
        console.log(`Found ${febRecords.length} records for Feb 2026`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkAttendance();
