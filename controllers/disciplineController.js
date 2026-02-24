const Violation = require('../models/Violation');
const User = require('../models/User');

// @desc    Get Discipline Report
// @route   GET /api/discipline/report
// @access  Private (ADMIN, HR)
exports.getDisciplineReport = async (req, res) => {
    try {
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({ success: false, error: 'Please provide month and year' });
        }

        const queryMonth = parseInt(month);
        const queryYear = parseInt(year);

        let matchStage = {
            month: queryMonth,
            year: queryYear
        };

        // RBAC: HR sees only their branch
        if (req.user.role === 'HR') {
            matchStage.branch = req.user.branch;
        }

        const report = await Violation.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$user',
                    totalViolations: { $sum: 1 },
                    lateCount: {
                        $sum: { $cond: [{ $eq: ['$type', 'LATE'] }, 1, 0] }
                    },
                    earlyExitCount: {
                        $sum: { $cond: [{ $eq: ['$type', 'EARLY_EXIT'] }, 1, 0] }
                    },
                    autoCheckoutCount: {
                        $sum: { $cond: [{ $eq: ['$type', 'AUTO_CHECKOUT'] }, 1, 0] }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            {
                $unwind: '$userDetails'
            },
            {
                $project: {
                    _id: 1,
                    name: '$userDetails.name',
                    email: '$userDetails.email',
                    branch: '$userDetails.branch', // Optional
                    totalViolations: 1,
                    lateCount: 1,
                    earlyExitCount: 1,
                    autoCheckoutCount: 1,
                    halfDaysDeducted: {
                        $floor: { $divide: ['$totalViolations', 3] }
                    }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            count: report.length,
            data: report
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
