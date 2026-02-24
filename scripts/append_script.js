const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../services/attendanceUpdater.js');

const appendContent = `
/**
 * Reverts attendance records for a deleted/moved holiday
 * @param {Object} holiday - The holiday document (or object with date/branch)
 */
exports.revertAttendanceForHoliday = async (holiday) => {
    try {
        console.log(\`[AttendanceUpdater] Reverting Holiday: \${holiday.name} (\${holiday.date})\`);

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
        console.log(\`[AttendanceUpdater] Found \${records.length} records to revert.\`);
        
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
        console.log(\`[AttendanceUpdater] Reverted \${updatedCount} records from HOLIDAY.\`);

    } catch (error) {
        console.error('[AttendanceUpdater] Error reverting holiday attendance:', error);
    }
};
`;

fs.appendFileSync(filePath, appendContent);
console.log('Appended function successfully.');
