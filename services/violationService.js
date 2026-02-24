const Attendance = require('../models/Attendance');
const { DateTime } = require('luxon');

/**
 * Calculate Violations for a specific user in a given month/year
 * @param {Object} user - User document (must have shift populated)
 * @param {Number} month - 1-12
 * @param {Number} year - YYYY
 * @returns {Object} Violation Stats
 */
const calculateViolations = async (user, month, year, options = {}) => {
    const session = options.session;
    const stats = {
        totalLate: 0,
        totalEarlyExit: 0,
        totalAutoCheckout: 0,
        totalHalfDays: 0,
        totalAbsents: 0,
        totalDeductionDays: 0,
        penaltyHalfDays: 0, // This will be penalty days (full days)
        penaltyEligibleViolations: 0,
        leavesUsed: 0,
        newAvailableLeaves: 0,
        isPostProbation: false,
        details: []
    };

    if (!user.shift) return stats;

    const m = parseInt(month);
    const y = parseInt(year);
    const timezone = 'Asia/Kolkata';
    const monthStartDT = DateTime.fromObject({ year: y, month: m, day: 1 }, { zone: timezone });
    const monthEndDT = monthStartDT.endOf('month');

    // REQUIREMENT: Probation check happens based on payroll_month_end_date
    const joinDateJS = user.joiningDate || user.createdAt;
    const probationEndDate = DateTime.fromJSDate(joinDateJS).setZone(timezone).plus({ months: 6 }).endOf('day');

    // Dynamic Probation Check: If payroll_month_end_date < probation_end_date -> On Probation
    // Else Post Probation
    const isPostProbationMonth = monthEndDT >= probationEndDate;
    stats.isPostProbation = isPostProbationMonth;

    const startDate = monthStartDT.startOf('day').toJSDate();
    const endDate = monthEndDT.endOf('day').toJSDate();

    // 1. Requirement 3: Source of Truth Balance Calculation
    const LeaveLedger = require('../models/payroll/LeaveLedger');
    let currentBalance = await LeaveLedger.getBalance(user._id, options.excludingSupersededRunId);

    // Safety clamp: balance cannot be negative for deduction math.
    // Negative historical balance can explode LOP on re-runs.
    if (currentBalance < 0) currentBalance = 0;

    if (isPostProbationMonth && !user.probationLeavesAllocated) {
        // Initial allocation
        const User = require('../models/User');
        await User.updateOne({ _id: user._id }, {
            $set: {
                probationLeavesAllocated: true,
                probationStatus: 'POST_PROBATION'
            }
        }, { session }).catch(e => console.error("Error auto-allocating leaves:", e));

        await LeaveLedger.create([{
            user: user._id,
            month: m,
            year: y,
            type: 'ALLOCATION',
            leaveType: 'PAID',
            days: 18,
            reason: `Post-Probation Lump Sum Allocation (18 days) - Probation ended ${probationEndDate.toISODate()}`,
            payrollRunId: options.payrollRunId
        }], { session });

        currentBalance += 18;
    }

    let attendanceRecords = options.attendanceRecords;
    if (!attendanceRecords) {
        const q = Attendance.find({ user: user._id, date: { $gte: startDate, $lte: endDate } }).populate('branch');
        if (session) q.session(session);
        attendanceRecords = await q;
    }

    const attendanceMap = {};
    attendanceRecords.forEach(att => {
        const dateKey = DateTime.fromJSDate(att.date).setZone(timezone).toISODate();
        attendanceMap[dateKey] = att;
    });

    const now = DateTime.now().setZone(timezone);
    let checkUntilDay = monthEndDT.day;

    // If it's the current month, only check up to yesterday (or today if it's past shift end)
    if (now.year === y && now.month === m) {
        checkUntilDay = now.day;
    }

    const shift = user.shift;
    const [startHr, startMin] = shift.startTime.split(':').map(Number);
    const [endHr, endMin] = shift.endTime.split(':').map(Number);
    let shiftStartVal = startHr * 60 + startMin;
    let shiftEndVal = endHr * 60 + endMin;
    if (shiftEndVal < shiftStartVal) shiftEndVal += 24 * 60;
    const halfDayThreshold = (shiftEndVal - shiftStartVal) / 2;

    const Holiday = require('../models/Holiday');
    const holidays = await Holiday.find({ date: { $gte: startDate, $lte: endDate } });
    const holidayDates = holidays.map(h => DateTime.fromJSDate(h.date).setZone(timezone).toISODate());

    const Branch = require('../models/Branch');
    const branch = user.branch?._id ? user.branch : await Branch.findById(user.branch);
    const workingDays = branch?.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    let runningLop = 0;
    let runningLeavesUsed = 0;

    for (let d = 1; d <= checkUntilDay; d++) {
        const dayDate = monthStartDT.set({ day: d });
        const dateKey = dayDate.toISODate();
        const fullDayName = dayDate.toFormat('cccc');
        const isHoliday = holidayDates.includes(dateKey);
        const isWorkingDay = workingDays.includes(fullDayName);
        const record = attendanceMap[dateKey];

        let dayWeight = 0;
        let isAbsent = false;

        // Skip if employee hadn't joined yet
        if (dayDate.startOf('day') < DateTime.fromJSDate(joinDateJS).startOf('day')) continue;

        if (!record) {
            if (isWorkingDay && !isHoliday) {
                // Only mark as absent if the day has passed or shift ended
                if (dayDate.startOf('day') < now.startOf('day')) {
                    isAbsent = true;
                } else if (dayDate.hasSame(now, 'day')) {
                    const shiftEndDT = dayDate.set({ hour: Math.floor(shiftEndVal / 60) % 24, minute: shiftEndVal % 60 });
                    if (now > shiftEndDT) isAbsent = true;
                }
            }
        } else if (record.status === 'ABSENT' || (record.status === 'PRESENT' && (!record.punches || record.punches.length === 0) && dayDate.startOf('day') < now.startOf('day'))) {
            isAbsent = true;
        }

        if (isAbsent) {
            dayWeight = 1.0;
            stats.totalAbsents++;
        } else if (record && isWorkingDay && !isHoliday) {
            let actualMinutes = 0;
            if (record.punches?.length > 0) {
                record.punches.forEach(p => { if (p.checkIn && p.checkOut) actualMinutes += Math.max(0, (new Date(p.checkOut) - new Date(p.checkIn)) / 60000); });
            }

            if (record.status === 'HALF_DAY' || (actualMinutes > 0 && actualMinutes < halfDayThreshold)) {
                dayWeight = 0.5;
                stats.totalHalfDays++;
            } else {
                let isLate = false, isEarly = false, isAutoCheckedOut = !!record.autoClosed;
                const first = record.punches?.[0];
                if (first) {
                    const checkInTime = DateTime.fromJSDate(first.checkIn).setZone(timezone);
                    if (checkInTime > dayDate.set({ hour: startHr, minute: startMin }).plus({ minutes: shift.allowedLateMinutes || 0 })) isLate = true;
                }
                const last = record.punches?.[record.punches.length - 1];
                if (last?.checkOut) {
                    let endDT = dayDate.set({ hour: endHr, minute: endMin });
                    if (shiftEndVal >= 1440) endDT = endDT.plus({ days: 1 });
                    if (DateTime.fromJSDate(last.checkOut).setZone(timezone) < endDT.minus({ minutes: shift.allowedEarlyExitMinutes || 0 })) isEarly = true;
                }

                if (isLate) stats.totalLate++;
                if (isEarly) stats.totalEarlyExit++;
                if (isAutoCheckedOut) stats.totalAutoCheckout++;

                const pIn = first?.checkIn ? DateTime.fromJSDate(first.checkIn).setZone(timezone).toFormat('hh:mm a') : '-';
                const pOut = last?.checkOut ? DateTime.fromJSDate(last.checkOut).setZone(timezone).toFormat('hh:mm a') : '-';

                const hrs = Math.floor(actualMinutes / 60);
                const mns = Math.floor(actualMinutes % 60);
                const dur = actualMinutes > 0 ? `${hrs}h ${mns}m` : '-';

                if (isLate || isEarly || isAutoCheckedOut) {
                    stats.penaltyEligibleViolations++;
                    stats.details.push({
                        date: dateKey,
                        type: isLate ? 'LATE' : (isEarly ? 'EARLY_EXIT' : 'AUTO_CHECKOUT'),
                        isViolation: true,
                        checkIn: pIn,
                        checkOut: pOut,
                        duration: dur
                    });
                }

                // If it's a Half Day derived from punches, still add to details for history
                if (record.status === 'HALF_DAY' || (actualMinutes > 0 && actualMinutes < halfDayThreshold)) {
                    // This is already being handled by dayWeight logic below, 
                    // but we might want to ensure it has punch details too.
                }
            }
        }

        // Apply Absence/Half-Day Deduction Logic
        if (dayWeight > 0) {
            // Prepare punch details for LOP/Leave entries if they come from a record
            let pIn = '-', pOut = '-', dur = '-';
            if (record) {
                const first = record.punches?.[0];
                const last = record.punches?.[record.punches.length - 1];
                pIn = first?.checkIn ? DateTime.fromJSDate(first.checkIn).setZone(timezone).toFormat('hh:mm a') : '-';
                pOut = last?.checkOut ? DateTime.fromJSDate(last.checkOut).setZone(timezone).toFormat('hh:mm a') : '-';

                let actualMinutes = 0;
                if (record.punches?.length > 0) {
                    record.punches.forEach(p => { if (p.checkIn && p.checkOut) actualMinutes += Math.max(0, (new Date(p.checkOut) - new Date(p.checkIn)) / 60000); });
                }
                const hrs = Math.floor(actualMinutes / 60);
                const mns = Math.floor(actualMinutes % 60);
                dur = actualMinutes > 0 ? `${hrs}h ${mns}m` : '-';
            }

            if (isPostProbationMonth && currentBalance >= dayWeight) {
                currentBalance -= dayWeight;
                runningLeavesUsed += dayWeight;
                stats.details.push({
                    date: dateKey,
                    weight: dayWeight,
                    type: 'PAID_LEAVE',
                    checkIn: pIn,
                    checkOut: pOut,
                    duration: dur
                });
            } else {
                runningLop += dayWeight;
                stats.details.push({
                    date: dateKey,
                    weight: dayWeight,
                    type: 'LOP',
                    checkIn: pIn,
                    checkOut: pOut,
                    duration: dur
                });
            }
        }
    }

    // Violation Penalties (3-6-9 Rule)
    // Every 3 violations = 1 day penalty
    const penaltyDays = Math.floor(stats.penaltyEligibleViolations / 3);
    stats.penaltyHalfDays = penaltyDays; // Using field to store penalty full days

    if (penaltyDays > 0) {
        if (isPostProbationMonth) {
            if (currentBalance >= penaltyDays) {
                currentBalance -= penaltyDays;
                runningLeavesUsed += penaltyDays;
                stats.details.push({ type: 'VIOLATION_PENALTY', days: penaltyDays, adjusted: 'LEAVE_BALANCE' });
            } else {
                const useFromBalance = Math.max(0, currentBalance);
                runningLeavesUsed += useFromBalance;
                const remainingAsLop = penaltyDays - useFromBalance;
                runningLop += Math.max(0, remainingAsLop);
                currentBalance = 0;
                stats.details.push({ type: 'VIOLATION_PENALTY', days: penaltyDays, adjusted: 'PARTIAL_LEAVE_LOP', leaveUsed: useFromBalance, lop: remainingAsLop });
            }
        } else {
            // During Probation: Penalty = Direct LOP
            runningLop += penaltyDays;
            stats.details.push({ type: 'VIOLATION_PENALTY', days: penaltyDays, adjusted: 'DIRECT_LOP_PROBATION' });
        }
    }

    stats.totalDeductionDays = Math.max(0, runningLop);
    stats.leavesUsed = Math.max(0, runningLeavesUsed);
    stats.newAvailableLeaves = Math.max(0, currentBalance);

    return stats;
};

module.exports = { calculateViolations };
