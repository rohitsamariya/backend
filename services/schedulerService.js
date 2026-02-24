const cron = require('node-cron');
const Attendance = require('../models/Attendance');
const Branch = require('../models/Branch');
const Shift = require('../models/Shift');
const User = require('../models/User');
const Violation = require('../models/Violation');
const { DateTime } = require('luxon');

const startScheduler = () => {
    // Run every 10 minutes
    cron.schedule('*/10 * * * *', async () => {
        console.log('Running Auto-Checkout Scheduler...');
        try {
            const branches = await Branch.find({});

            for (const branch of branches) {
                // 1. Get Branch Time Context
                const timezone = branch.timezone || 'UTC';
                const now = DateTime.now().setZone(timezone);
                const todayMidnight = now.startOf('day').toJSDate();

                // 2. Find Open Punches for Today in this Branch
                // We find Attendance docs for this branch & date where the last punch has no checkOut
                const openAttendances = await Attendance.find({
                    branch: branch._id,
                    date: todayMidnight,
                    'punches.checkOut': null // Check if ANY punch has null checkout? 
                    // Mongoose query for "last element of array has null checkOut" is tricky.
                    // Easier to fetch candidate docs and filter in code.
                }).populate('shift').populate('user');

                for (const attendance of openAttendances) {
                    // Double check last punch is actually open
                    const lastPunch = attendance.punches[attendance.punches.length - 1];
                    if (!lastPunch || lastPunch.checkOut) continue;

                    const shift = attendance.shift;
                    const user = attendance.user;

                    if (!shift || !user) continue;

                    // 3. Calculate Threshold
                    // Shift End Time for Today
                    const [endHour, endMinute] = shift.endTime.split(':').map(Number);
                    const shiftEndTime = now.set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });

                    // Threshold: Shift End + 2 Hours
                    const autoCloseThreshold = shiftEndTime.plus({ hours: 2 });

                    // 4. Check if Current Time > Threshold
                    if (now > autoCloseThreshold) {
                        console.log(`Auto-closing attendance for User ${user.name} (${user._id})`);

                        // 5. Auto-Close Action
                        // Cap checkout at Shift End Time
                        lastPunch.checkOut = shiftEndTime.toJSDate();
                        lastPunch.checkOutLocation = lastPunch.checkInLocation; // Fallback to checkIn location or null? 
                        // keeping checkIn location is safer than null for some validators, 
                        // or explicitly null if allowed. 
                        // Validations in model are loose, so this is fine.
                        lastPunch.autoClosed = true;

                        // Create Violation Record
                        await Violation.create({
                            user: user._id,
                            branch: branch._id,
                            attendance: attendance._id,
                            type: 'AUTO_CHECKOUT',
                            date: todayMidnight,
                            month: now.month,
                            year: now.year
                        });

                        // 6. Recalculate Totals (Copying logic from controller)
                        let totalWorkingMs = 0;
                        let totalBreakMs = 0;

                        for (let i = 0; i < attendance.punches.length; i++) {
                            const p = attendance.punches[i];
                            if (p.checkIn && p.checkOut) {
                                totalWorkingMs += (new Date(p.checkOut) - new Date(p.checkIn));
                            }
                            if (i > 0) {
                                const prev = attendance.punches[i - 1];
                                if (prev.checkOut && p.checkIn) {
                                    totalBreakMs += (new Date(p.checkIn) - new Date(prev.checkOut));
                                }
                            }
                        }

                        attendance.totalWorkingMinutes = Math.floor(totalWorkingMs / 1000 / 60);
                        attendance.totalBreakMinutes = Math.floor(totalBreakMs / 1000 / 60);

                        // 7. Update Status (Simple Logic for Auto-Close)
                        // If auto-closed, usually means they worked full day but forgot.
                        // Or they left early and forgot. 
                        // We use the calculated duration vs shift duration.
                        const startParts = shift.startTime.split(':').map(Number);
                        const startMinutes = startParts[0] * 60 + startParts[1];
                        const endMinutes = endHour * 60 + endMinute;
                        const shiftDuration = endMinutes - startMinutes;

                        const percentage = attendance.totalWorkingMinutes / shiftDuration;

                        if (percentage >= 0.99) attendance.status = 'PRESENT';
                        else if (percentage >= 0.5) attendance.status = 'HALF_DAY';
                        else attendance.status = 'ABSENT';

                        await attendance.save();

                        // 8. Notification (Mock)
                        console.log(`Notification: User ${user.email} was auto-checked out at ${shiftEndTime.toFormat('HH:mm')}`);
                    }
                }
            }
        } catch (error) {
            console.error('Auto-Checkout Scheduler Error:', error);
        }
    });
};

// Monthly Violation Report (1st of Month at 9:00 AM)
cron.schedule('0 9 1 * *', async () => {
    console.log('Running Monthly Violation Report Scheduler...');
    try {
        // 1. Determine Previous Month
        const now = DateTime.now();
        const prevMonthDate = now.minus({ months: 1 });
        const month = prevMonthDate.month;
        const year = prevMonthDate.year;

        console.log(`Generating reports for: ${month}/${year}`);

        // 2. Fetch All Active Employees with Shifts
        const employees = await User.find({ status: 'ACTIVE', role: 'EMPLOYEE', shift: { $exists: true } })
            .populate('shift');

        const { calculateViolations } = require('./violationService');
        const { sendViolationReportEmail } = require('./emailService');

        let sentCount = 0;

        for (const emp of employees) {
            // 3. Calculate Violations
            const stats = await calculateViolations(emp, month, year);

            // 4. Send Email IF violations exist
            const totalViolations = stats.totalLate + stats.totalEarlyExit + stats.totalHalfDays + stats.totalAbsents;

            if (totalViolations > 0) {
                await sendViolationReportEmail(emp, stats, month, year);
                sentCount++;
            }
        }
        console.log(`Monthly Violation Reports Sent: ${sentCount}`);

    } catch (error) {
        console.error('Monthly Violation Scheduler Error:', error);
    }
});

module.exports = startScheduler;
