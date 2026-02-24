const cron = require('node-cron');
const Attendance = require('../models/Attendance');
const Branch = require('../models/Branch');
const Shift = require('../models/Shift');
const User = require('../models/User');
const { DateTime } = require('luxon');
const { handleViolation } = require('../utils/violationEngine');
const { sendAutoCheckoutEmail } = require('./emailService');

// FIX 6: Execution Lock
let isRunning = false;

const runAutoCheckout = async () => {
    if (isRunning) {
        console.log('Skipping Auto-Checkout: Previous run still active.');
        return;
    }
    isRunning = true;
    console.log('Running Auto-Checkout Scheduler...');

    try {
        const branches = await Branch.find({});

        for (const branch of branches) {
            const timezone = branch.timezone || 'UTC';
            const now = DateTime.now().setZone(timezone);
            const todayMidnight = now.startOf('day').toJSDate();

            // FIX: Use isOpen flag and populate
            const openAttendances = await Attendance.find({
                branch: branch._id,
                date: todayMidnight,
                isOpen: true
            })
                .populate('shift')
                .populate('user');

            for (const attendance of openAttendances) {
                // Safety: Ensure punches exist
                if (!attendance.punches || attendance.punches.length === 0) continue;

                // Validate openPunchIndex Integrity
                const idx = attendance.openPunchIndex;
                if (idx === null || idx === undefined || idx < 0 || idx >= attendance.punches.length) {
                    console.log(`Auto-Checkout: Invalid openPunchIndex for ${attendance._id}. Skipping.`);
                    continue;
                }

                // Ensure the targeted punch is actually open
                if (attendance.punches[idx].checkOut) {
                    console.log(`Auto-Checkout: Target punch ${idx} already closed for ${attendance._id}. Correcting state.`);
                    attendance.isOpen = false;
                    attendance.openPunchIndex = null;
                    await attendance.save();
                    continue;
                }

                const shift = attendance.shift;
                const user = attendance.user;

                if (!user || user.status !== 'ACTIVE') continue;
                if (!shift) continue;

                const [endHour, endMinute] = shift.endTime.split(':').map(Number);

                // Timezone Safe End Time
                const attendanceDate = DateTime.fromJSDate(attendance.date).setZone(timezone);
                const shiftEndTime = attendanceDate.set({
                    hour: endHour,
                    minute: endMinute,
                    second: 0,
                    millisecond: 0
                });

                const autoCloseThreshold = shiftEndTime.plus({ hours: 2 });

                if (now > autoCloseThreshold) {
                    console.log(`Auto-closing attendance for User ${user.name} (${user._id})`);

                    // FIX: Deterministic Atomic Update using Direct Index
                    const atomicUpdate = await Attendance.findOneAndUpdate(
                        {
                            _id: attendance._id,
                            isOpen: true,
                            openPunchIndex: idx // Ensure we are updating exactly what we read
                        },
                        {
                            $set: {
                                [`punches.${idx}.checkOut`]: shiftEndTime.toJSDate(),
                                [`punches.${idx}.checkOutLocation`]: attendance.punches[idx].checkInLocation, // Fallback
                                [`punches.${idx}.autoClosed`]: true,
                                autoClosed: true,
                                isOpen: false,
                                openPunchIndex: null
                            }
                        },
                        {
                            new: true
                        }
                    );

                    if (atomicUpdate) {
                        // Logic post-update: Calculate metrics & Violations
                        let totalWorkingMs = 0;
                        let totalBreakMs = 0;
                        const punches = atomicUpdate.punches;

                        for (let i = 0; i < punches.length; i++) {
                            const p = punches[i];
                            if (p.checkIn && p.checkOut) {
                                totalWorkingMs += (new Date(p.checkOut) - new Date(p.checkIn));
                            }
                            if (i > 0) {
                                const prev = punches[i - 1];
                                if (prev.checkOut && p.checkIn) {
                                    totalBreakMs += (new Date(p.checkIn) - new Date(prev.checkOut));
                                }
                            }
                        }

                        atomicUpdate.totalWorkingMinutes = Math.floor(totalWorkingMs / 1000 / 60);
                        atomicUpdate.totalBreakMinutes = Math.floor(totalBreakMs / 1000 / 60);

                        // Trigger Violation
                        await handleViolation(user, atomicUpdate, 'AUTO_CHECKOUT', todayMidnight, timezone);

                        // Re-calculate Status (If discipline didn't hit)
                        if (atomicUpdate.status !== 'HALF_DAY') {
                            const startParts = shift.startTime.split(':').map(Number);
                            const startMinutes = startParts[0] * 60 + startParts[1];
                            const endMinutes = endHour * 60 + endMinute;
                            let shiftDuration = endMinutes - startMinutes;
                            if (shiftDuration < 0) shiftDuration += 24 * 60;

                            const percentage = atomicUpdate.totalWorkingMinutes / shiftDuration;

                            if (percentage >= 0.99) atomicUpdate.status = 'PRESENT';
                            else if (percentage >= 0.5) atomicUpdate.status = 'HALF_DAY';
                            else atomicUpdate.status = 'ABSENT';
                        }

                        await atomicUpdate.save(); // Save metrics/status
                        console.log(`Auto-Checkout completed for ${user.email}`);

                        // Send Employee Notification Email
                        try {
                            const dateStr = attendanceDate.toFormat('dd MMM YYYY');
                            const timeStr = shiftEndTime.toFormat('hh:mm a');
                            await sendAutoCheckoutEmail(user, dateStr, timeStr);
                        } catch (err) {
                            console.error(`Failed to send auto-checkout email to ${user.email}`, err);
                        }
                    } else {
                        console.log(`Auto-Checkout atomic update failed for ${user.email} (State changed mid-process)`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Auto-Checkout Scheduler Fatal Error:', error);
    } finally {
        isRunning = false; // Release Lock
    }
};

const startScheduler = () => {
    // Run every 10 minutes
    cron.schedule('*/10 * * * *', () => {
        runAutoCheckout();
    });
    console.log('Auto-Checkout Scheduler Initialized.');
};

module.exports = { startScheduler, runAutoCheckout };
