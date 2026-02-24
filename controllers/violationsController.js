const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Shift = require('../models/Shift');
const { DateTime } = require('luxon');

// @desc    Get Monthly Violation Report (Dynamic Calculation)
// @route   GET /api/admin/violations
// @access  ADMIN, HR
exports.getMonthlyViolations = async (req, res) => {
    try {
        const { branchId, month, year } = req.query;

        if (!branchId || !month || !year) {
            return res.status(400).json({ success: false, error: 'Please provide branchId, month, and year' });
        }

        const m = parseInt(month);
        const y = parseInt(year);

        // 1. Fetch Active Employees for Branch
        const query = { branch: branchId, status: 'ACTIVE', role: 'EMPLOYEE' };
        if (req.query.employeeId) {
            query._id = req.query.employeeId;
        }

        const employees = await User.find(query)
            .select('name shift branch')
            .populate('shift')
            .populate('branch');

        if (!employees.length) {
            return res.status(200).json({
                success: true,
                summary: { totalLate: 0, totalEarlyExit: 0, totalHalfDays: 0, totalAbsents: 0 },
                employees: []
            });
        }

        // 2. Fetch Attendance for the Month
        // Use Branch Timezone if available, else generic. For aggregation simplicity, we use the stored dates.
        // Assuming Attendance dates are stored as Midnight UTC or Branch Midnight.
        const startDate = DateTime.fromObject({ year: y, month: m, day: 1 }).startOf('day').toJSDate();
        const endDate = DateTime.fromObject({ year: y, month: m, day: 1 }).endOf('month').endOf('day').toJSDate();

        const { calculateViolations } = require('../services/violationService'); // Import Service

        // 3. Calculation Loop
        const report = [];
        const summary = { totalLate: 0, totalEarlyExit: 0, totalHalfDays: 0, totalAbsents: 0, totalDeductions: 0, penaltyHalfDays: 0 };

        // Detailed List for History Page
        const allViolations = [];

        for (const emp of employees) {
            const stats = await calculateViolations(emp, m, y);

            summary.totalLate += stats.totalLate;
            summary.totalEarlyExit += stats.totalEarlyExit;
            summary.totalHalfDays += stats.totalHalfDays;
            summary.totalAbsents += stats.totalAbsents;
            summary.totalDeductions += stats.totalDeductionDays;
            summary.penaltyHalfDays += stats.penaltyHalfDays;

            if (req.query.format === 'detailed') {
                // Flatten details
                stats.details.forEach(v => {
                    // if (v.type === 'ABSENT') return; // Restored Absent records

                    allViolations.push({
                        employeeId: emp._id,
                        employeeName: emp.name,
                        branchName: emp.branch ? emp.branch.name : 'Unknown', // Populate usually happens at top level
                        date: v.date,
                        type: v.type,
                        checkIn: v.checkIn,
                        checkOut: v.checkOut,
                        duration: v.duration,
                        details: v.time || v.duration || '-' // Keep for backward compatibility or simple view
                    });
                });
            } else {
                // Summary Report - Optional: Adjust total count if needed
                // User wants only check-in violations effectively? 
                // But summary cards (stats) still show totalAbsents. 
                // I will NOT filter stats here, as Overview cards might still need them, 
                // BUT the frontend will hide the Absent Card.
                // The employee row in Overview table WILL show Absent count as per current logic.
                // User said: "if any employee don't have checked in whole day... he'll be absent but i won't be shown the voilation page"
                // This implies removal from the list if they ONLY have absents.

                const visibleViolations = stats.totalLate + stats.totalEarlyExit + stats.totalHalfDays;

                if (visibleViolations > 0) {
                    report.push({
                        employeeId: emp._id,
                        name: emp.name,
                        ...stats,
                        details: []
                    });
                }
            }
        }

        // Sort detailed list by date desc
        if (req.query.format === 'detailed') {
            allViolations.sort((a, b) => new Date(b.date) - new Date(a.date));

            return res.status(200).json({
                success: true,
                data: allViolations
            });
        }

        res.status(200).json({
            success: true,
            data: {
                summary,
                employees: report
            }
        });

    } catch (error) {
        console.error("Violations Report Error:", error);
        res.status(500).json({ success: false, error: 'Server Error generating violations report' });
    }
};

// @desc    Trigger Manual Violation Emails for All Time (or specific range)
// @route   POST /api/admin/violations/trigger-email
// @access  ADMIN
exports.triggerAllTimeViolations = async (req, res) => {
    try {
        const { calculateViolations } = require('../services/violationService');
        const { sendViolationReportEmail } = require('../services/emailService');

        // 1. Identify Time Range
        // Find earliest attendance record to know when to start
        const earliestRecord = await Attendance.findOne().sort({ date: 1 });
        if (!earliestRecord) {
            return res.status(200).json({ success: true, message: 'No attendance records found.' });
        }

        let startDate = DateTime.fromJSDate(earliestRecord.date);
        const now = DateTime.now();

        // 2. Fetch All Employees (Active)
        const employees = await User.find({ role: 'EMPLOYEE', status: 'ACTIVE', shift: { $exists: true } })
            .populate('shift');

        console.log(`Starting Manual Violation Email Trigger. Range: ${startDate.toFormat('MMM yyyy')} - ${now.toFormat('MMM yyyy')}`);

        let emailCount = 0;

        // 3. Iterate Months
        while (startDate < now) {
            const m = startDate.month;
            const y = startDate.year;

            // Skip current incomplete month? User said "all time". 
            // Usually reports are for past months. 
            // If we include current month, it might be partial data.
            // Let's include current month only if it's explicitly asked, but "all time" implies everything.
            // However, typical "monthly report" is for completed months.
            // I'll stick to COMPLETED months to avoid confusion (users getting emails for "Absent" for future days).
            // Actually, my calculateViolations handles future days correctly (ignores them).

            console.log(`Processing ${m}/${y}...`);

            for (const emp of employees) {
                // Optimize: check if user existed in this month? 
                // calculateViolations will just return 0 if no attendance.
                const stats = await calculateViolations(emp, m, y);

                const totalViolations = stats.totalLate + stats.totalEarlyExit + stats.totalHalfDays + stats.totalAbsents;

                if (totalViolations > 0) {
                    await sendViolationReportEmail(emp, stats, m, y);
                    emailCount++;
                }
            }

            // Move to next month
            startDate = startDate.plus({ months: 1 });
        }

        res.status(200).json({
            success: true,
            message: `Process completed. Sent ${emailCount} violation emails.`
        });

    } catch (error) {
        console.error("Trigger Violations Error:", error);
        res.status(500).json({ success: false, error: 'Failed to trigger emails' });
    }
};
