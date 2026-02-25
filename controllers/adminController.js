const User = require('../models/User');
const Branch = require('../models/Branch');
const Shift = require('../models/Shift');
const Attendance = require('../models/Attendance');
const Violation = require('../models/Violation');
const AttendanceCorrectionRequest = require('../models/AttendanceCorrectionRequest');
const violationService = require('../services/violationService');

// @desc    Reactivate User
// @route   PATCH /api/admin/users/:id/reactivate
// @access  ADMIN
exports.reactivateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (user.isActive) {
            return res.status(400).json({ success: false, error: 'User is already active' });
        }

        user.isActive = true;
        // Also ensure status is ACTIVE if they were DEACTIVATED
        if (user.status === 'DEACTIVATED') {
            user.status = 'ACTIVE';
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: 'User reactivated successfully',
            data: user
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error reactivating user' });
    }
};

// @desc    Deactivate User
// @route   PATCH /api/admin/users/:id/deactivate
// @access  ADMIN
exports.deactivateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Prevent self-deactivation
        if (req.user.id === req.params.id) {
            return res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
        }

        // Prevent deactivating an ADMIN
        if (user.role === 'ADMIN') {
            return res.status(403).json({ success: false, error: 'Cannot deactivate an ADMIN user' });
        }

        user.isActive = false;
        user.status = 'DEACTIVATED';
        await user.save();

        res.status(200).json({
            success: true,
            message: 'User deactivated successfully',
            data: user
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error deactivating user' });
    }
};

// @desc    Change Role
// @route   PUT /api/admin/role/:id
// @access  ADMIN, HR, MANAGER (Restricted logic inside)
exports.changeRole = async (req, res) => {
    try {
        const { role } = req.body;
        const userToUpdate = await User.findById(req.params.id);

        if (!userToUpdate) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Prevent changing own role
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ success: false, error: 'Cannot change your own role' });
        }

        // Prevent modifying ADMIN
        if (userToUpdate.role === 'ADMIN') {
            return res.status(403).json({ success: false, error: 'Cannot modify an ADMIN user' });
        }

        // Logic
        if (role === 'HR' || role === 'MANAGER') {
            // Only ADMIN can promote to HR/MANAGER
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ success: false, error: 'Only ADMIN can promote to HR or MANAGER' });
            }
        } else if (role === 'TEAM_LEADER') {
            // ADMIN, HR, MANAGER can promote to TL
            // Already covered by route middleware, but can be strict here if needed
        } else if (role === 'EMPLOYEE') {
            // Demotion allowed by higher ups
        } else {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }

        userToUpdate.role = role;
        await userToUpdate.save();

        res.status(200).json({ success: true, message: `User role updated to ${role}`, data: userToUpdate });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Change Branch
