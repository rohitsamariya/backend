const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Violation = require('../models/Violation');
const Branch = require('../models/Branch');
const { DateTime } = require('luxon');
const mongoose = require('mongoose');

// Helper to get Branch Timezone
const getBranchTimezone = async (branchId) => {
    const branch = await Branch.findById(branchId).select('timezone');
    return branch ? branch.timezone : 'Asia/Kolkata';
};

// @desc    Get Manager Live Dashboard
// @route   GET /api/manager/dashboard/live
// @access  MANAGER
exports.getManagerLiveDashboard = async (req, res) => {
    try {
        // Manager's Branch Only
        const branchId = req.user.branch;
        const timezone = await getBranchTimezone(branchId);
        const now = DateTime.now().setZone(timezone);
        const todayMidnight = now.startOf('day').toUTC().toJSDate();

        // Parallel Queries
        const [
            teamCount,
            attendanceStats,
            violationStats
        ] = await Promise.all([
            // 1. Total Team Size (Active Employees in Branch)
            User.countDocuments({ branch: branchId, role: 'EMPLOYEE', status: 'ACTIVE' }),

            // 2. Attendance Stats (Present, Working, Break?)
            // "On Break" logic: We don't have explicit break status yet. 
            // We approximate: CheckedIn (Present) vs Open (Working). 
            // Difference is "Completed" or "Break".
            Attendance.aggregate([
                { $match: { branch: branchId, date: todayMidnight } },
                {
                    $group: {
                        _id: null,
                        present: { $sum: 1 }, // Any record created today
                        working: { $sum: { $cond: ['$isOpen', 1, 0] } },
                        // If we had explicit 'ON_BREAK' status, we'd sum it here.
                        // For now, let's assume "Closed but Present" could be "Completed/Break".
                        // Prompt asks for "On Break". If we can't reliably calc it, return 0 or inferred.
                        // Let's return 0 to be safe unless we find a flag.
                        break: { $sum: 0 }
                    }
                }
            ]),

            // 3. Violations Today
            Violation.countDocuments({
                branch: branchId,
                date: { $gte: todayMidnight, $lte: now.endOf('day').toUTC().toJSDate() }
            })
        ]);

        const stats = attendanceStats[0] || { present: 0, working: 0, break: 0 };

        res.status(200).json({
            success: true,
            data: {
                teamCount,
                presentToday: stats.present,
                workingNow: stats.working,
                onBreak: stats.break,
                totalViolationsToday: violationStats
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Team Status (Paginated)
// @route   GET /api/manager/dashboard/team
// @access  MANAGER
exports.getTeamStatus = async (req, res) => {
    try {
        const branchId = req.user.branch;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20; // Default 20
        const skip = (page - 1) * limit;

        const timezone = await getBranchTimezone(branchId);
        const now = DateTime.now().setZone(timezone);
        const todayMidnight = now.startOf('day').toUTC().toJSDate();

        // Strategy: Fetch Users, then LOOKUP Attendance for Today
        // We want ALL employees, even absent ones.

        // 1. Fetch Users (Paginated)
        const users = await User.find({ branch: branchId, role: 'EMPLOYEE', status: 'ACTIVE' })
            .select('name email role')
            .sort({ name: 1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalUsers = await User.countDocuments({ branch: branchId, role: 'EMPLOYEE', status: 'ACTIVE' });

        // 2. Fetch Attendance for these users
        const userIds = users.map(u => u._id);
        const attendances = await Attendance.find({
            user: { $in: userIds },
            date: todayMidnight
        }).lean();

        // 3. Map Attendance to Users
        const attMap = {};
        attendances.forEach(a => attMap[a.user.toString()] = a);

        const teamData = users.map(u => {
            const att = attMap[u._id.toString()];
            // Status Logic
            let status = 'ABSENT';
            let workingMinutes = 0;
            let isLate = false;
            let isEarlyExit = false;
            let isAutoClosed = false;

            if (att) {
                status = att.isOpen ? 'WORKING' : (att.status || 'PRESENT');
                workingMinutes = att.totalWorkingMinutes || 0;
                isLate = att.lateMarked || false;
                isEarlyExit = att.earlyExitMarked || false;
                isAutoClosed = att.autoClosed || false;
            }

            return {
                id: u._id,
                name: u.name,
                status: status,
                workingMinutes: workingMinutes,
                isLate: isLate,
                isEarlyExit: isEarlyExit,
                isAutoClosed: isAutoClosed
            };
        });

        res.status(200).json({
            success: true,
            meta: { page, limit, total: totalUsers },
            data: teamData
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Risk Report (3-6-9)
// @route   GET /api/manager/dashboard/risk-report
// @access  MANAGER
exports.getRiskReport = async (req, res) => {
    try {
        const branchId = req.user.branch;
        const timezone = await getBranchTimezone(branchId);
        const now = DateTime.now().setZone(timezone);
        const m = now.month;
        const y = now.year;

        // 1. Aggregation to count violations per user
        const violationCounts = await Violation.aggregate([
            { $match: { branch: branchId, month: m, year: y } },
            { $group: { _id: '$user', total: { $sum: 1 } } }
        ]);

        // 2. Filter for "Risk" (Close to 3, 6, 9)
        // Let's say "Close" is within 1 violation of penalty?
        // Penalties at 3, 6, 9. 
        // Risk: 2, 5, 8.
        const riskUserIds = [];
        const riskMap = {};

        violationCounts.forEach(v => {
            const rem = v.total % 3;
            // If total is 2, 5, 8... next is penalty.
            if (rem === 2) {
                riskUserIds.push(v._id);
                riskMap[v._id.toString()] = v.total;
            }
        });

        if (riskUserIds.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        // 3. Fetch User Details
        const riskUsers = await User.find({ _id: { $in: riskUserIds } })
            .select('name email')
            .lean();

        const report = riskUsers.map(u => ({
            id: u._id,
            name: u.name,
            currentViolations: riskMap[u._id.toString()],
            nextPenaltyAt: riskMap[u._id.toString()] + 1
        }));

        res.status(200).json({ success: true, data: report });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
