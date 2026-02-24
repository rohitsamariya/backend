const Attendance = require('../models/Attendance');
const Violation = require('../models/Violation');
const AttendanceCorrectionRequest = require('../models/AttendanceCorrectionRequest');
const User = require('../models/User');
const Branch = require('../models/Branch');
const { DateTime } = require('luxon');

// Helper to get Branch Timezone
const getBranchTimezone = async (branchId) => {
    const branch = await Branch.findById(branchId).select('timezone');
    return branch ? branch.timezone : 'Asia/Kolkata';
};

// @desc    Get Real-Time Branch Status
// @route   GET /api/hr/dashboard/live-status
// @access  HR (Own Branch), ADMIN
exports.getLiveStatus = async (req, res) => {
    try {
        const { branchId } = req.query; // Middleware ensures safety
        const timezone = await getBranchTimezone(branchId);
        const now = DateTime.now().setZone(timezone);
        const todayMidnight = now.startOf('day').toUTC().toJSDate();

        // Parallel Queries for Performance
        const [
            totalEmployees,
            checkedInToday,
            currentlyWorking,
            attendanceStats,
            violationStats
        ] = await Promise.all([
            // 1. Total Active Employees in Branch
            User.countDocuments({ branch: branchId, status: 'ACTIVE', role: 'EMPLOYEE' }),

            // 2. Checked In Today (Total Attendance docs created)
            Attendance.countDocuments({ branch: branchId, date: todayMidnight }),

            // 3. Currently Working (isOpen = true)
            Attendance.countDocuments({ branch: branchId, date: todayMidnight, isOpen: true }),

            // 4. Status Breakdown (AutoClosed)
            Attendance.aggregate([
                { $match: { branch: new mongoose.Types.ObjectId(branchId), date: todayMidnight } },
                {
                    $group: {
                        _id: null,
                        autoClosed: { $sum: { $cond: ['$autoClosed', 1, 0] } },
                        lateMarked: { $sum: { $cond: ['$lateMarked', 1, 0] } },
                        earlyExitMarked: { $sum: { $cond: ['$earlyExitMarked', 1, 0] } }
                    }
                }
            ]),

            // 5. Violations Today (Optional, but useful)
            // Or we rely on attendance flags above.
            Promise.resolve(null)
        ]);

        const stats = attendanceStats[0] || { autoClosed: 0, lateMarked: 0, earlyExitMarked: 0 };
        const notCheckedIn = Math.max(0, totalEmployees - checkedInToday);

        // "Currently On Break" logic:
        // CheckedInToday - CurrentlyWorking - Completed(CheckedOut)
        // If "Closed" means "Completed" or "On Break"?
        // HR usually wants to know: Who is IN PREMISES vs OUT.
        // CurrentlyWorking = isOpen: true.
        // CurrentlyCheckedIn (Total) = isOpen + isClosed.
        // On Break is hard without Break Mode.
        // We will return:
        // - Total Employees
        // - Present Today (Checked In at least once)
        // - Currently Working (Active Punch)
        // - Not Yet In
        // - Auto Closed (Warning)

        // We can approximate "On Break" if we had that status. For now, we omit or assume Closed = Left.

        res.status(200).json({
            success: true,
            meta: { branchTimezone: timezone },
            data: {
                totalEmployees,
                presentToday: checkedInToday,
                currentlyWorking,
                notCheckedIn,
                autoClosedCount: stats.autoClosed,
                lateTodayCount: stats.lateMarked,
                earlyExitTodayCount: stats.earlyExitMarked
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Today's Attendance Grid (Paginated)
// @route   GET /api/hr/dashboard/today
// @access  HR (Own Branch), ADMIN
exports.getTodayAttendance = async (req, res) => {
    try {
        const { branchId } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const timezone = await getBranchTimezone(branchId);
        const now = DateTime.now().setZone(timezone);
        const todayMidnight = now.startOf('day').toUTC().toJSDate();

        // Fetch Attendance with Projection and Population
        const attendanceList = await Attendance.find({
            branch: branchId,
            date: todayMidnight
        })
            .select('user shift punches totalWorkingMinutes status lateMarked earlyExitMarked autoClosed isOpen')
            .populate('user', 'name role email')
            .populate('shift', 'name startTime endTime')
            .sort({ 'punches.0.checkIn': 1 }) // Earliest check-in first? Or latest? Usually earliest first for "Today's Log". Can change to -1.
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Attendance.countDocuments({ branch: branchId, date: todayMidnight });

        // Transform for Grid
        const gridData = attendanceList.map(doc => {
            const firstPunch = doc.punches[0];
            const lastPunch = doc.punches[doc.punches.length - 1];

            return {
                id: doc._id,
                employeeName: doc.user ? doc.user.name : 'Unknown',
                role: doc.user ? doc.user.role : 'N/A',
                shiftName: doc.shift ? doc.shift.name : 'N/A',
                checkInTime: firstPunch ? firstPunch.checkIn : null,
                checkOutTime: (!doc.isOpen && lastPunch) ? lastPunch.checkOut : null, // Only show if closed? Or show last known punch?
                // Request asks: "checkOutTime". If open, it's null.
                checkOutTimeDisplay: doc.isOpen ? null : (lastPunch ? lastPunch.checkOut : null),
                totalWorkingMinutes: doc.totalWorkingMinutes,
                status: doc.isOpen ? 'WORKING' : doc.status, // Override 'PRESENT' if still working
                lateMarked: doc.lateMarked,
                earlyExitMarked: doc.earlyExitMarked,
                autoClosed: doc.autoClosed
            };
        });

        res.status(200).json({
            success: true,
            meta: {
                page,
                limit,
                total,
                branchTimezone: timezone
            },
            data: gridData
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Corrections Panel
// @route   GET /api/hr/dashboard/corrections
// @access  HR, ADMIN
exports.getCorrections = async (req, res) => {
    try {
        const { branchId, status } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const queryStatus = status || 'PENDING';

        const corrections = await AttendanceCorrectionRequest.find({
            branch: branchId,
            status: queryStatus
        })
            .populate('user', 'name email role')
            .populate('attendance', 'date')
            .sort({ createdAt: 1 }) // Oldest first (FIFO queue for HR)
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await AttendanceCorrectionRequest.countDocuments({ branch: branchId, status: queryStatus });

        const mapped = corrections.map(c => ({
            id: c._id,
            employeeName: c.user ? c.user.name : 'Unknown',
            attendanceDate: c.attendance ? c.attendance.date : null,
            reason: c.reason,
            type: c.type,
            requestedData: c.requestedData,
            status: c.status,
            createdAt: c.createdAt
        }));

        res.status(200).json({
            success: true,
            meta: { page, limit, total },
            data: mapped
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// Export (Phase 2 impl)
// Aggregations (Phase 2 impl)
// Approve/Reject (Phase 2 impl)

const mongoose = require('mongoose');

// ... (Previous exports maintained) ...

// @desc    Approve Correction Request
// @route   PUT /api/hr/dashboard/corrections/:id/approve
// @access  HR, ADMIN
exports.approveCorrection = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;
        const request = await AttendanceCorrectionRequest.findById(id).session(session);

        if (!request) {
            throw new Error('Request not found');
        }
        if (request.status !== 'PENDING') {
            throw new Error('Request is not PENDING');
        }

        const attendance = await Attendance.findById(request.attendance).session(session);
        if (!attendance) {
            throw new Error('Attendance record not found');
        }

        // Apply Correction based on Type
        // This is complex. We must respect the request type.
        // For MISSED_CHECKOUT, we close the punch.
        // For WRONG_TIME, we update specific punch.
        // Simplified Logic for Proof of Concept:

        if (request.type === 'MISSED_CHECKOUT') {
            // Logic: Close the open punch or add checkout
            // Assuming request.requestedData.checkOut exists
            const checkOutTime = request.requestedData.checkOut ? new Date(request.requestedData.checkOut) : new Date();

            // Find open punch or last punch
            let targetPunch = null;
            if (attendance.isOpen && attendance.openPunchIndex !== null) {
                targetPunch = attendance.punches[attendance.openPunchIndex];
            } else if (attendance.punches.length > 0) {
                targetPunch = attendance.punches[attendance.punches.length - 1]; // Last punch
            }

            if (targetPunch) {
                targetPunch.checkOut = checkOutTime;
                targetPunch.checkOutLocation = request.requestedData.location || { latitude: 0, longitude: 0 }; // Manual override loc
            }
            attendance.isOpen = false;
            attendance.openPunchIndex = null;
            attendance.autoClosed = false; // Remove auto-close flag if fixed
        } else if (request.type === 'MISSED_CHECKIN') {
            // Add new punch? Or fix existing?
            // Usually adds a punch pair.
            attendance.punches.push({
                checkIn: new Date(request.requestedData.checkIn),
                checkOut: request.requestedData.checkOut ? new Date(request.requestedData.checkOut) : null,
                checkInLocation: request.requestedData.location || { latitude: 0, longitude: 0 }
            });
            // Recalc status
            if (!request.requestedData.checkOut) {
                attendance.isOpen = true;
                attendance.openPunchIndex = attendance.punches.length - 1;
            }
        }

        // Recalculate Working Minutes (shared logic needed ideally)
        let totalWorkingMs = 0;
        attendance.punches.forEach(p => {
            if (p.checkIn && p.checkOut) {
                totalWorkingMs += (new Date(p.checkOut) - new Date(p.checkIn));
            }
        });
        attendance.totalWorkingMinutes = Math.floor(totalWorkingMs / 1000 / 60);

        // Update Request Status
        request.status = 'APPROVED';
        request.reviewedBy = req.user._id;
        request.reviewedAt = new Date();

        await attendance.save({ session });
        await request.save({ session });

        await session.commitTransaction();
        res.status(200).json({ success: true, message: 'Correction Approved' });

    } catch (error) {
        await session.abortTransaction();
        console.error(error);
        res.status(400).json({ success: false, error: error.message || 'Approval Failed' });
    } finally {
        session.endSession();
    }
};

// @desc    Reject Correction Request
// @route   PUT /api/hr/dashboard/corrections/:id/reject
// @access  HR, ADMIN
exports.rejectCorrection = async (req, res) => {
    try {
        const { id } = req.params;
        const request = await AttendanceCorrectionRequest.findById(id);

        if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
        if (request.status !== 'PENDING') return res.status(400).json({ success: false, error: 'Not Pending' });

        request.status = 'REJECTED';
        request.reviewedBy = req.user._id;
        request.reviewedAt = new Date();

        await request.save();
        res.status(200).json({ success: true, message: 'Correction Rejected' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Monthly Summary
// @route   GET /api/hr/dashboard/monthly-summary
// @access  HR, ADMIN
exports.getMonthlySummary = async (req, res) => {
    try {
        const { branchId, month, year } = req.query;
        // Validate inputs...

        const m = parseInt(month);
        const y = parseInt(year);

        // Construct Date Range for Attendance (UTC Midnight)
        // Need Branch Timezone? Yes.
        const timezone = await getBranchTimezone(branchId);
        const startOfMonth = DateTime.fromObject({ year: y, month: m, day: 1 }, { zone: timezone }).startOf('day').toUTC().toJSDate();
        const endOfMonth = DateTime.fromObject({ year: y, month: m, day: 1 }, { zone: timezone }).endOf('month').toUTC().toJSDate();

        // 1. Attendance Aggregation
        const attendanceAgg = await Attendance.aggregate([
            {
                $match: {
                    branch: new mongoose.Types.ObjectId(branchId),
                    date: { $gte: startOfMonth, $lte: endOfMonth }
                }
            },
            {
                $group: {
                    _id: '$user',
                    present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
                    halfDay: { $sum: { $cond: [{ $eq: ['$status', 'HALF_DAY'] }, 1, 0] } },
                    absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } },
                    autoClosed: { $sum: { $cond: ['$autoClosed', 1, 0] } },
                    late: { $sum: { $cond: ['$lateMarked', 1, 0] } }
                }
            }
        ]);

        // 2. Violation Aggregation
        const violationAgg = await Violation.aggregate([
            {
                $match: {
                    branch: new mongoose.Types.ObjectId(branchId),
                    month: m,
                    year: y
                }
            },
            {
                $group: {
                    _id: '$user',
                    totalViolations: { $sum: 1 }
                }
            }
        ]);

        // Merge Logic
        // We need a list of ALL employees, not just those with attendance/violations.
        // Fetch All Users of Branch
        const users = await User.find({ branch: branchId, role: 'EMPLOYEE', status: 'ACTIVE' }).select('name').lean();

        // Create Lookup Maps
        const attMap = {};
        attendanceAgg.forEach(a => attMap[a._id.toString()] = a);
        const vioMap = {};
        violationAgg.forEach(v => vioMap[v._id.toString()] = v);

        const report = users.map(u => {
            const uid = u._id.toString();
            const att = attMap[uid] || { present: 0, halfDay: 0, absent: 0, autoClosed: 0, late: 0 };
            const vio = vioMap[uid] || { totalViolations: 0 };

            return {
                userId: uid,
                name: u.name,
                present: att.present,
                halfDay: att.halfDay,
                absent: att.absent,
                autoClosed: att.autoClosed,
                violations: vio.totalViolations,
                late: att.late
            };
        });

        // Totals for Cards
        const totals = report.reduce((acc, curr) => ({
            totalPresent: acc.totalPresent + curr.present,
            totalHalfDay: acc.totalHalfDay + curr.halfDay,
            totalAbsent: acc.totalAbsent + curr.absent,
            totalViolations: acc.totalViolations + curr.violations,
            totalAutoClosed: acc.totalAutoClosed + curr.autoClosed
        }), { totalPresent: 0, totalHalfDay: 0, totalAbsent: 0, totalViolations: 0, totalAutoClosed: 0 });

        // Top Lists
        const topLate = [...report].sort((a, b) => b.late - a.late).slice(0, 5);
        const topViolations = [...report].sort((a, b) => b.violations - a.violations).slice(0, 5);

        res.status(200).json({
            success: true,
            meta: { branchTimezone: timezone, totalEmployees: users.length },
            data: {
                totals,
                report: report, // Or paginated report? Endpoint says "Summary".
                topLate,
                topViolations
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Discipline Report
// @route   GET /api/hr/dashboard/discipline
// @access  HR, ADMIN
exports.getDisciplineReport = async (req, res) => {
    try {
        const { branchId, month, year } = req.query;
        const m = parseInt(month);
        const y = parseInt(year);

        const violations = await Violation.aggregate([
            { $match: { branch: new mongoose.Types.ObjectId(branchId), month: m, year: y } },
            {
                $group: {
                    _id: '$user',
                    total: { $sum: 1 },
                    late: { $sum: { $cond: [{ $eq: ['$type', 'LATE'] }, 1, 0] } },
                    earlyExit: { $sum: { $cond: [{ $eq: ['$type', 'EARLY_EXIT'] }, 1, 0] } },
                    autoCheckout: { $sum: { $cond: [{ $eq: ['$type', 'AUTO_CHECKOUT'] }, 1, 0] } }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            { $unwind: '$userInfo' },
            {
                $project: {
                    _id: 1,
                    name: '$userInfo.name',
                    total: 1,
                    late: 1,
                    earlyExit: 1,
                    autoCheckout: 1
                }
            }
        ]);

        // Add "Next Penalty At" Logic?
        const report = violations.map(v => {
            let nextAt = 3;
            if (v.total > 0) {
                const rem = v.total % 3;
                nextAt = v.total + (3 - rem);
            }
            return { ...v, nextPenaltyAt: nextAt };
        });

        res.status(200).json({ success: true, data: report });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