// @route   PUT /api/admin/branch/:id
// @access  ADMIN, HR
exports.changeBranch = async (req, res) => {
    try {
        const { branch_id } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const branch = await Branch.findById(branch_id);
        if (!branch) {
            return res.status(404).json({ success: false, error: 'Branch not found' });
        }

        user.branch = branch_id;
        await user.save();

        res.status(200).json({ success: true, message: 'User branch updated', data: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get All Users (with optional status filter)
// @route   GET /api/admin/users
// @access  ADMIN, HR, MANAGER
exports.getUsers = async (req, res) => {
    try {
        const { status, role, branch } = req.query;
        let query = {};

        if (status === 'active') {
            query.isActive = true;
            query.status = { $nin: ['ONBOARDING', 'INVITED'] }; // Exclude onboarding and invited users from active list
        } else if (status === 'deactivated') {
            query.isActive = false;
        } else if (status === 'onboarding') {
            query.status = 'ONBOARDING';
            query.onboardingCompleted = false;
        } else {
            // Default to active, excluding onboarding and invited
            query.isActive = true;
            query.status = { $nin: ['ONBOARDING', 'INVITED'] };
        }

        if (role) query.role = role;
        if (branch) query.branch = branch;

        const users = await User.find(query)
            .populate('branch', 'name')
            .populate('shift', 'name')
            .sort('-createdAt');

        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error fetching users' });
    }
};

// @desc    Get Admin Dashboard Overview
// @route   GET /api/admin/dashboard/overview
// @access  ADMIN
exports.getDashboardOverview = async (req, res) => {
    try {
        const { DateTime } = require('luxon');
        const now = DateTime.now();
        const todayMidnight = now.startOf('day').toJSDate();

        const [
            totalUsers,
            totalBranches,
            activeUsers,
            inactiveUsers,
            onboardingPending,
            invitedPending,
            attendanceToday,
            violationsMonth,
            pendingCorrections
        ] = await Promise.all([
            User.countDocuments({}),
            Branch.countDocuments(),
            User.countDocuments({ status: 'ACTIVE', isActive: true }),
            User.countDocuments({ status: 'DEACTIVATED' }),
            User.countDocuments({ status: 'ONBOARDING' }),
            User.countDocuments({ status: 'INVITED' }),
            Attendance.countDocuments({ date: { $gte: todayMidnight } }),
            Violation.countDocuments({
                createdAt: {
                    $gte: now.startOf('month').toJSDate(),
                    $lte: now.endOf('month').toJSDate()
                }
            }),
            AttendanceCorrectionRequest.countDocuments({ status: 'PENDING' })
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                totalBranches,
                activeUsers,
                inactiveUsers,
                onboardingPending,
                invitedPending,
                attendanceToday,
                violationsThisMonth: violationsMonth,
                pendingCorrections
            }
        });

    } catch (error) {
        console.error("Dashboard overview error:", error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Stats (Simplified for Tests)
// @route   GET /api/admin/stats
// @access  ADMIN
exports.getAdminStats = async (req, res) => {
    try {
        const { DateTime } = require('luxon');
        const now = DateTime.now();
        const todayMidnight = now.startOf('day').toJSDate();

        const [
            totalEmployees,
            totalBranches,
            activeUsers,
            attendanceToday
        ] = await Promise.all([
            User.countDocuments(),
            Branch.countDocuments(),
            User.countDocuments({ status: 'ACTIVE' }),
            Attendance.countDocuments({ date: { $gte: todayMidnight } })
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalUsers: totalEmployees,
                totalBranches,
                activeUsers,
                todayAttendanceCount: attendanceToday
            }
        });
    } catch (error) {
        console.error("Admin stats error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get Branch Performance Stats
// @route   GET /api/admin/dashboard/branch-performance
// @access  ADMIN
exports.getBranchPerformance = async (req, res) => {
    try {
        const { DateTime } = require('luxon');
        const now = DateTime.now(); // Current Month
        const m = now.month;
        const y = now.year;
        const Violation = require('../models/Violation');
        const Attendance = require('../models/Attendance');

        // Optimized Approach
        // 1. Branches
        const branches = await Branch.find().select('name').lean();

        // 2. Aggregate Violations by Branch (This Month)
        const vioStats = await Violation.aggregate([
            { $match: { month: m, year: y } },
            { $group: { _id: '$branch', count: { $sum: 1 } } }
        ]);

        // 3. Aggregate Attendance Late by Branch (This Month)
        const attStats = await Attendance.aggregate([
            {
                $match: {
                    date: {
                        $gte: now.startOf('month').toJSDate(),
                        $lte: now.endOf('month').toJSDate()
                    }
                }
            },
            {
                $group: {
                    _id: '$branch',
                    lateCount: { $sum: { $cond: ['$lateMarked', 1, 0] } },
                    presentCount: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } }
                }
            }
        ]);

        const vioMap = {}; vioStats.forEach(v => vioMap[v._id.toString()] = v.count);
        const attMap = {}; attStats.forEach(a => attMap[a._id.toString()] = a);

        const data = branches.map(b => {
            const bid = b._id.toString();
            const att = attMap[bid] || { lateCount: 0, presentCount: 0 };
            return {
                branchId: bid,
                branchName: b.name,
                totalViolations: vioMap[bid] || 0,
                lateCount: att.lateCount,
                presentCount: att.presentCount
            };
        });

        res.status(200).json({ success: true, data });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Global Payroll Summary
// @route   GET /api/admin/dashboard/payroll-summary
// @access  ADMIN
exports.getPayrollSummary = async (req, res) => {
    try {
        const { month, year } = req.query;
        const PayrollSummary = require('../models/PayrollSummary');

        const { DateTime } = require('luxon');
        const now = DateTime.now();
        const m = month ? parseInt(month) : (now.month === 1 ? 12 : now.month - 1);
        const y = year ? parseInt(year) : (now.month === 1 ? now.year - 1 : now.year);

        const summary = await PayrollSummary.aggregate([
            { $match: { month: m, year: y } },
            {
                $group: {
                    _id: null,
                    totalGross: { $sum: '$grossSalary' },
                    totalDeductions: { $sum: '$totalDeductions' },
                    netPayout: { $sum: '$netSalary' },
                    totalPFEmployee: { $sum: '$pfEmployee' },
                    totalPFEmployer: { $sum: '$pfEmployer' },
                    totalHalfDays: { $sum: '$halfDays' }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            meta: { month: m, year: y },
            data: summary[0] || { totalGross: 0, netPayout: 0, totalDeductions: 0 }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Update User (Admin)
// @route   PUT /api/admin/users/:id
// @access  ADMIN
exports.updateUser = async (req, res) => {
    try {
        const { name, role, branch, shift } = req.body;
        const userId = req.params.id;

        // 1. Validation
        if (name && name.length < 3) {
            return res.status(400).json({ success: false, error: 'Name must be at least 3 characters' });
        }

        const allowedRoles = ['EMPLOYEE', 'HR', 'MANAGER', 'ADMIN'];
        if (role && !allowedRoles.includes(role)) {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // 2. Security Checks
        const isSelf = req.user.id === userId;

        // Prevent self-deactivation (if isActive was included, but usually handled by toggle)
        // Here we focus on role downgrade
        if (isSelf && role && role !== 'ADMIN' && user.role === 'ADMIN') {
            return res.status(400).json({ success: false, error: 'Cannot downgrade your own ADMIN role' });
        }

        // If promoting to ADMIN/HR, check if requester is ADMIN (though route is ADMIN only already)
        if ((role === 'ADMIN' || role === 'HR') && req.user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, error: 'Only ADMIN can grant ADMIN or HR roles' });
        }

        // 3. Dependency Validation
        if (role === 'EMPLOYEE' && !shift) {
            return res.status(400).json({ success: false, error: 'Shift is required for Employees' });
        }

        if (role && role !== 'ADMIN' && !branch) {
            return res.status(400).json({ success: false, error: 'Branch is required for this role' });
        }

        // Prevent removing branch from HR/MANAGER if it was there (unless reassigning)
        if (user.role !== 'ADMIN' && role !== 'ADMIN' && !branch) {
            return res.status(400).json({ success: false, error: 'Branch assignment is mandatory for non-Admin roles' });
        }

        // 4. Verification of IDs
        if (branch) {
            const branchExists = await Branch.findById(branch);
            if (!branchExists) return res.status(404).json({ success: false, error: 'Branch not found' });
        }
        if (shift) {
            const shiftExists = await Shift.findById(shift);
            if (!shiftExists) return res.status(404).json({ success: false, error: 'Shift not found' });
        }

        // 5. Update Fields
        if (name) user.name = name;
        if (role) user.role = role;

        // ADMINs usually don't have branch/shift in this system structure (N/A)
        if (role === 'ADMIN') {
            user.branch = undefined;
            user.shift = undefined;
        } else {
            if (branch) user.branch = branch;
            if (role === 'EMPLOYEE') {
                if (shift) user.shift = shift;
            } else {
                user.shift = undefined; // HR/MANAGER don't have shifts usually
            }
        }

        await user.save();

        const updatedUser = await User.findById(userId).populate('branch', 'name').populate('shift', 'name');

        res.status(200).json({
            success: true,
            message: 'User updated successfully',
            data: updatedUser
        });

    } catch (error) {
        console.error(error);
        if (error.name === 'CastError') {
            return res.status(400).json({ success: false, error: 'Invalid User ID format' });
        }
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get User By ID (Admin)
// @route   GET /api/admin/users/:id
// @access  ADMIN
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .populate('branch', 'name timezone')
            .populate('shift', 'name startTime endTime');

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Attendance Summary Aggregation
        const attendanceSummary = await Attendance.aggregate([
            { $match: { user: user._id } },
            {
                $group: {
                    _id: null,
                    totalPresent: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
                    totalHalfDays: { $sum: { $cond: [{ $eq: ['$status', 'HALF_DAY'] }, 1, 0] } },
                    totalAbsent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } }
                }
            }
        ]);

        const violationCount = await Violation.countDocuments({ user: user._id });

        const stats = attendanceSummary[0] || { totalPresent: 0, totalHalfDays: 0, totalAbsent: 0 };

        const { DateTime } = require('luxon');
        const joinDateJS = user.joiningDate ? new Date(user.joiningDate) : new Date(user.createdAt);
        const joinMeta = DateTime.fromJSDate(joinDateJS);
        const probationEndDate = joinMeta.plus({ months: 6 });
        const now = DateTime.now();
        const isPostProbation = now > probationEndDate;

        if (isPostProbation && !user.probationLeavesAllocated) {
            user.probationLeavesAllocated = true;
            user.availableLeaves = 18;
            user.leavesTaken = 0;
            user.lateCount = 0;
            user.earlyExitCount = 0;
            await User.updateOne({ _id: user._id }, {
                $set: {
                    probationLeavesAllocated: true,
                    availableLeaves: 18,
                    leavesTaken: 0,
                    lateCount: 0,
                    earlyExitCount: 0
                }
            }).catch(e => console.error("Error auto-allocating leaves:", e));
        }

        res.status(200).json({
            success: true,
            data: {
                ...user._doc,
                isPostProbation: isPostProbation,
                attendanceSummary: stats,
                totalViolations: violationCount
            }
        });
    } catch (error) {
        console.error(error);
        if (error.name === 'CastError') {
            return res.status(400).json({ success: false, error: 'Invalid User ID format' });
        }
        res.status(500).json({ success: false, error: 'Server Error fetching user' });
    }
};

// @desc    Patch User (Admin - Specialized fields)
// @route   PATCH /api/admin/users/:id
// @access  ADMIN
exports.patchUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const {
            name, role, branch, shift, isPfEligible, monthlyCTC,
            phoneNumber, dateOfBirth, gender,
            address, emergencyContact, bankDetails,
            aadhaarNumber, panNumber
        } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (req.user.id === userId && role && role !== user.role) {
            return res.status(400).json({ success: false, error: 'Cannot change your own role' });
        }

        // Track if CTC changed for auto-payroll
        const prevCTC = user.monthlyCTC || 0;

        // 1. Basic & Role Updates
        if (name) user.name = name;
        if (role) {
            const allowedRoles = ['EMPLOYEE', 'HR', 'MANAGER', 'ADMIN', 'TEAM_LEADER'];
            if (allowedRoles.includes(role)) {
                user.role = role;
                if (role === 'ADMIN') {
                    user.branch = undefined;
                    user.shift = undefined;
                }
            }
        }

        if (branch) {
            const branchExists = await Branch.findById(branch);
            if (!branchExists) return res.status(404).json({ success: false, error: 'Branch not found' });
            user.branch = branch;
        }

        if (shift) {
            const shiftExists = await Shift.findById(shift);
            if (!shiftExists) return res.status(404).json({ success: false, error: 'Shift not found' });
            user.shift = shift;
        }

        // 2. Specialized HR Fields
        if (typeof isPfEligible !== 'undefined') user.isPfEligible = isPfEligible;
        if (typeof monthlyCTC !== 'undefined') user.monthlyCTC = monthlyCTC;
        if (phoneNumber) user.phoneNumber = phoneNumber;
        if (dateOfBirth) user.dateOfBirth = dateOfBirth;
        if (gender) user.gender = gender;
        if (aadhaarNumber) user.aadhaarNumber = aadhaarNumber;
        if (panNumber) user.panNumber = panNumber;

        // 3. Nested Object Updates (Merge to prevent wiping)
        if (address) {
            user.address = { ...user.address, ...address };
        }
        if (emergencyContact) {
            user.emergencyContact = { ...user.emergencyContact, ...emergencyContact };
        }
        if (bankDetails) {
            user.bankDetails = { ...user.bankDetails, ...bankDetails };
        }

        await user.save();

        // 4. Auto-Generate Payroll if CTC was set/changed
        const newCTC = user.monthlyCTC || 0;
        if (newCTC > 0 && newCTC !== prevCTC && typeof monthlyCTC !== 'undefined') {
            const { generateSalaryStructureSync } = require('./adminController'); // Self ref for helper
            await exports.syncSalaryStructureForUser(user._id, newCTC, req.user._id);

            if (user.branch) {
                // Run in background (non-blocking)
                autoGeneratePayroll(user).catch(err =>
                    console.error(`Auto-payroll generation failed for ${userId}:`, err)
                );
            }
        }

        const updatedUser = await User.findById(userId)
            .populate('branch', 'name')
            .populate('shift', 'name');

        res.status(200).json({
            success: true,
            message: newCTC > 0 && newCTC !== prevCTC
                ? 'Profile updated & payroll generated for current month'
                : 'Profile updated successfully',
            data: updatedUser
        });

    } catch (error) {
        console.error(error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, error: messages.join(', ') });
        }
        if (error.name === 'CastError') {
            return res.status(400).json({ success: false, error: 'Invalid User ID format' });
        }
        res.status(500).json({ success: false, error: 'Server Error updating user' });
    }
};

// Helper: Auto-generate payroll for the current month when CTC is assigned
async function autoGeneratePayroll(user) {
    const { DateTime } = require('luxon');
    const PayrollSummary = require('../models/PayrollSummary');

    const branchDoc = await Branch.findById(user.branch);
    if (!branchDoc) return;

    const tz = branchDoc.timezone || 'Asia/Kolkata';
    const now = DateTime.now().setZone(tz);
    const month = now.month;
    const year = now.year;

    // Check if already locked — don't overwrite
    const existing = await PayrollSummary.findOne({ user: user._id, month, year });
    if (existing && existing.status === 'LOCKED') {
        console.log(`Payroll already LOCKED for user ${user._id} (${month}/${year}). Skipping.`);
        return;
    }

    // Calculate attendance stats for current month
    const startOfMonth = now.startOf('month').toUTC().toJSDate();
    const endOfMonth = now.endOf('month').toUTC().toJSDate();
    const daysInMonth = now.daysInMonth;

    const stats = await Attendance.aggregate([
        { $match: { user: user._id, date: { $gte: startOfMonth, $lte: endOfMonth } } },
        {
            $group: {
                _id: null,
                present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
                halfDay: { $sum: { $cond: [{ $eq: ['$status', 'HALF_DAY'] }, 1, 0] } },
                absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } }
            }
        }
    ]);

    const att = stats[0] || { present: 0, halfDay: 0, absent: 0 };
    const totalRecorded = att.present + att.halfDay + att.absent;
    const implicitAbsent = Math.max(0, daysInMonth - totalRecorded); // Keep implicitAbsent for other potential uses if needed, though not directly used in new LOP calc
    const finalAbsent = att.absent + implicitAbsent;

    // Use violationService logic
    const vStats = await violationService.calculateViolations(user, month, year);
    const totalDeductionDays = vStats.totalDeductionDays;

    // Gross Salary Refactoring (50/25/12.5/12.5)
    // Here CTC means Gross Salary
    const GrossSalary = user.monthlyCTC || 0;
    const Basic = GrossSalary * 0.50;
    const HRA = GrossSalary * 0.25;
    const DA = GrossSalary * 0.125;
    const SpecialAllowance = GrossSalary * 0.125;
    const Conveyance = 0; // Not used in this strict breakdown

    let PF_Employee = 0, PF_Employer = 0;
    const perDayCost = GrossSalary / daysInMonth; // Using total days for per-day cost
    const lopDeduction = Math.round(totalDeductionDays * perDayCost);
    const earnedGross = Math.max(0, GrossSalary - lopDeduction);

    if (user.isPfEligible) {
        // PF is strict 12% of FIXED Gross Salary to keep it visually stable
        PF_Employee = Math.round(GrossSalary * 0.12);
        PF_Employer = Math.round(GrossSalary * 0.12);
    }

    const PT = GrossSalary > 0 ? 200 : 0;
    const TDS = (GrossSalary * 12) > 700000 ? (Basic * 0.05) : 0;

    const TotalDeductions = PF_Employee + PT + TDS + lopDeduction;
    const NetSalary = Math.max(0, GrossSalary - TotalDeductions);

    // Upsert PayrollSummary
    await PayrollSummary.findOneAndUpdate(
        { user: user._id, month, year },
        {
            user: user._id,
            branch: user.branch,
            month, year,
            basic: Basic,
            hra: HRA,
            da: DA,
            specialAllowance: SpecialAllowance,
            grossSalary: GrossSalary,
            totalWorkingDays: daysInMonth,
            presentDays: att.present,
            halfDays: att.halfDay,
            absentDays: finalAbsent,
            employeePF: PF_Employee,
            employerPF: PF_Employer,
            professionalTax: PT,
            tds: TDS,
            lopDeduction: lopDeduction,
            totalDeductions: TotalDeductions,
            netSalary: NetSalary,
            status: 'GENERATED'
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    console.log(`✅ Auto-generated payroll for ${user.name} (${month}/${year}) — Net: ₹${NetSalary.toFixed(0)}`);
}

// @desc    Upload Profile Image
// @route   POST /api/admin/users/:id/profile-image
// @access  ADMIN
exports.uploadProfileImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Please upload a file' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Store relative path for frontend access
        user.profileImage = `/uploads/profile-images/${req.file.filename}`;
        await user.save();

        res.status(200).json({
            success: true,
            data: user.profileImage
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error uploading image' });
    }
};

// @desc    Upload/Replace Document
// @route   POST /api/admin/users/:id/documents
// @access  ADMIN
exports.uploadDocument = async (req, res) => {
    try {
        const { type } = req.body;
        if (!req.file || !type) {
            return res.status(400).json({ success: false, error: 'Please upload a file and specify document type' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const newDoc = {
            type,
            fileUrl: `/uploads/documents/${req.file.filename}`,
            uploadedAt: new Date()
        };

        // Check if document of this type already exists, if so replace it
        const docIndex = user.documents.findIndex(d => d.type === type);
        if (docIndex > -1) {
            user.documents[docIndex] = newDoc;
        } else {
            user.documents.push(newDoc);
        }

        await user.save();

        res.status(200).json({
            success: true,
            data: user.documents
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error uploading document' });
    }
};

// @desc    Get Fake Check-in Attempts
// @route   GET /api/admin/fake-checkins
// @access  ADMIN
exports.getFakeCheckins = async (req, res) => {
    try {
        const { branchId, employeeId, month, year, page = 1, limit = 20 } = req.query;
        let query = {};

        if (branchId && branchId !== 'undefined' && branchId !== 'All') {
            query.branch = branchId;
        }
        if (employeeId && employeeId !== 'undefined' && employeeId !== 'All') {
            query.user = employeeId;
        }

        if (month && year && month !== 'undefined' && year !== 'undefined') {
            const { DateTime } = require('luxon');
            const tz = 'Asia/Kolkata'; // Note: Should ideally be branch tz, assuming 'Asia/Kolkata' for now like getAdminStats

            // Re-map month names if provided as string
            const monthMap = { 'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6, 'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12 };
            const m = isNaN(month) ? monthMap[month] : Number(month);

            if (m) {
                const startOfMonth = DateTime.fromObject({ year: Number(year), month: m, day: 1 }, { zone: tz }).startOf('month').toUTC().toJSDate();
                const endOfMonth = DateTime.fromObject({ year: Number(year), month: m, day: 1 }, { zone: tz }).endOf('month').toUTC().toJSDate();

                query.date = { $gte: startOfMonth, $lte: endOfMonth };
            }
        }

        const startIndex = (Number(page) - 1) * Number(limit);

        const CheckInAttempt = require('../models/CheckInAttempt');
        const total = await CheckInAttempt.countDocuments(query);
        const attempts = await CheckInAttempt.find(query)
            .sort({ date: -1 })
            .skip(startIndex)
            .limit(Number(limit))
            .populate('user', 'name email role status profileImage')
            .populate('branch', 'name');

        res.status(200).json({
            success: true,
            count: attempts.length,
            pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
            data: attempts
        });

    } catch (error) {
        console.error("Error fetching fake checkins:", error);
        res.status(500).json({ success: false, error: 'Server Error fetching fake checkins' });
    }
}

// Helper: Sync SalaryStructure on CTC update
exports.syncSalaryStructureForUser = async (userId, grossSalary, adminId) => {
    const SalaryStructure = require('../models/payroll/SalaryStructure');

    // Deactivate previous
    await SalaryStructure.updateMany(
        { user: userId, isActive: true },
        { isActive: false, effectiveTo: new Date() }
    );

    const lastVersion = await SalaryStructure.findOne({ user: userId }).sort({ version: -1 });
    const version = lastVersion ? lastVersion.version + 1 : 1;

    // Strict 50/25/12.5/12.5 Breakdown
    const basic = grossSalary * 0.50;
    const hra = grossSalary * 0.25;
    const da = grossSalary * 0.125;
    const specialAllowance = grossSalary * 0.125;

    await SalaryStructure.create({
        user: userId,
        basic,
        hra,
        da,
        specialAllowance,
        otherAllowances: 0,
        grossSalary,
        annualCTC: grossSalary * 12,
        monthlyCTC: grossSalary, // grossSalary is the new CTC
        isActive: true,
        version,
        effectiveFrom: new Date(),
        createdBy: adminId || userId
    });
};;
