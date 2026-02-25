const mongoose = require('mongoose');
const User = require('./models/User');
const Attendance = require('./models/Attendance');
const Branch = require('./models/Branch');
const Shift = require('./models/Shift');
require('dotenv').config();

const seedAttendance = async () => {
    try {
        const liveUri = 'mongodb://hrmsuser:j6jTgFYcflQgEq32@ac-gdvbveo-shard-00-02.akr9n7d.mongodb.net:27017/hrms_attendance?ssl=true&authSource=admin&directConnection=true';
        await mongoose.connect(liveUri);
        console.log('Connected to MongoDB');

        const email = 'rsamariya50@gmail.com';
        const user = await User.findOne({ email }).populate('branch').populate('shift');

        if (!user) {
            console.error('User not found');
            process.exit(1);
        }

        if (!user.branch || !user.shift) {
            console.error('User has no branch or shift assigned');
            process.exit(1);
        }

        const start = new Date('2025-08-12');
        const end = new Date('2026-02-24');

        // Delete existing attendance just in case
        await Attendance.deleteMany({
            user: user._id
        });

        const attendanceRecords = [];
        let current = new Date(start);

        while (current <= end) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) { // Avoid Sat (6) and Sun (0)
                const attendanceDate = new Date(current);
                attendanceDate.setHours(0, 0, 0, 0);

                const checkIn = new Date(current);
                checkIn.setHours(9, 0, 0, 0); // 9:00 AM

                const checkOut = new Date(current);
                checkOut.setHours(18, 0, 0, 0); // 6:00 PM

                attendanceRecords.push({
                    user: user._id,
                    branch: user.branch._id,
                    shift: user.shift._id,
                    date: attendanceDate,
                    status: 'PRESENT',
                    isOpen: false,
                    totalWorkingMinutes: 540, // 9 hours
                    punches: [{
                        checkIn,
                        checkOut,
                        checkInLocation: { latitude: 19.0760, longitude: 72.8777 },
                        checkOutLocation: { latitude: 19.0760, longitude: 72.8777 }
                    }]
                });
            }
            current.setDate(current.getDate() + 1);
        }

        if (attendanceRecords.length > 0) {
            await Attendance.insertMany(attendanceRecords);
            console.log(`Successfully seeded ${attendanceRecords.length} attendance records for ${user.name}.`);
        } else {
            console.log('No records to seed.');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedAttendance();
