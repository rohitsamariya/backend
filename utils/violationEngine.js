const Violation = require('../models/Violation');
const Attendance = require('../models/Attendance');
const { DateTime } = require('luxon');

/**
 * Handle Violation Logic
 * @param {Object} user - User document
 * @param {Object} attendance - Attendance document
 * @param {String} type - 'LATE', 'EARLY_EXIT', 'AUTO_CHECKOUT'
 * @param {Date} date - Midnight UTC of the occurrence
 * @param {Object} timezone - Branch timezone (default 'UTC')
 */
const handleViolation = async (user, attendance, type, date, timezone = 'UTC') => {
    try {
        const now = DateTime.now().setZone(timezone);
        const month = now.month;
        const year = now.year;

        // 1. Check if violation of this type already exists for this attendance
        // (Prevent duplicate LATE/EARLY_EXIT for same day)
        // AUTO_CHECKOUT is unique per punch technically, but usually once per day.
        const existingViolation = await Violation.findOne({
            attendance: attendance._id,
            type: type
        });

        if (existingViolation) {
            console.log(`Violation ${type} already exists for attendance ${attendance._id}`);
            return;
        }

        // 2. Create Violation Record
        await Violation.create({
            user: user._id,
            branch: user.branch,
            attendance: attendance._id,
            type: type,
            date: date,
            month: month,
            year: year
        });

        console.log(`Created violation ${type} for user ${user.name}`);

        // 3. Calculate Total Violations for Current Month
        const totalViolations = await Violation.countDocuments({
            user: user._id,
            month: month,
            year: year
        });

        // 4. Check 3-6-9 Discipline Policy
        if (totalViolations > 0 && totalViolations % 3 === 0) {

            // FIX 4: Idempotency - Prevent Double Apply
            if (attendance.status === 'HALF_DAY') {
                console.log(`User ${user.name} reached ${totalViolations} violations, but discipline already applied.`);
                return { disciplineApplied: true, totalViolations, alreadyApplied: true };
            }

            console.log(`User ${user.name} reached ${totalViolations} violations. Applying discipline.`);

            // Apply HALF_DAY penalty
            // We update the status of the CURRENT attendance record.
            attendance.status = 'HALF_DAY';

            return { disciplineApplied: true, totalViolations };
        }

        return { disciplineApplied: false, totalViolations };

    } catch (error) {
        console.error('Violaton Engine Error:', error);
        throw error;
    }
};

module.exports = {
    handleViolation
};
