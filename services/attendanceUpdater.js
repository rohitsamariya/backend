const Attendance = require('../models/Attendance');
const Branch = require('../models/Branch');
const User = require('../models/User');
const { DateTime } = require('luxon');

/**
 * Updates attendance records for a specific holiday
 * @param {Object} holiday - The holiday document
 */
exports.updateAttendanceForHoliday = async (holiday) => {
    try {
        console.log(`[AttendanceUpdater] Updating for Holiday: ${holiday.name} (${holiday.date})`);

        const startOfDay = DateTime.fromJSDate(holiday.date).startOf('day').toJSDate();
        const endOfDay = DateTime.fromJSDate(holiday.date).endOf('day').toJSDate();

        const query = {
            date: { $gte: startOfDay, $lte: endOfDay },
            status: { $in: ['PRESENT', 'HALF_DAY', 'ABSENT'] } // Only update these statuses
        };

        if (holiday.branch) {
            query.branch = holiday.branch;
        }

        const result = await Attendance.updateMany(query, { status: 'HOLIDAY' });
        console.log(`[AttendanceUpdater] Updated ${result.modifiedCount} records to HOLIDAY.`);
    } catch (error) {
        console.error('[AttendanceUpdater] Error updating holiday attendance:', error);
    }
};

/**
 * Updates attendance records for a branch based on working days
 * @param {Object} branch - The branch document with updated workingDays
 */
exports.updateAttendanceForWorkingDays = async (branch) => {
    try {
        console.log(`[AttendanceUpdater] Updating WeekOffs for Branch: ${branch.name}`);
        const workingDays = branch.workingDays || [];

        // We need to look at past attendance. 
        // OPTIMIZATION: Limit to last 30 days? Or a specific range? 
        // For now, let's just do "future" or "all-time"?
        // User asked for "retroactive". Let's do all-time but be mindful of performance.
        // A better approach might be to find records that ARE 'PRESENT/ABSENT' but SHOULD be 'WEEK_OFF'.
        // AND records that ARE 'WEEK_OFF' but SHOULD be 'PRESENT/ABSENT' (if working days added).

        // Strategy: Iterate all 'relevant' records for this branch.
        // Valid Statuses to flip: PRESENT, HALF_DAY, ABSENT, WEEK_OFF.

        const records = await Attendance.find({
            branch: branch._id,
            status: { $in: ['PRESENT', 'HALF_DAY', 'ABSENT', 'WEEK_OFF'] }
        });

        let updatedCount = 0;
        const timezone = branch.timezone || 'Asia/Kolkata';

        for (const record of records) {
            const dayName = DateTime.fromJSDate(record.date).setZone(timezone).toFormat('cccc');
            const isWorkingDay = workingDays.includes(dayName);

            // Case 1: Should be WEEK_OFF
            if (!isWorkingDay && record.status !== 'WEEK_OFF' && record.status !== 'HOLIDAY') {
                record.status = 'WEEK_OFF';
                await record.save();
                updatedCount++;
            }
            // Case 2: Should NOT be WEEK_OFF (was WeekOff, now Working Day)
            // If it was marked WEEK_OFF, we might revert it to... what?
            // If punches exist -> PRESENT. If no punches -> ABSENT?
            // This is tricky. 
            // If it was WEEK_OFF, it means we likely didn't expect punches.
            // If we flip it to "Working Day", and there are punches, it should be PRESENT.
            // If no punches, it implies ABSENT.
            else if (isWorkingDay && record.status === 'WEEK_OFF') {
                if (record.punches && record.punches.length > 0) {
                    record.status = 'PRESENT'; // Or recalculate logic?
                } else {
                    record.status = 'ABSENT';
                }
                await record.save();
                updatedCount++;
            }
        }
        console.log(`[AttendanceUpdater] Updated ${updatedCount} records for Working Days.`);

    } catch (error) {
        console.error('[AttendanceUpdater] Error updating working days attendance:', error);
    }
};

/**
 * Reverts attendance records for a deleted/moved holiday
 * @param {Object} holiday - The holiday document (or object with date/branch)
 */
exports.revertAttendanceForHoliday = async (holiday) => {
    try {
        console.log(`[AttendanceUpdater] Reverting Holiday: ${holiday.name} (${holiday.date})`);

        const { DateTime } = require('luxon'); // Ensure DateTime is available if scope issue
        // Actually it is required at top of file, but let's assume it is there.
        // To be safe against scope issues if file structure is weird:
        const startOfDay = DateTime.fromJSDate(holiday.date).startOf('day').toJSDate();
        const endOfDay = DateTime.fromJSDate(holiday.date).endOf('day').toJSDate();

        const query = {
            date: { $gte: startOfDay, $lte: endOfDay },
            status: 'HOLIDAY' // Only revert records that are currently marked as HOLIDAY
        };

        if (holiday.branch) {
            query.branch = holiday.branch;
        }

        const Attendance = require('../models/Attendance');
        const Branch = require('../models/Branch');

        const records = await Attendance.find(query);
        console.log(`[AttendanceUpdater] Found ${records.length} records to revert.`);
        
        let updatedCount = 0;

        for (const record of records) {
            // Fetch Branch to check working days
            const branch = await Branch.findById(record.branch);
            if (!branch) continue;

            const timezone = branch.timezone || 'Asia/Kolkata';
            const dayName = DateTime.fromJSDate(record.date).setZone(timezone).toFormat('cccc');
            const workingDays = branch.workingDays || [];
            
            let newStatus = 'ABSENT'; // Default fallback

            if (!workingDays.includes(dayName)) {
                newStatus = 'WEEK_OFF';
            } else {
                // It's a working day. Check punches.
                if (record.punches && record.punches.length > 0) {
                     newStatus = 'PRESENT'; 
                } else {
                    newStatus = 'ABSENT';
                }
            }

            record.status = newStatus;
            await record.save();
            updatedCount++;
        }
        console.log(`[AttendanceUpdater] Reverted ${updatedCount} records from HOLIDAY.`);

    } catch (error) {
        console.error('[AttendanceUpdater] Error reverting holiday attendance:', error);
    }
};
