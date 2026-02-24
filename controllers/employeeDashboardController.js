const Attendance = require('../models/Attendance');
const Violation = require('../models/Violation');
const User = require('../models/User');
const { DateTime } = require('luxon');

// @desc    Get Today's Dashboard Stats
// @route   GET /api/employee/dashboard/today
// @access  EMPLOYEE
exports.getTodayDashboard = async (req, res) => {
    try {
        const userId = req.user._id;

        // 1. Get User with Branch for Timezone
        const user = await User.findById(userId).populate('branch');
        if (!user || !user.branch) {
            return res.status(400).json({ success: false, error: 'User or Branch not found' });
        }

        const timezone = user.branch.timezone || 'Asia/Kolkata';

        // 2. Calculate Today's Midnight in Branch Timezone
        // This must match how Attendance 'date' is stored (Midnight set to local time)
        const today = DateTime.now().setZone(timezone).startOf('day').toJSDate();

        // 3. Find Attendance Record
        const attendance = await Attendance.findOne({
            user: userId,
            date: today
        }).populate('shift', 'name startTime endTime');

        // 4. Construct Response
        let data = {
            checkInTime: null,
            checkOutTime: null,
            totalWorkedMinutes: 0,
            isOpen: false,
            autoClosed: false,
            lateMarked: false,
            earlyExitMarked: false,
            shift: null,
            branchTimezone: timezone
        };

        if (attendance) {
            // Find the latest punch for checkIn/checkOut display
            // Standard logic: If open, use latest punch checkIn. If closed, use latest punch checkOut (or checkIn if incomplete).
            // Actually, usually dashboard shows FIRST CheckIn and LAST CheckOut for the day, or list of punches.
            // Prompt asks for "checkInTime, checkOutTime". I will provide First CheckIn and Last CheckOut (if exists).

            const firstPunch = attendance.punches.length > 0 ? attendance.punches[0] : null;
            const lastPunch = attendance.punches.length > 0 ? attendance.punches[attendance.punches.length - 1] : null;

            data.checkInTime = firstPunch ? firstPunch.checkIn : null;
            data.checkOutTime = lastPunch && lastPunch.checkOut ? lastPunch.checkOut : null;

            // If currently open, override checkOutTime to null (or keep previous closed punch? Usually null implies "Currently Working")
            if (attendance.isOpen) {
                data.checkOutTime = null;
            }

            data.totalWorkedMinutes = attendance.totalWorkingMinutes;
            data.isOpen = attendance.isOpen;
            data.autoClosed = attendance.autoClosed;
            data.lateMarked = attendance.lateMarked;
            data.earlyExitMarked = attendance.earlyExitMarked;
            data.shift = attendance.shift;
        } else {
            // If no attendance, we still might want to show assigned shift
            // But we only populating shift from attendance query. 
            // We can fetch user's assigned shift if needed.
            // For now, if no attendance today, return nulls.
            // Let's populate default shift from User if attendance missing
            if (user.shift) {
                const Shift = require('../models/Shift');
                const defaultShift = await Shift.findById(user.shift).select('name startTime endTime');
                data.shift = defaultShift;
            }
        }

        res.status(200).json({ success: true, data });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Monthly Summary
// @route   GET /api/employee/dashboard/monthly-summary
// @access  EMPLOYEE
exports.getMonthlySummary = async (req, res) => {
    try {
        const userId = req.user._id;

        // 1. Get Timezone
        const user = await User.findById(userId).populate('branch', 'timezone');
        const timezone = user?.branch?.timezone || 'Asia/Kolkata';

        // 2. Calculate Current Month Range
        const now = DateTime.now().setZone(timezone);
        const startOfMonth = now.startOf('month').toJSDate();
        const endOfMonth = now.endOf('month').toJSDate();
        const currentMonth = now.month; // 1-12
        const currentYear = now.year;

        // Fetch Branch working days to calculate Scheduled / Absent accurately
        const workingDays = user?.branch?.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const Holiday = require('../models/Holiday');
        const holidaysThisMonth = await Holiday.find({
            date: { $gte: startOfMonth, $lte: endOfMonth }
        });

        // Calculate Scheduled Days (Past & Total)
        let totalScheduledDays = 0;
        let scheduledDaysPassed = 0;
        const todayMidnight = now.startOf('day').toJSDate();

        for (let d = now.startOf('month'); d <= now.endOf('month'); d = d.plus({ days: 1 })) {
            const dayName = d.toFormat('cccc');
            const isWorkingDay = workingDays.includes(dayName);
            const isHoliday = holidaysThisMonth.some(h => new Date(h.date).getTime() === d.startOf('day').toJSDate().getTime());

            if (isWorkingDay && !isHoliday) {
                totalScheduledDays++;
                if (d.toJSDate() <= todayMidnight) {
                    scheduledDaysPassed++;
                }
            }
        }

        // Parallelize DB fetching for attended days
        const [
            presentDays,
            halfDays,
            dbAbsentDays,
            totalViolations
        ] = await Promise.all([
            // PRESENT
            Attendance.countDocuments({
                user: userId,
                date: { $gte: startOfMonth, $lte: endOfMonth },
                status: 'PRESENT'
            }),
            // HALF_DAY
            Attendance.countDocuments({
                user: userId,
                date: { $gte: startOfMonth, $lte: endOfMonth },
                status: 'HALF_DAY'
            }),
            // EXPLICIT ABSENT (If manually marked)
            Attendance.countDocuments({
                user: userId,
                date: { $gte: startOfMonth, $lte: endOfMonth },
                status: 'ABSENT'
            }),
            // Violations in Current Month
            Violation.countDocuments({
                user: userId,
                month: currentMonth,
                year: currentYear
            })
        ]);

        // User requested actual db data for absents
        const finalAbsentDays = dbAbsentDays;

        // User requested every 3 violations = 1 half day penalty
        const calculatedHalfDays = halfDays + Math.floor(totalViolations / 3);

        // 4. Calculate Next Penalty
        // "if violations % 3 === 0 → next at violations + 3"
        // "else → next multiple of 3"
        // Examples:
        // 0 -> next 3
        // 1 -> next 3
        // 2 -> next 3
        // 3 -> next 6
        // 4 -> next 6

        let nextPenaltyAt;
        if (totalViolations === 0) {
            nextPenaltyAt = 3;
        } else {
            const remainder = totalViolations % 3;
            if (remainder === 0) {
                nextPenaltyAt = totalViolations + 3;
            } else {
                nextPenaltyAt = totalViolations + (3 - remainder);
            }
        }

        res.status(200).json({
            success: true,
            data: {
                totalDays: totalScheduledDays,
                presentDays,
                halfDays: calculatedHalfDays,
                absentDays: finalAbsentDays,
                totalViolations,
                nextPenaltyAt
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Violation History
// @route   GET /api/employee/dashboard/violations
// @access  EMPLOYEE
exports.getViolationHistory = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const { month, year } = req.query;
        let query = { user: req.user._id };

        if (month && year) {
            query.month = parseInt(month);
            query.year = parseInt(year);
        }

        const violations = await Violation.find(query)
            .select('type date month year createdAt') // Optimized select
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Violation.countDocuments(query);

        res.status(200).json({
            success: true,
            count: violations.length,
            total,
            pagination: { page, limit },
            data: violations
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Attendance History
// @route   GET /api/employee/dashboard/attendance-history
// @access  EMPLOYEE
exports.getAttendanceHistory = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const { month, year, status } = req.query;

        let query = { user: req.user._id };

        // Apply Status Filter if provided
        if (status) {
            query.status = status;
        }

        // Apply Month/Year Date Filtering if provided
        if (month && year) {
            const user = await User.findById(req.user._id).populate('branch', 'timezone');
            const timezone = user?.branch?.timezone || 'Asia/Kolkata';

            // Create a luxon date for the requested month/year
            const startOfMonth = DateTime.fromObject({ year: parseInt(year), month: parseInt(month) }, { zone: timezone }).startOf('month').toJSDate();
            const endOfMonth = DateTime.fromObject({ year: parseInt(year), month: parseInt(month) }, { zone: timezone }).endOf('month').toJSDate();

            query.date = {
                $gte: startOfMonth,
                $lte: endOfMonth
            };
        }

        const history = await Attendance.find(query)
            .select('date totalWorkingMinutes status autoClosed punches') // Needed fields
            .sort({ date: -1 }) // Newest first
            .skip(skip)
            .limit(limit);

        const total = await Attendance.countDocuments(query);

        res.status(200).json({
            success: true,
            count: history.length,
            total,
            pagination: { page, limit },
            data: history
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Live Shift Status
// @route   GET /api/employee/dashboard/live-status
// @access  EMPLOYEE
exports.getLiveStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('branch', 'timezone')
            .populate('shift'); // Need full shift details

        if (!user || !user.branch || !user.shift) {
            return res.status(400).json({ success: false, error: 'Configuration missing (Branch/Shift)' });
        }

        const timezone = user.branch.timezone || 'Asia/Kolkata';
        const now = DateTime.now().setZone(timezone);
        const todayMidnight = now.startOf('day').toJSDate();

        // Fetch Attendance
        const attendance = await Attendance.findOne({
            user: user._id,
            date: todayMidnight // Stored as UTC
        });

        // Calculate Shift Times (Handle Overnight)
        let shiftStart = now.set({
            hour: parseInt(user.shift.startTime.split(':')[0]),
            minute: parseInt(user.shift.startTime.split(':')[1]),
            second: 0
        });

        let shiftEnd = now.set({
            hour: parseInt(user.shift.endTime.split(':')[0]),
            minute: parseInt(user.shift.endTime.split(':')[1]),
            second: 0
        });

        // Overnight detection (End < Start)
        // If End is 'tomorrow' relative to Start
        // And 'now' might be 'today' or 'tomorrow'.
        // Logic: 
        if (shiftEnd < shiftStart) {
            // Shift is overnight. 
            // e.g. Start 22:00, End 06:00.
            // If now is 23:00, End is +1 day.
            // If now is 05:00, End is Today (and Start was Yesterday).
            // Complex. Let's rely on standard logic: 
            // Duration is fixed 24h aware.
            shiftEnd = shiftEnd.plus({ days: 1 });
        }
        // Wait, if we just want "Today's Shift limits", and we are currently working...
        // If I punched in yesterday 22:00, the attendance date is YESTERDAY's midnight.
        // If I punched in today 22:00, attendance date is TODAY.
        // This endpoint is "Live Status". 
        // If I am currently "Open", I want THAT attendance record. 
        // If I am not Open, I want "Today's" record.

        // Let's refine Attendance Fetch:
        // Find OPEN attendance first?
        // Or strictly TODAY's attendance? 
        // If I worked overnight yesterday, that record is "Yesterday". It might still be open (if unchecked out).
        // Let's check for Open Attendance first.
        let activeAttendance = await Attendance.findOne({
            user: user._id,
            isOpen: true
        });

        // If no open attendance, use Today's attendance (even if closed or not created)
        if (!activeAttendance) {
            activeAttendance = attendance; // The one found by todayMidnight
        }

        // --- CALCULATIONS ---

        let minutesWorked = 0;
        let breakMinutes = 0;
        let currentState = 'NOT_STARTED'; // NOT_STARTED, WORKING, ON_BREAK, COMPLETED
        let isLate = false;

        if (activeAttendance) {
            // Worked & Break
            // Use same logic as checkOut calculation
            let totalWorkingMs = 0;
            let totalBreakMs = 0;

            for (let i = 0; i < activeAttendance.punches.length; i++) {
                const p = activeAttendance.punches[i];
                const inTime = p.checkIn ? new Date(p.checkIn) : null;
                const outTime = p.checkOut ? new Date(p.checkOut) : (activeAttendance.isOpen && i === activeAttendance.punches.length - 1 ? new Date() : null); // If open, use NOW

                if (inTime && outTime) {
                    totalWorkingMs += (outTime - inTime);
                }

                if (i > 0) {
                    const prev = activeAttendance.punches[i - 1];
                    const prevOut = prev.checkOut ? new Date(prev.checkOut) : null;
                    if (prevOut && inTime) {
                        totalBreakMs += (inTime - prevOut);
                    }
                }
            }
            minutesWorked = Math.floor(totalWorkingMs / 1000 / 60);
            breakMinutes = Math.floor(totalBreakMs / 1000 / 60);

            if (activeAttendance.isOpen) {
                currentState = 'WORKING';
            } else if (activeAttendance.status === 'PRESENT' || activeAttendance.status === 'HALF_DAY' || activeAttendance.punches.length > 0) {
                // If closed but has punches...
                currentState = 'COMPLETED'; // Or ON_BREAK if between punches? 
                // Difficult to detect ON_BREAK without "Break Mode". 
                // We assume Closed = Completed for now unless we add Break Start/End logic explicitly.
                // Or if we define "On Break" as "Checked Out but Shift not over". 
                // Let's stick to simple: OPEN=WORKING, CLOSED=COMPLETED (or NOT_STARTED if 0 punches).
            }

            if (activeAttendance.lateMarked) isLate = true;
        }

        // Risks
        const toMinutes = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
        let startMins = toMinutes(user.shift.startTime);
        let endMins = toMinutes(user.shift.endTime);
        if (endMins < startMins) endMins += (24 * 60);
        const shiftDuration = endMins - startMins;

        const minutesRemaining = Math.max(0, shiftDuration - minutesWorked);
        const projectedHalfDay = (minutesWorked < (shiftDuration * 0.5));
        // Note: Real "Risk" implies "If I leave now".

        // Late Risk? 
        // If not checked in yet, and NOW > allowable late time.
        if (!activeAttendance && currentState === 'NOT_STARTED') {
            const lateThreshold = shiftStart.plus({ minutes: user.shift.allowedLateMinutes });
            if (now > lateThreshold) isLate = true; // "Already Late"
        }

        const data = {
            serverTime: now.toISO(), // Branch TZ
            shiftStartTime: user.shift.startTime,
            shiftEndTime: user.shift.endTime,
            minutesWorkedToday: minutesWorked,
            minutesRemaining: minutesRemaining,
            breakMinutes: breakMinutes,
            currentState: currentState,
            lateRisk: isLate,
            // Early leave risk: if I leave now, will I get early exit?
            earlyLeaveRisk: false, // Calc logic needed? 
            // "If Now < ShiftEnd - AllowedEarly"
            halfDayRisk: projectedHalfDay
        };

        // Refine Early Leave Risk
        // If currently working, and now < earlyExitThreshold
        if (currentState === 'WORKING') {
            // Need absolute Shift End (Today or Tomorrow)
            // We approximated shiftEnd above, but careful with overnight.
            // If activeAttendance matches "yesterday" (overnight), shiftEnd should be relative to THAT day.
            // For "Live Status", let's strictly use "Time Remaining" logic or just generic time check.
            // This is complex. Let's simplify:
            // If minutesRemaining > allowedEarlyExitMinutes, then Early Leave Risk is TRUE.
            if (minutesRemaining > user.shift.allowedEarlyExitMinutes) {
                data.earlyLeaveRisk = true;
            }
        }

        res.status(200).json({ success: true, data });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Discipline & Salary Summary
// @route   GET /api/employee/dashboard/discipline-summary
// @access  EMPLOYEE
exports.getDisciplineSummary = async (req, res) => {
    try {
        const { calculateSalaryImpact } = require('../utils/salaryUtils');
        const user = await User.findById(req.user._id).populate('branch');
        const timezone = user.branch?.timezone || 'Asia/Kolkata';
        const now = DateTime.now().setZone(timezone);

        const currentMonth = now.month;
        const currentYear = now.year;

        // 1. Total Violations
        const totalViolations = await Violation.countDocuments({
            user: req.user._id,
            month: currentMonth,
            year: currentYear
        });

        // 2. Half Days Deducted (Status = HALF_DAY)
        // Note: This counts VALID half days (short work) AND Penalties (3-6-9)
        // If we want ONLY penalties, we need to flag them in Attendance or Violation. 
        // Prompt says: "totalViolationsThisMonth", "halfDaysDeductedThisMonth".
        // Let's sum ALL Half Days for now as "Deducted" from full salary.
        const startOfMonth = now.startOf('month').toJSDate();
        const endOfMonth = now.endOf('month').toJSDate();

        const halfDays = await Attendance.countDocuments({
            user: req.user._id,
            date: { $gte: startOfMonth, $lte: endOfMonth },
            status: 'HALF_DAY'
        });

        // 3. Projected Next Penalty
        let nextPenaltyAt;
        if (totalViolations === 0) {
            nextPenaltyAt = 3;
        } else {
            const remainder = totalViolations % 3;
            nextPenaltyAt = totalViolations + (3 - remainder);
        }

        // 4. Salary Impact
        const salaryImpactPreview = calculateSalaryImpact(user, halfDays);

        res.status(200).json({
            success: true,
            data: {
                totalViolationsThisMonth: totalViolations,
                halfDaysDeductedThisMonth: halfDays,
                projectedNextPenaltyAt: nextPenaltyAt,
                // "at violation #6" or "in 2 violations" ? 
                // Prompt says "projectedNextPenaltyAt". I'll return the violation count trigger.
                salaryImpactPreview: salaryImpactPreview
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
